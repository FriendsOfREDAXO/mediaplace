/**
 * Detail-Panel + JSON-Metadaten-Widgets (inline Titel-/Feld-Editing,
 * Metainfo-Canvas, Tags-Combobox, Media-Link-Picker, Speichern). Extraktion
 * aus core.js (siehe DEV.md/Modularisierungs-Plan), Phase 10 -- groesster
 * verbleibender Block.
 *
 * Bewusst NICHT mit hierher gewandert (bleibt noch-legacy-State/-Funktion in
 * core.js, siehe ctx-Vertrag unten): selectedFile/multiMode/multiSelected/
 * onSelect/onMultiSelect/mediaBaseUrl/lastLoadedFiles/mediaForceCacheTokens/
 * metainfoCanvasOpen/metainfoCanvasFilename/metainfoPickTarget/
 * mediaLinkPickFieldKey/fieldCollectors -- diese haben Leser/Schreiber
 * ausserhalb des Detail-Panels (u.a. in build()'s Event-Delegation, in
 * anderen initX()-ctx-Aufrufen), ein Vollumzug haette dort viele zusaetzliche
 * Stellen angefasst. isCompactLayout()/applyDetailWidth()/updateMultiUI()
 * bleiben ebenfalls in core.js (werden von/fuer mehr als nur das
 * Detail-Panel gebraucht) und kommen als Funktionsreferenzen per ctx.
 */

import { isFocuspointCanvasOpen, closeFocuspointCanvas } from './focuspoint.js';
import { showAlertModal } from './modals.js';
import { isCollectionTagName, splitSystemTags, mergeUniqueSystemTags } from './collections.js';
import { pollOptimizeVideo } from './optimize.js';
import { attachOwnFieldButton, attachClassicFieldButton } from './ai_alt.js';
import { attachTagSuggestButton } from './ai_tags.js';

var ctx = null;

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var escAttr = MP3Core.helpers.escAttr;
var qs = MP3Core.helpers.qs;
var qsa = MP3Core.helpers.qsa;
var deepClone = MP3Core.helpers.deepClone;
var isObj = MP3Core.helpers.isObj;
var hasChanged = MP3Core.helpers.hasChanged;
var mediaThumbSrc = MP3Core.helpers.mediaThumbSrc;
var isImageFile = MP3Core.helpers.isImageFile;
var apiLoadJsonMetainfo = MP3Core.api.apiLoadJsonMetainfo;
var apiSaveJsonMetainfo = MP3Core.api.apiSaveJsonMetainfo;
var apiUpdate = MP3Core.api.apiUpdate;
var apiLoadSystemTagsForFiles = MP3Core.api.apiLoadSystemTagsForFiles;
var apiLoadMetainfoForm = MP3Core.api.apiLoadMetainfoForm;
var apiSaveMetainfoForm = MP3Core.api.apiSaveMetainfoForm;

// ---- State (vollstaendig vom Detail-Panel besessen, keine Leser/Schreiber
// ausserhalb dieses Moduls -- Ausnahme: detailOriginalSystemTags, siehe
// setDetailOriginalSystemTags() unten, von initCollections()'s ctx aus
// core.js heraus geschrieben) ----
var detailOriginalTitle = '';
var detailOriginalJson = {};
var detailOriginalSystemTags = [];
var detailOriginalCollectionSystemTags = [];
var detailFieldDefs = [];
var detailClangs = [];
var detailSystemTagCatalog = [];
// Tag-Namen, die in dieser Detail-Panel-Sitzung (seit dem letzten
// renderDetail(), also seit dem Oeffnen dieser Datei) per "Neu anlegen" ganz
// NEU im System-Tag-Katalog entstanden sind -- nur fuer diese zeigt
// repaintTagsWidget() noch das interaktive Farb-Swatch (siehe
// mediaplace-tag-combobox/Tag-Management-Notiz: bestehende Tags sind nur noch
// zentral ueber die Tag-Verwaltung umfaerbbar, neue duerfen bei der
// Erstellung direkt eingefaerbt werden).
var newlyCreatedTagNames = {};

export function setDetailOriginalSystemTags(v) {
    detailOriginalSystemTags = v;
}

/**
 * ctx-Vertrag:
 * - overlay/detailPanel/grid/multiFooter: DOM-Refs
 * - mediaForceCacheTokens: noch-legacy-State, Objekt-Referenz (nur mutiert,
 *   nie neu zugewiesen -- direkt durchgereicht statt Getter)
 * - fieldCollectors: noch-legacy-State, Objekt-Referenz (MP3.registerFieldCollector()-
 *   Registry, ebenfalls nur mutiert)
 * - getSelectedFile()/setSelectedFile(v): noch-legacy-State
 * - getMultiMode()/setMultiMode(v), getMultiSelected()/setMultiSelected(v): noch-legacy-State
 * - getOnSelect()/getOnMultiSelect(): noch-legacy-State (nur gelesen hier)
 * - getMediaBaseUrl(): noch-legacy-State
 * - getLastLoadedFiles(): noch-legacy-State
 * - getMetainfoCanvasOpen()/setMetainfoCanvasOpen(v): noch-legacy-State
 * - getMetainfoCanvasFilename()/setMetainfoCanvasFilename(v): noch-legacy-State
 * - getMetainfoPickTarget()/setMetainfoPickTarget(v): noch-legacy-State
 * - getMediaLinkPickFieldKey()/setMediaLinkPickFieldKey(v): noch-legacy-State
 * - isCompactLayout()/applyDetailWidth()/updateMultiUI(): noch-legacy-Funktionen
 * - updateTagFilterOptions()/setCurrentTagCatalog(catalog): noch-legacy-Funktionen
 *   (eigentlich aus modules/filters.js, core.js reicht sie nur durch)
 */
export function initDetail(theCtx) {
    ctx = theCtx;
}

export function toggleInlineEdit(fieldEl, editing) {
    if (!fieldEl) return;
    var display = qs('.mp3-edit-display', fieldEl);
    var editWrap = qs('.mp3-inline-edit-wrap', fieldEl);
    var input = qs('.mp3-edit-input[data-json-field], #mp3-detail-title-input', fieldEl);
    if (!display || !editWrap || !input) return;

    display.style.display = editing ? 'none' : '';
    editWrap.style.display = editing ? '' : 'none';
    fieldEl.classList.toggle('mp3-inline-edit-open', editing);

    if (editing) {
        setTimeout(function () {
            input.focus();
            if (typeof input.select === 'function') input.select();
        }, 0);
    }
}

export function updateInlineDisplay(fieldEl) {
    if (!fieldEl) return;
    var displayTextEl = qs('.mp3-edit-display .mp3-edit-text', fieldEl);
    var input = qs('.mp3-edit-input[data-json-field], #mp3-detail-title-input', fieldEl);
    if (!displayTextEl || !input) return;
    var text = String(input.value || '').trim();
    if (text) {
        displayTextEl.textContent = text;
        displayTextEl.classList.remove('mp3-edit-placeholder');
    } else {
        displayTextEl.textContent = t('mediaplace_click_to_edit');
        displayTextEl.classList.add('mp3-edit-placeholder');
    }
}

