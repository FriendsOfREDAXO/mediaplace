<?php

namespace FriendsOfRedaxo\Mediaplace\Api;

use FriendsOfRedaxo\Mediaplace\FfmpegIntegration;
use FriendsOfRedaxo\Mediaplace\ThumbWarmupCronjob;
use rex_api_function;
use rex_api_result;

/**
 * Manuelles Vorwaermen ALLER Grid-Vorschaubilder mit Fortschrittsanzeige
 * (pages/thumb_warmup.php) -- Ergaenzung zum bestehenden ThumbWarmupCronjob,
 * der nur in kleinen, periodischen Haeppchen die NEUESTEN Dateien nachzieht
 * (fuer den taeglichen Betrieb gedacht, keine Fortschritts-/Vollstaendigkeits-
 * Garantie). Hier dagegen: einmalig den KOMPLETTEN Bestand systematisch nach
 * ID durchpaginieren, bis wirklich jede Datei einmal angefasst wurde -- fuer
 * den Fall "grosser, kalter Bestand nach Migration/Erstinstallation, jetzt
 * einmal komplett durchwaermen statt auf viele Cron-Laeufe zu warten".
 *
 * rex_media_manager::create() erkennt einen vorhandenen, aktuellen Cache-
 * Eintrag selbst und ueberspringt die eigentliche Konvertierung dafuer (billig
 * genug, um es nicht separat vorab zu pruefen) -- ein wiederholter Aufruf
 * dieses Endpunkts ist damit gefahrlos (kein Doppel-Rendern bereits gecachter
 * Dateien).
 *
 * Bewusst kleine feste Batch-Groesse pro Request (siehe BATCH_SIZE): der
 * Client (thumb_warmup.php) ruft sequentiell, nicht parallel, auf -- genau
 * das soll die vielen gleichzeitigen Media-Manager-Anfragen vermeiden, die
 * auf langsamen Servern beim normalen Lazy-Loading eines grossen, kalten
 * Grids zum Problem werden.
 *
 * POST (JSON body, {action: ...}):
 * - count       {} -> Gesamtanzahl Dateien je Typ (fuer die Fortschrittsanzeige)
 * - warm_batch  {type: 'image'|'video', offset} -> waermt bis zu BATCH_SIZE
 *   Dateien ab offset, gibt {processed, next_offset, total, done} zurueck
 */
class ThumbWarmup extends rex_api_function
{
    // Siehe Api\StorageUsage/CategoryBulk-Kommentar: umgeht nur das
    // isBackend()-Gate, execute() prueft Login+Rechte ohnehin selbst.
    protected $published = true;

    private const BATCH_SIZE = 15;

    public function execute(): rex_api_result
    {
        \rex_response::cleanOutputBuffers();

        if (!\rex::getUser()) {
            \rex_response::setStatus(\rex_response::HTTP_UNAUTHORIZED);
            \rex_response::sendJson(['error' => 'Unauthorized']);
            exit;
        }

        // Eigene Admin-Seite (siehe package.yml, perm: admin) -- konsistent
        // dazu auch hier volle Admin-Pruefung statt der sonst ueblichen
        // MediaPermission::hasMediaAccess() (die wuerde jedem mit Basis-
        // Medienzugriff erlauben, auf einem fremden Server potenziell
        // teure Massen-Konvertierungen anzustossen).
        $user = \rex::getUser();
        if (!$user->isAdmin()) {
            \rex_response::setStatus(\rex_response::HTTP_FORBIDDEN);
            \rex_response::sendJson(['error' => 'Permission denied']);
            exit;
        }

        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body)) {
            $body = [];
        }
        $action = (string) ($body['action'] ?? '');

        switch ($action) {
            case 'count':
                $this->handleCount();
                break;
            case 'warm_batch':
                $this->handleWarmBatch($body);
                break;
            default:
                \rex_response::setStatus(\rex_response::HTTP_BAD_REQUEST);
                \rex_response::sendJson(['error' => 'Unknown action']);
        }

        exit;
    }

    private function handleCount(): void
    {
        $videoType = FfmpegIntegration::isAvailable() ? FfmpegIntegration::getActiveVideoThumbType() : null;

        \rex_response::sendJson([
            'image' => ['total' => $this->countForExtensions(ThumbWarmupCronjob::IMAGE_EXTENSIONS)],
            'video' => [
                'total' => null !== $videoType ? $this->countForExtensions(FfmpegIntegration::supportedExtensions()) : 0,
                'active' => null !== $videoType,
            ],
        ]);
    }

    /**
     * @param mixed[] $body
     */
    private function handleWarmBatch(array $body): void
    {
        $type = (string) ($body['type'] ?? '');
        $offset = max(0, (int) ($body['offset'] ?? 0));

        if ('image' === $type) {
            $mmType = ThumbWarmupCronjob::IMAGE_TYPE;
            $extensions = ThumbWarmupCronjob::IMAGE_EXTENSIONS;
        } elseif ('video' === $type) {
            $mmType = FfmpegIntegration::isAvailable() ? FfmpegIntegration::getActiveVideoThumbType() : null;
            $extensions = FfmpegIntegration::supportedExtensions();
            if (null === $mmType) {
                \rex_response::sendJson(['processed' => 0, 'next_offset' => $offset, 'total' => 0, 'done' => true]);
                return;
            }
        } else {
            \rex_response::setStatus(\rex_response::HTTP_BAD_REQUEST);
            \rex_response::sendJson(['error' => 'Unknown type']);
            return;
        }

        $total = $this->countForExtensions($extensions);

        $sql = \rex_sql::factory();
        $placeholders = implode(',', array_fill(0, count($extensions), '?'));
        // LIMIT/OFFSET direkt eingebaut statt als Platzhalter (wie schon in
        // ThumbWarmupCronjob::warmupType()) -- beides int-typisiert (BATCH_SIZE
        // Konstante, $offset per (int)-Cast oben), kein Injection-Risiko, aber
        // PDO-Platzhalter fuer LIMIT/OFFSET sind je nach Treiber-Konfiguration
        // nicht zuverlaessig.
        $sql->setQuery(
            'SELECT filename FROM ' . \rex::getTable('media') . '
             WHERE LOWER(SUBSTRING_INDEX(filename, \'.\', -1)) IN (' . $placeholders . ')
             ORDER BY id ASC
             LIMIT ' . self::BATCH_SIZE . ' OFFSET ' . $offset,
            $extensions,
        );

        $processed = 0;
        foreach ($sql as $row) {
            \rex_media_manager::create($mmType, (string) $row->getValue('filename'));
            ++$processed;
        }

        $nextOffset = $offset + $processed;

        \rex_response::sendJson([
            'processed' => $processed,
            'next_offset' => $nextOffset,
            'total' => $total,
            'done' => $processed < self::BATCH_SIZE || $nextOffset >= $total,
        ]);
    }

    /**
     * @param list<string> $extensions
     */
    private function countForExtensions(array $extensions): int
    {
        $sql = \rex_sql::factory();
        $placeholders = implode(',', array_fill(0, count($extensions), '?'));
        $row = $sql->getArray(
            'SELECT COUNT(*) AS c FROM ' . \rex::getTable('media') . '
             WHERE LOWER(SUBSTRING_INDEX(filename, \'.\', -1)) IN (' . $placeholders . ')',
            $extensions,
        );

        return (int) ($row[0]['c'] ?? 0);
    }
}
