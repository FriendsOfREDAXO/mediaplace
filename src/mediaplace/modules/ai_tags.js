/**
 * Optionale KI-Tag-Vorschlaege (siehe AiAutoTagService::isAvailable() --
 * rein soft-optional, ohne installiertes+konfiguriertes ai_platform-Addon,
 * aktivierte Einstellung UND mindestens einen KI-freigegebenen Tag bleibt
 * die URL am #mp3-root leer und diese Funktionen sind No-Ops).
 *
 * GESCHLOSSENES Vokabular (siehe AiAutoTagService-Docblock): Vorschlaege
 * kommen ausschliesslich aus bereits bestehenden, in der Tag-Verwaltung fuer
 * KI freigegebenen Tags. Ein Klick auf einen Vorschlag ruft exakt dieselbe
 * addTagFromWidget()-Funktion wie eine manuelle Tag-Auswahl auf (per
 * Callback von modules/detail.js hereingereicht, keine eigene Kopie der
 * Hinzufuegen-Logik) -- Review-vor-Speichern-Prinzip wie bei ai_alt.js:
 * ein Vorschlag landet erst im (ungespeicherten) Widget-Zustand, echtes
 * Schreiben passiert weiterhin nur ueber den normalen Speichern-Button.
 *
 * SVG-Rasterisierung (rasterizeSvgToPngDataUrl()) wird von modules/ai_alt.js
 * mitgenutzt statt dupliziert -- gleiche Begruendung wie dort (Server hat
 * keinen SVG-Rasterizer, der Browser rendert es stattdessen selbst).
 */

import { isSvgFilename, rasterizeSvgToPngDataUrl, buildIconButton, attachToLabel } from './ai_alt.js';

var ctx = null;

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var escAttr = MP3Core.helpers.escAttr;
var qs = MP3Core.helpers.qs;
var apiSuggestAiTags = MP3Core.api.apiSuggestAiTags;

/**
 * ctx-Vertrag:
 * - getAiAutoTagAvailable(): true nur wenn Feature aktiv, ai_platform
 *   verfuegbar UND mindestens ein Tag fuer KI freigegeben ist (siehe
 *   data-ai-auto-tag-url am #mp3-root)
 * - getMediaBaseUrl(): siehe ai_alt.js -- fuer den SVG-Rasterisierungs-Fetch
 */
export function initAiTags(theCtx) {
    ctx = theCtx;
}

function generateAiTagsFor(filename) {
    if (!isSvgFilename(filename)) {
        return apiSuggestAiTags(filename);
    }

    return rasterizeSvgToPngDataUrl(filename, 1024).then(function (dataUrl) {
        return apiSuggestAiTags(filename, dataUrl);
    });
}

function setBusy(btn, busy) {
    btn.disabled = busy;
    btn.classList.toggle('mp3-ai-tags-busy', busy);
}

// Namen bereits im (ggf. noch ungespeicherten) Widget-Zustand gewaehlter
// Tags -- Vorschlaege dafuer werden nicht nochmal angeboten.
function currentTagNames(wrap) {
    var hidden = qs('[data-widget="tags-value"]', wrap);
    var values = [];
    try { values = JSON.parse((hidden && hidden.value) || '[]'); } catch (e) { values = []; }
    if (!Array.isArray(values)) return [];

    var names = [];
    values.forEach(function (item) {
        var name = typeof item === 'string' ? item : String((item && item.name) || '');
        if (name) names.push(name);
    });
    return names;
}

/**
 * wrap: .mp3-tags-widget-Element (System-Tags-Feld).
 * onAdd: function(tagName) -- vom Aufrufer hereingereicht, ruft
 *   detail.js's addTagFromWidget(wrap, tagName) auf.
 */
export function attachTagSuggestButton(wrap, filename, onAdd) {
    if (!ctx.getAiAutoTagAvailable() || !filename) return;
    if (wrap.hasAttribute('data-ai-tags-attached')) return;
    wrap.setAttribute('data-ai-tags-attached', '1');

    // Icon-only-Trigger im Feld-Label statt eines ausgeschriebenen, das
    // Formular optisch unruhig machenden Buttons (gleiches Muster wie beim
    // ALT-Text-Button, siehe attachToLabel()-Docblock in ai_alt.js).
    var btn = buildIconButton('mediaplace_ai_tags_suggest');
    if (!attachToLabel(wrap, btn)) {
        wrap.insertBefore(btn, wrap.firstChild);
    }

    var suggestionsEl = document.createElement('div');
    suggestionsEl.className = 'mp3-ai-tags-suggestions';
    suggestionsEl.style.display = 'none';
    wrap.appendChild(suggestionsEl);

    btn.addEventListener('click', function (e) {
        e.preventDefault();
        var btn = e.currentTarget;
        setBusy(btn, true);
        suggestionsEl.innerHTML = '';
        suggestionsEl.style.display = 'none';

        generateAiTagsFor(filename).then(function (res) {
            setBusy(btn, false);
            var already = currentTagNames(wrap);
            var tags = (Array.isArray(res.tags) ? res.tags : []).filter(function (tagName) {
                return already.indexOf(tagName) === -1;
            });

            if (0 === tags.length) {
                suggestionsEl.innerHTML = '<span class="mp3-ai-tags-empty">' + escAttr(t('mediaplace_ai_tags_none_suggested')) + '</span>';
                suggestionsEl.style.display = '';
                return;
            }

            var html = '<span class="mp3-ai-tags-hint">' + escAttr(t('mediaplace_ai_tags_suggestions_hint')) + '</span>';
            tags.forEach(function (tagName) {
                html += '<button type="button" class="mp3-ai-tags-chip" data-tag="' + escAttr(tagName) + '">' +
                    '<i class="fa-solid fa-plus"></i> ' + escAttr(tagName) + '</button>';
            });
            suggestionsEl.innerHTML = html;
            suggestionsEl.style.display = '';
        }).catch(function (err) {
            setBusy(btn, false);
            suggestionsEl.innerHTML = '<span class="mp3-ai-tags-empty mp3-ai-tags-error">' + escAttr(err.message || t('mediaplace_ai_tags_error_network')) + '</span>';
            suggestionsEl.style.display = '';
        });
    });

    suggestionsEl.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('.mp3-ai-tags-chip') : null;
        if (!chip) return;
        var tagName = chip.getAttribute('data-tag');
        if (tagName && typeof onAdd === 'function') onAdd(tagName);
        chip.remove();
        if (!qs('.mp3-ai-tags-chip', suggestionsEl)) suggestionsEl.style.display = 'none';
    });
}