/**
 * Klick auf JEDEN Feld-Speichern-Button loest denselben Gesamt-Save aus
 * (saveDetail() speichert immer alle geaenderten Felder, nicht nur das
 * eine) -- bei mehr als einem geaenderten Feld waeren mehrere sichtbare
 * Speichern-Buttons also irrefuehrend (alle tun exakt dasselbe). Deshalb
 * erst alle Dirty-Zustaende sammeln, dann nur bei genau einem geaenderten
 * Feld dessen Button zeigen; bei mehreren nur der globale Button im
 * fixierten Footer (.mp3-detail-save-btn, siehe updateDetailSaveState()).
 */
function updateFieldSaveButtons(currentTitle, currentJson) {
    var detailPanel = ctx.detailPanel;
    if (!detailPanel) return;

    var titleField = detailPanel.querySelector('.mp3-edit-field[data-field-key="__title"]');
    var titleDirty = titleField ? hasChanged(currentTitle, detailOriginalTitle) : false;
    if (titleField) titleField.classList.toggle('mp3-field-dirty', titleDirty);

    var dirtyFieldEls = [];
    if (titleDirty && titleField) dirtyFieldEls.push(titleField);

    var fieldDirtyMap = {};
    detailFieldDefs.forEach(function (field) {
        var key = String(field.key || '');
        if (!key) return;
        var fieldEl = detailPanel.querySelector('.mp3-json-field[data-field-key="' + key + '"]');
        if (!fieldEl) return;
        var cur = Object.prototype.hasOwnProperty.call(currentJson, key) ? currentJson[key] : null;
        var orig = Object.prototype.hasOwnProperty.call(detailOriginalJson, key) ? detailOriginalJson[key] : null;
        var dirty = hasChanged(cur, orig);
        fieldDirtyMap[key] = dirty;
        fieldEl.classList.toggle('mp3-field-dirty', dirty);
        if (dirty) dirtyFieldEls.push(fieldEl);
    });

    var systemField = detailPanel.querySelector('.mp3-json-field[data-field-key="__system_tags"]');
    var systemDirty = systemField ? hasChanged(collectSystemTagsFromDetail(), detailOriginalSystemTags) : false;
    if (systemField) {
        systemField.classList.toggle('mp3-field-dirty', systemDirty);
        if (systemDirty) dirtyFieldEls.push(systemField);
    }

    var showPerFieldButtons = dirtyFieldEls.length === 1;

    if (titleField) {
        var titleSaveBtn = qs('.mp3-field-save-btn', titleField);
        if (titleSaveBtn) titleSaveBtn.style.display = (titleDirty && showPerFieldButtons) ? '' : 'none';
    }

    detailFieldDefs.forEach(function (field) {
        var key = String(field.key || '');
        if (!key) return;
        var fieldEl = detailPanel.querySelector('.mp3-json-field[data-field-key="' + key + '"]');
        if (!fieldEl) return;
        var saveBtn = qs('.mp3-field-save-btn', fieldEl);
        if (saveBtn) saveBtn.style.display = (fieldDirtyMap[key] && showPerFieldButtons) ? '' : 'none';
    });

    if (systemField) {
        var systemSaveBtn = qs('.mp3-field-save-btn', systemField);
        if (systemSaveBtn) systemSaveBtn.style.display = (systemDirty && showPerFieldButtons) ? '' : 'none';
    }
}

// ---- Metainfo-Feld-Bearbeitung ----
export function openMetainfoCanvas(filename, label) {
    var overlay = ctx.overlay;
    var detailPanel = ctx.detailPanel;
    if (!overlay || !filename) return;
    if (isFocuspointCanvasOpen()) closeFocuspointCanvas();

    ctx.setMetainfoCanvasOpen(true);
    ctx.setMetainfoCanvasFilename(filename);
    // REDAXOs Metainfo-Formular kann eigene TinyMCE-Feldtypen rendern
    // (klassisches Metainfo-Addon, nicht unser JSON-Feldsystem), deren
    // Dialoge ebenfalls ueber #mp3-overlay liegen muessen.
    document.body.classList.add('mp3-embedded-editor-active');

    var content = qs('.mp3-content', overlay);
    if (content) content.classList.add('mp3-editor-mode');

    var canvas = qs('#mp3-metainfo-canvas', overlay);
    if (canvas) canvas.style.display = '';

    if (ctx.isCompactLayout() && detailPanel) detailPanel.classList.remove('mp3-detail-open');

    var saveBtn = qs('.mp3-metainfo-canvas-save', canvas);
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
        saveBtn.title = '';
        saveBtn.classList.remove('mp3-detail-save-success', 'mp3-detail-save-error');
    }

    var titleEl = qs('.mp3-metainfo-canvas-title', canvas);
    if (titleEl) titleEl.textContent = label || filename;

    var formEl = document.getElementById('mp3-metainfo-form');
    if (formEl) formEl.innerHTML = '<div class="mp3-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_loading_more') + '</div>';

    apiLoadMetainfoForm(filename)
        .then(function (html) {
            if (!formEl || ctx.getMetainfoCanvasFilename() !== filename) return;
            formEl.innerHTML = html || '<p class="mp3-metainfo-canvas-empty text-muted">' + t('mediaplace_metainfo_readonly_empty') + '</p>';
            // Bootstrap-select initialisiert dynamisch eingefuegte Selects nicht automatisch.
            if (window.jQuery && window.jQuery.fn && window.jQuery.fn.selectpicker) {
                window.jQuery('.selectpicker', formEl).selectpicker();
            }
            // Optionaler "AI generieren"-Button neben dem klassischen
            // med_alt-Feld (siehe modules/ai_alt.js) -- No-Op, falls kein
            // eigenes JSON-Alt-Feld aktiv ist UND das Feature aus ist bzw.
            // kein med_alt-Feld in diesem Formular vorkommt.
            attachClassicFieldButton(formEl, filename);
            // metainfo_lang_fields: Klick-/Input-Handler sind auf document delegiert und
            // funktionieren bereits, aber das versteckte JSON-Feld jedes Sprachfelds wird
            // nur beim initialen Seitenladen befuellt (rex:ready) -- ohne diesen Aufruf
            // waere es hier leer und wuerde beim Speichern bestehende Uebersetzungen loeschen.
            if (typeof window.initializeRepeaterFields === 'function') {
                window.initializeRepeaterFields();
            }
        })
        .catch(function (err) {
            if (!formEl) return;
            formEl.innerHTML = '<div class="mp3-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
        });

    if (canvas) canvas.scrollTop = 0;
}

