/**
 * Fokuspunkt-Canvas (Integration mit dem separaten focuspoint-Addon).
 * Vierte Extraktion aus core.js (siehe DEV.md/Modularisierungs-Plan), nach
 * dem gleichen Muster wie modules/providers.js/modals.js/lightbox.js.
 *
 * Eigenstaendiger Canvas-Block (nicht der Metainfo-Canvas) -- andere Body-
 * Struktur (Bild+Crosshair+Live-Vorschau statt Formular), teilt aber
 * dasselbe "Hauptbereich uebernehmen"-Konzept (Grid wird verdeckt, Header
 * mit Zurueck/Titel/Speichern). Speicherung laeuft bewusst weiter ueber das
 * klassische Metainfo-Feld (rex_media.med_focuspoint o.ae.), nicht ueber
 * med_json_data.
 *
 * Bleibt vorerst Teil des Haupt-Bundles (statischer Import, kein eigenes,
 * bedingt geladenes Bundle wie im Modularisierungs-Plan fuer diese Phase
 * urspruenglich skizziert) -- die addon-optionale Auslagerung (via
 * MP3.registerModule() + eigenes esbuild-Entry) ist als Folgeschritt
 * vorgesehen, siehe DEV.md.
 *
 * Event-Listener-REGISTRIERUNG: der Klick-/Change-Listener auf
 * #mp3-focuspoint-canvas selbst ist bereits vollstaendig eigenstaendig und
 * wandert komplett hierher (initFocuspoint()). Die ESC-/Ctrl+S-Zweige in
 * core.js' geteiltem overlay-keydown-Listener und der "Fokuspunkt
 * bearbeiten"-Button im Detail-Panel-Klick-Listener bleiben dagegen als
 * schlanke Zweige in core.js -- selbes Prinzip wie bei providers.js.
 */

var ctx = null;
var focuspointCanvasOpen = false;
var focuspointFilename = null;
var focuspointFields = []; // Liste der Fokuspunkt-Metainfo-Felder (meist nur ["med_focuspoint"])
var focuspointTypes = {}; // typname -> {label, meta:[feldnamen]}
var focuspointCurrent = {}; // feldname -> [x,y] (beim Oeffnen geladen)
var focuspointActiveField = null;
var focuspointActiveType = '';
var focuspointPos = [50, 50]; // aktuelle [x,y] fuer focuspointActiveField

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var escAttr = MP3Core.helpers.escAttr;
var qs = MP3Core.helpers.qs;
var mediaThumbSrc = MP3Core.helpers.mediaThumbSrc;
var apiLoadFocuspointInfo = MP3Core.api.apiLoadFocuspointInfo;
var apiSaveFocuspoint = MP3Core.api.apiSaveFocuspoint;

/**
 * ctx-Vertrag:
 * - overlay, detailPanel: DOM-Refs
 * - mediaForceCacheTokens: Objekt-Referenz (wird in-place mutiert)
 * - getSelectedFile()/getLastLoadedFiles()/getMediaBaseUrl(): Zugriff auf
 *   noch-legacy-State (fuer mediaThumbSrc())
 * - isMetainfoCanvasOpen()/closeMetainfoCanvas(): Metainfo-Canvas ist
 *   exklusiv zum Fokuspunkt-Canvas (siehe openFocuspointCanvas())
 * - isCompactLayout(): noch-legacy-Funktion (Layout-Umschaltung
 *   Detail-Panel vs. Canvas im Compact-Modus)
 */
