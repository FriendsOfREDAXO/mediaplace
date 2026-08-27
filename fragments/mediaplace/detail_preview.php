<?php

/**
 * Vorschau-Bereich des Detail-Panels: Bild/Video/Audio/Icon je nach Dateityp.
 *
 * Vars:
 * - array $info   siehe detail_panel.php
 * - array $fields Felddefinitionen (aktuell ungenutzt, fuer kuenftige
 *                  Erweiterungspunkt-Widgets mit eigener Vorschau-Overlay-
 *                  Schicht mituebergeben)
 * - array $data   aktuelle Feldwerte
 *
 * @var rex_fragment $this
 */

use FriendsOfRedaxo\Mediaplace\DetailPanelFormatter;

/** @var array<string, mixed> $info */
$info = $this->getVar('info');
$filename = $info['filename'];
?>
<?php if ($info['is_image']): ?>
    <?php
    $src = DetailPanelFormatter::mediaThumbUrl($filename, 'rex_media_medium', $info['updatedate'], $info['filesize']);
    // Lightbox zeigt die Original-Datei in Upload-Qualitaet, nicht die kleine
    // rex_media_medium-Vorschau -- dafuer will man vergroessern.
    $lightboxSrc = DetailPanelFormatter::mediaFileUrl($filename, $info['updatedate'], $info['filesize']);
    ?>
    <div class="mp3-detail-preview">
        <button type="button" class="mp3-lightbox-open-btn" data-lightbox-src="<?= rex_escape($lightboxSrc) ?>" data-lightbox-caption="<?= rex_escape($info['title'] !== '' ? $info['title'] : $filename) ?>" title="<?= rex_escape($this->i18n('mediaplace_open_lightbox')) ?>"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
        <?php if (!empty($info['focuspoint_available'])): ?>
            <button type="button" class="mp3-focuspoint-edit-btn" data-focuspoint-file="<?= rex_escape($filename) ?>" title="<?= rex_escape($this->i18n('mediaplace_edit_focuspoint')) ?>"><i class="fa-solid fa-crosshairs"></i></button>
        <?php endif; ?>
        <img src="<?= rex_escape($src) ?>" alt="<?= rex_escape($info['title'] !== '' ? $info['title'] : $filename) ?>">
    </div>
<?php elseif (DetailPanelFormatter::isVideoFilename($filename)): ?>
    <?php $vidSrc = DetailPanelFormatter::mediaFileUrl($filename, $info['updatedate'], $info['filesize']); ?>
    <div class="mp3-detail-preview mp3-detail-preview-video">
        <video controls preload="metadata" playsinline>
            <source src="<?= rex_escape($vidSrc) ?>" type="<?= rex_escape($info['filetype'] ?: 'video/mp4') ?>">
        </video>
    </div>
<?php elseif (DetailPanelFormatter::isAudioFilename($filename)): ?>
    <?php $audSrc = DetailPanelFormatter::mediaFileUrl($filename, $info['updatedate'], $info['filesize']); ?>
    <div class="mp3-detail-preview mp3-detail-preview-audio">
        <i class="<?= rex_escape(DetailPanelFormatter::fileIconClass($filename)) ?>"></i>
        <audio controls preload="metadata">
            <source src="<?= rex_escape($audSrc) ?>" type="<?= rex_escape($info['filetype'] ?: 'audio/mpeg') ?>">
        </audio>
    </div>
<?php elseif (DetailPanelFormatter::isPdfFilename($filename)): ?>
    <?php $pdfSrc = DetailPanelFormatter::mediaFileUrl($filename, $info['updatedate'], $info['filesize']); ?>
    <div class="mp3-detail-preview mp3-detail-preview-icon">
        <a class="mp3-pdf-open-btn" href="<?= rex_escape($pdfSrc) ?>" target="_blank" rel="noopener" title="<?= rex_escape($this->i18n('mediaplace_open_pdf_new_tab')) ?>"><i class="fa-solid fa-up-right-from-square"></i></a>
        <i class="<?= rex_escape(DetailPanelFormatter::fileIconClass($filename)) ?>"></i>
    </div>
<?php else: ?>
    <div class="mp3-detail-preview mp3-detail-preview-icon">
        <i class="<?= rex_escape(DetailPanelFormatter::fileIconClass($filename)) ?>"></i>
    </div>
<?php endif; ?>
