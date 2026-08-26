<?php

/**
 * Feldkoerper fuer widget_type "media_link" (Verlinkung auf ein anderes
 * Medium, z.B. Poster-Bild). Auswahl per Klick im Raster / Zuruecksetzen
 * bleibt JS-seitig (setMediaLinkPickMode()/repaintMediaLinkWidget() in
 * mediapool3.js). Markup identisch zum 'media_link'-Zweig von
 * renderJsonWidgetField() / renderMediaLinkWidget().
 *
 * Vars: $field, $value (siehe detail_field.php)
 *
 * @var rex_fragment $this
 */

use FriendsOfRedaxo\Mediaplace\DetailPanelFormatter;

$field = $this->getVar('field');
$value = $this->getVar('value');
$key = (string) $field['key'];

$filename = is_string($value) ? $value : '';
?>
<div class="mp3-media-link-widget" data-json-field-wrap="<?= rex_escape($key) ?>">
    <div class="mp3-media-link-row">
        <input class="mp3-edit-input" type="text" readonly data-json-field="<?= rex_escape($key) ?>" value="<?= rex_escape($filename) ?>" placeholder="Kein Medium verlinkt">
        <button type="button" class="mp3-media-link-picker" data-field="<?= rex_escape($key) ?>"><i class="fa-solid fa-photo-film"></i></button>
        <button type="button" class="mp3-media-link-clear" data-field="<?= rex_escape($key) ?>"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="mp3-media-link-pick-hint" style="display:none"><i class="fa-solid fa-circle-info"></i> Auswahl aktiv: Datei im Raster anklicken.</div>
    <?php if ('' !== $filename && DetailPanelFormatter::isImageFilename($filename)): ?>
        <?php
        $linkedMedia = rex_media::get($filename);
        $updatedate = $linkedMedia ? (string) $linkedMedia->getValue('updatedate') : '';
        $filesize = $linkedMedia ? (int) $linkedMedia->getValue('filesize') : 0;
        $previewSrc = DetailPanelFormatter::mediaThumbUrl($filename, 'rex_media_small', $updatedate, $filesize);
        ?>
        <div class="mp3-media-link-preview"><img src="<?= rex_escape($previewSrc) ?>" alt=""></div>
    <?php endif; ?>
</div>
