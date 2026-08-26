<?php

/**
 * System-Tags-Feld (global, nicht Teil der Custom-Feld-Widgets), Markup
 * identisch zu renderSystemTagsField() in mediapool3.js. Sammlungs-Tags
 * ("collection:..."-Praefix) sind hier absichtlich nicht editierbar --
 * werden ueber die Sammlungsauswahl in der Sidebar verwaltet.
 *
 * Vars:
 * - list<array{name:string,color:string}> $tags    bereits collection-gefiltert
 * - list<array{name:string,color:string}> $catalog  globaler Tag-Katalog
 *
 * @var rex_fragment $this
 */

$tags = $this->getVar('tags');
$catalog = $this->getVar('catalog');

$selectedNames = [];
foreach ($tags as $t) {
    $selectedNames[strtolower((string) $t['name'])] = true;
}
?>
<div class="mp3-edit-field mp3-json-field" data-field-key="__system_tags">
    <label class="mp3-edit-label"><?= rex_escape($this->i18n('mediaplace_system_tags')) ?> <span class="mp3-edit-kind-badge">global</span></label>
    <?php $this->subfragment('mediaplace/detail_tags_widget.php', [
        'key' => '__system_tags',
        'tags' => $tags,
        'with_datalist' => true,
    ]); ?>
    <datalist id="mp3-system-tags-suggestions">
        <?php foreach ($catalog as $item): ?>
            <?php
            $name = trim((string) ($item['name'] ?? ''));
            if ('' === $name || 0 === stripos($name, 'collection:') || isset($selectedNames[strtolower($name)])) {
                continue;
            }
            ?>
            <option value="<?= rex_escape($name) ?>"></option>
        <?php endforeach; ?>
    </datalist>
    <div class="mp3-metainfo-hint"><?= rex_escape($this->i18n('mediaplace_system_tags_hint')) ?></div>
    <button type="button" class="mp3-field-save-btn" data-save-field="__system_tags" style="display:none"><i class="fa-solid fa-floppy-disk"></i> <?= rex_escape($this->i18n('mediaplace_save')) ?></button>
</div>