export function commitMetainfoCanvas() {
    var overlay = ctx.overlay;
    if (!ctx.getMetainfoCanvasOpen() || !ctx.getMetainfoCanvasFilename()) return;
    var formEl = document.getElementById('mp3-metainfo-form');
    if (!formEl) return;

    var saveBtn = qs('.mp3-metainfo-canvas-save', overlay);
    if (saveBtn) saveBtn.disabled = true;

    apiSaveMetainfoForm(ctx.getMetainfoCanvasFilename(), new FormData(formEl))
        .then(function () {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> ' + t('mediaplace_saved');
                saveBtn.classList.add('mp3-detail-save-success');
            }
            // Kurze Erfolgs-Rueckmeldung, bevor der Canvas schliesst -- ohne die
            // wechselt die Ansicht sofort zurueck ins Grid, was wie ein Fehlschlag
            // wirken kann (siehe Feedback: "es wechselt sofort in den browse mode").
            setTimeout(function () {
                closeMetainfoCanvas();
            }, 700);
        })
        .catch(function (err) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error');
                saveBtn.title = t('mediaplace_error_saving', { msg: err.message });
                saveBtn.classList.add('mp3-detail-save-error');
                setTimeout(function () {
                    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
                    saveBtn.title = '';
                    saveBtn.classList.remove('mp3-detail-save-error');
                }, 1800);
            }
            console.error('MP3 metainfo save failed:', err);
        });
}

export function closeMetainfoCanvas() {
    var overlay = ctx.overlay;
    var detailPanel = ctx.detailPanel;
    ctx.setMetainfoCanvasOpen(false);
    ctx.setMetainfoCanvasFilename(null);
    document.body.classList.remove('mp3-embedded-editor-active');

    var content = qs('.mp3-content', overlay);
    if (content) content.classList.remove('mp3-editor-mode');
    var canvas = qs('#mp3-metainfo-canvas', overlay);
    if (canvas) canvas.style.display = 'none';

    if (ctx.isCompactLayout() && detailPanel && ctx.getSelectedFile()) detailPanel.classList.add('mp3-detail-open');

    // Der native Metainfo-Canvas kann Felder speichern, die die eigenen
    // Widgets im JSON-Panel mitbetreffen (z.B. das klassische med_alt neben
    // dem eigenen Alt-Widget, siehe ClassicMetainfoFormatter/AltTextStatus).
    // Ohne diesen Refresh blieben ALT-Warnung und der Dirty-/Speichern-
    // Button-Zustand des Panels auf dem Stand vor dem Aufruf des Canvas
    // stehen, bis das Panel geschlossen und neu geoeffnet wird.
    if (detailPanel && ctx.getSelectedFile()) {
        qsa('.mp3-alt-wrap', detailPanel).forEach(updateAltHint);
        updateDetailSaveState();
        refreshAltMissingHint(ctx.getSelectedFile());
    }
}

// Der "ALT-Text fehlt"-Hinweis neben dem "Metadaten bearbeiten"-Button
// (server-gerendert aus AltTextStatus::isMissing(), siehe detail_panel.php)
// ist reines, einmalig beim Oeffnen erzeugtes HTML ohne eigene Live-Logik --
// anders als updateAltHint() oben (das eigene Alt-Widget im JSON-Panel).
// Speichert der native Canvas den klassischen med_alt oder das eigene
// "alt"-Feld, muss dieser Hinweis beim Zurueckkehren neu bewertet werden.
// Ein leichter Nachfrage-Request (ohne render_detail=1, also ohne den vollen
// detail_html-Rebuild) reicht dafuer -- das ganze Panel neu zu rendern
// wuerde sonst still nicht gespeicherte Aenderungen an anderen Feldern
// verwerfen.
function refreshAltMissingHint(filename) {
    var detailPanel = ctx.detailPanel;
    apiLoadJsonMetainfo(filename).then(function (payload) {
        // User kann in der Zwischenzeit eine andere Datei geoeffnet haben.
        if (!detailPanel || ctx.getSelectedFile() !== filename) return;
        var editBtn = detailPanel.querySelector('.mp3-metainfo-canvas-open');
        var currentHint = detailPanel.querySelector('.mp3-alt-missing-hint');
        var shouldShow = !!(payload && payload.alt_text_missing);
        if (shouldShow && !currentHint && editBtn) {
            var hint = document.createElement('p');
            hint.className = 'mp3-alt-missing-hint';
            hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(t('mediaplace_alt_text_missing'));
            editBtn.insertAdjacentElement('afterend', hint);
        } else if (!shouldShow && currentHint) {
            currentHint.remove();
        }
    }).catch(function () {});
}

// Klick auf "Oeffnen"/"Hinzufuegen" eines klassischen REX_MEDIA[n]/
// REX_MEDIALIST[n]-Widgets innerhalb des Metainfo-Canvas: statt REDAXOs
// natives Popup blendet MP3 den Canvas kurz aus, zeigt das eigene Grid
// zum Auswaehlen, und kehrt danach zum (unveraendert im DOM verbliebenen,
// nicht neu geladenen) Formular zurueck.
export function startMetainfoPick(wrapper, isList) {
    var overlay = ctx.overlay;
    var multiFooter = ctx.multiFooter;
    if (!wrapper || !ctx.getMetainfoCanvasOpen()) return;

    if (isList) {
        var select = qs('select[id^="REX_MEDIALIST_SELECT_"]', wrapper);
        if (!select) return;
        ctx.setMetainfoPickTarget({ type: 'medialist', select: select, listId: select.id.slice('REX_MEDIALIST_SELECT_'.length) });
        ctx.setMultiMode(true);
        ctx.setMultiSelected({});
        overlay.classList.add('mp3-multi-mode');
        if (multiFooter) multiFooter.style.display = '';
        ctx.updateMultiUI();
    } else {
        var input = qs('input[id^="REX_MEDIA_"]', wrapper);
        if (!input) return;
        ctx.setMetainfoPickTarget({ type: 'media', input: input });
    }

    var canvas = qs('#mp3-metainfo-canvas', overlay);
    if (canvas) canvas.style.display = 'none';
    var content = qs('.mp3-content', overlay);
    if (content) content.classList.remove('mp3-editor-mode');
    overlay.classList.add('mp3-metainfo-pick-mode');

    var banner = qs('#mp3-metainfo-pick-banner', overlay);
    if (banner) {
        var text = qs('.mp3-metainfo-pick-banner-text', banner);
        if (text) text.textContent = t(isList ? 'mediaplace_metainfo_pick_hint_multi' : 'mediaplace_metainfo_pick_hint');
        banner.style.display = '';
    }
}

export function endMetainfoPick() {
    var overlay = ctx.overlay;
    var multiFooter = ctx.multiFooter;
    var pickTarget = ctx.getMetainfoPickTarget();
    var wasMedialist = !!pickTarget && 'medialist' === pickTarget.type;
    ctx.setMetainfoPickTarget(null);
    ctx.setMultiMode(false);
    ctx.setMultiSelected({});
    overlay.classList.remove('mp3-multi-mode');
    overlay.classList.remove('mp3-metainfo-pick-mode');
    if (multiFooter) multiFooter.style.display = 'none';
    if (wasMedialist) ctx.updateMultiUI();
    var banner = qs('#mp3-metainfo-pick-banner', overlay);
    if (banner) banner.style.display = 'none';

    var canvas = qs('#mp3-metainfo-canvas', overlay);
    if (canvas) canvas.style.display = '';
    var content = qs('.mp3-content', overlay);
    if (content) content.classList.add('mp3-editor-mode');
}

