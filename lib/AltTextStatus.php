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
        $ownField = self::findOwnAltField();
        if ($ownField instanceof MetainfoField) {
            return self::isOwnValueEmpty($ownData[$ownField->getKey()] ?? null);
        }

        return self::isClassicAltEmpty($media);
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
        if (!\rex_addon::get('metainfo')->isAvailable()) {
            return false;
        }

        $fieldSql = \rex_sql::factory();
        $exists = $fieldSql->getArray(
            'SELECT id FROM ' . \rex::getTable('metainfo_field') . ' WHERE name = :name',
            ['name' => 'med_alt'],
        );
        if ([] === $exists) {
            return false;
        }

        $sql = \rex_sql::factory();
        $sql->setQuery('SELECT med_alt FROM ' . \rex::getTable('media') . ' WHERE id = ?', [$media->getId()]);
        if (1 !== $sql->getRows()) {
            return false;
        }

        return '' === trim((string) $sql->getValue('med_alt'));
    }
}
