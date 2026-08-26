<?php

/**
 * Tag-Chip-Liste + Eingabefeld, Markup identisch zu renderTagsWidget() in
 * mediapool3.js. Interaktion (hinzufuegen/entfernen/Farbe aendern) bleibt
 * komplett JS-seitig (repaintTagsWidget() u.a., event delegation auf
 * overlay) -- dieses Fragment liefert nur den initialen Zustand.
 *
 * Vars:
 * - string $key           data-json-field-Key (z.B. "__system_tags")
 * - list<array{name:string,color:string}> $tags
 * - bool   $with_datalist true = Eingabefeld bekommt das system-tags-Autocomplete
 *
 * @var rex_fragment $this
 */

$key = (string) $this->getVar('key');
$tags = $this->getVar('tags');
$withDatalist = (bool) $this->getVar('with_datalist', false);
?>
<div class="mp3-tags-widget" data-json-field-wrap="<?= rex_escape($key) ?>">
    <input type="hidden" data-json-field="<?= rex_escape($key) ?>" data-widget="tags-value" value="<?= rex_escape(json_encode($tags)) ?>">
    <div class="mp3-tags-list">
        <?php foreach ($tags as $tag): ?>
            <span class="mp3-tag-item">
                <span class="mp3-tag-dot" style="background:<?= rex_escape($tag['color']) ?>"></span> <?= rex_escape($tag['name']) ?>
                <input type="color" class="mp3-tag-color" data-tag="<?= rex_escape($tag['name']) ?>" value="<?= rex_escape($tag['color']) ?>">
                <button type="button" class="mp3-tag-remove" data-tag="<?= rex_escape($tag['name']) ?>"><i class="fa-solid fa-xmark"></i></button>
            </span>
        <?php endforeach; ?>
    </div>
    <div class="mp3-tags-input-wrap">
        <input class="mp3-edit-input mp3-tags-input" type="text" placeholder="<?= rex_escape($this->i18n('mediaplace_add_tag')) ?>"<?= $withDatalist ? ' list="mp3-system-tags-suggestions"' : '' ?>>
        <button type="button" class="mp3-tags-add-btn"><i class="fa-solid fa-plus"></i></button>
    </div>
</div>
