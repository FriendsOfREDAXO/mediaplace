<?php

namespace FriendsOfRedaxo\Mediaplace\Api;

use FriendsOfRedaxo\Mediaplace\AiAltTextService;
use FriendsOfRedaxo\Mediaplace\AiAltTextWriter;
use FriendsOfRedaxo\Mediaplace\AltTextStatus;
use FriendsOfRedaxo\Mediaplace\MediaPermission;

/**
 * Kategorieuebergreifende KI-Massengenerierung ("AI Bulk Management", ueber
 * das Zahnrad-Menue erreichbar). Eigener Endpunkt statt Eingriff in
 * Api\CategoryBulk.php -- dessen Scope ist bewusst je-Kategorie, hier ist
 * der Scope global (alle zugaenglichen Kategorien).
 *
 * Zwei getrennte Phasen (Review-vor-Speichern-Prinzip, wie beim
 * Einzeldatei-Button in Api\AiAltText.php): 'generate_batch' erzeugt nur
 * Textvorschlaege und schreibt NICHTS in die Datenbank, der Client zeigt sie
 * zur Pruefung/Bearbeitung an; erst ein expliziter 'apply'-Aufruf mit den
 * (ggf. vom Nutzer bearbeiteten) Texten schreibt tatsaechlich. Die
 * Generierungs-Schleife folgt trotzdem dem etablierten Response-Vertrag
 * (processed/remaining, Abbruch bei processed===0 pro Runde) 1:1 nach dem
 * Vorbild von CategoryBulk.php, nur dass hier "processed" (nicht
 * "succeeded") die Schleife am Laufen haelt -- ein Fehlschlag soll die
 * naechste Datei versuchen, nicht die Datei endlos erneut anfassen (siehe
 * "exclude"-Parameter unten).
 */
class AiAltBulk extends \rex_api_function
{
    protected $published = true;

    // Deutlich kleiner als CategoryBulk (100/500): hier ist jeder
    // Batch-Eintrag ein echter KI-Vendor-Call, nicht eine billige
    // SQL-Zeilenoperation.
    private const BATCH_LIMIT_DEFAULT = 10;
    private const BATCH_LIMIT_MAX = 25;

    public function execute(): \rex_api_result
    {
        if (!\rex::getUser()) {
            $this->send(['success' => false, 'error' => 'Nicht angemeldet.'], 401);
        }
        if (!AiAltTextService::isAvailable()) {
            $this->send(['success' => false, 'error' => 'KI-Alt-Text-Generierung ist nicht aktiviert oder ai_platform nicht verfügbar.'], 403);
        }
        if (!MediaPermission::hasBulkOperationsAccess()) {
            $this->send(['success' => false, 'error' => 'Keine Berechtigung für Massenaktionen.'], 403);
        }

        $body = json_decode((string) file_get_contents('php://input'), true);
        $body = is_array($body) ? $body : [];
        $action = (string) ($body['action'] ?? \rex_request('action', 'string', ''));

        switch ($action) {
            case 'count':
                $this->handleCount();

                break;
            case 'generate_batch':
                $this->handleGenerateBatch($body);

                break;
            case 'apply':
                $this->handleApply($body);

                break;
            default:
                $this->send(['success' => false, 'error' => 'Unbekannte Aktion.'], 400);
        }

        return new \rex_api_result(true);
    }

    private function handleCount(): void
    {
        $clangs = [];
        foreach (\rex_clang::getAll() as $clang) {
            $clangs[] = [
                'id' => $clang->getId(),
                'name' => $clang->getName(),
                'code' => $clang->getCode(),
            ];
        }

        $this->send([
            'success' => true,
            'total' => count($this->accessibleEligibleFilenames()),
            'svgSkipped' => count($this->accessibleSvgFilenames()),
            'clangs' => $clangs,
        ]);
    }

    /**
     * Erzeugt nur Textvorschlaege (kein Schreiben). Der Client uebergibt in
     * "exclude" die Dateinamen, die er in dieser Sitzung bereits verarbeitet
     * hat (erfolgreich generiert ODER fehlgeschlagen) -- ohne diesen
     * Parameter waere der Endpunkt zustandslos und wuerde bei jedem Aufruf
     * wieder dieselben ersten N Dateien liefern.
     *
     * @param array<string, mixed> $body
     */
    private function handleGenerateBatch(array $body): void
    {
        $limit = max(1, min(self::BATCH_LIMIT_MAX, (int) ($body['limit'] ?? self::BATCH_LIMIT_DEFAULT)));
        $excludeRaw = is_array($body['exclude'] ?? null) ? $body['exclude'] : [];
        $exclude = array_flip(array_map('strval', $excludeRaw));

        $eligible = array_values(array_filter(
            $this->accessibleEligibleFilenames(),
            static function (string $filename) use ($exclude): bool {
                return !isset($exclude[$filename]);
            },
        ));
        $batch = array_slice($eligible, 0, $limit);

        $service = new AiAltTextService();
        $clangIds = AiAltTextWriter::resolveClangIds();
        $items = [];
        $errors = [];

        foreach ($batch as $filename) {
            $media = \rex_media::get($filename);
            if (!$media) {
                $errors[] = ['filename' => $filename, 'message' => 'Datei "' . \rex_escape($filename) . '" nicht gefunden.'];

                continue;
            }
            try {
                $texts = $service->generateAltText($media, $clangIds);
                if ([] === $texts) {
                    $errors[] = ['filename' => $filename, 'message' => 'Keine verwertbare Antwort für "' . \rex_escape($filename) . '" erhalten.'];

                    continue;
                }
                $items[] = [
                    'filename' => $filename,
                    'title' => (string) $media->getValue('title'),
                    'texts' => $texts,
                ];
            } catch (\Throwable $e) {
                $errors[] = ['filename' => $filename, 'message' => \rex_escape($filename) . ': ' . $e->getMessage()];
            }
        }

        $processed = count($batch);
        $remaining = max(0, count($eligible) - $processed);

        $this->send(['success' => true, 'items' => $items, 'errors' => $errors, 'processed' => $processed, 'remaining' => $remaining]);
    }

