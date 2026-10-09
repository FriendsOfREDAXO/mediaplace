<?php

namespace FriendsOfRedaxo\Mediaplace;

use Imagick;
use ImagickPixel;

/**
 * Bildbearbeitung im Detail-Panel: Drehen/Spiegeln, Perspektive, Ausrichten,
 * Zuschneiden, Licht und Farbe.
 *
 * Reihenfolge der Schritte (identisch in modules/image_editor.js):
 * EXIF-Orientierung → 90°-Drehung → Spiegeln → Perspektive → Ausrichten
 * (mit Zuschnitt auf das größte Rechteck ohne leere Ecken) → Zuschnitt →
 * Helligkeit → Kontrast → Gamma → Sättigung.
 *
 * Mit Imagick stehen alle Werkzeuge zur Verfügung, mit GD nur die Geometrie
 * ohne Perspektive.
 */
final class ImageEditor
{
    public const PERM_EDIT = 'mediaplace[edit_image]';
    public const PERM_OVERWRITE = 'mediaplace[edit_image_overwrite]';

    private const MAX_ANGLE = 45.0;

    public static function engine(): ?string
    {
        if (extension_loaded('imagick') && class_exists(Imagick::class)) {
            return 'imagick';
        }
        if (extension_loaded('gd')) {
            return 'gd';
        }

        return null;
    }

    /**
     * @return array{perspective: bool, adjust: bool}
     */
    public static function capabilities(): array
    {
        $full = 'imagick' === self::engine();

        return ['perspective' => $full, 'adjust' => $full];
    }

    /** @return list<string> */
    public static function supportedExtensions(): array
    {
        $extensions = ['jpg', 'jpeg', 'png', 'webp'];
        $engine = self::engine();
        if (('imagick' === $engine && [] !== Imagick::queryFormats('AVIF')) || ('gd' === $engine && function_exists('imagecreatefromavif'))) {
            $extensions[] = 'avif';
        }

        return $extensions;
    }

    public static function isSupported(string $filename): bool
    {
        return '' !== $filename && in_array(strtolower(\rex_file::extension($filename)), self::supportedExtensions(), true);
    }

    public static function canEdit(\rex_media $media): bool
    {
        $user = \rex::getUser();

        return null !== self::engine()
            && $user instanceof \rex_user
            && ($user->isAdmin() || $user->hasPerm(self::PERM_EDIT) || $user->hasPerm(self::PERM_OVERWRITE))
            && self::isSupported($media->getFileName())
            && MediaPermission::hasCategoryAccess($media->getCategoryId());
    }

    public static function canOverwrite(): bool
    {
        $user = \rex::getUser();

        return $user instanceof \rex_user && ($user->isAdmin() || $user->hasPerm(self::PERM_OVERWRITE));
    }

    public static function canSaveCopy(): bool
    {
        $user = \rex::getUser();

        return $user instanceof \rex_user && ($user->isAdmin() || $user->hasPerm(self::PERM_EDIT));
    }

    // ---- Original aufbewahren ----

    private static function backupPath(string $filename): string
    {
        return \rex_path::addonData('mediaplace', 'originals/' . $filename);
    }

    public static function hasBackup(string $filename): bool
    {
        return is_file(self::backupPath($filename));
    }

    public static function deleteBackup(string $filename): void
    {
        \rex_file::delete(self::backupPath($filename));
        \rex_file::delete(self::backupPath($filename) . '.json');
    }

    /**
     * Stellt das beim ersten Überschreiben aufbewahrte Original wieder her.
     */
    public static function restore(\rex_media $media): void
    {
        $filename = $media->getFileName();
        $backup = self::backupPath($filename);
        if (!is_file($backup)) {
            throw new \rex_exception('No original stored for ' . $filename);
        }

        $sidecar = json_decode((string) \rex_file::get($backup . '.json'), true);
        $tmpFile = self::tmpFile($filename);
        if (!copy($backup, $tmpFile)) {
            throw new \rex_exception('Could not copy original of ' . $filename);
        }

        self::replaceFile($media, $tmpFile);

        if (is_array($sidecar) && is_array($sidecar['meta'] ?? null)) {
            self::writeMeta($filename, $sidecar['meta']);
        }
        self::deleteBackup($filename);
    }

