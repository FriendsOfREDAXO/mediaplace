<?php

/**
 * Aktionen-Zeile (Auswaehlen/Speichern/Ersetzen/Herunterladen/Loeschen), am
 * unteren Rand des Detail-Panels fixiert (position: sticky). Markup
 * identisch zum Aktionen-Teil von renderDetail() in mediaplace.js.
 *
 * Der "Auswaehlen"-Button wird -- anders als frueher in renderDetail(), wo
 * er nur bei onSelect/onMultiSelect ueberhaupt ausgegeben wurde -- immer
 * gerendert und per JS nach dem Einfuegen ein-/ausgeblendet (renderDetail()
 * in mediaplace.js), weil der PHP-Endpoint zur Renderzeit nicht wissen
 * kann, in welchem Auswahlmodus der Overlay gerade geoeffnet wurde. Er steht
 * auf einer eigenen, vollbreiten Zeile ueber den restlichen Buttons: bei fuenf
 * Buttons in einer Reihe (Auswaehlen/Ersetzen/Herunterladen/Speichern/
 * Loeschen) reichte die feste 320px-Panel-Breite nicht mehr aus, sobald
 * Speichern permanent sichtbar wurde (s.u.) -- "Auswaehlen" wurde dabei bis
 * zur Unlesbarkeit zusammengequetscht. Als Primaeraktion im Auswahlmodus
 * verdient er ohnehin die volle Breite statt mit den kleinen Icon-Buttons zu
 * konkurrieren.
 *
 * Aufteilung (3.1.0): Die zentralen Aktionen stehen direkt in der Zeile --
 * "Speichern" (breit, mit Text), Sammlungen (Lesezeichen), "Loeschen" (rotes
 * Symbol, ganz rechts). Seltener gebrauchte Werkzeuge (Ersetzen, Umbenennen,
 * Herunterladen) liegen im Menue "Weitere Aktionen" (…). Vorher standen sechs
 * Knoepfe in einer Reihe -- breiter als das 320px-Panel, "Loeschen" wurde
 * rechts an der Kante abgeschnitten. Menue-Logik: core.js (.mp-detail-more-btn).
 *
 * "Speichern" (.mp-detail-save-btn) lebt hier statt am Ende der (potenziell
 * langen, scrollbaren) Bearbeiten-Sektion, damit er nicht weggescrollt werden
 * kann -- immer sichtbar (Default: disabled), nur der disabled-Zustand wird
 * JS-seitig gesteuert (updateDetailSaveState(), aktiv nur bei ungespeicherten
 * Aenderungen). Bewusst kein display:none mehr, damit der Button als fester
 * Anker in der Actions-Zeile erkennbar bleibt statt bei Bedarf zu erscheinen.
 *
 * Vars:
 * - array $info siehe detail_panel.php
 * - bool  $feature_collections  Einstellungen-Toggle: Sammlungen-Zeile zeigen?
 * - bool  $has_collections      Ist diese Datei bereits Mitglied mind. einer
 *                                Sammlung? (nur fuer die .is-active-Optik)
 *
 * @var rex_fragment $this
 */

use FriendsOfRedaxo\Mediaplace\DetailPanelFormatter;

$info = $this->getVar('info');
$filename = $info['filename'];
$featureCollections = (bool) $this->getVar('feature_collections');
$hasCollections = (bool) $this->getVar('has_collections');

// Muss mit API_BASE in assets/mediaplace.js uebereinstimmen (fixe Route des
// FriendsOfRedaxo/api-Addons fuer die Backend-Session-Auth-Spiegelroute).
$apiBase = '/api/backend/';
$token = $info['updatedate'] ?: (string) $info['filesize'];
$downloadUrl = $apiBase . 'media/' . rawurlencode($filename) . '/file' . ($token ? '?mpv=' . rawurlencode($token) : '');
?>
<div class="mp-detail-actions">
    <button class="mp-detail-select-btn" data-filename="<?= rex_escape($filename) ?>" style="display:none"><i class="fa-solid fa-check"></i> <?= rex_escape($this->i18n('mediaplace_select')) ?></button>

    <div class="mp-detail-actions-row">
        <button type="button" class="mp-detail-save-btn" title="<?= rex_escape($this->i18n('mediaplace_save_changes')) ?>" disabled>
            <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> <?= rex_escape($this->i18n('mediaplace_save')) ?></button>
        <?php if ($featureCollections): ?>
            <button type="button" class="mp-detail-collection-btn<?= $hasCollections ? ' is-active' : '' ?>" data-filename="<?= rex_escape($filename) ?>" title="<?= rex_escape($this->i18n('mediaplace_manage_collections')) ?>" aria-label="<?= rex_escape($this->i18n('mediaplace_manage_collections')) ?>">
                <i class="fa-solid fa-bookmark" aria-hidden="true"></i></button>
        <?php endif; ?>
        <div class="mp-detail-more">
            <button type="button" class="mp-detail-more-btn" aria-expanded="false" title="<?= rex_escape($this->i18n('mediaplace_more_actions')) ?>" aria-label="<?= rex_escape($this->i18n('mediaplace_more_actions')) ?>">
                <i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
            <div class="mp-detail-more-menu" hidden>
                <?php /* Tausch-Pfeile statt Kreispfeilen (sah aus wie „Neu laden“, Issue #23); per Tastatur bedienbar */ ?>
                <label class="mp-detail-replace-btn mp-detail-more-item" role="button" tabindex="0" title="<?= rex_escape($this->i18n('mediaplace_replace_file')) ?>">
                    <i class="fa-solid fa-right-left" aria-hidden="true"></i><span><?= rex_escape($this->i18n('mediaplace_replace_file_short')) ?></span><input type="file" class="mp-detail-replace-input" accept="<?= rex_escape(DetailPanelFormatter::replacementAccept($filename)) ?>" style="display:none"></label>
                <?php if ($this->getVar('rename_available')): ?>
                    <button type="button" class="mp-detail-rename-btn mp-detail-more-item" data-filename="<?= rex_escape($filename) ?>">
                        <i class="fa-solid fa-i-cursor" aria-hidden="true"></i><span><?= rex_escape($this->i18n('mediaplace_rename_file')) ?></span></button>
                <?php endif; ?>
                <a class="mp-detail-download-btn mp-detail-more-item" href="<?= rex_escape($downloadUrl) ?>" download="<?= rex_escape($filename) ?>">
                    <i class="fa-solid fa-download" aria-hidden="true"></i><span><?= rex_escape($this->i18n('mediaplace_download_file')) ?></span></a>
            </div>
        </div>
        <button type="button" class="mp-detail-delete-btn" data-filename="<?= rex_escape($filename) ?>" data-in-use="<?= $info['is_in_use'] ? '1' : '0' ?>" data-in-use-detail="<?= rex_escape((string) ($info['is_in_use_detail'] ?? '')) ?>" title="<?= rex_escape($this->i18n('mediaplace_delete_file')) ?>" aria-label="<?= rex_escape($this->i18n('mediaplace_delete_file')) ?>">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
    </div>
</div>