export function finishMetainfoMediaPick(filename) {
    var pickTarget = ctx.getMetainfoPickTarget();
    if (!pickTarget || 'media' !== pickTarget.type) return;
    var input = pickTarget.input;
    input.value = filename;
    if (window.jQuery) {
        window.jQuery(input).trigger('change');
    } else {
        var evt;
        try { evt = new Event('change', { bubbles: true }); }
        catch (e) { evt = document.createEvent('Event'); evt.initEvent('change', true, true); }
        input.dispatchEvent(evt);
    }
    endMetainfoPick();
}

export function finishMetainfoMedialistPick(filenames) {
    var pickTarget = ctx.getMetainfoPickTarget();
    if (!pickTarget || 'medialist' !== pickTarget.type) return;
    var select = pickTarget.select;
    var listId = pickTarget.listId;
    filenames.forEach(function (filename) {
        var exists = Array.prototype.some.call(select.options, function (o) { return o.value === filename; });
        if (!exists) select.add(new Option(filename, filename));
    });
    if (typeof window.writeREXMedialist === 'function') {
        window.writeREXMedialist(listId);
    }
    endMetainfoPick();
}

export function updateAltHint(wrap) {
    if (!wrap) return;
    var altKey = String(wrap.getAttribute('data-alt-key') || '');
    var decCb = wrap.querySelector('[data-json-field="' + altKey + '-decorative"]');
    var isDecorative = decCb ? !!decCb.checked : false;
    var hasText = false;
    var inputs = wrap.querySelectorAll('[data-json-field="' + altKey + '"][data-clang], [data-json-field="' + altKey + '"]:not([data-clang])');
    inputs.forEach(function (inp) {
        if (String(inp.value || '').trim()) hasText = true;
    });
    var hint = wrap.querySelector('.mp3-alt-hint');
    var needsHint = !isDecorative && !hasText;
    if (needsHint && !hint) {
        hint = document.createElement('div');
        hint.className = 'mp3-alt-hint';
        hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_alt_missing_hint');
        wrap.insertBefore(hint, wrap.firstChild);
    } else if (!needsHint && hint) {
        hint.remove();
    }
    // Show/hide lang inputs depending on decorative state
    var langWrap = wrap.querySelector('.mp3-lang-inputs');
    if (langWrap) langWrap.style.display = isDecorative ? 'none' : '';
}


export function repaintTagsWidget(widgetWrap) {
    if (!widgetWrap) return;
    var hidden = qs('[data-widget="tags-value"]', widgetWrap);
    var listWrap = qs('.mp3-tags-list', widgetWrap);
    if (!hidden || !listWrap) return;
    var tags = [];
    try { tags = JSON.parse(hidden.value || '[]'); } catch (e) { tags = []; }
    if (!Array.isArray(tags)) tags = [];
    // System-Tags: Farbe eines BESTEHENDEN Tags nur noch zentral ueber die
    // Tag-Verwaltung aenderbar, nicht mehr per-Datei -- das interaktive
    // Swatch erscheint deshalb hier nur fuer Tags, die in dieser Sitzung
    // gerade erst neu angelegt wurden (siehe addTagFromWidget()). Andere
    // Tags-Felder (falls ein Drittanbieter je widget_type "tags" registriert)
    // kennen keinen zentralen Katalog und behalten das alte Verhalten.
    var isSystemTagsField = !!widgetWrap.closest('.mp3-json-field[data-field-key="__system_tags"]');
    var html = '';
    for (var i = 0; i < tags.length; i++) {
        var item = tags[i];
        var tagName = typeof item === 'string' ? item : String((item && item.name) || '');
        var tagColor = typeof item === 'object' && item && /^#[0-9a-fA-F]{6}$/.test(String(item.color || '')) ? String(item.color).toLowerCase() : '#4a90d9';
        if (!tagName) continue;
        var showColorInput = !isSystemTagsField || !!newlyCreatedTagNames[tagName];
        html += '<span class="mp3-tag-item">';
        html += '<span class="mp3-tag-dot" style="background:' + escAttr(tagColor) + '"></span> ' + escAttr(tagName);
        if (showColorInput) {
            html += ' <input type="color" class="mp3-tag-color" data-tag="' + escAttr(tagName) + '" value="' + escAttr(tagColor) + '">';
        }
        html += ' <button type="button" class="mp3-tag-remove" data-tag="' + escAttr(tagName) + '"><i class="fa-solid fa-xmark"></i></button>';
        html += '</span>';
    }
    listWrap.innerHTML = html;
}

function collectTagNames(values) {
    var names = [];
    var seen = Object.create(null);
    if (!Array.isArray(values)) return names;
    for (var i = 0; i < values.length; i++) {
        var item = values[i];
        var name = typeof item === 'string' ? item : String((item && item.name) || '');
        name = String(name || '').trim();
        if (!name || seen[name]) continue;
        seen[name] = true;
        names.push(name);
    }
    return names;
}

// Combobox-Vorschlagsliste fuers System-Tags-Feld (ersetzt ein frueheres
// natives <datalist>, siehe CHANGELOG): zeigt passende Katalog-Tags
// (gefiltert nach Eingabetext, ohne Sammlungs-Tags/bereits gewaehlte) und
// haengt bei fehlender exakter Uebereinstimmung eine "Neu anlegen"-Zeile
// an. detailSystemTagCatalog kommt aus renderDetail() (JSON-Metadaten-
// Payload), ist also schon beim ersten Rendern der Datei aktuell.
export function updateTagsComboList(wrap) {
    var list = wrap ? qs('.mp3-tags-combo-list', wrap) : null;
    var input = wrap ? qs('.mp3-tags-input', wrap) : null;
    var hidden = wrap ? qs('[data-widget="tags-value"]', wrap) : null;
    if (!list || !input || !hidden) return;

    var values = [];
    try { values = JSON.parse(hidden.value || '[]'); } catch (e) { values = []; }
    if (!Array.isArray(values)) values = [];
    var selectedNames = collectTagNames(values);
    var selected = Object.create(null);
    for (var s = 0; s < selectedNames.length; s++) {
        selected[selectedNames[s].toLowerCase()] = true;
    }

    var term = String(input.value || '').trim();
    var termLower = term.toLowerCase();
    var catalog = Array.isArray(detailSystemTagCatalog) ? detailSystemTagCatalog : [];

    var html = '';
    var exactMatch = false;
    for (var i = 0; i < catalog.length; i++) {
        var item = catalog[i];
        var name = item && item.name ? String(item.name).trim() : '';
        if (!name) continue;
        if (isCollectionTagName(name)) continue;
        if (selected[name.toLowerCase()]) continue;
        if (term && name.toLowerCase().indexOf(termLower) === -1) continue;
        if (name.toLowerCase() === termLower) exactMatch = true;
        var color = /^#[0-9a-fA-F]{6}$/.test(String(item.color || '')) ? String(item.color).toLowerCase() : '#4a90d9';
        html += '<button type="button" class="mp3-tags-combo-option" data-tag-name="' + escAttr(name) + '">' +
            '<span class="mp3-tag-dot" style="background:' + escAttr(color) + '"></span>' +
            '<span class="mp3-tags-combo-option-label">' + escAttr(name) + '</span>' +
            '</button>';
    }
    if (term && !exactMatch) {
        html += '<button type="button" class="mp3-tags-combo-create" data-tag-name="' + escAttr(term) + '">' +
            '<i class="fa-solid fa-plus"></i> ' + escAttr(t('mediaplace_create_tag', { name: term })) +
            '</button>';
    }
    if (!html) {
        html = '<div class="mp3-tags-combo-empty">' + t('mediaplace_no_tags_found') + '</div>';
    }
    list.innerHTML = html;
}

