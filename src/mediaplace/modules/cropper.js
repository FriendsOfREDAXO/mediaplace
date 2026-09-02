/**
 * Zuschneiden-Canvas (Integration mit dem separaten cropper-Addon, nur aktiv
 * wenn canCropper -- siehe #mp-root data-cropper-available). Fuenfte
 * Extraktion aus core.js (siehe DEV.md/Modularisierungs-Plan), nach dem
 * gleichen Muster wie modules/providers.js/modals.js/lightbox.js/focuspoint.js.
 *
 * Anders als Metadaten/Fokuspunkt wird hier NICHT neu gebaut: cropper's
 * eigenes UI (Ratio-Presets, Zoom/Rotate/Flip, Live-Vorschau) kommt 1:1 vom
 * Server (rex_api_mediaplace_crop.php) und wird per "rex:ready" (REDAXOs
 * Standard-Konvention fuer nachtraeglich eingefuegten Inhalt, siehe
 * mp-widget.js/metainfo_lang_fields) selbst initialisiert.
 *
 * Bleibt vorerst Teil des Haupt-Bundles (statischer Import), gleiche
 * Begruendung wie bei modules/focuspoint.js -- die addon-optionale
 * Auslagerung ist ein separater Folgeschritt, siehe DEV.md.
 *
 * Event-Listener-REGISTRIERUNG: der Klick-Listener auf #mp-crop-canvas
 * (nur der Zurueck-Button) ist bereits vollstaendig eigenstaendig und
 * wandert komplett hierher (initCropper()).
 */

import { isFocuspointCanvasOpen, closeFocuspointCanvas } from './focuspoint.js';

var ctx = null;
var cropCanvasOpen = false;
var cropCanvasFilename = null;

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;
var qs = MPCore.helpers.qs;
var apiLoadCropPanel = MPCore.api.apiLoadCropPanel;
var apiSaveCrop = MPCore.api.apiSaveCrop;

/**
 * ctx-Vertrag:
 * - overlay: DOM-Ref
 * - canCropper: bool (einmalig aus #mp-root data-cropper-available gelesen)
 * - mediaForceCacheTokens: Objekt-Referenz (wird in-place mutiert)
 * - getCurrentCat()/setCurrentCat(): Zugriff auf noch-legacy-State
 * - isMetainfoCanvasOpen()/closeMetainfoCanvas(): Metainfo-Canvas ist
 *   exklusiv zum Crop-Canvas (siehe openCropCanvas())
 * - loadFiles()/showDetail(): noch-legacy-Funktionen (nach dem Speichern)
 */
export function initCropper(theCtx) {
    ctx = theCtx;

    // Zuschneiden-Canvas: nur der Zurueck-Button liegt in unserem eigenen
    // Header -- Speichern laeuft ueber cropper's eigenes Formular
    // (initCropFormSubmit()), nicht ueber einen zweiten Button hier.
    var cropCanvas = qs('#mp-crop-canvas', ctx.overlay);
    if (cropCanvas) {
        cropCanvas.addEventListener('click', function (e) {
            if (e.target.closest('.mp-crop-canvas-back')) {
                closeCropCanvas();
            }
        });
    }
}

export function isCropCanvasOpen() {
    return cropCanvasOpen;
}

export function openCropCanvas(filename) {
    if (!ctx.overlay || !ctx.canCropper || !filename) return;
    if (ctx.isMetainfoCanvasOpen()) ctx.closeMetainfoCanvas();
    if (isFocuspointCanvasOpen()) closeFocuspointCanvas();

    cropCanvasOpen = true;
    cropCanvasFilename = filename;

    var content = qs('.mp-content', ctx.overlay);
    if (content) content.classList.add('mp-crop-mode');

    var canvas = qs('#mp-crop-canvas', ctx.overlay);
    if (canvas) canvas.style.display = '';

    var titleEl = qs('.mp-crop-canvas-title', canvas);
    if (titleEl) titleEl.textContent = filename;

    var bodyEl = document.getElementById('mp-crop-canvas-body');
    if (bodyEl) bodyEl.innerHTML = '<div class="mp-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_loading_more') + '</div>';

    apiLoadCropPanel(filename)
        .then(function (html) {
            if (!bodyEl || cropCanvasFilename !== filename) return;
            bodyEl.innerHTML = html || '';
            if (window.jQuery) {
                window.jQuery(document).trigger('rex:ready', [window.jQuery(bodyEl)]);
            }
            var form = qs('.mp-crop-form', bodyEl);
            if (form) initCropFormSubmit(form, filename);
        })
        .catch(function (err) {
            if (!bodyEl) return;
            bodyEl.innerHTML = '<div class="mp-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
        });
}

export function closeCropCanvas() {
    cropCanvasOpen = false;
    cropCanvasFilename = null;

    var content = qs('.mp-content', ctx.overlay);
    if (content) content.classList.remove('mp-crop-mode');
    var canvas = qs('#mp-crop-canvas', ctx.overlay);
    if (canvas) canvas.style.display = 'none';
    var bodyEl = document.getElementById('mp-crop-canvas-body');
    if (bodyEl) bodyEl.innerHTML = '';
}

// Fetch-basiertes Speichern statt echter Formular-Navigation (cropper's
// eigenes <form action> wuerde das Overlay per vollem Seiten-Reload
// verlassen) -- preventDefault() + apiSaveCrop() stattdessen. rex_cropper.js's
// eigener submit-Handler (initSaveGuard(), zeigt den "Speichern..."-Overlay)
// laeuft unabhaengig weiter -- jeder der beiden preventDefault()-Aufrufe
// reicht, die Listener-Reihenfolge spielt keine Rolle.
function initCropFormSubmit(form, filename) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var reloadCat = ctx.getCurrentCat();
        apiSaveCrop(filename, new FormData(form))
            .then(function (result) {
                var resultFilename = result.filename || filename;
                ctx.mediaForceCacheTokens[resultFilename] = Date.now();
                ctx.mediaForceCacheTokens[filename] = Date.now();
                closeCropCanvas();
                ctx.setCurrentCat(reloadCat);
                ctx.loadFiles(reloadCat, true);
                ctx.showDetail(resultFilename);
            })
            .catch(function (err) {
                form.dataset.cropperSaving = '0';
                form.classList.remove('cropper-is-saving');
                var savingOverlay = form.querySelector('.cropper-save-overlay');
                if (savingOverlay) savingOverlay.remove();
                alert(t('mediaplace_error_cropping', { msg: err.message }));
            });
    });
}