    // ---- Bearbeitung ----

    /**
     * Normalisiert die vom Client übergebenen Schritte.
     *
     * @param array<mixed> $raw
     * @return array{quarter: int, flipH: bool, flipV: bool, perspective: list<array{0: float, 1: float}>|null, angle: float, crop: array{x: float, y: float, w: float, h: float}|null, brightness: float, contrast: float, gamma: float, saturation: float}
     */
    public static function normalizeOperations(array $raw): array
    {
        $num = static fn (mixed $v, float $min, float $max): float => max($min, min($max, is_numeric($v) ? (float) $v : 0.0));

        $perspective = null;
        if (is_array($raw['perspective'] ?? null) && 4 === count($raw['perspective'])) {
            $perspective = [];
            foreach ($raw['perspective'] as $point) {
                $perspective[] = [$num($point[0] ?? 0, 0, 1), $num($point[1] ?? 0, 0, 1)];
            }
        }

        $crop = null;
        if (is_array($raw['crop'] ?? null)) {
            $x = $num($raw['crop']['x'] ?? 0, 0, 1);
            $y = $num($raw['crop']['y'] ?? 0, 0, 1);
            $w = $num($raw['crop']['w'] ?? 1, 0, 1 - $x);
            $h = $num($raw['crop']['h'] ?? 1, 0, 1 - $y);
            if ($w > 0 && $h > 0 && ($x > 0 || $y > 0 || $w < 1 || $h < 1)) {
                $crop = ['x' => $x, 'y' => $y, 'w' => $w, 'h' => $h];
            }
        }

        return [
            'quarter' => ((int) ($raw['quarter'] ?? 0) % 4 + 4) % 4,
            'flipH' => !empty($raw['flipH']),
            'flipV' => !empty($raw['flipV']),
            'perspective' => $perspective,
            'angle' => $num($raw['angle'] ?? 0, -self::MAX_ANGLE, self::MAX_ANGLE),
            'crop' => $crop,
            'brightness' => $num($raw['brightness'] ?? 0, -100, 100),
            'contrast' => $num($raw['contrast'] ?? 0, -100, 100),
            'gamma' => $num($raw['gamma'] ?? 0, -100, 100),
            'saturation' => $num($raw['saturation'] ?? 0, -100, 100),
        ];
    }

    /**
     * Bearbeitet die Datei und speichert sie über- oder als Kopie.
     *
     * @param array<mixed> $rawOperations
     * @return string Dateiname des Ergebnisses
     */
    public static function save(\rex_media $media, array $rawOperations, bool $asCopy, string $copyName = ''): string
    {
        $ops = self::normalizeOperations($rawOperations);
        if (!self::capabilities()['perspective']) {
            $ops['perspective'] = null;
        }
        if (!self::capabilities()['adjust']) {
            $ops['brightness'] = $ops['contrast'] = $ops['gamma'] = $ops['saturation'] = 0.0;
        }

        $filename = $media->getFileName();
        $source = \rex_path::media($filename);
        $tmpFile = self::tmpFile($filename);

        [$width, $height] = 'imagick' === self::engine()
            ? self::renderImagick($source, $tmpFile, $ops)
            : self::renderGd($source, $tmpFile, $ops);

        $focusUpdates = self::mapFocuspoints($media, $ops);

        if ($asCopy) {
            $newFilename = self::addCopy($media, $tmpFile, $copyName);
            self::copyMeta($filename, $newFilename);
            self::writeMeta($newFilename, $focusUpdates);

            return $newFilename;
        }

        if (!self::hasBackup($filename)) {
            \rex_dir::create(dirname(self::backupPath($filename)));
            if (!copy($source, self::backupPath($filename))) {
                @unlink($tmpFile);
                throw new \rex_exception('Could not keep original of ' . $filename);
            }
            $meta = [];
            foreach (array_keys($focusUpdates) as $field) {
                $meta[$field] = (string) $media->getValue($field);
            }
            \rex_file::put(self::backupPath($filename) . '.json', (string) json_encode(['meta' => $meta, 'created' => time()]));
        }

        self::replaceFile($media, $tmpFile);
        self::writeMeta($filename, $focusUpdates);

        return $filename;
    }