export function openTagsComboList(wrap) {
    var list = wrap ? qs('.mp3-tags-combo-list', wrap) : null;
    if (!list) return;
    updateTagsComboList(wrap);
    list.style.display = '';
}

export function closeTagsComboList(wrap) {
    var list = wrap ? qs('.mp3-tags-combo-list', wrap) : null;
    if (list) list.style.display = 'none';
}

// Gemeinsame "Tag hinzufuegen"-Logik fuer DREI Ausloeser: Klick auf den
// "+"-Button (liest tagsInput.value), Klick auf eine Combobox-Zeile (liest
// deren data-tag-name) UND Klick auf einen KI-Vorschlags-Chip (siehe
// ai_tags.js) -- identisches Verhalten statt divergierender Kopien.
// reopenCombo=false fuer den KI-Vorschlags-Fall: bei den ersten beiden
// Ausloesern ist der Nutzer aktiv im "Tags suchen/eintippen"-Fluss, dort
// haelt das Wiederoeffnen+Fokussieren fuer zuegige Mehrfachauswahl sinnvoll
// offen -- ein Klick auf einen Vorschlags-Chip ist dagegen kein Texteingabe-
// Moment, das Aufklappen der Autocomplete-Liste direkt danach wirkte dort
// nur wie ein unerwuenschter Nebeneffekt (siehe Bugreport).
export function addTagFromWidget(wrap, rawTagName, reopenCombo) {
    if (undefined === reopenCombo) reopenCombo = true;
    var tagsInput = wrap ? qs('.mp3-tags-input', wrap) : null;
    var hiddenInput = wrap ? qs('[data-widget="tags-value"]', wrap) : null;
    if (!wrap || !hiddenInput) return;
    var newTag = String(rawTagName || '').trim();
    if (!newTag) return;
    var list = [];
    try { list = JSON.parse(hiddenInput.value || '[]'); } catch (e1) { list = []; }
    if (!Array.isArray(list)) list = [];
    var exists = false;
    for (var li = 0; li < list.length; li++) {
        var existingName = typeof list[li] === 'string' ? list[li] : String((list[li] && list[li].name) || '');
        if (existingName === newTag) {
            exists = true;
            break;
        }
    }
    var isSystemTagsField = !!wrap.closest('.mp3-json-field[data-field-key="__system_tags"]');
    if (!exists) {
        if (isSystemTagsField && isCollectionTagName(newTag)) {
            showAlertModal({
                icon: 'fa-circle-info',
                title: t('mediaplace_notice'),
                message: escAttr(t('mediaplace_collection_tags_hint')),
            });
            return;
        }
        var color = '#4a90d9';
        var foundInCatalog = false;
        if (isSystemTagsField && Array.isArray(detailSystemTagCatalog)) {
            for (var ci = 0; ci < detailSystemTagCatalog.length; ci++) {
                var c = detailSystemTagCatalog[ci];
                if (c && c.name === newTag && /^#[0-9a-fA-F]{6}$/.test(String(c.color || ''))) {
                    color = String(c.color).toLowerCase();
                    foundInCatalog = true;
                    break;
                }
            }
        }
        // Tag existiert im System-Katalog noch gar nicht (nicht nur "auf dieser
        // Datei noch nicht gesetzt") -- die Farbe darf hier direkt gewaehlt
        // werden, siehe repaintTagsWidget()/newlyCreatedTagNames.
        if (isSystemTagsField && !foundInCatalog) {
            newlyCreatedTagNames[newTag] = true;
        }
        list.push({ name: newTag, color: color });
    }
    hiddenInput.value = JSON.stringify(list);
    if (tagsInput) tagsInput.value = '';
    repaintTagsWidget(wrap);
    if (isSystemTagsField && reopenCombo) {
        // Bleibt offen (statt zu schliessen) fuer zuegige Mehrfachauswahl.
        openTagsComboList(wrap);
        if (tagsInput) tagsInput.focus();
    }
    updateDetailSaveState();
}

export function applyTagColorChange(colorInput) {
    if (!colorInput) return;
    var colorWrap = colorInput.closest('.mp3-tags-widget');
    var colorHidden = colorWrap ? qs('[data-widget="tags-value"]', colorWrap) : null;
    var colorTag = colorInput.getAttribute('data-tag');
    if (!colorHidden || !colorTag) return;

    var colorValues = [];
    try { colorValues = JSON.parse(colorHidden.value || '[]'); } catch (e) { colorValues = []; }
    if (!Array.isArray(colorValues)) colorValues = [];

    for (var vi = 0; vi < colorValues.length; vi++) {
        var name = typeof colorValues[vi] === 'string' ? colorValues[vi] : String((colorValues[vi] && colorValues[vi].name) || '');
        if (name === colorTag) {
            colorValues[vi] = { name: colorTag, color: String(colorInput.value || '#4a90d9').toLowerCase() };
        }
    }

    colorHidden.value = JSON.stringify(colorValues);
    repaintTagsWidget(colorWrap);
    updateDetailSaveState();
}


export function setMediaLinkPickMode(fieldKey) {
    var overlay = ctx.overlay;
    var detailPanel = ctx.detailPanel;
    ctx.setMediaLinkPickFieldKey(fieldKey || null);
    if (!overlay || !detailPanel) return;

    var mediaLinkPickFieldKey = ctx.getMediaLinkPickFieldKey();
    overlay.classList.toggle('mp3-media-link-pick-mode', !!mediaLinkPickFieldKey);

    qsa('.mp3-media-link-widget', detailPanel).forEach(function (widget) {
        var input = qs('[data-json-field]', widget);
        var key = input ? input.getAttribute('data-json-field') : null;
        var active = !!mediaLinkPickFieldKey && key === mediaLinkPickFieldKey;

        widget.classList.toggle('mp3-media-link-widget-pick-active', active);

        var hint = qs('.mp3-media-link-pick-hint', widget);
        if (hint) {
            hint.style.display = active ? '' : 'none';
        }
    });
}

