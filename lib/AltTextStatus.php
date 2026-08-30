<?php

namespace FriendsOfRedaxo\Mediaplace;

/**
 * Prueft, ob fuer eine Datei ALT-Text fehlt -- fuer den Hinweis unter dem
 * "Metadaten bearbeiten"-Button im Detail-Panel. Eigene Metadaten (Feldtyp
 * "alt") haben Vorrang vor dem klassischen med_alt-Feld, wenn sie aktiv sind
 * und konfiguriert wurden; sonst zaehlt med_alt.
 */
class AltTextStatus
{
    /**
     * @param array<string, mixed> $ownData aktuelle Werte aus med_json_data
     */
    public static function isMissing(\rex_media $media, array $ownData): bool
    {
        // ALT-Text ist ein Bild-Barrierefreiheits-Konzept -- bei PDFs/Videos/
        // Audio etc. gibt es kein sinnvolles ALT-Attribut, der Hinweis waere
        // dort nur verwirrend.
        if (!$media->isImage()) {
            return false;
        }

        $ownField = self::findOwnAltField();
        if ($ownField instanceof MetainfoField) {
            return self::isOwnValueEmpty($ownData[$ownField->getKey()] ?? null);
        }

        return self::isClassicAltEmpty($media);
    }

    /**
     * Ob der "Bitte ALT-Text hinterlegen"-Hinweis unter dem "Metadaten
     * bearbeiten"-Button (natives Formular, klassisches med_alt) gezeigt
     * werden soll. Ist das eigene Alt-Feld aktiv, hat DAS sein eigenes,
     * direkt am Feld sitzendes Hinweis-Widget (siehe
     * detail_field_body_alt.php) -- der Hinweis hier waere dann nicht nur
     * doppelt, sondern auch irrefuehrend: der Klick auf "Metadaten
     * bearbeiten" fuehrt zum klassischen med_alt-Feld im nativen Formular,
     * nicht zum eigentlich fehlenden eigenen Feld.
     *
     * @param array<string, mixed> $ownData aktuelle Werte aus med_json_data
     */
    public static function shouldShowNativeCanvasHint(\rex_media $media, array $ownData): bool
    {
        if (null !== self::findOwnAltField()) {
            return false;
        }
        return self::isMissing($media, $ownData);
    }

    private static function findOwnAltField(): ?MetainfoField
    {
        if (!\rex_config::get('mediaplace', 'enable_own_metadata', false)) {
            return null;
        }
        foreach (MetainfoFieldGroup::getFields() as $field) {
            if ('alt' === $field->getWidgetType()) {
                return $field;
            }
        }
        return null;
    }

    private static function isOwnValueEmpty(mixed $value): bool
    {
        if (!is_array($value)) {
            return true;
        }
        if (!empty($value['decorative'])) {
            return false;
        }
        foreach ((array) ($value['text'] ?? []) as $text) {
            if ('' !== trim((string) $text)) {
                return false;
            }
        }
        return true;
    }

    private static function isClassicAltEmpty(\rex_media $media): bool
    {
        if (!self::classicAltFieldExists()) {
            return false;
        }

        $sql = \rex_sql::factory();
        $sql->setQuery('SELECT med_alt FROM ' . \rex::getTable('media') . ' WHERE id = ?', [$media->getId()]);
        if (1 !== $sql->getRows()) {
            return false;
        }

        return '' === trim((string) $sql->getValue('med_alt'));
    }

    private static function classicAltFieldExists(): bool
    {
        if (!\rex_addon::get('metainfo')->isAvailable()) {
            return false;
        }

        $sql = \rex_sql::factory();
        $exists = $sql->getArray(
            'SELECT id FROM ' . \rex::getTable('metainfo_field') . ' WHERE name = :name',
            ['name' => 'med_alt'],
        );

        return [] !== $exists;
    }

    /**
     * True, wenn es UEBERHAUPT ein ALT-Text-Feld gibt (eigenes oder
     * klassisches) -- steuert, ob die "Medien ohne ALT-Text"-Sidebar-Ansicht
     * ueberhaupt sinnvoll ist (siehe boot.php OUTPUT_FILTER,
     * data-alt-missing-filter-available).
     */
    public static function hasAltField(): bool
    {
        return null !== self::findOwnAltField() || self::classicAltFieldExists();
    }

    /**
     * Bulk-Variante von isMissing() fuer die "Medien ohne ALT-Text"-Ansicht
     * (Api\MediaList.php, filter[alt_missing]): liest alle Bilddateien in
     * einem Rutsch statt pro Datei rex_media::get() + isMissing() aufzurufen,
     * folgt aber derselben Prioritaets-Logik (eigenes Feld vor med_alt).
     *
     * @return list<string>
     */
    public static function getFilenamesMissingAlt(): array
    {
        $ownField = self::findOwnAltField();

        if (null === $ownField && !self::classicAltFieldExists()) {
            return [];
        }

        $selectCol = null !== $ownField ? 'med_json_data' : 'med_alt';
        $sql = \rex_sql::factory();
        $rows = $sql->getArray(
            'SELECT filename, ' . $selectCol . " FROM " . \rex::getTable('media') . " WHERE filetype LIKE 'image/%'",
        );

        $missing = [];
        foreach ($rows as $row) {
            if (null !== $ownField) {
                $json = json_decode((string) ($row['med_json_data'] ?? ''), true);
                $ownData = is_array($json) ? $json : [];
                if (self::isOwnValueEmpty($ownData[$ownField->getKey()] ?? null)) {
                    $missing[] = (string) $row['filename'];
                }
            } elseif ('' === trim((string) ($row['med_alt'] ?? ''))) {
                $missing[] = (string) $row['filename'];
            }
        }

        return $missing;
    }
}
