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

        // rex_media_service::updateMedia() liest $data['title'] OHNE
        // Fallback direkt -- 'title' muss deshalb immer mitgegeben werden
        // (siehe Api\CategoryBulk.php fuer denselben bereits dokumentierten
        // Stolperstein).
        \rex_media_service::updateMedia($media->getFileName(), [
            'title' => $media->getTitle(),
            'med_alt' => $text,
        ]);
    }
}