    /**
     * @param array{quarter: int, flipH: bool, flipV: bool, perspective: list<array{0: float, 1: float}>|null, angle: float, crop: array{x: float, y: float, w: float, h: float}|null, brightness: float, contrast: float, gamma: float, saturation: float} $ops
     * @return array{0: int, 1: int}
     */
    private static function renderImagick(string $source, string $target, array $ops): array
    {
        $image = new Imagick($source);
        if ($image->getNumberImages() > 1) {
            $image = $image->coalesceImages();
            $image->setIteratorIndex(0);
            $image = $image->getImage();
        }
        if (Imagick::COLORSPACE_CMYK === $image->getImageColorspace()) {
            $image->transformImageColorspace(Imagick::COLORSPACE_SRGB);
        }
        $quality = $image->getImageCompressionQuality();
        $image->autoOrient();
        $image->setImagePage(0, 0, 0, 0);
        $transparent = new ImagickPixel('transparent');

        if ($ops['quarter'] > 0) {
            $image->rotateImage($transparent, 90 * $ops['quarter']);
        }
        if ($ops['flipH']) {
            $image->flopImage();
        }
        if ($ops['flipV']) {
            $image->flipImage();
        }
        $image->setImagePage(0, 0, 0, 0);

        if (null !== $ops['perspective']) {
            $w = $image->getImageWidth();
            $h = $image->getImageHeight();
            $quad = array_map(static fn (array $p): array => [$p[0] * $w, $p[1] * $h], $ops['perspective']);
            [$outW, $outH] = self::perspectiveSize($quad);
            $image->setImageVirtualPixelMethod(Imagick::VIRTUALPIXELMETHOD_EDGE);
            $image->setImageArtifact('distort:viewport', $outW . 'x' . $outH . '+0+0');
            $image->distortImage(Imagick::DISTORTION_PERSPECTIVE, [
                $quad[0][0], $quad[0][1], 0, 0,
                $quad[1][0], $quad[1][1], $outW, 0,
                $quad[2][0], $quad[2][1], $outW, $outH,
                $quad[3][0], $quad[3][1], 0, $outH,
            ], false);
            $image->setImagePage(0, 0, 0, 0);
        }

        if (0.0 !== $ops['angle']) {
            $w = $image->getImageWidth();
            $h = $image->getImageHeight();
            [$innerW, $innerH] = self::straightenSize($w, $h, $ops['angle']);
            $image->rotateImage($transparent, $ops['angle']);
            $image->setImagePage(0, 0, 0, 0);
            $image->cropImage($innerW, $innerH, (int) round(($image->getImageWidth() - $innerW) / 2), (int) round(($image->getImageHeight() - $innerH) / 2));
            $image->setImagePage(0, 0, 0, 0);
        }

        if (null !== $ops['crop']) {
            $w = $image->getImageWidth();
            $h = $image->getImageHeight();
            [$x, $y, $cw, $ch] = self::cropPixels($ops['crop'], $w, $h);
            $image->cropImage($cw, $ch, $x, $y);
            $image->setImagePage(0, 0, 0, 0);
        }

        // Nur RGB, Alpha bleibt unverändert; die Imagick-Stubs kennen keine kombinierten Masken
        $rgb = Imagick::CHANNEL_RED | Imagick::CHANNEL_GREEN | Imagick::CHANNEL_BLUE;
        if (0.0 !== $ops['brightness']) {
            $image->evaluateImage(Imagick::EVALUATE_MULTIPLY, self::brightnessFactor($ops['brightness']), $rgb); // @phpstan-ignore argument.type
            $image->clampImage($rgb);
        }
        if (0.0 !== $ops['contrast']) {
            $k = self::contrastFactor($ops['contrast']);
            $image->functionImage(Imagick::FUNCTION_POLYNOMIAL, [$k, 0.5 - 0.5 * $k], $rgb); // @phpstan-ignore argument.type
            $image->clampImage($rgb);
        }
        if (0.0 !== $ops['gamma']) {
            $image->gammaImage(self::gammaValue($ops['gamma']), $rgb); // @phpstan-ignore argument.type
            $image->clampImage($rgb);
        }
        if (0.0 !== $ops['saturation']) {
            $s = 1 + $ops['saturation'] / 100;
            $lr = 0.2126 * (1 - $s);
            $lg = 0.7152 * (1 - $s);
            $lb = 0.0722 * (1 - $s);
            // Imagick verlangt 5×5; die ersten drei Zeilen/Spalten sind RGB, Alpha bleibt unverändert
            $image->colorMatrixImage([
                $lr + $s, $lg, $lb, 0, 0,
                $lr, $lg + $s, $lb, 0, 0,
                $lr, $lg, $lb + $s, 0, 0,
                0, 0, 0, 1, 0,
                0, 0, 0, 0, 1,
            ]);
            $image->clampImage($rgb);
        }

        if ($quality > 0) {
            $image->setImageCompressionQuality($quality);
        }
        $image->writeImage($target);
        $size = [$image->getImageWidth(), $image->getImageHeight()];
        $image->clear();

        return $size;
    }