export function repaintMediaLinkWidget(widgetWrap) {
    if (!widgetWrap) return;
    var input = qs('[data-json-field]', widgetWrap);
    if (!input) return;
    var filename = String(input.value || '').trim();
    var preview = qs('.mp3-media-link-preview', widgetWrap);
    if (!filename || !isImageFile(filename)) {
        if (preview) preview.remove();
        return;
    }
    var previewSrc = mediaThumbSrc(filename, 'rex_media_small', filename, ctx.mediaForceCacheTokens, ctx.getLastLoadedFiles(), ctx.getMediaBaseUrl());
    var previewHtml = '<img src="' + escAttr(previewSrc) + '" alt="">';
    if (preview) {
        preview.innerHTML = previewHtml;
    } else {
        var div = document.createElement('div');
        div.className = 'mp3-media-link-preview';
        div.innerHTML = previewHtml;
        widgetWrap.appendChild(div);
    }
}

function collectJsonValuesFromDetail() {
    var detailPanel = ctx.detailPanel;
    var fieldCollectors = ctx.fieldCollectors;
    var json = {};
    detailFieldDefs.forEach(function (field) {
        var key = field.key;
        var widget = String(field.widget_type || 'text');

        // Von einem anderen Addon per MP3.registerFieldCollector() registrierter
        // Feldtyp (siehe MetainfoWidget::getRegisteredTypes() in PHP) -- hat
        // Vorrang vor den eingebauten Zweigen, falls ein widget_type kollidiert.
        if (fieldCollectors[widget]) {
            json[key] = fieldCollectors[widget](key, detailPanel);
            return;
        }

        if (widget === 'tags') {
            var hidden = detailPanel.querySelector('[data-json-field="' + key + '"][data-widget="tags-value"]');
            if (!hidden || !hidden.value) {
                json[key] = null;
                return;
            }
            try {
                var parsed = JSON.parse(hidden.value);
                json[key] = Array.isArray(parsed) && parsed.length ? parsed : null;
            } catch (e) {
                json[key] = null;
            }
            return;
        }

        if (widget === 'alt') {
            var langInputs = qsa('[data-json-field="' + key + '"][data-clang]', detailPanel);
            var textMap = {};
            for (var i = 0; i < langInputs.length; i++) {
                var v = String(langInputs[i].value || '').trim();
                var cid = String(langInputs[i].getAttribute('data-clang') || '');
                if (v) textMap[cid] = v;
            }
            var decorativeEl = detailPanel.querySelector('[data-json-field="' + key + '-decorative"]');
            var decorative = decorativeEl ? !!decorativeEl.checked : false;
            if (!decorative && Object.keys(textMap).length === 0) {
                json[key] = null;
            } else {
                json[key] = { text: textMap, decorative: decorative };
            }
            return;
        }

        // media_link rendert immer nur ein einzelnes, nicht sprachgebundenes
        // Eingabefeld (siehe detail_field_body_media_link.php) -- unabhaengig
        // davon, ob das Feld als "mehrsprachig" angelegt wurde. Muss deshalb
        // VOR dem generischen field.translatable-Zweig behandelt werden,
        // sonst sucht dieser nach [data-clang]-Unterfeldern, die es fuer
        // diesen Widget-Typ nie gibt, und der Wert wird nie gespeichert.
        if (widget === 'media_link') {
            var linkEl = detailPanel.querySelector('[data-json-field="' + key + '"]');
            var linkScalar = linkEl ? String(linkEl.value || '').trim() : '';
            json[key] = linkScalar || null;
            return;
        }

        if (widget === 'checkbox') {
            var cbEl = detailPanel.querySelector('[data-json-field="' + key + '"]');
            json[key] = cbEl ? !!cbEl.checked : false;
            return;
        }

        if (widget === 'select') {
            var selEl = detailPanel.querySelector('[data-json-field="' + key + '"]');
            if (!selEl) {
                json[key] = null;
                return;
            }
            if (field.options && field.options.multiple) {
                var chosen = [];
                for (var so = 0; so < selEl.options.length; so++) {
                    if (selEl.options[so].selected) chosen.push(selEl.options[so].value);
                }
                json[key] = chosen.length ? chosen : null;
            } else {
                json[key] = selEl.value || null;
            }
            return;
        }

        if (field.translatable) {
            var inputs = qsa('[data-json-field="' + key + '"][data-clang]', detailPanel);
            var map = {};
            for (var j = 0; j < inputs.length; j++) {
                var text = String(inputs[j].value || '').trim();
                var clangId = String(inputs[j].getAttribute('data-clang') || '');
                if (text) map[clangId] = text;
            }
            json[key] = Object.keys(map).length ? map : null;
            return;
        }

        var el = detailPanel.querySelector('[data-json-field="' + key + '"]');
        var scalar = el ? String(el.value || '').trim() : '';
        json[key] = scalar ? scalar : null;
    });
    return json;
}

function collectSystemTagsFromDetail() {
    var detailPanel = ctx.detailPanel;
    if (!detailPanel) return [];
    var hidden = detailPanel.querySelector('[data-json-field="__system_tags"][data-widget="tags-value"]');
    if (!hidden || !hidden.value) return [];

    var parsed = [];
    try {
        parsed = JSON.parse(hidden.value || '[]');
    } catch (e) {
        parsed = [];
    }

    if (!Array.isArray(parsed)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < parsed.length; i++) {
        var item = parsed[i];
        var name = typeof item === 'string' ? item : String((item && item.name) || '');
        var color = typeof item === 'object' && item && /^#[0-9a-fA-F]{6}$/.test(String(item.color || '')) ? String(item.color).toLowerCase() : '#4a90d9';
        name = String(name || '').trim();
        if (isCollectionTagName(name)) continue;
        if (!name || seen[name]) continue;
        seen[name] = true;
        out.push({ name: name, color: color });
    }
    return out;
}

export function updateDetailSaveState() {
    var detailPanel = ctx.detailPanel;
    if (!detailPanel) return;
    var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
    if (!saveBtn) return;

    var titleEl = detailPanel.querySelector('#mp3-detail-title-input');
    var currentTitle = titleEl ? String(titleEl.value || '').trim() : '';
    var currentJson = collectJsonValuesFromDetail();
    var currentSystemTags = collectSystemTagsFromDetail();
    var changed = hasChanged(currentTitle, detailOriginalTitle)
        || hasChanged(currentJson, detailOriginalJson)
        || hasChanged(currentSystemTags, detailOriginalSystemTags);

    saveBtn.disabled = !changed;
    saveBtn.classList.toggle('is-dirty', changed);

    updateFieldSaveButtons(currentTitle, currentJson);
    qsa('.mp3-edit-field-inline, .mp3-json-field', detailPanel).forEach(updateInlineDisplay);
}