    /**
     * Schreibt die vom Client geprueften/bearbeiteten Textvorschlaege --
     * einziger Schreibpunkt dieses Endpunkts. Rechte werden hier nochmal
     * pro Datei geprueft, da die Liste vollstaendig vom Client kommt.
     *
     * @param array<string, mixed> $body
     */
    private function handleApply(array $body): void
    {
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        $succeeded = 0;
        $errors = [];

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $filename = (string) ($item['filename'] ?? '');
            $rawTexts = is_array($item['texts'] ?? null) ? $item['texts'] : [];

            $textByClangId = [];
            foreach ($rawTexts as $clangId => $text) {
                if (is_string($text) && '' !== trim($text)) {
                    $textByClangId[(string) $clangId] = trim($text);
                }
            }

            $media = '' !== $filename ? \rex_media::get($filename) : null;
            if (!$media) {
                $errors[] = ['filename' => $filename, 'message' => 'Datei "' . \rex_escape($filename) . '" nicht gefunden.'];

                continue;
            }
            if (!MediaPermission::hasCategoryAccess($media->getCategoryId())) {
                $errors[] = ['filename' => $filename, 'message' => 'Kein Zugriff auf diese Kategorie.'];

                continue;
            }
            if ([] === $textByClangId) {
                $errors[] = ['filename' => $filename, 'message' => 'Kein Text zum Übernehmen für "' . \rex_escape($filename) . '".'];

                continue;
            }

            try {
                AiAltTextWriter::write($media, $textByClangId);
                ++$succeeded;
            } catch (\Throwable $e) {
                $errors[] = ['filename' => $filename, 'message' => \rex_escape($filename) . ': ' . $e->getMessage()];
            }
        }

        $this->send(['success' => true, 'succeeded' => $succeeded, 'errors' => $errors]);
    }

    /**
     * Dateien ohne ALT-Text, zugaenglich fuer den aktuellen Nutzer, OHNE
     * SVGs (Vektorformat, kein verlaessliches KI-Bildverstaendnis -- siehe
     * AiAltTextService::generateAltText(), gleicher Ausschluss wie
     * filepond_uploader). SVGs werden separat gezaehlt (siehe
     * accessibleSvgFilenames()), damit der Client den Nutzer informieren
     * kann, statt sie in der Massengenerierung einfach scheitern zu lassen.
     *
     * @return list<string>
     */
    private function accessibleEligibleFilenames(): array
    {
        return $this->filterAccessible($this->filterByExtension(AltTextStatus::getFilenamesMissingAlt(), false));
    }

    /**
     * @return list<string>
     */
    private function accessibleSvgFilenames(): array
    {
        return $this->filterAccessible($this->filterByExtension(AltTextStatus::getFilenamesMissingAlt(), true));
    }

    /**
     * @param list<string> $filenames
     * @return list<string>
     */
    private function filterByExtension(array $filenames, bool $onlySvg): array
    {
        return array_values(array_filter($filenames, static function (string $filename) use ($onlySvg): bool {
            $isSvg = 'svg' === strtolower(pathinfo($filename, PATHINFO_EXTENSION));

            return $onlySvg ? $isSvg : !$isSvg;
        }));
    }

    /**
     * @param list<string> $filenames
     * @return list<string>
     */
    private function filterAccessible(array $filenames): array
    {
        if (MediaPermission::hasFullAccess()) {
            return $filenames;
        }

        $accessibleCats = array_flip(MediaPermission::getAccessibleCategoryIds());

        return array_values(array_filter($filenames, static function (string $filename) use ($accessibleCats): bool {
            $media = \rex_media::get($filename);

            return $media && isset($accessibleCats[$media->getCategoryId()]);
        }));
    }

    /**
     * @param array<string, mixed> $data
     */
    private function send(array $data, int $status = 200): never
    {
        \rex_response::cleanOutputBuffers();
        if (200 !== $status) {
            http_response_code($status);
        }
        \rex_response::sendJson($data);
        exit;
    }
}