export function initFocuspoint(theCtx) {
    ctx = theCtx;

    // Fokuspunkt Canvas events -- vollstaendig eigenstaendig, siehe Docblock
    // oben.
    var focuspointCanvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    if (!focuspointCanvas) return;

    focuspointCanvas.addEventListener('click', function (e) {
        if (e.target.closest('.mp3-focuspoint-canvas-back')) {
            closeFocuspointCanvas();
            return;
        }
        if (e.target.closest('.mp3-focuspoint-canvas-save')) {
            commitFocuspointCanvas();
            return;
        }
        if (e.target.closest('.mp3-focuspoint-reset-btn')) {
            focuspointPos = focuspointActiveField ? focuspointPosOrDefault(focuspointCurrent[focuspointActiveField]) : [50, 50];
            updateFocuspointMarker();
            updateFocuspointPreview();
            resetSaveButtonState();
            return;
        }
        if (e.target.closest('.mp3-focuspoint-remove-btn')) {
            focuspointPos = [50, 50];
            updateFocuspointMarker();
            updateFocuspointPreview();
            resetSaveButtonState();
            return;
        }
        var imageWrap = e.target.closest('.mp3-focuspoint-image-wrap');
        if (imageWrap) {
            focuspointPos = focuspointPositionFromEvent(e, imageWrap);
            updateFocuspointMarker();
            updateFocuspointPreview();
            resetSaveButtonState();
        }
    });

    focuspointCanvas.addEventListener('change', function (e) {
        var typeSel = e.target.closest('.mp3-focuspoint-type-select');
        if (typeSel) {
            focuspointActiveType = typeSel.value || '';
            updateFocuspointPreview();
            return;
        }
        var fieldSel = e.target.closest('.mp3-focuspoint-field-select');
        if (fieldSel) {
            setFocuspointActiveField(fieldSel.value || null);
        }
    });
}

export function isFocuspointCanvasOpen() {
    return focuspointCanvasOpen;
}

// Nach einer erfolgreichen Speicherung bekommt der Button kurz den
// "Gespeichert"-Zustand (siehe commitFocuspointCanvas()) -- ohne diesen
// Reset blieb er dort haengen, auch wenn der Nutzer danach die Position
// erneut per Drag/Reset/Entfernen aendert und der Stand damit wieder
// ungespeichert ist.
function resetSaveButtonState() {
    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    var saveBtn = canvas ? qs('.mp3-focuspoint-canvas-save', canvas) : null;
    if (!saveBtn) return;
    saveBtn.classList.remove('mp3-detail-save-success', 'mp3-detail-save-error');
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
    saveBtn.title = '';
}

function focuspointTypeNames() {
    return Object.keys(focuspointTypes).sort(function (a, b) {
        return a.localeCompare(b, 'de', { sensitivity: 'base' });
    });
}

function updateFocuspointFieldSelect() {
    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    if (!canvas) return;
    var wrap = qs('.mp3-focuspoint-field-wrap', canvas);
    var sel = qs('.mp3-focuspoint-field-select', canvas);
    if (!wrap || !sel) return;
    if (focuspointFields.length <= 1) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';
    var html = '';
    for (var i = 0; i < focuspointFields.length; i++) {
        var f = focuspointFields[i];
        html += '<option value="' + escAttr(f) + '"' + (f === focuspointActiveField ? ' selected' : '') + '>' + escAttr(f) + '</option>';
    }
    sel.innerHTML = html;
}

function updateFocuspointTypeSelect() {
    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    if (!canvas) return;
    var sel = qs('.mp3-focuspoint-type-select', canvas);
    if (!sel) return;
    var names = focuspointTypeNames();
    if (!names.length) {
        sel.innerHTML = '<option value="">' + t('mediaplace_no_focuspoint_type') + '</option>';
        sel.disabled = true;
        return;
    }
    sel.disabled = false;
    var html = '<option value="">' + t('mediaplace_choose_preview') + '</option>';
    for (var i = 0; i < names.length; i++) {
        var typeObj = focuspointTypes[names[i]];
        var label = (typeObj && typeObj.label) ? typeObj.label : names[i];
        html += '<option value="' + escAttr(names[i]) + '"' + (names[i] === focuspointActiveType ? ' selected' : '') + '>' + escAttr(label) + '</option>';
    }
    sel.innerHTML = html;
}