export function saveDetail() {
    var detailPanel = ctx.detailPanel;
    var grid = ctx.grid;
    var selectedFile = ctx.getSelectedFile();
    if (!selectedFile || !detailPanel) return;
    var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
    var titleEl = detailPanel.querySelector('#mp3-detail-title-input');
    var currentTitle = titleEl ? String(titleEl.value || '').trim() : '';
    var currentJson = collectJsonValuesFromDetail();
    var currentSystemTags = collectSystemTagsFromDetail();

    var titleChanged = hasChanged(currentTitle, detailOriginalTitle);
    var jsonChanged = hasChanged(currentJson, detailOriginalJson);
    var systemTagsChanged = hasChanged(currentSystemTags, detailOriginalSystemTags);
    if (!titleChanged && !jsonChanged && !systemTagsChanged) {
        updateDetailSaveState();
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_saving');
    }

    var requests = [];
    if (titleChanged) {
        requests.push(apiUpdate(selectedFile, { title: currentTitle }));
    }
    if (jsonChanged || systemTagsChanged) {
        var payload = deepClone(currentJson);
        payload.__system_tags = mergeUniqueSystemTags(currentSystemTags, detailOriginalCollectionSystemTags);
        requests.push(apiSaveJsonMetainfo(selectedFile, payload));
    }

    Promise.all(requests)
        .then(function () {
            detailOriginalTitle = currentTitle;
            detailOriginalJson = deepClone(currentJson);
            detailOriginalSystemTags = deepClone(currentSystemTags);

            if (titleChanged) {
                var card = grid.querySelector('.mp3-card[data-filename="' + selectedFile + '"]');
                if (card) {
                    var nameEl = card.querySelector('.mp3-card-name');
                    if (nameEl) nameEl.textContent = currentTitle || selectedFile;
                    var fnameEl = card.querySelector('.mp3-fname');
                    if (currentTitle) {
                        if (!fnameEl) {
                            fnameEl = document.createElement('span');
                            fnameEl.className = 'mp3-fname';
                            fnameEl.title = selectedFile;
                            fnameEl.textContent = selectedFile;
                            var infoEl = card.querySelector('.mp3-info');
                            if (infoEl) infoEl.insertBefore(fnameEl, infoEl.querySelector('.mp3-fmeta'));
                        }
                    } else if (fnameEl) {
                        fnameEl.remove();
                    }
                }
                var row = grid.querySelector('.mp3-list-row[data-filename="' + selectedFile + '"]');
                if (row) {
                    var nameCell = row.querySelector('.mp3-list-cell-name');
                    if (nameCell) {
                        nameCell.textContent = currentTitle || selectedFile;
                        nameCell.title = currentTitle ? selectedFile : '';
                    }
                }
                var masonryCard = grid.querySelector('.mp3-masonry-card[data-filename="' + selectedFile + '"]');
                if (masonryCard) {
                    var masonryName = masonryCard.querySelector('.mp3-masonry-name');
                    if (masonryName) {
                        masonryName.textContent = currentTitle || selectedFile;
                        masonryName.title = selectedFile;
                    }
                }
                var lastLoadedFiles = ctx.getLastLoadedFiles();
                for (var i = 0; i < lastLoadedFiles.length; i++) {
                    if (lastLoadedFiles[i].filename === selectedFile) {
                        lastLoadedFiles[i].title = currentTitle;
                        break;
                    }
                }
            }

            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> ' + t('mediaplace_saved');
                saveBtn.classList.add('mp3-detail-save-success');
                setTimeout(function () {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
                    saveBtn.classList.remove('mp3-detail-save-success');
                    updateDetailSaveState();
                }, 1200);
            }

            // After saving system tags: refresh catalog + filter options
            if (systemTagsChanged && selectedFile) {
                apiLoadSystemTagsForFiles([selectedFile]).then(function (payload) {
                    ctx.setCurrentTagCatalog(Array.isArray(payload.catalog) ? payload.catalog : []);
                    var ft = payload.file_tags || {};
                    var selectedFileTags = Array.isArray(ft[selectedFile]) ? ft[selectedFile] : [];
                    var splitTags = splitSystemTags(selectedFileTags);
                    detailOriginalCollectionSystemTags = deepClone(splitTags.collections);
                    var lastLoadedFiles = ctx.getLastLoadedFiles();
                    for (var k = 0; k < lastLoadedFiles.length; k++) {
                        if (lastLoadedFiles[k].filename === selectedFile) {
                            lastLoadedFiles[k].system_tags = selectedFileTags;
                            break;
                        }
                    }
                    ctx.updateTagFilterOptions();
                }).catch(function () {});
            }
        })
        .catch(function (err) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error');
                saveBtn.title = t('mediaplace_error_saving', { msg: err.message });
                saveBtn.classList.add('mp3-detail-save-error');
                setTimeout(function () {
                    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
                    saveBtn.title = t('mediaplace_save_changes');
                    saveBtn.classList.remove('mp3-detail-save-error');
                    updateDetailSaveState();
                }, 1800);
            }
            console.error('MP3 save detail failed:', err);
        });
}

export function showDetail(filename) {
    var detailPanel = ctx.detailPanel;
    var overlay = ctx.overlay;
    var grid = ctx.grid;
    ctx.setSelectedFile(filename);
    if (!detailPanel) return;

    qsa('.mp3-card', grid).forEach(function (c) {
        c.classList.toggle('mp3-card-selected', c.getAttribute('data-filename') === filename);
    });
    qsa('.mp3-list-row', grid).forEach(function (r) {
        r.classList.toggle('mp3-list-row-selected', r.getAttribute('data-filename') === filename);
    });
    qsa('.mp3-masonry-card', grid).forEach(function (r) {
        r.classList.toggle('mp3-masonry-card-selected', r.getAttribute('data-filename') === filename);
    });

    detailPanel.classList.add('mp3-detail-open');
    detailPanel.innerHTML = '<div class="mp3-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> Lade Details…</div>';
    ctx.applyDetailWidth();
    var detailResizeHandle = qs('#mp3-detail-resize-handle', overlay);
    if (detailResizeHandle) detailResizeHandle.style.display = overlay.classList.contains('mp3-compact') ? 'none' : '';

    // Alle Info-Felder (inkl. is_in_use) berechnet der eigene Endpunkt jetzt
    // selbst (siehe buildFastInfoFields() in
    // rex_api_mediaplace_json_metainfo.php) -- ein Fetch statt vorher
    // zwei (frueher zusaetzlich media/{filename}/info vom api-Addon).
    apiLoadJsonMetainfo(filename, true)
        .then(function (payload) {
            renderDetail(payload);
        })
        .catch(function (err) {
            detailPanel.innerHTML = '<div class="mp3-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
        });
}

export function hideDetail() {
    var detailPanel = ctx.detailPanel;
    var overlay = ctx.overlay;
    var grid = ctx.grid;
    ctx.setSelectedFile(null);
    setMediaLinkPickMode(null);
    if (detailPanel) {
        detailPanel.classList.remove('mp3-detail-open');
        detailPanel.innerHTML = '';
        detailPanel.style.width = '';
    }
    var detailResizeHandle = qs('#mp3-detail-resize-handle', overlay);
    if (detailResizeHandle) detailResizeHandle.style.display = 'none';
    qsa('.mp3-card', grid).forEach(function (c) {
        c.classList.remove('mp3-card-selected');
    });
    qsa('.mp3-list-row', grid).forEach(function (r) {
        r.classList.remove('mp3-list-row-selected');
    });
    qsa('.mp3-masonry-card', grid).forEach(function (r) {
        r.classList.remove('mp3-masonry-card-selected');
    });
}