    /**
     * Nur Geometrie: Drehen, Spiegeln, Ausrichten, Zuschneiden.
     *
     * @param array{quarter: int, flipH: bool, flipV: bool, perspective: list<array{0: float, 1: float}>|null, angle: float, crop: array{x: float, y: float, w: float, h: float}|null, brightness: float, contrast: float, gamma: float, saturation: float} $ops
     * @return array{0: int, 1: int}
     */
    private static function renderGd(string $source, string $target, array $ops): array
    {
        $extension = strtolower(\rex_file::extension($source));
        $image = match ($extension) {
            'jpg', 'jpeg' => @imagecreatefromjpeg($source),
            'png' => @imagecreatefrompng($source),
            'webp' => @imagecreatefromwebp($source),
            'avif' => function_exists('imagecreatefromavif') ? @imagecreatefromavif($source) : false,
            default => false,
        };
        if (false === $image) {
            throw new \rex_exception('Could not read ' . basename($source));
        }
        imagealphablending($image, false);
        imagesavealpha($image, true);

        $image = self::gdOrient($image, $source);
        $transparent = (int) imagecolorallocatealpha($image, 0, 0, 0, 127);

        if ($ops['quarter'] > 0) {
            $image = self::gdRequire(imagerotate($image, -90 * $ops['quarter'], $transparent));
        }
        if ($ops['flipH']) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }
        if ($ops['flipV']) {
            imageflip($image, IMG_FLIP_VERTICAL);
        }

        if (0.0 !== $ops['angle']) {
            [$innerW, $innerH] = self::straightenSize(imagesx($image), imagesy($image), $ops['angle']);
            $rotated = self::gdRequire(imagerotate($image, -$ops['angle'], $transparent));
            $image = self::gdRequire(imagecrop($rotated, [
                'x' => (int) round((imagesx($rotated) - $innerW) / 2),
                'y' => (int) round((imagesy($rotated) - $innerH) / 2),
                'width' => $innerW,
                'height' => $innerH,
            ]));
        }

        if (null !== $ops['crop']) {
            [$x, $y, $cw, $ch] = self::cropPixels($ops['crop'], imagesx($image), imagesy($image));
            $image = self::gdRequire(imagecrop($image, ['x' => $x, 'y' => $y, 'width' => $cw, 'height' => $ch]));
        }
        imagesavealpha($image, true);

        $written = match ($extension) {
            'jpg', 'jpeg' => imagejpeg($image, $target, 90),
            'png' => imagepng($image, $target, 6),
            'webp' => imagewebp($image, $target, 90),
            'avif' => function_exists('imageavif') && imageavif($image, $target),
            default => false,
        };
        if (!$written) {
            throw new \rex_exception('Could not write edited image');
        }