function updateFocuspointMarker() {
    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    if (!canvas) return;
    var marker = qs('.mp3-focuspoint-marker', canvas);
    if (marker) {
        marker.style.left = focuspointPos[0] + '%';
        marker.style.top = focuspointPos[1] + '%';
    }
    var coords = qs('.mp3-focuspoint-coords', canvas);
    if (coords) coords.textContent = focuspointPos[0].toFixed(1) + '% | ' + focuspointPos[1].toFixed(1) + '%';
}

function updateFocuspointPreview() {
    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    if (!canvas) return;
    var wrap = qs('.mp3-focuspoint-preview-wrap', canvas);
    var img = qs('.mp3-focuspoint-preview-img', canvas);
    if (!wrap || !img) return;
    if (!focuspointActiveType || !focuspointFilename) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';
    var xy = focuspointPos[0].toFixed(1) + ',' + focuspointPos[1].toFixed(1);
    // Live, uncached Vorschau ueber den rex-api-call des focuspoint-Addons
    // selbst (rex_api_focuspoint) -- exakt derselbe Mechanismus, den auch
    // dessen eigenes fp_panel.php nutzt, kein eigener Crop-Simulationscode.
    img.src = 'index.php?rex-api-call=focuspoint&file=' + encodeURIComponent(focuspointFilename) +
        '&type=' + encodeURIComponent(focuspointActiveType) + '&xy=' + encodeURIComponent(xy) + '&_=' + Date.now();
}

function focuspointPositionFromEvent(e, wrap) {
    var rect = wrap.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 100;
    var y = ((e.clientY - rect.top) / rect.height) * 100;
    return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
}

// Defensive Zahl-Normalisierung: das focuspoint-Addon liefert Koordinaten
// je nach Codepfad mal als PHP-Int, mal als String zurueck (str2fp()
// parst per Regex), was via JSON mal als Zahl, mal als String ankommt.
// Serverseitig bereits auf float gecastet (siehe FocuspointIntegration::
// getFocus()), hier trotzdem nochmal defensiv, statt sich implizit auf
// die Typisierung eines fremden Addons zu verlassen.
function focuspointPosOrDefault(raw) {
    if (!Array.isArray(raw) || raw.length < 2) return [50, 50];
    var x = parseFloat(raw[0]);
    var y = parseFloat(raw[1]);
    return [isNaN(x) ? 50 : x, isNaN(y) ? 50 : y];
}

function setFocuspointActiveField(field) {
    focuspointActiveField = field;
    focuspointPos = field ? focuspointPosOrDefault(focuspointCurrent[field]) : [50, 50];
    updateFocuspointFieldSelect();
    updateFocuspointMarker();
    updateFocuspointPreview();
}

