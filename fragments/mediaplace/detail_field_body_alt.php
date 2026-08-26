<?php

/**
 * Feldkoerper fuer widget_type "alt" (ALT-Text + "dekorativ"-Checkbox).
 * Live-Aktualisierung des Fehlt-Hinweises beim Tippen laeuft JS-seitig
 * (updateAltHint() in mediapool3.js) -- dieses Fragment liefert nur den
 * initialen Zustand. Markup identisch zum 'alt'-Zweig von
 * renderJsonWidgetField().
 *
 * Vars: $field, $value, $clangs (siehe detail_field.php)
 *
 * @var rex_fragment $this
 */

$field = $this->getVar('field');
$value = $this->getVar('value');
$clangs = $this->getVar('clangs');
$key = (string) $field['key'];

$altValue = is_array($value) ? $value : [];
$altText = isset($altValue['text']) && is_array($altValue['text']) ? $altValue['text'] : [];
$decorative = !empty($altValue['decorative']);

$hasAltText = false;
foreach ($altText as $t) {
    if ('' !== trim((string) $t)) {
        $hasAltText = true;
        break;
    }
}
$altMissing = !$decorative && !$hasAltText;
?>
<div class="mp3-alt-wrap" data-alt-key="<?= rex_escape($key) ?>">
    <?php if ($altMissing): ?>
        <div class="mp3-alt-hint"><i class="fa-solid fa-triangle-exclamation"></i> ALT-Text fehlt – bitte ausfüllen oder als dekorativ markieren.</div>
    <?php endif; ?>
    <div class="mp3-lang-inputs"<?= $decorative ? ' style="display:none"' : '' ?>>
        <?php $this->subfragment('mediaplace/detail_lang_group.php', [
            'field_key' => $key,
            'values' => $altText,
            'multiline' => false,
            'clangs' => $clangs,
        ]); ?>
    </div>
    <label class="mp3-edit-checkbox-label"><input type="checkbox" data-json-field="<?= rex_escape($key) ?>-decorative"<?= $decorative ? ' checked' : '' ?>> Dekoratives Bild (kein ALT)</label>
</div>
