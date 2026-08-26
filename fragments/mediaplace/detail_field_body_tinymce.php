<?php

/**
 * Feldkoerper fuer widget_type "tinymce". Kein inline WYSIWYG (siehe
 * getTinyLightOptions()-Kommentar in mediapool3.js -- dead code, wird hier
 * nicht reproduziert): stattdessen pro Sprache eine Vorschauzeile mit
 * "Bearbeiten"-Button, der den Vollbild-Editor-Canvas oeffnet
 * (openEditorCanvas() in mediapool3.js). Markup identisch zum
 * 'tinymce'-Zweig von renderJsonWidgetField().
 *
 * Vars: $field, $value, $clangs (siehe detail_field.php)
 *
 * @var rex_fragment $this
 */

use FriendsOfRedaxo\Mediaplace\DetailPanelFormatter;

$field = $this->getVar('field');
$value = $this->getVar('value');
$clangs = $this->getVar('clangs');
$key = (string) $field['key'];
$label = '' !== (string) $field['label'] ? $field['label'] : $key;

if (!empty($field['translatable'])) {
    $rows = !empty($clangs) ? $clangs : [['id' => 1, 'name' => 'Lang 1', 'code' => 'l1']];
    $valueMap = is_array($value) ? $value : [];
    foreach ($rows as $clang) {
        $clVal = (string) ($valueMap[(string) $clang['id']] ?? '');
        $badge = $clang['code'] ?: $clang['name'];
        ?>
        <input type="hidden" data-json-field="<?= rex_escape($key) ?>" data-clang="<?= rex_escape((string) $clang['id']) ?>" class="mp3-tiny-canvas-value" value="<?= rex_escape($clVal) ?>">
        <div class="mp3-tiny-canvas-row">
            <span class="mp3-lang-badge"><?= rex_escape($badge) ?></span>
            <div class="mp3-tiny-canvas-preview"><?= rex_escape(DetailPanelFormatter::tinyPreviewText($clVal)) ?></div>
            <button type="button" class="mp3-tiny-canvas-open" data-canvas-field="<?= rex_escape($key) ?>" data-canvas-clang="<?= rex_escape((string) $clang['id']) ?>" data-canvas-label="<?= rex_escape($label . ' (' . $badge . ')') ?>"><i class="fa-solid fa-pen-to-square"></i> Bearbeiten</button>
        </div>
        <?php
    }
    return;
}

$tinyVal = (string) $value;
?>
<input type="hidden" data-json-field="<?= rex_escape($key) ?>" class="mp3-tiny-canvas-value" value="<?= rex_escape($tinyVal) ?>">
<div class="mp3-tiny-canvas-row">
    <div class="mp3-tiny-canvas-preview"><?= rex_escape(DetailPanelFormatter::tinyPreviewText($tinyVal)) ?></div>
    <button type="button" class="mp3-tiny-canvas-open" data-canvas-field="<?= rex_escape($key) ?>" data-canvas-label="<?= rex_escape($label) ?>"><i class="fa-solid fa-pen-to-square"></i> Bearbeiten</button>
</div>