export function openFocuspointCanvas(filename) {
    // Kein canFocuspoint-Check hier (mehr): der Button selbst wird nur
    // gerendert, wenn FocuspointIntegration::canEdit() zum Zeitpunkt der
    // Detail-Panel-Anfrage bereits true war (siehe focuspoint_available
    // in rex_api_mediaplace_json_metainfo.php) -- das ist die aktuelle,
    // echte Pruefung. Ein zusaetzlicher client-seitiger Gate auf einem nur
    // einmal beim Seitenaufbau gecachten Flag (frueher canFocuspoint,
    // #mp3-root data-focuspoint-available) konnte veralten: legt ein
    // Admin z.B. waehrend eine MediaPlace-Session bereits offen ist einen
    // Media-Manager-Fokuspunkt-Effekt an, blieb der Button-Klick bis zum
    // naechsten Seiten-Reload wirkungslos -- ganz ohne Fehlermeldung.
    if (!ctx.overlay || !filename) return;
    if (ctx.isMetainfoCanvasOpen()) ctx.closeMetainfoCanvas();

    focuspointCanvasOpen = true;
    focuspointFilename = filename;
    focuspointFields = [];
    focuspointTypes = {};
    focuspointCurrent = {};
    focuspointActiveField = null;
    focuspointActiveType = '';
    focuspointPos = [50, 50];

    var content = qs('.mp3-content', ctx.overlay);
    if (content) content.classList.add('mp3-focuspoint-mode');

    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    if (!canvas) return;
    canvas.style.display = '';

    if (ctx.isCompactLayout() && ctx.detailPanel) ctx.detailPanel.classList.remove('mp3-detail-open');

    var titleEl = qs('.mp3-focuspoint-canvas-title', canvas);
    if (titleEl) titleEl.textContent = 'Fokuspunkt: ' + filename;

    var img = qs('.mp3-focuspoint-image', canvas);
    if (img) img.src = mediaThumbSrc(filename, 'rex_media_large', filename, ctx.mediaForceCacheTokens, ctx.getLastLoadedFiles(), ctx.getMediaBaseUrl());

    updateFocuspointFieldSelect();
    updateFocuspointTypeSelect();
    updateFocuspointMarker();
    updateFocuspointPreview();
    canvas.scrollTop = 0;

    apiLoadFocuspointInfo(filename)
        .then(function (info) {
            // Stale-Check: Canvas kann zwischenzeitlich fuer eine andere
            // Datei geoeffnet oder geschlossen worden sein.
            if (!focuspointCanvasOpen || focuspointFilename !== filename) return;
            focuspointFields = info.fields;
            focuspointTypes = info.types;
            focuspointCurrent = info.current;
            var defaultField = focuspointFields.indexOf('med_focuspoint') !== -1 ? 'med_focuspoint' : (focuspointFields[0] || null);
            setFocuspointActiveField(defaultField);
            // Direkt den ersten verfuegbaren Typ vorauswaehlen statt leer zu
            // starten -- die Live-Vorschau ist damit sofort sichtbar, ohne
            // dass der Nutzer erst manuell einen Typ waehlen muss.
            var typeNames = focuspointTypeNames();
            focuspointActiveType = typeNames.length ? typeNames[0] : '';
            updateFocuspointTypeSelect();
            updateFocuspointPreview();
        })
        .catch(function (err) {
            var coords = qs('.mp3-focuspoint-coords', canvas);
            if (coords) coords.textContent = t('mediaplace_error_loading', { msg: (err && err.message ? err.message : t('mediaplace_unknown')) });
            console.error('MP3 focuspoint info failed:', err);
        });
}

export function commitFocuspointCanvas() {
    if (!focuspointCanvasOpen || !focuspointActiveField || !focuspointFilename) return;
    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    var saveBtn = canvas ? qs('.mp3-focuspoint-canvas-save', canvas) : null;
    var xy = focuspointPos[0].toFixed(1) + ',' + focuspointPos[1].toFixed(1);

    if (saveBtn) saveBtn.disabled = true;
    apiSaveFocuspoint(focuspointFilename, focuspointActiveField, xy)
        .then(function () {
            focuspointCurrent[focuspointActiveField] = focuspointPos.slice();
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> ' + t('mediaplace_saved');
                saveBtn.classList.add('mp3-detail-save-success');
            }
            // Schliesst den Canvas nach kurzer Erfolgs-Rueckmeldung automatisch
            // (Detail-Panel wird dadurch wieder sichtbar, siehe closeFocuspointCanvas())
            // -- "Speichern" fungiert hier als "Speichern & zurueck", analog zu
            // "Zurueck" selbst, statt den Nutzer im leeren Canvas stehen zu lassen.
            setTimeout(function () {
                closeFocuspointCanvas();
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
            console.error('MP3 focuspoint save failed:', err);
        });
}

export function closeFocuspointCanvas() {
    focuspointCanvasOpen = false;
    focuspointFilename = null;
    focuspointFields = [];
    focuspointTypes = {};
    focuspointCurrent = {};
    focuspointActiveField = null;
    focuspointActiveType = '';
    focuspointPos = [50, 50];

    var content = qs('.mp3-content', ctx.overlay);
    if (content) content.classList.remove('mp3-focuspoint-mode');
    var canvas = qs('#mp3-focuspoint-canvas', ctx.overlay);
    if (canvas) canvas.style.display = 'none';

    if (ctx.isCompactLayout() && ctx.detailPanel && ctx.getSelectedFile()) ctx.detailPanel.classList.add('mp3-detail-open');
}