        return [imagesx($image), imagesy($image)];
    }

    private static function gdOrient(\GdImage $image, string $source): \GdImage
    {
        $orientation = 1;
        if (function_exists('exif_read_data') && in_array(strtolower(\rex_file::extension($source)), ['jpg', 'jpeg'], true)) {
            $exif = @exif_read_data($source);
            $orientation = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        }
        if (in_array($orientation, [2, 4, 5, 7], true)) {
            imageflip($image, in_array($orientation, [2, 7], true) ? IMG_FLIP_HORIZONTAL : IMG_FLIP_VERTICAL);
        }
        $angle = match ($orientation) {
            3 => 180,
            5, 6, 7 => -90,
            8 => 90,
            default => 0,
        };

        return 0 === $angle ? $image : self::gdRequire(imagerotate($image, $angle, 0));
    }

    private static function gdRequire(\GdImage|false $image): \GdImage
    {
        if (false === $image) {
            throw new \rex_exception('Image operation failed');
        }

        return $image;
    }

    // ---- Geometrie (identisch in modules/image_editor.js) ----

    /**
     * Zielgröße der Perspektivkorrektur: mittlere Kantenlängen des Vierecks.
     *
     * @param list<array{0: float, 1: float}> $quad TL, TR, BR, BL in Pixeln
     * @return array{0: int, 1: int}
     */
    public static function perspectiveSize(array $quad): array
    {
        $dist = static fn (array $a, array $b): float => hypot($b[0] - $a[0], $b[1] - $a[1]);

        return [
            max(1, (int) round(($dist($quad[0], $quad[1]) + $dist($quad[3], $quad[2])) / 2)),
            max(1, (int) round(($dist($quad[0], $quad[3]) + $dist($quad[1], $quad[2])) / 2)),
        ];
    }

    /**
     * Größtes achsenparalleles Rechteck gleichen Seitenverhältnisses im gedrehten Bild.
     *
     * @return array{0: int, 1: int}
     */
    public static function straightenSize(int $width, int $height, float $angle): array
    {
        $a = deg2rad(abs($angle));
        $k = min(
            $width / ($width * cos($a) + $height * sin($a)),
            $height / ($width * sin($a) + $height * cos($a)),
        );

        return [max(1, (int) floor($width * $k)), max(1, (int) floor($height * $k))];
    }

    /**
     * @param array{x: float, y: float, w: float, h: float} $crop
     * @return array{0: int, 1: int, 2: int, 3: int}
     */
    public static function cropPixels(array $crop, int $width, int $height): array
    {
        $x = (int) round($crop['x'] * $width);
        $y = (int) round($crop['y'] * $height);

        return [
            $x,
            $y,
            max(1, min($width - $x, (int) round($crop['w'] * $width))),
            max(1, min($height - $y, (int) round($crop['h'] * $height))),
        ];
    }

    public static function brightnessFactor(float $value): float
    {
        return 2 ** ($value / 100);
    }

    public static function contrastFactor(float $value): float
    {
        return $value >= 0 ? 1 + $value / 50 : 1 + $value / 100;
    }

    public static function gammaValue(float $value): float
    {
        return 2 ** ($value / 50);
    }

    // ---- Fokuspunkt ----

    /**
     * Rechnet gesetzte Fokuspunkte durch die Geometrie; außerhalb des Ergebnisses → geleert.
     *
     * @param array{quarter: int, flipH: bool, flipV: bool, perspective: list<array{0: float, 1: float}>|null, angle: float, crop: array{x: float, y: float, w: float, h: float}|null, brightness: float, contrast: float, gamma: float, saturation: float} $ops
     * @return array<string, string>
     */
    private static function mapFocuspoints(\rex_media $media, array $ops): array
    {
        if (!FocuspointIntegration::isAvailable()) {
            return [];
        }

        $width = (int) $media->getWidth();
        $height = (int) $media->getHeight();
        $updates = [];
        foreach (FocuspointIntegration::getMetafields() as $field) {
            $raw = trim((string) $media->getValue($field));
            if (1 !== preg_match('/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/', $raw, $m)) {
                continue;
            }
            $point = self::mapPoint([(float) $m[1] / 100, (float) $m[2] / 100], $ops, $width, $height);
            $updates[$field] = null === $point ? '' : number_format($point[0] * 100, 1, '.', '') . ',' . number_format($point[1] * 100, 1, '.', '');
        }

        return $updates;
    }

    /**
     * @param array{0: float, 1: float} $p normalisiert im Original
     * @param array{quarter: int, flipH: bool, flipV: bool, perspective: list<array{0: float, 1: float}>|null, angle: float, crop: array{x: float, y: float, w: float, h: float}|null, brightness: float, contrast: float, gamma: float, saturation: float} $ops
     * @return array{0: float, 1: float}|null
     */
    public static function mapPoint(array $p, array $ops, int $width, int $height): ?array
    {
        [$x, $y] = $p;
        for ($i = 0; $i < $ops['quarter']; ++$i) {
            [$x, $y] = [1 - $y, $x];
            [$width, $height] = [$height, $width];
        }
        if ($ops['flipH']) {
            $x = 1 - $x;
        }
        if ($ops['flipV']) {
            $y = 1 - $y;
        }

        if (null !== $ops['perspective']) {
            $quad = array_map(static fn (array $q): array => [$q[0] * $width, $q[1] * $height], $ops['perspective']);
            [$outW, $outH] = self::perspectiveSize($quad);
            $mapped = self::invertQuad($quad, [$x * $width, $y * $height]);
            if (null === $mapped) {
                return null;
            }
            [$x, $y] = $mapped;
            [$width, $height] = [$outW, $outH];
        }

        if (0.0 !== $ops['angle']) {
            [$innerW, $innerH] = self::straightenSize($width, $height, $ops['angle']);
            $a = deg2rad($ops['angle']);
            $dx = ($x - 0.5) * $width;
            $dy = ($y - 0.5) * $height;
            $x = (($dx * cos($a) - $dy * sin($a)) + $innerW / 2) / $innerW;
            $y = (($dx * sin($a) + $dy * cos($a)) + $innerH / 2) / $innerH;
        }

        if (null !== $ops['crop']) {
            $x = ($x - $ops['crop']['x']) / $ops['crop']['w'];
            $y = ($y - $ops['crop']['y']) / $ops['crop']['h'];
        }

        return $x >= 0 && $x <= 1 && $y >= 0 && $y <= 1 ? [$x, $y] : null;
    }

    /**
     * Projektive Abbildung Einheitsquadrat → Viereck (TL, TR, BR, BL), als 3×3-Matrix.
     *
     * @param list<array{0: float, 1: float}> $quad
     * @return array{0: float, 1: float, 2: float, 3: float, 4: float, 5: float, 6: float, 7: float, 8: float}
     */
    public static function squareToQuad(array $quad): array
    {
        [[$x0, $y0], [$x1, $y1], [$x2, $y2], [$x3, $y3]] = $quad;
        $dx3 = $x0 - $x1 + $x2 - $x3;
        $dy3 = $y0 - $y1 + $y2 - $y3;
        if (abs($dx3) < 1e-9 && abs($dy3) < 1e-9) {
            return [$x1 - $x0, $x2 - $x1, $x0, $y1 - $y0, $y2 - $y1, $y0, 0.0, 0.0, 1.0];
        }
        $dx1 = $x1 - $x2;
        $dx2 = $x3 - $x2;
        $dy1 = $y1 - $y2;
        $dy2 = $y3 - $y2;
        $det = $dx1 * $dy2 - $dx2 * $dy1;
        $g = ($dx3 * $dy2 - $dx2 * $dy3) / $det;
        $h = ($dx1 * $dy3 - $dx3 * $dy1) / $det;

        return [$x1 - $x0 + $g * $x1, $x3 - $x0 + $h * $x3, $x0, $y1 - $y0 + $g * $y1, $y3 - $y0 + $h * $y3, $y0, $g, $h, 1.0];
    }

    /**
     * Position eines Punktes im entzerrten Rechteck (normalisiert), null bei entarteter Abbildung.
     *
     * @param list<array{0: float, 1: float}> $quad
     * @param array{0: float, 1: float} $point
     * @return array{0: float, 1: float}|null
     */
    private static function invertQuad(array $quad, array $point): ?array
    {
        [$a, $b, $c, $d, $e, $f, $g, $h, $i] = self::squareToQuad($quad);
        // Adjunkte = Inverse bis auf einen Faktor, der sich beim Dehomogenisieren kürzt
        $inv = [
            $e * $i - $f * $h, $c * $h - $b * $i, $b * $f - $c * $e,
            $f * $g - $d * $i, $a * $i - $c * $g, $c * $d - $a * $f,
            $d * $h - $e * $g, $b * $g - $a * $h, $a * $e - $b * $d,
        ];
        [$x, $y] = $point;
        $w = $inv[6] * $x + $inv[7] * $y + $inv[8];
        if (abs($w) < 1e-12) {
            return null;
        }

        return [($inv[0] * $x + $inv[1] * $y + $inv[2]) / $w, ($inv[3] * $x + $inv[4] * $y + $inv[5]) / $w];
    }

    // ---- Speichern ----

    private static function tmpFile(string $filename): string
    {
        $dir = \rex_path::addonData('mediaplace', 'image_edit_tmp');
        \rex_dir::create($dir);

        return $dir . '/' . uniqid('edit_', true) . '.' . strtolower(\rex_file::extension($filename));
    }

    private static function replaceFile(\rex_media $media, string $tmpFile): void
    {
        $filename = $media->getFileName();
        try {
            $result = \rex_media_service::updateMedia($filename, [
                'title' => $media->getTitle(),
                'category_id' => $media->getCategoryId(),
                'file' => ['name' => $filename, 'tmp_name' => $tmpFile],
            ]);
        } finally {
            if (is_file($tmpFile)) {
                @unlink($tmpFile);
            }
        }
        if (empty($result['ok'])) {
            throw new \rex_exception((string) ($result['msg'] ?? 'Saving failed'));
        }
        \rex_media_manager::deleteCache($filename);
    }

    private static function addCopy(\rex_media $media, string $tmpFile, string $copyName): string
    {
        $extension = strtolower(\rex_file::extension($media->getFileName()));
        $base = '' !== trim($copyName) ? pathinfo(trim($copyName), PATHINFO_FILENAME) : pathinfo($media->getFileName(), PATHINFO_FILENAME) . '_edit';

        try {
            $result = \rex_media_service::addMedia([
                'title' => $media->getTitle(),
                'category_id' => $media->getCategoryId(),
                'file' => ['name' => $base . '.' . $extension, 'tmp_name' => $tmpFile],
            ], true);
        } finally {
            if (is_file($tmpFile)) {
                @unlink($tmpFile);
            }
        }
        if (empty($result['ok'])) {
            throw new \rex_exception(implode(', ', (array) ($result['messages'] ?? ['Saving failed'])));
        }

        return (string) $result['filename'];
    }

    /** Übernimmt alle med_*-Felder des Originals. */
    private static function copyMeta(string $from, string $to): void
    {
        $source = \rex_sql::factory();
        $source->setQuery('SELECT * FROM ' . \rex::getTable('media') . ' WHERE filename = ?', [$from]);
        if (1 !== $source->getRows()) {
            return;
        }
        $values = [];
        foreach ($source->getFieldnames() as $field) {
            if (str_starts_with($field, 'med_')) {
                $values[$field] = $source->getValue($field);
            }
        }
        self::writeMeta($to, $values);
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function writeMeta(string $filename, array $values): void
    {
        if ([] === $values) {
            return;
        }
        $media = \rex_media::get($filename);
        $sql = \rex_sql::factory();
        $sql->setTable(\rex::getTable('media'));
        $sql->setWhere(['filename' => $filename]);
        foreach ($values as $field => $value) {
            $sql->setValue($field, $value);
        }
        $sql->addGlobalUpdateFields();
        $sql->update();
        \rex_media_cache::delete($filename);
        \rex_extension::registerPoint(new \rex_extension_point('MEDIA_UPDATED', '', ['filename' => $filename, 'id' => $media?->getId()]));
    }
}