/**
 * Baut das Detail-Panel aus dem serverseitig vorgerenderten detail_html
 * (siehe rex_api_mediaplace_json_metainfo::renderDetailHtml() +
 * fragments/mediaplace/detail_panel.php) -- ersetzt die frueheren
 * ~140 Zeilen JS-String-Konkatenation. Interaktion (Klick/Keydown/Input/
 * Change) haengt per Event-Delegation auf overlay und wird dadurch nicht
 * beruehrt. Setzt nur noch die JS-Dirty-Check-Baselines und erledigt,
 * was echte Laufzeitinformation braucht, die PHP zum Renderzeitpunkt
 * nicht kennen kann (Auswaehlen-Button-Sichtbarkeit, erzwungener
 * Cache-Buster nach Datei-Ersetzen).
 */
function renderDetail(jsonPayload) {
    var detailPanel = ctx.detailPanel;
    var selectedFile = ctx.getSelectedFile();
    var jsonData = (jsonPayload && isObj(jsonPayload.data)) ? jsonPayload.data : {};
    detailFieldDefs = (jsonPayload && Array.isArray(jsonPayload.fields)) ? jsonPayload.fields : [];
    detailClangs = (jsonPayload && Array.isArray(jsonPayload.clangs)) ? jsonPayload.clangs : [];
    detailSystemTagCatalog = (jsonPayload && Array.isArray(jsonPayload.system_tag_catalog)) ? jsonPayload.system_tag_catalog : [];
    newlyCreatedTagNames = {};
    var allSystemTags = (jsonPayload && Array.isArray(jsonPayload.system_tags)) ? jsonPayload.system_tags : [];
    var splitSystem = splitSystemTags(allSystemTags);
    detailOriginalSystemTags = deepClone(splitSystem.normal);
    detailOriginalCollectionSystemTags = deepClone(splitSystem.collections);
    detailOriginalTitle = String((jsonPayload && jsonPayload.title) || '');
    detailOriginalJson = deepClone(jsonData);
    // Checkbox-Felder liefern in collectJsonValuesFromDetail() immer ein echtes
    // Bool (nie null), damit "explizit Nein" von "nie gesetzt" unterscheidbar
    // bleibt. Ein Feld, das fuer diese Datei noch nie gespeichert wurde, fehlt
    // im Server-Datensatz dagegen komplett -- ohne dieses Nachziehen wuerde der
    // Dirty-Check das faelschlich als Aenderung werten (false vs. fehlender Key).
    detailFieldDefs.forEach(function (field) {
        if ('checkbox' === field.widget_type && !Object.prototype.hasOwnProperty.call(detailOriginalJson, field.key)) {
            detailOriginalJson[field.key] = false;
        }
    });

    detailPanel.innerHTML = (jsonPayload && jsonPayload.detail_html) || '';

    // Optionaler "AI generieren"-Button neben dem eigenen JSON-Alt-Feld
    // (siehe modules/ai_alt.js) -- synchron direkt nach dem innerHTML-Setzen,
    // garantiert korrektes Timing (kein separates Observer-Script noetig).
    // No-Op, falls das Feature aus ist oder kein eigenes Alt-Feld existiert
    // (attachOwnFieldButton() prueft beides selbst).
    qsa('.mp3-alt-wrap[data-alt-key]', detailPanel).forEach(function (wrap) {
        attachOwnFieldButton(wrap, selectedFile);
    });

    // Optionaler "KI-Tags vorschlagen"-Button im System-Tags-Widget (siehe
    // modules/ai_tags.js) -- gleiches synchrones Timing wie oben. onAdd ruft
    // addTagFromWidget() dieses Moduls auf, damit Vorschlaege exakt denselben
    // Hinzufuegen-Pfad wie eine manuelle Tag-Auswahl durchlaufen (Dedup,
    // Katalog-Farbe, Sammlungs-Namen-Sperre, Dirty-State).
    var systemTagsWidget = qs('.mp3-json-field[data-field-key="__system_tags"] .mp3-tags-widget', detailPanel);
    if (systemTagsWidget) {
        attachTagSuggestButton(systemTagsWidget, selectedFile, function (tagName) {
            // reopenCombo=false: siehe addTagFromWidget()-Docblock.
            addTagFromWidget(systemTagsWidget, tagName, false);
        });
    }

    // Cache-Buster nach Datei-Ersetzen erzwingen (mediaForceCacheTokens),
    // falls der Server-Render noch die vorherige updatedate eingebettet hat.
    var mediaForceCacheTokens = ctx.mediaForceCacheTokens;
    if (selectedFile && mediaForceCacheTokens[selectedFile]) {
        var forceToken = String(mediaForceCacheTokens[selectedFile]);
        qsa('.mp3-detail-preview img, .mp3-detail-preview source, .mp3-lightbox-open-btn', detailPanel).forEach(function (el) {
            ['src', 'data-lightbox-src'].forEach(function (attr) {
                var val = el.getAttribute(attr);
                if (!val) return;
                var next = val.replace(/([?&])mp3v=[^&]*/, '$1mp3v=' + encodeURIComponent(forceToken));
                if (next === val) {
                    next = val + (val.indexOf('?') === -1 ? '?' : '&') + 'mp3v=' + encodeURIComponent(forceToken);
                }
                el.setAttribute(attr, next);
            });
        });
    }

    // "Auswaehlen"-Button: PHP kennt den Aufrufmodus (Picker vs. reines
    // Durchsuchen) nicht, daher immer gerendert und hier ein-/ausgeblendet.
    var selectBtn = qs('.mp3-detail-select-btn', detailPanel);
    if (selectBtn) selectBtn.style.display = (ctx.getOnSelect() || ctx.getOnMultiSelect()) ? '' : 'none';

    // Laeuft GERADE eine Videooptimierung fuer diese Datei (server-seitig
    // im HTML mitgegeben, siehe optimize_video_job in
    // rex_api_mediaplace_json_metainfo.php) -- Polling sofort fortsetzen
    // statt erst nach einem erneuten Klick auf "optimieren" (der Job kann
    // auch in einer anderen Session/ueber ffmpeg's eigene Seite gestartet
    // worden sein).
    var optimizeBtn = qs('.mp3-video-optimize-btn', detailPanel);
    if (optimizeBtn) {
        var activeJobRaw = optimizeBtn.getAttribute('data-optimize-video-job');
        if (activeJobRaw) {
            try {
                var activeJob = JSON.parse(activeJobRaw);
                if (activeJob && activeJob.id) {
                    var optimizeFile = optimizeBtn.getAttribute('data-optimize-video-file') || '';
                    optimizeBtn.disabled = true;
                    optimizeBtn.classList.add('is-loading');
                    pollOptimizeVideo(optimizeFile, activeJob.id, optimizeBtn, optimizeBtn.parentNode.querySelector('.mp3-video-optimize-status'));
                }
            } catch (e) { /* malformed/missing -- kein aktiver Job */ }
        }
    }

    updateDetailSaveState();
}
