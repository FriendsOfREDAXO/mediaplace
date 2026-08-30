/**
 * Lightbox (Bild-Vollansicht) + Fullscreen-Modus des Overlays. Dritte
 * Extraktion aus core.js (siehe DEV.md/Modularisierungs-Plan), nach dem
 * gleichen Muster wie modules/providers.js/modals.js.
 *
 * Event-Listener-REGISTRIERUNG (Klick auf .mp3-fullscreen-toggle/
 * .mp3-lightbox-open-btn/.mp3-lightbox-close/Backdrop, ESC-/F-Taste) bleibt
 * bewusst noch in core.js' build() -- wie bei providers.js/modals.js nur
 * die schlanken if/return-Zweige rufen hierher durch. Wichtig: der ESC-
 * Handler fuer die Lightbox teilt sich sein document-keydown-Listener mit
 * anderen Concerns (metainfoPickTarget/close()) und hat dort Vorrang (kein
 * close() der ganzen Overlay, wenn nur die Lightbox offen war) -- ein
 * eigener, separat registrierter keydown-Listener wuerde das nur ueber
 * stopImmediatePropagation() korrekt nachbilden koennen, siehe DEV.md fuer
 * die Begruendung, warum das (noch) nicht gemacht wird.
 */

var ctx = null;
var fullscreenMode = false;
var lightboxOpen = false;

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var qs = MP3Core.helpers.qs;

/** ctx-Vertrag: { overlay, lightboxLayer, lightboxImage, lightboxCaption }. */
export function initLightbox(theCtx) {
    ctx = theCtx;
}

export function isFullscreenMode() {
    return fullscreenMode;
}

export function isLightboxOpen() {
    return lightboxOpen;
}

export function setFullscreenMode(enabled) {
    fullscreenMode = !!enabled;
    if (!ctx.overlay) return;
    ctx.overlay.classList.toggle('mp3-fullscreen-mode', fullscreenMode);
    var btn = qs('.mp3-fullscreen-toggle', ctx.overlay);
    if (!btn) return;
    btn.innerHTML = fullscreenMode
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';
    btn.title = fullscreenMode ? t('mediaplace_restore_window_size') : t('mediaplace_fullscreen');
}

export function openLightbox(src, caption) {
    if (!ctx.lightboxLayer || !ctx.lightboxImage) return;
    if (!src) return;
    ctx.lightboxImage.src = src;
    ctx.lightboxImage.alt = caption || '';
    if (ctx.lightboxCaption) {
        ctx.lightboxCaption.textContent = caption || '';
        ctx.lightboxCaption.style.display = caption ? '' : 'none';
    }
    ctx.lightboxLayer.classList.add('mp3-lightbox-open');
    lightboxOpen = true;
}

export function closeLightbox() {
    if (!ctx.lightboxLayer) return;
    ctx.lightboxLayer.classList.remove('mp3-lightbox-open');
    if (ctx.lightboxImage) {
        ctx.lightboxImage.removeAttribute('src');
    }
    lightboxOpen = false;
}
