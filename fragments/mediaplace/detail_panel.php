<?php

/**
 * Detail-Panel (rechtes Metadaten-Panel) fuer eine einzelne Mediendatei.
 * Ersetzt renderDetail() + zugehoerige Render-Helfer in mediapool3.js.
 *
 * Markup ist bewusst 1:1 identisch zu dem, was renderDetail() vorher per
 * JS-String-Konkatenation gebaut hat -- gleiche Klassen/data-Attribute,
 * damit die bestehende Event-Delegation (overlay.addEventListener(...) in
 * mediapool3.js) unveraendert weiterfunktioniert. Interaktion/Speichern
 * bleibt komplett JS-seitig (collectJsonValuesFromDetail()/saveDetail()),
 * dieses Fragment liefert nur den initialen Rendering-Zustand.
 *
 * Vars:
 * - array $info               filename/title/filetype/filesize/width/height/
 *                              created_formatted/createuser/updated_formatted/
 *                              updateuser/is_image/is_in_use/file_exists/category_id
 * - array $data                aktuelle Feldwerte (med_json_data)
 * - array $fields               Felddefinitionen (id/key/label/widget_type/options/translatable/image_only)
 * - array $clangs                Sprachen (id/name/code)
 * - array $system_tags_normal    System-Tags ohne Sammlungs-Tags
 * - array $system_tag_catalog    globaler Tag-Katalog (Autocomplete)
 * - array $collection_names      Namen der Sammlungen, denen die Datei angehoert
 * - array $category_list         flache Kategorienliste (Verschieben-Select)
 * - bool  $feature_tagging       Einstellungen-Toggle: System-Tags-Feld zeigen?
 * - bool  $feature_collections   Einstellungen-Toggle: Sammlungen-Zeile zeigen?
 * - bool  $feature_legacy_metainfo  Einstellungen-Toggle: Alte-Metadaten-Bereich zeigen?
 *
 * @var rex_fragment $this
 */

/** @var array<string, mixed> $info */
$info = $this->getVar('info');
$data = $this->getVar('data');
$fields = $this->getVar('fields');
$clangs = $this->getVar('clangs');
$systemTagsNormal = $this->getVar('system_tags_normal');
$systemTagCatalog = $this->getVar('system_tag_catalog');
$collectionNames = $this->getVar('collection_names');
$categoryList = $this->getVar('category_list');
$featureTagging = (bool) $this->getVar('feature_tagging');
$featureCollections = (bool) $this->getVar('feature_collections');
$featureLegacyMetainfo = (bool) $this->getVar('feature_legacy_metainfo');

$headerName = $info['title'] !== '' ? $info['title'] : $info['filename'];
?>
<div class="mp3-detail-inner">
    <div class="mp3-detail-header">
        <span class="mp3-detail-header-name" title="<?= rex_escape($info['filename']) ?>"><?= rex_escape($headerName) ?></span>
        <button class="mp3-detail-close" title="<?= rex_escape($this->i18n('mediaplace_close')) ?>"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <?php $this->subfragment('mediaplace/detail_preview.php', [
        'info' => $info,
        'fields' => $fields,
        'data' => $data,
    ]); ?>

    <div class="mp3-edit-section">
        <?php $this->subfragment('mediaplace/detail_field_title.php', [
            'title' => $info['title'],
        ]); ?>

        <?php if ($featureTagging): ?>
            <?php $this->subfragment('mediaplace/detail_field_system_tags.php', [
                'tags' => $systemTagsNormal,
                'catalog' => $systemTagCatalog,
            ]); ?>
        <?php endif; ?>

        <?php if (!empty($fields)): ?>
            <?php foreach ($fields as $field): ?>
                <?php
                $fieldKey = (string) $field['key'];
                $fieldValue = array_key_exists($fieldKey, $data) ? $data[$fieldKey] : null;
                $this->subfragment('mediaplace/detail_field.php', [
                    'field' => $field,
                    'value' => $fieldValue,
                    'info' => $info,
                    'clangs' => $clangs,
                ]);
                ?>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>

    <?php $this->subfragment('mediaplace/detail_info_table.php', [
        'info' => $info,
        'collection_names' => $collectionNames,
        'category_list' => $categoryList,
        'feature_collections' => $featureCollections,
    ]); ?>

    <?php
    $legacyEditUrl = rex_url::backendController(['page' => 'mediapool/media', 'file_name' => $info['filename'], 'rex_file_category' => $info['category_id']], false);
    ?>
    <?php if ($featureLegacyMetainfo): ?>
        <div class="mp3-legacy-section">
            <button type="button" class="mp3-legacy-toggle-btn"><i class="fa-solid fa-chevron-right"></i> <?= rex_escape($this->i18n('mediaplace_legacy_metadata')) ?></button>
            <?php // newPoolWindow() ist REDAXOs eigene globale Popup-Funktion (core/assets/standard.js),
            // dieselbe, die openMediaPool()/openMediaDetails() im klassischen Medienpool nutzen --
            // gleiche Fenstergroesse/-optik wie jeder andere klassische Medienpool-Popup. ?>
            <button type="button" class="mp3-legacy-edit-link btn btn-default btn-xs"
                    onclick="newPoolWindow(<?= rex_escape(json_encode($legacyEditUrl)) ?>); return false;">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> <?= rex_escape($this->i18n('mediaplace_legacy_edit_classic')) ?>
            </button>
            <?php // Prototyp: Fasst dieselben Metainfo-Felder ueber REDAXOs eigenen
            // MEDIA_FORM_EDIT-Pfad direkt im Overlay-Canvas an, statt zum klassischen
            // Medienpool zu wechseln -- siehe rex_api_mediaplace_metainfo_form.php. ?>
            <button type="button" class="mp3-legacy-edit-link mp3-metainfo-canvas-open btn btn-default btn-xs"
                    data-canvas-file="<?= rex_escape($info['filename']) ?>"
                    data-canvas-label="<?= rex_escape($info['filename']) ?>">
                <i class="fa-solid fa-pen-to-square"></i> <?= rex_escape($this->i18n('mediaplace_metainfo_edit_native')) ?>
            </button>
            <div class="mp3-legacy-content" style="display:none"></div>
        </div>
    <?php endif; ?>

    <?php $this->subfragment('mediaplace/detail_actions.php', [
        'info' => $info,
    ]); ?>
</div>
