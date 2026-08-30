<?php

namespace FriendsOfRedaxo\Mediaplace;

/**
 * Schreibt generierten ALT-Text ins richtige Ziel -- eigenes JSON-Feld
 * (Widget-Typ "alt") falls aktiv+konfiguriert, sonst klassisches med_alt.
 * Nutzt AltTextStatus::resolveOwnAltField() fuer dieselbe Prioritaets-Logik
 * wie der "ALT-Text fehlt"-Filter, statt sie ein zweites Mal zu ermitteln.
 * Nur fuer Api\AiAltBulk.php (Massengenerierung, kein Einzel-Review) --
 * der Einzeldatei-Button (Api\AiAltText.php) schreibt bewusst NICHT selbst,
 * siehe dortiger Docblock.
 */
class AiAltTextWriter
{
    /**
     * @return list<int>
     */
    public static function resolveClangIds(): array
    {
        $ownField = AltTextStatus::resolveOwnAltField();
        if ($ownField instanceof MetainfoField && $ownField->isTranslatable()) {
            return \rex_clang::getAllIds();
        }

        // Klassisches med_alt: bewusst nur die Startsprache -- keine volle
        // metainfo_lang_fields-Integration in v1.
        return [\rex_clang::getStartId()];
    }

    /**
     * @param array<string, string> $textByClangId clang-id (String-Key) => Text
     */
    public static function write(\rex_media $media, array $textByClangId): void
    {
        if ([] === $textByClangId) {
            return;
        }

        $ownField = AltTextStatus::resolveOwnAltField();
        if ($ownField instanceof MetainfoField) {
            self::writeOwnField($media, $ownField, $textByClangId);

            return;
        }

        self::writeClassicField($media, $textByClangId);
    }

    /**
     * @param array<string, string> $textByClangId
     */
    private static function writeOwnField(\rex_media $media, MetainfoField $field, array $textByClangId): void
    {
        $data = MetainfoJsonStorage::loadFromMedia($media);
        $current = MetainfoJsonStorage::getFieldValue($data, $field->getKey());
        $value = is_array($current) ? $current : [];

        if ($field->isTranslatable()) {
            $textData = is_array($value['text'] ?? null) ? $value['text'] : [];
            foreach ($textByClangId as $clangId => $text) {
                $textData[(string) $clangId] = $text;
            }
            $value['text'] = $textData;
        } else {
            $value['text'] = reset($textByClangId);
        }

        MetainfoJsonStorage::setFieldValue($data, $field->getKey(), $value);
        MetainfoJsonStorage::saveToMedia($media, $data);
    }

    /**
     * @param array<string, string> $textByClangId
     */
    private static function writeClassicField(\rex_media $media, array $textByClangId): void
    {
        $text = (string) reset($textByClangId);
        $filename = $media->getFileName();

        // rex_media_service::updateMedia() ist HIER die falsche Wahl: die
        // Funktion kennt nur title/category_id/Datei-Upload-Spalten fest
        // verdrahtet, jedes 'med_alt' im $data-Array wird komplett ignoriert
        // -- der Text landete also nie in der Datenbank. Schlimmer noch:
        // sie liest $data['category_id'] OHNE Fallback (kein isset-Check),
        // ein fehlender Key wuerde still zu (int) null = 0 und die Datei in
        // die Wurzelkategorie verschieben. Direkt per rex_sql schreiben --
        // exakt dasselbe, bereits bewaehrte Muster wie
        // FocuspointIntegration::saveFocus() fuer ein einzelnes klassisches
        // Metainfo-Feld (kein Formular-Roundtrip, gleiche Aufraeum-/
        // Benachrichtigungskette wie ein normales Medien-Update).
        $sql = \rex_sql::factory();
        $sql->setTable(\rex::getTable('media'));
        $sql->setWhere(['filename' => $filename]);
        $sql->setValue('med_alt', $text);
        $sql->addGlobalUpdateFields();
        $sql->update();

        \rex_media_cache::delete($filename);
        \rex_extension::registerPoint(new \rex_extension_point('MEDIA_UPDATED', '', ['filename' => $filename, 'id' => $media->getId()]));
    }
}
