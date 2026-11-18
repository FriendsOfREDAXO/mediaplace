<?php

/**
 * Gleicht Zeichensatz und Sortierung (Collation) der filename-Spalten von MediaPlace an rex_media.filename an.
 *
 * MediaPlace verknüpft seine Tabellen über filename mit rex_media (Tag-Leiste, Sammlungen, Tags per Kategorie).
 * Ältere Installationen haben rex_media oft noch mit utf8mb3_general_ci, neu angelegte Tabellen bekommen dagegen
 * z. B. utf8mb3_unicode_ci – MariaDB/MySQL lehnt den Vergleich dann ab:
 * „Illegal mix of collations … for operation '='“ (HTTP 500 in mediaplace_tags).
 *
 * Eigenständig (keine Klasse), damit install.php und update.php sie nutzen können – update.php läuft noch im
 * Kontext der alten AddOn-Version.
 *
 * Sicher für alle Installationen:
 *  - Stimmen die Sortierungen schon überein (Normalfall), wird nur gelesen, nichts geändert.
 *  - Geändert wird ausschließlich die filename-Spalte der MediaPlace-eigenen Tabelle, nie rex_media.
 *  - Die Spalte enthält nur Dateinamen aus rex_media; die passen per Definition in deren Zeichensatz.
 *  - Jeder Fehler wird nur protokolliert – Install und Update laufen in jedem Fall weiter.
 */

return static function (): void {
    try {
        $media = rex::getTable('media');
        $tables = [
            rex::getTable('mediaplace_media_tags') => ['filename' => ['varchar(255)', true]],
        ];

        $sql = rex_sql::factory();
        $reference = $sql->getArray(
            'SELECT CHARACTER_SET_NAME AS cs, COLLATION_NAME AS co FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$media, 'filename'],
        );
        if ([] === $reference || !$reference[0]['cs'] || !$reference[0]['co']) {
            return;
        }
        $charset = (string) $reference[0]['cs'];
        $collation = (string) $reference[0]['co'];
        if (!preg_match('/^\w+$/', $charset) || !preg_match('/^\w+$/', $collation)) {
            return;
        }

        foreach ($tables as $table => $columns) {
            foreach ($columns as $column => [$type, $nullable]) {
                $current = $sql->getArray(
                    'SELECT COLLATION_NAME AS co FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                    [$table, $column],
                );
                if ([] === $current || $current[0]['co'] === $collation) {
                    continue;
                }
                $sql->setQuery(sprintf(
                    'ALTER TABLE %s MODIFY %s %s CHARACTER SET %s COLLATE %s %s',
                    $sql->escapeIdentifier($table),
                    $sql->escapeIdentifier($column),
                    $type,
                    $charset,
                    $collation,
                    $nullable ? 'NULL' : 'NOT NULL',
                ));
            }
        }
    } catch (Throwable $e) {
        // Nie Install/Update abbrechen – im Zweifel bleibt alles wie es war, der Fehler steht im Systemlog
        rex_logger::logException($e);
    }
};
