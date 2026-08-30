<?php

namespace FriendsOfRedaxo\Mediaplace;

/**
 * Bettet die UI des separaten "cropper"-Addons (FriendsOfRedaxo/cropper) 1:1
 * in den eigenen Canvas ein, statt sie nachzubauen (anders als
 * FocuspointIntegration, die nur die Datenschicht konsumiert): das
 * Zuschneiden-UI (Ratio-Presets, Zoom/Rotate/Flip, Live-Vorschau) ist zu
 * umfangreich, um es sinnvoll neu zu implementieren, und Aenderungen am
 * cropper-Addon sollen automatisch mitgelten. Geladen werden dessen echte
 * cropper.js/cropper.css/rex_cropper.js-Assets sowie dessen
 * fragments/cropper_panel.php-Fragment; gespeichert wird ueber dessen
 * CropperExecutor (siehe Api\Crop.php).
 *
 * Alle cropper-Klassen werden nur vollqualifiziert INNERHALB von
 * isAvailable()-abgesicherten Methoden referenziert (kein "use" am
 * Dateikopf) -- die Datei muss auch fehlerfrei ladbar sein, wenn das
 * cropper-Addon nicht installiert ist.
 */
class CropperIntegration
{
    /**
     * cropper selbst wirft beim Aufruf seiner Seite eine Exception, wenn
     * media_manager fehlt/inaktiv ist (siehe pages/mediapool.cropper.php) --
     * hier vorab geprueft, damit der Button erst gar nicht erscheint.
     */
    public static function isAvailable(): bool
    {
        return \rex_addon::get('cropper')->isAvailable()
            && \rex_addon::get('media_manager')->isAvailable();
    }

    /**
     * Steuert die Sichtbarkeit des Zuschneiden-Buttons im Detail-Panel.
     */
    public static function canEdit(string $filename): bool
    {
        if (!self::isAvailable()) {
            return false;
        }
        $user = \rex::getUser();
        if (!$user || !$user->hasPerm('cropper[]')) {
            return false;
        }

        return self::isSupportedMedia($filename);
    }

    /**
     * Ohne dieses (separate) Recht darf cropper nur neue Kopien erzeugen,
     * nie das Original ueberschreiben -- spiegelt cropper/pages/mediapool.cropper.php.
     * Server-seitig in Api\Crop.php erzwungen, nicht nur im UI versteckt.
     */
    public static function canOverwrite(): bool
    {
        $user = \rex::getUser();

        return $user instanceof \rex_user && $user->hasPerm('cropper[overwrite]');
    }

    /**
     * Gleiche Endungs-Whitelist wie cropper_is_supported_media() in cropper/boot.php.
     */
    public static function isSupportedMedia(string $filename): bool
    {
        if ('' === $filename) {
            return false;
        }
        $extension = strtolower(\rex_file::extension($filename));

        return \in_array($extension, ['jpg', 'jpeg', 'png', 'gif'], true);
    }

    /**
     * Cache-gebustete Asset-URLs, gleiches Muster wie cropper/boot.php
     * ($assetVersion) -- fuer die Einbindung im OUTPUT_FILTER-Hook (boot.php).
     *
     * CSS wird bewusst NICHT zurueckgegeben: cropper/boot.php laedt
     * vendor/cropper/cropper.css + cropper_ui_fix.css bereits unconditional
     * fuer jeden Backend-User mit cropper[]-Recht -- exakt die Bedingung,
     * unter der auch mediaplace hier landet. Ein zweiter addCssFile()-Aufruf
     * mit identischer (filemtime-gebusteter) URL wirft eine rex_exception
     * ("already added to media"). JS laedt cropper dagegen nur auf
     * mediapool/cropper- bzw. yform-Seiten, nicht im mediaplace-Overlay --
     * das muss mediaplace weiterhin selbst einbinden.
     *
     * @return array{css: list<string>, js: list<string>}
     */
    public static function assetUrls(): array
    {
        $addon = \rex_addon::get('cropper');
        $version = static function (string $assetPath) use ($addon): string {
            $fullPath = $addon->getPath('assets/' . $assetPath);
            $mtime = @filemtime($fullPath);

            return '?v=' . rawurlencode(false !== $mtime ? (string) $mtime : (string) $addon->getVersion());
        };

        return [
            'css' => [],
            'js' => [
                $addon->getAssetsUrl('vendor/cropper/cropper.min.js') . $version('vendor/cropper/cropper.min.js'),
                $addon->getAssetsUrl('js/rex_cropper.js') . $version('js/rex_cropper.js'),
            ],
        ];
    }
}
