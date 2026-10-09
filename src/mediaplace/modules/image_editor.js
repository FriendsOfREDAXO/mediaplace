/**
 * Bildbearbeitung im Hauptbereich: Zuschneiden, Drehen, Spiegeln, Ausrichten,
 * Perspektive, Licht und Farbe. Die Vorschau rechnet auf einer verkleinerten
 * Kopie mit denselben Schritten und Formeln wie lib/ImageEditor.php; gespeichert
 * wird serverseitig am Original.
 */

var ctx = null;
var state = null;

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;
var qs = MPCore.helpers.qs;
var apiImageEditInfo = MPCore.api.apiImageEditInfo;
var apiImageEditSave = MPCore.api.apiImageEditSave;
var apiImageEditRestore = MPCore.api.apiImageEditRestore;

var PREVIEW_MAX = 1600;
var MIN_CROP = 12;
var ASPECTS = [
    ['free', null], ['original', 'original'], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2],
    ['16:9', 16 / 9], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16]
];
var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
// Regler: Wert im Regler / scale = Wert in ops
var CONTROLS = {
    temperature: { min: -100, max: 100, def: 0 },
    tint: { min: -100, max: 100, def: 0 },
    black: { min: 0, max: 50, def: 0, scale: 100 },
    white: { min: 50, max: 100, def: 100, scale: 100 },
    brightness: { min: -100, max: 100, def: 0 },
    contrast: { min: -100, max: 100, def: 0 },
    highlights: { min: -100, max: 100, def: 0 },
    shadows: { min: -100, max: 100, def: 0 },
    gamma: { min: -100, max: 100, def: 0 },
    saturation: { min: -100, max: 100, def: 0 },
    effectStrength: { min: 0, max: 100, def: 100 },
    vignette: { min: 0, max: 100, def: 0 }
};
var EFFECTS = ['none', 'bw', 'sepia', 'warm', 'cold', 'faded'];
var SECTIONS_STORAGE_KEY = 'mediaplace.imageEditor.sections';

/**
 * ctx-Vertrag:
 * - overlay, detailPanel: DOM-Refs
 * - mediaForceCacheTokens: Objekt-Referenz (wird in-place mutiert)
 * - getCurrentCat()/setCurrentCat(), getSelectedFile(): Zustand aus core.js
 * - isMetainfoCanvasOpen()/closeMetainfoCanvas(), isFocuspointCanvasOpen()/closeFocuspointCanvas()
 * - isCompactLayout(), loadFiles(), showDetail()
 */
export function initImageEditor(theCtx) {
    ctx = theCtx;
    var canvas = qs('#mp-image-editor-canvas', ctx.overlay);
    if (!canvas) return;

    canvas.innerHTML = buildMarkup();
    applySections(readOpenSections());
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('input', onInput);
    canvas.addEventListener('change', onChange);
    canvas.addEventListener('dblclick', onDoubleClick);

    var crop = qs('.mp-ie-crop', canvas);
    crop.addEventListener('pointerdown', onCropPointerDown);
    crop.addEventListener('pointermove', onCropPointerMove);
    crop.addEventListener('pointerup', onCropPointerUp);
    crop.addEventListener('pointercancel', onCropPointerUp);
    crop.addEventListener('keydown', onCropKeydown);

    qs('.mp-ie-frame', canvas).addEventListener('pointerdown', onFramePointerDown, true);

    var quad = qs('.mp-ie-quad', canvas);
    quad.addEventListener('pointerdown', onQuadPointerDown);
    quad.addEventListener('pointermove', onQuadPointerMove);
    quad.addEventListener('pointerup', onQuadPointerUp);
    quad.addEventListener('pointercancel', onQuadPointerUp);
    quad.addEventListener('keydown', onQuadKeydown);

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function () {
            if (state) render();
        }).observe(qs('.mp-ie-stage', canvas));
    }
}

export function isImageEditorOpen() {
    return null !== state;
}

function el(selector) {
    return qs(selector, qs('#mp-image-editor-canvas', ctx.overlay));
}

function buildMarkup() {
    var aspectOptions = ASPECTS.map(function (a) {
        var label = a[0] === 'free' ? t('mediaplace_image_edit_aspect_free') : (a[0] === 'original' ? t('mediaplace_image_edit_aspect_original') : a[0]);
        return '<option value="' + a[0] + '">' + escAttr(label) + '</option>';
    }).join('');
    var slider = function (key) {
        var c = CONTROLS[key];
        return '<label class="mp-ie-slider" data-adjust="' + key + '">' +
            '<span class="mp-ie-slider-label">' + escAttr(t('mediaplace_image_edit_' + key)) + '<output>' + c.def + '</output></span>' +
            '<input type="range" min="' + c.min + '" max="' + c.max + '" step="1" value="' + c.def + '" data-adjust="' + key + '">' +
        '</label>';
    };
    var sectionHead = function (key, title) {
        return '<h3 class="mp-ie-section-title"><button type="button" class="mp-ie-section-toggle" data-section-toggle="' + key + '" aria-expanded="false" aria-controls="mp-ie-section-' + key + '">' +
            '<span>' + title + '</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></h3>';
    };
    var effectOptions = EFFECTS.map(function (key) {
        return '<option value="' + key + '">' + escAttr(t('mediaplace_image_edit_effect_' + key)) + '</option>';
    }).join('');
    var handles = HANDLES.map(function (h) {
        return '<span class="mp-ie-handle mp-ie-handle-' + h + '" data-handle="' + h + '"></span>';
    }).join('');
    var quadHandles = [0, 1, 2, 3].map(function (i) {
        return '<span class="mp-ie-quad-handle" data-corner="' + i + '" tabindex="0" role="slider" aria-label="' + escAttr(t('mediaplace_image_edit_corner_' + i)) + '"></span>';
    }).join('');
    var tool = function (action, icon, label) {
        return '<button type="button" class="mp-ie-tool" data-action="' + action + '" title="' + escAttr(label) + '" aria-label="' + escAttr(label) + '"><i class="fa-solid ' + icon + '"></i></button>';
    };

    return '' +
        '<div class="mp-editor-canvas-header">' +
            '<button type="button" class="mp-ie-back mp-ie-header-btn" title="' + escAttr(t('mediaplace_back_to_overview')) + '"><i class="fa-solid fa-arrow-left"></i> ' + t('mediaplace_back') + '</button>' +
            '<div class="mp-ie-title"></div>' +
            '<button type="button" class="mp-ie-compare mp-ie-header-btn" aria-pressed="false" title="' + escAttr(t('mediaplace_image_edit_compare_hint')) + '"><i class="fa-solid fa-circle-half-stroke"></i> ' + t('mediaplace_image_edit_compare') + '</button>' +
            '<button type="button" class="mp-ie-reset-all mp-ie-header-btn"><i class="fa-solid fa-rotate-left"></i> ' + t('mediaplace_image_edit_reset_all') + '</button>' +
            '<button type="button" class="mp-ie-save"><i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save') + '</button>' +
        '</div>' +
        '<div class="mp-ie-body">' +
            '<div class="mp-ie-stage">' +
                '<div class="mp-ie-loading"><i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_loading_more') + '</div>' +
                '<div class="mp-ie-frame">' +
                    '<canvas class="mp-ie-view"></canvas>' +
                    '<div class="mp-ie-crop" tabindex="0" role="slider" aria-label="' + escAttr(t('mediaplace_image_edit_crop_area')) + '">' + handles + '</div>' +
                    '<div class="mp-ie-quad"><svg class="mp-ie-quad-lines" aria-hidden="true"><polygon></polygon></svg>' + quadHandles + '</div>' +
                '</div>' +
            '</div>' +
            '<aside class="mp-ie-sidebar">' +
                '<section class="mp-ie-section" data-section="geometry" data-key="crop">' +
                    sectionHead('crop', t('mediaplace_image_edit_section_crop')) +
                    '<div class="mp-ie-section-body" id="mp-ie-section-crop">' +
                    '<button type="button" class="mp-ie-btn mp-ie-btn-primary mp-ie-auto" data-action="auto" title="' + escAttr(t('mediaplace_image_edit_auto_hint')) + '"><i class="fa-solid fa-wand-magic-sparkles"></i> ' + t('mediaplace_image_edit_auto') + '</button>' +
                    '<label class="mp-ie-field"><span>' + t('mediaplace_image_edit_aspect') + '</span><select class="mp-ie-aspect">' + aspectOptions + '</select></label>' +
                    '<div class="mp-ie-tools">' +
                        tool('rotate-left', 'fa-rotate-left', t('mediaplace_image_edit_rotate_left')) +
                        tool('rotate-right', 'fa-rotate-right', t('mediaplace_image_edit_rotate_right')) +
                        tool('flip-h', 'fa-left-right', t('mediaplace_image_edit_flip_h')) +
                        tool('flip-v', 'fa-up-down', t('mediaplace_image_edit_flip_v')) +
                    '</div>' +
                    '<label class="mp-ie-slider" data-angle="1"><span class="mp-ie-slider-label">' + t('mediaplace_image_edit_straighten') + '<output>0°</output></span>' +
                        '<input type="range" class="mp-ie-angle" min="-45" max="45" step="0.1" value="0">' +
                    '</label>' +
                    '</div>' +
                '</section>' +
                '<section class="mp-ie-section" data-section="perspective" data-key="perspective">' +
                    sectionHead('perspective', t('mediaplace_image_edit_section_perspective')) +
                    '<div class="mp-ie-section-body" id="mp-ie-section-perspective">' +
                    '<p class="mp-ie-hint mp-ie-perspective-hint">' + t('mediaplace_image_edit_perspective_hint') + '</p>' +
                    '<figure class="mp-ie-persp-preview"><canvas aria-hidden="true"></canvas><figcaption>' + t('mediaplace_image_edit_perspective_preview') + '</figcaption></figure>' +
                    '<div class="mp-ie-buttons">' +
                        '<button type="button" class="mp-ie-btn" data-action="perspective-start"><i class="fa-solid fa-vector-square"></i> ' + t('mediaplace_image_edit_perspective_start') + '</button>' +
                        '<button type="button" class="mp-ie-btn mp-ie-btn-primary" data-action="perspective-apply">' + t('mediaplace_image_edit_apply') + '</button>' +
                        '<button type="button" class="mp-ie-btn" data-action="perspective-cancel">' + t('mediaplace_cancel') + '</button>' +
                        '<button type="button" class="mp-ie-btn" data-action="perspective-compare" aria-pressed="false"><i class="fa-solid fa-eye"></i> <span>' + t('mediaplace_image_edit_perspective_show_result') + '</span></button>' +
                        '<button type="button" class="mp-ie-btn" data-action="perspective-reset">' + t('mediaplace_reset') + '</button>' +
                    '</div>' +
                    '</div>' +
                '</section>' +
                '<section class="mp-ie-section" data-section="adjust" data-key="white_balance">' +
                    sectionHead('white_balance', t('mediaplace_image_edit_section_white_balance')) +
                    '<div class="mp-ie-section-body" id="mp-ie-section-white_balance">' +
                    '<div class="mp-ie-buttons">' +
                        '<button type="button" class="mp-ie-btn" data-action="pipette" aria-pressed="false"><i class="fa-solid fa-eye-dropper"></i> ' + t('mediaplace_image_edit_pipette') + '</button>' +
                    '</div>' +
                    '<p class="mp-ie-hint mp-ie-pipette-hint">' + t('mediaplace_image_edit_pipette_hint') + '</p>' +
                    slider('temperature') + slider('tint') +
                    '</div>' +
                '</section>' +
                '<section class="mp-ie-section" data-section="adjust" data-key="tone">' +
                    sectionHead('tone', t('mediaplace_image_edit_section_tone')) +
                    '<div class="mp-ie-section-body" id="mp-ie-section-tone">' +
                    slider('black') + slider('white') + slider('brightness') + slider('contrast') +
                    slider('highlights') + slider('shadows') + slider('gamma') +
                    '</div>' +
                '</section>' +
                '<section class="mp-ie-section" data-section="adjust" data-key="color">' +
                    sectionHead('color', t('mediaplace_image_edit_section_color')) +
                    '<div class="mp-ie-section-body" id="mp-ie-section-color">' +
                    slider('saturation') +
                    '<label class="mp-ie-field"><span>' + t('mediaplace_image_edit_effect') + '</span><select class="mp-ie-effect">' + effectOptions + '</select></label>' +
                    slider('effectStrength') + slider('vignette') +
                    '<button type="button" class="mp-ie-link" data-action="adjust-reset">' + t('mediaplace_image_edit_reset_tone') + '</button>' +
                    '</div>' +
                '</section>' +
                '<section class="mp-ie-section" data-section="save" data-key="save">' +
                    sectionHead('save', t('mediaplace_image_edit_section_save')) +
                    '<div class="mp-ie-section-body" id="mp-ie-section-save">' +
                    '<label class="mp-ie-radio"><input type="radio" name="mp-ie-mode" value="copy"> ' + t('mediaplace_image_edit_mode_copy') + '</label>' +
                    '<div class="mp-ie-copy-name"><input type="text" class="mp-ie-name" aria-label="' + escAttr(t('mediaplace_image_edit_copy_name')) + '"><span class="mp-ie-ext"></span></div>' +
                    '<label class="mp-ie-radio"><input type="radio" name="mp-ie-mode" value="overwrite"> ' + t('mediaplace_image_edit_mode_overwrite') + '</label>' +
                    '<p class="mp-ie-hint mp-ie-overwrite-hint">' + t('mediaplace_image_edit_overwrite_hint') + '</p>' +
                    '<button type="button" class="mp-ie-btn mp-ie-restore" data-action="restore"><i class="fa-solid fa-clock-rotate-left"></i> ' + t('mediaplace_image_edit_restore') + '</button>' +
                    '</div>' +
                '</section>' +
                '<p class="mp-ie-size" aria-live="polite"></p>' +
            '</aside>' +
        '</div>';
}

function defaultOps() {
    var ops = { quarter: 0, flipH: false, flipV: false, perspective: null, angle: 0, crop: null, effect: 'none' };
    Object.keys(CONTROLS).forEach(function (key) {
        ops[key] = CONTROLS[key].def / (CONTROLS[key].scale || 1);
    });
    return ops;
}

export function openImageEditor(filename) {
    if (!ctx.overlay || !filename) return;
    if (ctx.isMetainfoCanvasOpen()) ctx.closeMetainfoCanvas();
    if (ctx.isFocuspointCanvasOpen()) ctx.closeFocuspointCanvas();

    state = {
        filename: filename,
        info: null,
        ops: defaultOps(),
        aspect: 'free',
        mode: 'crop',
        quadDraft: null,
        source: null,
        full: { width: 0, height: 0 },
        stages: {},
        dirty: { geometry: true },
        scale: 1,
        saving: false
    };

    var content = qs('.mp-content', ctx.overlay);
    if (content) content.classList.add('mp-image-edit-mode');
    var canvas = qs('#mp-image-editor-canvas', ctx.overlay);
    canvas.style.display = '';
    canvas.classList.add('mp-ie-is-loading');
    if (ctx.isCompactLayout() && ctx.detailPanel) ctx.detailPanel.classList.remove('mp-detail-open');

    el('.mp-ie-title').textContent = t('mediaplace_image_edit') + ': ' + filename;
    el('.mp-ie-save').disabled = false;
    el('.mp-ie-save').title = '';
    setSaveButton('fa-floppy-disk', t('mediaplace_save'));
    resetControls();

    apiImageEditInfo(filename)
        .then(function (info) {
            if (!state || state.filename !== filename) return null;
            state.info = info;
            applyPermissions(info);
            return loadSource(info.src);
        })
        .then(function () {
            if (!state || state.filename !== filename || !state.source) return;
            canvas.classList.remove('mp-ie-is-loading');
            render();
            el('.mp-ie-crop').focus({ preventScroll: true });
        })
        .catch(function (err) {
            if (!state || state.filename !== filename) return;
            el('.mp-ie-loading').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message || t('mediaplace_unknown'));
        });
}

export function closeImageEditor() {
    state = null;
    var content = qs('.mp-content', ctx.overlay);
    if (content) content.classList.remove('mp-image-edit-mode');
    var canvas = qs('#mp-image-editor-canvas', ctx.overlay);
    if (canvas) {
        canvas.style.display = 'none';
        canvas.classList.remove('mp-ie-is-loading', 'mp-ie-perspective-mode');
        var loading = qs('.mp-ie-loading', canvas);
        if (loading) loading.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_loading_more');
    }
    if (ctx.isCompactLayout() && ctx.detailPanel && ctx.getSelectedFile()) ctx.detailPanel.classList.add('mp-detail-open');
}

function resetControls() {
    el('.mp-ie-aspect').value = 'free';
    el('.mp-ie-angle').value = '0';
    Object.keys(CONTROLS).forEach(function (key) {
        el('input[data-adjust="' + key + '"]').value = String(CONTROLS[key].def);
    });
    el('.mp-ie-effect').value = 'none';
    setPipette(false);
    setCompare(false);
    updateOutputs();
}

function applyPermissions(info) {
    var caps = info.capabilities || {};
    el('[data-section="perspective"]').hidden = !caps.perspective;
    qs('#mp-image-editor-canvas', ctx.overlay).querySelectorAll('[data-section="adjust"], .mp-ie-auto').forEach(function (node) {
        node.hidden = !caps.adjust;
    });

    var copyRadio = el('input[name="mp-ie-mode"][value="copy"]');
    var overwriteRadio = el('input[name="mp-ie-mode"][value="overwrite"]');
    copyRadio.closest('label').hidden = !info.canCopy;
    el('.mp-ie-copy-name').hidden = !info.canCopy;
    overwriteRadio.closest('label').hidden = !info.canOverwrite;
    el('.mp-ie-overwrite-hint').hidden = !info.canOverwrite;
    // Standard: Datei ersetzen (Original bleibt wiederherstellbar), sonst als neue Datei
    (info.canOverwrite ? overwriteRadio : copyRadio).checked = true;
    el('.mp-ie-name').value = info.copyName || '';
    el('.mp-ie-ext').textContent = '.' + (info.extension || '');
    el('.mp-ie-restore').hidden = !(info.hasBackup && info.canOverwrite);
    updateModeFields();
}

function updateModeFields() {
    var copy = el('input[name="mp-ie-mode"][value="copy"]').checked;
    el('.mp-ie-name').disabled = !copy;
}

function loadSource(src) {
    return fetch(src, { credentials: 'same-origin' })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        })
        .then(function (blob) {
            return createImageBitmap(blob, { imageOrientation: 'from-image' });
        })
        .then(function (bitmap) {
            if (!state) {
                bitmap.close();
                return;
            }
            state.full = { width: bitmap.width, height: bitmap.height };
            var scale = Math.min(1, PREVIEW_MAX / Math.max(bitmap.width, bitmap.height));
            var canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
            var c = canvas.getContext('2d');
            c.imageSmoothingQuality = 'high';
            c.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            state.source = canvas;
            state.dirty = { geometry: true };
        });
}

function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

// ---- Pipeline (gleiche Schritte und Formeln wie ImageEditor.php) ----

function rotatedSize(w, h, quarter) {
    return quarter % 2 ? { width: h, height: w } : { width: w, height: h };
}

function perspectiveSize(quad) {
    var dist = function (a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); };
    return {
        width: Math.max(1, Math.round((dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2)),
        height: Math.max(1, Math.round((dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2))
    };
}

function straightenSize(w, h, angle) {
    var a = Math.abs(angle) * Math.PI / 180;
    var k = Math.min(w / (w * Math.cos(a) + h * Math.sin(a)), h / (w * Math.sin(a) + h * Math.cos(a)));
    return { width: Math.max(1, Math.floor(w * k)), height: Math.max(1, Math.floor(h * k)) };
}

function squareToQuad(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
        return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0];
    }
    var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    var det = dx1 * dy2 - dx2 * dy1;
    var g = (dx3 * dy2 - dx2 * dy3) / det;
    var h = (dx1 * dy3 - dx3 * dy1) / det;
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

function stageGeometry() {
    var src = state.source;
    var size = rotatedSize(src.width, src.height, state.ops.quarter);
    var out = makeCanvas(size.width, size.height);
    var c = out.getContext('2d');
    c.translate(size.width / 2, size.height / 2);
    c.scale(state.ops.flipH ? -1 : 1, state.ops.flipV ? -1 : 1);
    c.rotate(state.ops.quarter * Math.PI / 2);
    c.drawImage(src, -src.width / 2, -src.height / 2);
    return out;
}

function stagePerspective(src, quadNorm) {
    var quad = quadNorm.map(function (p) { return [p[0] * src.width, p[1] * src.height]; });
    var size = perspectiveSize(quad);
    var m = squareToQuad(quad);
    var sw = src.width, sh = src.height;
    var sdata = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    var out = makeCanvas(size.width, size.height);
    var octx = out.getContext('2d');
    var img = octx.createImageData(size.width, size.height);
    var d = img.data;
    var i = 0;
    for (var y = 0; y < size.height; y++) {
        var v = (y + 0.5) / size.height;
        for (var x = 0; x < size.width; x++, i += 4) {
            var u = (x + 0.5) / size.width;
            var w = m[6] * u + m[7] * v + 1;
            var sx = (m[0] * u + m[1] * v + m[2]) / w - 0.5;
            var sy = (m[3] * u + m[4] * v + m[5]) / w - 0.5;
            sx = sx < 0 ? 0 : (sx > sw - 1 ? sw - 1 : sx);
            sy = sy < 0 ? 0 : (sy > sh - 1 ? sh - 1 : sy);
            var x0 = sx | 0, y0 = sy | 0;
            var x1 = x0 < sw - 1 ? x0 + 1 : x0, y1 = y0 < sh - 1 ? y0 + 1 : y0;
            var fx = sx - x0, fy = sy - y0;
            var a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, e = (y1 * sw + x1) * 4;
            for (var ch = 0; ch < 4; ch++) {
                var top = sdata[a + ch] + (sdata[b + ch] - sdata[a + ch]) * fx;
                var bottom = sdata[c + ch] + (sdata[e + ch] - sdata[c + ch]) * fx;
                d[i + ch] = top + (bottom - top) * fy;
            }
        }
    }
    octx.putImageData(img, 0, 0);
    return out;
}

function stageStraighten(src, angle) {
    if (!angle) return src;
    var size = straightenSize(src.width, src.height, angle);
    var out = makeCanvas(size.width, size.height);
    var c = out.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.translate(size.width / 2, size.height / 2);
    c.rotate(angle * Math.PI / 180);
    c.drawImage(src, -src.width / 2, -src.height / 2);
    return out;
}

function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function whiteBalanceGains(temperature, tint) {
    var r = Math.pow(2, temperature / 200 + tint / 400);
    var g = Math.pow(2, -tint / 200);
    var b = Math.pow(2, -temperature / 200 + tint / 400);
    var norm = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [r / norm, g / norm, b / norm];
}

function toneCurve(channel, v, ops) {
    if (ops.temperature || ops.tint) v = clamp01(v * whiteBalanceGains(ops.temperature, ops.tint)[channel]);
    if (ops.black > 0 || ops.white < 1) v = clamp01((v - ops.black) / Math.max(0.01, ops.white - ops.black));
    if (ops.brightness) v = clamp01(v * Math.pow(2, ops.brightness / 100));
    if (ops.contrast) {
        var k = ops.contrast >= 0 ? 1 + ops.contrast / 50 : 1 + ops.contrast / 100;
        v = clamp01(k * v + 0.5 - 0.5 * k);
    }
    if (ops.shadows || ops.highlights) {
        v = clamp01(v + 0.25 * (ops.shadows / 100) * 6.75 * v * (1 - v) * (1 - v) + 0.25 * (ops.highlights / 100) * 6.75 * v * v * (1 - v));
    }
    if (ops.gamma) v = clamp01(Math.pow(v, 1 / Math.pow(2, ops.gamma / 50)));
    if (ops.effect === 'faded' && ops.effectStrength > 0) {
        var lift = 0.12 * ops.effectStrength / 100;
        v = lift + v * (1 - lift);
    }
    return v;
}

function hasToneCurve(ops) {
    return !!(ops.temperature || ops.tint || ops.brightness || ops.contrast || ops.highlights || ops.shadows || ops.gamma ||
        ops.black > 0 || ops.white < 1 || (ops.effect === 'faded' && ops.effectStrength > 0));
}

/** Sättigung und Effekt als 3×3-Matrix (zeilenweise), null wenn ohne Wirkung. */
function colorMatrix(ops) {
    var identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    var luma = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722];
    var mix = function (a, b, tt) { return a.map(function (x, i) { return x + (b[i] - x) * tt; }); };
    var multiply = function (a, b) {
        var out = [];
        for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
        return out;
    };
    var matrix = identity;
    if (ops.saturation) matrix = mix(luma, identity, 1 + ops.saturation / 100);
    var effects = {
        bw: luma,
        sepia: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131],
        warm: [1.1, 0, 0, 0, 1.02, 0, 0, 0, 0.85],
        cold: [0.88, 0, 0, 0, 1, 0, 0, 0, 1.12],
        faded: mix(identity, luma, 0.3)
    };
    var effect = effects[ops.effect];
    if (effect && ops.effectStrength > 0) matrix = multiply(mix(identity, effect, ops.effectStrength / 100), matrix);
    return matrix === identity ? null : matrix;
}

function vignetteFactor(x, y, amount) {
    var d = Math.hypot((x - 0.5) * 2, (y - 0.5) * 2);
    var tt = clamp01((d - 0.45) / 0.8);
    return 1 - (amount / 100) * 0.7 * tt * tt * (3 - 2 * tt);
}

function stageAdjust(src) {
    var ops = state.ops;
    var curve = hasToneCurve(ops);
    var matrix = colorMatrix(ops);
    if (!curve && !matrix && !ops.vignette) return src;

    var out = makeCanvas(src.width, src.height);
    var octx = out.getContext('2d');
    var img = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    var d = img.data;
    var luts = [0, 1, 2].map(function (ch) {
        var lut = new Float32Array(256);
        for (var i = 0; i < 256; i++) lut[i] = curve ? toneCurve(ch, i / 255, ops) : i / 255;
        return lut;
    });
    var crop = cropRect();
    var W = src.width, H = src.height;
    for (var y = 0, i = 0; y < H; y++) {
        var vy = ((y + 0.5) / H - crop.y) / crop.h;
        for (var x = 0; x < W; x++, i += 4) {
            var r = luts[0][d[i]], g = luts[1][d[i + 1]], b = luts[2][d[i + 2]];
            if (matrix) {
                var rr = clamp01(matrix[0] * r + matrix[1] * g + matrix[2] * b);
                var gg = clamp01(matrix[3] * r + matrix[4] * g + matrix[5] * b);
                var bb = clamp01(matrix[6] * r + matrix[7] * g + matrix[8] * b);
                r = rr; g = gg; b = bb;
            }
            if (ops.vignette) {
                var f = vignetteFactor(((x + 0.5) / W - crop.x) / crop.w, vy, ops.vignette);
                r *= f; g *= f; b *= f;
            }
            d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
        }
    }
    octx.putImageData(img, 0, 0);
    return out;
}

/** Baut die Zwischenstufen ab der ersten geänderten neu. */
function compute() {
    var s = state.stages;
    var dirty = state.dirty;
    if (dirty.geometry || !s.geometry) {
        s.geometry = stageGeometry();
        dirty.perspective = true;
    }
    if (dirty.perspective || !s.perspective) {
        s.perspective = state.ops.perspective ? stagePerspective(s.geometry, state.ops.perspective) : s.geometry;
        dirty.straighten = true;
    }
    if (dirty.straighten || !s.straighten) {
        s.straighten = stageStraighten(s.perspective, state.ops.angle);
        dirty.adjust = true;
    }
    // Die Vignette hängt am Zuschnitt
    var cropKey = state.ops.vignette ? JSON.stringify(cropRect()) : '';
    if (dirty.adjust || !s.adjusted || cropKey !== state.adjustedCropKey) {
        s.adjusted = stageAdjust(s.straighten);
        state.adjustedCropKey = cropKey;
    }
    state.dirty = {};
}

// ---- Darstellung ----

var renderQueued = false;
function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
        renderQueued = false;
        if (!state || !state.source) return;
        compute();
        draw();
    });
}

function draw() {
    var canvas = qs('#mp-image-editor-canvas', ctx.overlay);
    var stage = qs('.mp-ie-stage', canvas);
    var frame = qs('.mp-ie-frame', canvas);
    var view = qs('.mp-ie-view', canvas);
    var perspective = state.mode === 'perspective';
    var compare = perspective && state.perspectiveCompare;
    var image = perspective ? state.stages.geometry : state.stages.adjusted;
    if (state.showOriginal) image = state.source;
    if (compare) {
        var key = JSON.stringify(state.quadDraft);
        if (!state.compareImage || state.compareKey !== key) {
            state.compareImage = stagePerspective(state.stages.geometry, state.quadDraft);
            state.compareKey = key;
        }
        image = state.compareImage;
    }

    var maxW = Math.max(50, stage.clientWidth - 32);
    var maxH = Math.max(50, stage.clientHeight - 32);
    var scale = Math.min(maxW / image.width, maxH / image.height);
    var cssW = Math.max(1, Math.floor(image.width * scale));
    var cssH = Math.max(1, Math.floor(image.height * scale));
    var dpr = window.devicePixelRatio || 1;
    frame.style.width = cssW + 'px';
    frame.style.height = cssH + 'px';
    view.style.width = cssW + 'px';
    view.style.height = cssH + 'px';
    view.width = Math.round(cssW * dpr);
    view.height = Math.round(cssH * dpr);
    var c = view.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(image, 0, 0, view.width, view.height);
    state.scale = scale;

    canvas.classList.toggle('mp-ie-perspective-mode', perspective);
    canvas.classList.toggle('mp-ie-perspective-compare', compare);
    canvas.classList.toggle('mp-ie-show-original', !!state.showOriginal);
    if (perspective && !compare) {
        drawQuad(cssW, cssH);
        schedulePerspectivePreview();
    } else if (perspective) {
        schedulePerspectivePreview();
    } else {
        drawCrop(cssW, cssH);
    }
    updateOutputs();
}

function cropRect() {
    return state.ops.crop || { x: 0, y: 0, w: 1, h: 1 };
}

function drawCrop(cssW, cssH) {
    var r = cropRect();
    var crop = el('.mp-ie-crop');
    crop.style.left = (r.x * cssW) + 'px';
    crop.style.top = (r.y * cssH) + 'px';
    crop.style.width = (r.w * cssW) + 'px';
    crop.style.height = (r.h * cssH) + 'px';
}

function drawQuad(cssW, cssH) {
    var quad = state.quadDraft;
    var points = quad.map(function (p) { return [p[0] * cssW, p[1] * cssH]; });
    var svg = el('.mp-ie-quad-lines');
    svg.setAttribute('viewBox', '0 0 ' + cssW + ' ' + cssH);
    svg.setAttribute('width', cssW);
    svg.setAttribute('height', cssH);
    svg.querySelector('polygon').setAttribute('points', points.map(function (p) { return p.join(','); }).join(' '));
    var handles = el('.mp-ie-quad').querySelectorAll('.mp-ie-quad-handle');
    for (var i = 0; i < 4; i++) {
        handles[i].style.left = points[i][0] + 'px';
        handles[i].style.top = points[i][1] + 'px';
        handles[i].setAttribute('aria-valuetext', Math.round(quad[i][0] * 100) + '% / ' + Math.round(quad[i][1] * 100) + '%');
    }
}

/** Größe des Ergebnisses in Originalpixeln. */
function outputSize() {
    var ops = state.ops;
    var size = rotatedSize(state.full.width, state.full.height, ops.quarter);
    if (ops.perspective) {
        size = perspectiveSize(ops.perspective.map(function (p) { return [p[0] * size.width, p[1] * size.height]; }));
    }
    if (ops.angle) size = straightenSize(size.width, size.height, ops.angle);
    var r = cropRect();
    return { width: Math.max(1, Math.round(r.w * size.width)), height: Math.max(1, Math.round(r.h * size.height)) };
}

function updateOutputs() {
    var canvas = qs('#mp-image-editor-canvas', ctx.overlay);
    if (!state) return;
    var angleOutput = qs('[data-angle] output', canvas);
    if (angleOutput) angleOutput.textContent = (Math.round(state.ops.angle * 10) / 10).toLocaleString() + '°';
    Object.keys(CONTROLS).forEach(function (key) {
        var out = qs('label[data-adjust="' + key + '"] output', canvas);
        if (out) out.textContent = String(Math.round(state.ops[key] * (CONTROLS[key].scale || 1)));
    });
    var strength = qs('label[data-adjust="effectStrength"]', canvas);
    if (strength) strength.hidden = state.ops.effect === 'none';
    if (state.full.width) {
        var size = outputSize();
        var text = size.width + ' × ' + size.height + ' px';
        el('.mp-ie-size').textContent = text;
        el('.mp-ie-crop').setAttribute('aria-valuetext', text);
    }
}

// ---- Zuschnitt ----

function ratioOf(aspect) {
    var entry = ASPECTS.filter(function (a) { return a[0] === aspect; })[0];
    if (!entry || !entry[1]) return null;
    var img = state.stages.straighten || state.source;
    return entry[1] === 'original' ? img.width / img.height : entry[1];
}

/** Größtes zentriertes Rechteck mit Verhältnis ratio (Breite/Höhe, in Pixeln) als normalisierter Zuschnitt. */
function fitCrop(ratio) {
    if (!ratio) return null;
    var img = state.stages.straighten;
    var w = img.width, h = w / ratio;
    if (h > img.height) {
        h = img.height;
        w = h * ratio;
    }
    return { x: (1 - w / img.width) / 2, y: (1 - h / img.height) / 2, w: w / img.width, h: h / img.height };
}

function resetCrop() {
    compute();
    state.ops.crop = fitCrop(ratioOf(state.aspect));
}

var drag = null;

function onCropPointerDown(e) {
    if (e.button !== 0 || !state) return;
    e.preventDefault();
    el('.mp-ie-crop').focus({ preventScroll: true });
    var img = state.stages.straighten;
    var r = cropRect();
    drag = {
        handle: e.target.dataset.handle || 'move',
        startX: e.clientX,
        startY: e.clientY,
        rect: { x: r.x * img.width, y: r.y * img.height, w: r.w * img.width, h: r.h * img.height },
        width: img.width,
        height: img.height
    };
    e.currentTarget.setPointerCapture(e.pointerId);
}

function onCropPointerMove(e) {
    if (!drag || !state) return;
    var scale = state.scale * (drag.width / state.stages.adjusted.width);
    var dx = (e.clientX - drag.startX) / scale;
    var dy = (e.clientY - drag.startY) / scale;
    var rect = drag.handle === 'move'
        ? moveRect(drag.rect, dx, dy, drag.width, drag.height)
        : resizeRect(drag.rect, drag.handle, dx, dy, drag.width, drag.height, ratioOf(state.aspect));
    setCropPx(rect, drag.width, drag.height);
}

function refreshCropDependent() {
    if (state && state.ops.vignette) render();
}

function onCropPointerUp(e) {
    if (!drag) return;
    drag = null;
    refreshCropDependent();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
}

function onCropKeydown(e) {
    var keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!state || !keys[e.key]) return;
    e.preventDefault();
    var img = state.stages.straighten;
    var step = (e.altKey ? 1 : 10) / state.scale;
    var r = cropRect();
    var rect = { x: r.x * img.width, y: r.y * img.height, w: r.w * img.width, h: r.h * img.height };
    var dx = keys[e.key][0] * step, dy = keys[e.key][1] * step;
    rect = e.shiftKey
        ? resizeRect(rect, 'se', dx, dy, img.width, img.height, ratioOf(state.aspect))
        : moveRect(rect, dx, dy, img.width, img.height);
    setCropPx(rect, img.width, img.height);
    refreshCropDependent();
}

function setCropPx(rect, width, height) {
    var full = rect.x <= 0.5 && rect.y <= 0.5 && rect.w >= width - 0.5 && rect.h >= height - 0.5;
    state.ops.crop = full ? null : { x: rect.x / width, y: rect.y / height, w: rect.w / width, h: rect.h / height };
    var frame = el('.mp-ie-frame');
    drawCrop(frame.clientWidth, frame.clientHeight);
    updateOutputs();
}

function moveRect(r, dx, dy, width, height) {
    return {
        x: Math.min(Math.max(r.x + dx, 0), width - r.w),
        y: Math.min(Math.max(r.y + dy, 0), height - r.h),
        w: r.w,
        h: r.h
    };
}

function resizeRect(start, handle, dx, dy, width, height, ratio) {
    var min = MIN_CROP / state.scale;
    var left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
    if (handle.indexOf('w') !== -1) left = Math.min(Math.max(0, left + dx), right - min);
    if (handle.indexOf('e') !== -1) right = Math.max(Math.min(width, right + dx), left + min);
    if (handle.indexOf('n') !== -1) top = Math.min(Math.max(0, top + dy), bottom - min);
    if (handle.indexOf('s') !== -1) bottom = Math.max(Math.min(height, bottom + dy), top + min);
    if (!ratio) return { x: left, y: top, w: right - left, h: bottom - top };

    var w = right - left, h = bottom - top;
    if (handle === 'n' || handle === 's') {
        w = h * ratio;
    } else if (handle === 'e' || handle === 'w') {
        h = w / ratio;
    } else if (w / h > ratio) {
        w = h * ratio;
    } else {
        h = w / ratio;
    }
    var hasW = handle.indexOf('w') !== -1, hasE = handle.indexOf('e') !== -1;
    var hasN = handle.indexOf('n') !== -1, hasS = handle.indexOf('s') !== -1;
    var ax = hasW ? start.x + start.w : (hasE ? start.x : start.x + start.w / 2);
    var ay = hasN ? start.y + start.h : (hasS ? start.y : start.y + start.h / 2);
    var maxW = hasW ? ax : (hasE ? width - ax : 2 * Math.min(ax, width - ax));
    var maxH = hasN ? ay : (hasS ? height - ay : 2 * Math.min(ay, height - ay));
    var fit = Math.min(1, maxW / w, maxH / h);
    w *= fit;
    h *= fit;
    return {
        x: hasW ? ax - w : (hasE ? ax : ax - w / 2),
        y: hasN ? ay - h : (hasS ? ay : ay - h / 2),
        w: w,
        h: h
    };
}

// ---- Perspektive ----

var quadDrag = null;

function startPerspective() {
    openSection('perspective');
    state.mode = 'perspective';
    state.quadDraft = state.ops.perspective
        ? state.ops.perspective.map(function (p) { return p.slice(); })
        : [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]];
    // Verkleinerte Kopie für die Live-Vorschau beim Ziehen
    var geometry = state.stages.geometry;
    var scale = Math.min(1, 360 / Math.max(geometry.width, geometry.height));
    state.perspectiveSmall = makeCanvas(Math.max(1, Math.round(geometry.width * scale)), Math.max(1, Math.round(geometry.height * scale)));
    state.perspectiveSmall.getContext('2d').drawImage(geometry, 0, 0, state.perspectiveSmall.width, state.perspectiveSmall.height);
    setPerspectiveCompare(false);
    render();
    var first = el('.mp-ie-quad-handle');
    if (first) first.focus({ preventScroll: true });
}

function endPerspective(apply) {
    if (apply) {
        var q = state.quadDraft;
        var identity = q[0][0] <= 0.001 && q[0][1] <= 0.001 && q[1][0] >= 0.999 && q[1][1] <= 0.001 && q[2][0] >= 0.999 && q[2][1] >= 0.999 && q[3][0] <= 0.001 && q[3][1] >= 0.999;
        state.ops.perspective = identity ? null : q;
        state.dirty.perspective = true;
        resetCrop();
    }
    state.mode = 'crop';
    state.quadDraft = null;
    state.perspectiveSmall = null;
    state.compareImage = null;
    setPerspectiveCompare(false);
    render();
}

function setPerspectiveCompare(on) {
    state.perspectiveCompare = on;
    var btn = el('[data-action="perspective-compare"]');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.querySelector('span').textContent = t(on ? 'mediaplace_image_edit_perspective_show_points' : 'mediaplace_image_edit_perspective_show_result');
    btn.querySelector('i').className = 'fa-solid ' + (on ? 'fa-vector-square' : 'fa-eye');
}

var previewQueued = false;
function schedulePerspectivePreview() {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(function () {
        previewQueued = false;
        if (!state || state.mode !== 'perspective' || !state.perspectiveSmall) return;
        var result = stagePerspective(state.perspectiveSmall, state.quadDraft);
        var canvas = el('.mp-ie-persp-preview canvas');
        canvas.width = result.width;
        canvas.height = result.height;
        canvas.getContext('2d').drawImage(result, 0, 0);
    });
}

function onQuadPointerDown(e) {
    var handle = e.target.closest('.mp-ie-quad-handle');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    handle.focus({ preventScroll: true });
    quadDrag = { corner: parseInt(handle.dataset.corner, 10) };
    e.currentTarget.setPointerCapture(e.pointerId);
}

function onQuadPointerMove(e) {
    if (!quadDrag || !state) return;
    var rect = el('.mp-ie-frame').getBoundingClientRect();
    state.quadDraft[quadDrag.corner] = [
        Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    ];
    drawQuad(rect.width, rect.height);
    schedulePerspectivePreview();
}

function onQuadPointerUp(e) {
    if (!quadDrag) return;
    quadDrag = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
}

function onQuadKeydown(e) {
    var keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    var handle = e.target.closest('.mp-ie-quad-handle');
    if (!handle || !keys[e.key] || !state) return;
    e.preventDefault();
    var frame = el('.mp-ie-frame');
    var step = e.shiftKey ? 10 : 1;
    var i = parseInt(handle.dataset.corner, 10);
    var p = state.quadDraft[i];
    state.quadDraft[i] = [
        Math.min(1, Math.max(0, p[0] + keys[e.key][0] * step / frame.clientWidth)),
        Math.min(1, Math.max(0, p[1] + keys[e.key][1] * step / frame.clientHeight))
    ];
    drawQuad(frame.clientWidth, frame.clientHeight);
    schedulePerspectivePreview();
}

// ---- Bedienelemente ----

function onClick(e) {
    var toggle = e.target.closest('.mp-ie-section-toggle');
    if (toggle) {
        toggleSection(toggle.dataset.sectionToggle);
        return;
    }
    if (!state) return;
    if (e.target.closest('.mp-ie-back')) {
        closeImageEditor();
        return;
    }
    if (e.target.closest('.mp-ie-save')) {
        save();
        return;
    }
    if (e.target.closest('.mp-ie-compare')) {
        setCompare(!state.showOriginal);
        render();
        return;
    }
    if (e.target.closest('.mp-ie-reset-all')) {
        state.ops = defaultOps();
        state.aspect = 'free';
        state.showOriginal = false;
        state.dirty = { geometry: true };
        if (state.mode === 'perspective') endPerspective(false);
        resetControls();
        render();
        return;
    }
    var button = e.target.closest('[data-action]');
    if (!button) return;
    var ops = state.ops;
    switch (button.dataset.action) {
        case 'rotate-left':
        case 'rotate-right':
            ops.quarter = (ops.quarter + (button.dataset.action === 'rotate-right' ? 1 : 3)) % 4;
            ops.perspective = null;
            state.dirty.geometry = true;
            resetCrop();
            break;
        case 'flip-h':
        case 'flip-v':
            // Gespiegelt wird die Ansicht; Perspektive, Ausrichten und Zuschnitt spiegeln mit
            var horizontal = button.dataset.action === 'flip-h';
            if (horizontal) ops.flipH = !ops.flipH; else ops.flipV = !ops.flipV;
            if (ops.perspective) {
                var q = ops.perspective;
                ops.perspective = horizontal
                    ? [[1 - q[1][0], q[1][1]], [1 - q[0][0], q[0][1]], [1 - q[3][0], q[3][1]], [1 - q[2][0], q[2][1]]]
                    : [[q[3][0], 1 - q[3][1]], [q[2][0], 1 - q[2][1]], [q[1][0], 1 - q[1][1]], [q[0][0], 1 - q[0][1]]];
            }
            if (ops.angle) ops.angle = -ops.angle;
            if (ops.crop && horizontal) ops.crop.x = 1 - ops.crop.x - ops.crop.w;
            if (ops.crop && !horizontal) ops.crop.y = 1 - ops.crop.y - ops.crop.h;
            state.dirty.geometry = true;
            break;
        case 'perspective-start':
            startPerspective();
            return;
        case 'perspective-apply':
            endPerspective(true);
            return;
        case 'perspective-cancel':
            endPerspective(false);
            return;
        case 'perspective-compare':
            setPerspectiveCompare(!state.perspectiveCompare);
            render();
            return;
        case 'perspective-reset':
            if (state.mode === 'perspective') {
                state.quadDraft = [[0, 0], [1, 0], [1, 1], [0, 1]];
                setPerspectiveCompare(false);
            } else {
                ops.perspective = null;
                state.dirty.perspective = true;
                resetCrop();
            }
            break;
        case 'adjust-reset':
            Object.keys(CONTROLS).forEach(function (key) {
                ops[key] = CONTROLS[key].def / (CONTROLS[key].scale || 1);
                el('input[data-adjust="' + key + '"]').value = String(CONTROLS[key].def);
            });
            ops.effect = 'none';
            el('.mp-ie-effect').value = 'none';
            state.dirty.adjust = true;
            break;
        case 'pipette':
            setPipette(!state.pipette);
            return;
        case 'auto':
            autoCorrect();
            break;
        case 'restore':
            restore();
            return;
        default:
            return;
    }
    el('.mp-ie-angle').value = String(ops.angle);
    render();
}

function onInput(e) {
    if (!state) return;
    var adjust = e.target.dataset.adjust;
    if (adjust) {
        var value = parseInt(e.target.value, 10) || 0;
        if (adjust === 'black' && value > parseInt(el('input[data-adjust="white"]').value, 10) - 5) return;
        if (adjust === 'white' && value < parseInt(el('input[data-adjust="black"]').value, 10) + 5) return;
        state.ops[adjust] = value / (CONTROLS[adjust].scale || 1);
        state.dirty.adjust = true;
        render();
        return;
    }
    if (e.target.classList.contains('mp-ie-angle')) {
        state.ops.angle = parseFloat(e.target.value) || 0;
        state.dirty.straighten = true;
        render();
    }
}

function onChange(e) {
    if (!state) return;
    if (e.target.classList.contains('mp-ie-effect')) {
        state.ops.effect = e.target.value;
        state.dirty.adjust = true;
        render();
        return;
    }
    if (e.target.classList.contains('mp-ie-aspect')) {
        state.aspect = e.target.value;
        resetCrop();
        render();
        return;
    }
    if (e.target.name === 'mp-ie-mode') updateModeFields();
}

function onDoubleClick(e) {
    if (!state) return;
    var input = e.target.closest('input[type="range"]');
    if (!input) return;
    input.value = input.dataset.adjust ? String(CONTROLS[input.dataset.adjust].def) : '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Escape im Perspektivmodus verlässt nur diesen Modus. */
export function handleImageEditorEscape() {
    if (state && state.mode === 'perspective') {
        if (state.perspectiveCompare) {
            setPerspectiveCompare(false);
            render();
        } else {
            endPerspective(false);
        }
        return true;
    }
    return false;
}

export function commitImageEditor() {
    save();
}

// ---- Aufklappbare Bereiche (Zustand pro Browser gemerkt) ----

/** Ohne gespeicherten Zustand ist „Zuschneiden und Drehen“ offen (Standardnutzung). */
function readOpenSections() {
    try {
        var raw = window.localStorage.getItem(SECTIONS_STORAGE_KEY);
        if (null === raw) return ['crop'];
        var stored = JSON.parse(raw);
        return Array.isArray(stored) ? stored : ['crop'];
    } catch (e) {
        return ['crop'];
    }
}

function writeOpenSections(keys) {
    try {
        window.localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(keys));
    } catch (e) {
        // Ohne Speicher bleibt es beim Zustand dieser Sitzung
    }
}

function applySections(openKeys) {
    var canvas = qs('#mp-image-editor-canvas', ctx.overlay);
    canvas.querySelectorAll('.mp-ie-section-toggle').forEach(function (btn) {
        var open = openKeys.indexOf(btn.dataset.sectionToggle) !== -1;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        qs('#' + btn.getAttribute('aria-controls'), canvas).hidden = !open;
    });
}

function currentOpenSections() {
    var keys = [];
    qs('#mp-image-editor-canvas', ctx.overlay).querySelectorAll('.mp-ie-section-toggle[aria-expanded="true"]').forEach(function (btn) {
        keys.push(btn.dataset.sectionToggle);
    });
    return keys;
}

function toggleSection(key) {
    var keys = currentOpenSections();
    var index = keys.indexOf(key);
    if (index === -1) keys.push(key); else keys.splice(index, 1);
    applySections(keys);
    writeOpenSections(keys);
}

function openSection(key) {
    var keys = currentOpenSections();
    if (keys.indexOf(key) !== -1) return;
    keys.push(key);
    applySections(keys);
    writeOpenSections(keys);
}

// ---- Weißabgleich, Auto, Vorher/Nachher ----

function setPipette(on) {
    if (state) state.pipette = on;
    var btn = el('[data-action="pipette"]');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    qs('#mp-image-editor-canvas', ctx.overlay).classList.toggle('mp-ie-pipette-mode', on);
}

function setCompare(on) {
    if (state) state.showOriginal = on;
    el('.mp-ie-compare').setAttribute('aria-pressed', on ? 'true' : 'false');
}

/** Farbtemperatur und Tönung, die die Farbe (r, g, b) neutral machen (Umkehrung von whiteBalanceGains). */
function neutralize(r, g, b) {
    var lr = Math.log2(Math.max(r, 1 / 255)), lg = Math.log2(Math.max(g, 1 / 255)), lb = Math.log2(Math.max(b, 1 / 255));
    var clampRange = function (v) { return Math.max(-100, Math.min(100, Math.round(v))); };
    return { temperature: clampRange(100 * (lb - lr)), tint: clampRange(-(400 / 3) * ((lr + lb) / 2 - lg)) };
}

function setControl(key, opsValue) {
    state.ops[key] = opsValue;
    el('input[data-adjust="' + key + '"]').value = String(Math.round(opsValue * (CONTROLS[key].scale || 1)));
}

function onFramePointerDown(e) {
    if (!state || !state.pipette) return;
    e.preventDefault();
    e.stopPropagation();
    var img = state.stages.straighten;
    var rect = el('.mp-ie-frame').getBoundingClientRect();
    var cx = Math.round((e.clientX - rect.left) / rect.width * img.width);
    var cy = Math.round((e.clientY - rect.top) / rect.height * img.height);
    var x0 = Math.max(0, cx - 2), y0 = Math.max(0, cy - 2);
    var data = img.getContext('2d').getImageData(x0, y0, Math.min(5, img.width - x0), Math.min(5, img.height - y0)).data;
    var sum = [0, 0, 0], n = 0;
    for (var i = 0; i < data.length; i += 4, n++) { sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; }
    var wb = neutralize(sum[0] / n / 255, sum[1] / n / 255, sum[2] / n / 255);
    setControl('temperature', wb.temperature);
    setControl('tint', wb.tint);
    setPipette(false);
    state.dirty.adjust = true;
    render();
}

/** Schwarz-/Weißpunkt aus dem Histogramm (0,5 % / 99,5 %), gedämpfter Grauwelt-Weißabgleich. */
function autoCorrect() {
    var img = state.stages.straighten;
    var crop = cropRect();
    var x0 = Math.floor(crop.x * img.width), y0 = Math.floor(crop.y * img.height);
    var w = Math.max(1, Math.floor(crop.w * img.width)), h = Math.max(1, Math.floor(crop.h * img.height));
    var data = img.getContext('2d').getImageData(x0, y0, w, h).data;
    var step = Math.max(1, Math.floor(Math.sqrt(w * h / 250000))) * 4;
    var hist = new Uint32Array(256), total = 0, mean = [0, 0, 0], midCount = 0;
    for (var i = 0; i < data.length; i += step) {
        var lum = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        hist[lum]++;
        total++;
        if (lum > 38 && lum < 242) {
            mean[0] += data[i]; mean[1] += data[i + 1]; mean[2] += data[i + 2];
            midCount++;
        }
    }
    var percentile = function (p) {
        var target = total * p, acc = 0;
        for (var v = 0; v < 256; v++) {
            acc += hist[v];
            if (acc >= target) return v / 255;
        }
        return 1;
    };
    setControl('black', Math.min(0.45, percentile(0.005)));
    setControl('white', Math.max(0.55, percentile(0.995)));
    if (midCount) {
        var wb = neutralize(mean[0] / midCount / 255, mean[1] / midCount / 255, mean[2] / midCount / 255);
        setControl('temperature', Math.round(wb.temperature / 2));
        setControl('tint', Math.round(wb.tint / 2));
    }
    state.dirty.adjust = true;
}

// ---- Speichern ----

function setSaveButton(icon, label, cls) {
    var btn = el('.mp-ie-save');
    btn.classList.remove('mp-detail-save-success', 'mp-detail-save-error');
    if (cls) btn.classList.add(cls);
    btn.innerHTML = '<i class="fa-solid ' + icon + '"></i> ' + label;
}

function hasChanges() {
    var ops = state.ops;
    return ops.quarter || ops.flipH || ops.flipV || ops.perspective || ops.angle || ops.crop ||
        hasToneCurve(ops) || colorMatrix(ops) || ops.vignette;
}

function save() {
    if (!state || state.saving || !state.info) return;
    if (state.mode === 'perspective') endPerspective(true);
    var mode = el('input[name="mp-ie-mode"]:checked');
    if (!mode) return;
    if (!hasChanges() && mode.value === 'overwrite') {
        closeImageEditor();
        return;
    }
    var filename = state.filename;
    state.saving = true;
    el('.mp-ie-save').disabled = true;
    setSaveButton('fa-spinner fa-spin', t('mediaplace_image_edit_saving'));

    apiImageEditSave(filename, state.ops, mode.value, el('.mp-ie-name').value)
        .then(function (result) {
            finish(filename, result.filename || filename);
        })
        .catch(function (err) {
            if (!state) return;
            state.saving = false;
            el('.mp-ie-save').disabled = false;
            setSaveButton('fa-triangle-exclamation', t('mediaplace_error'), 'mp-detail-save-error');
            el('.mp-ie-save').title = t('mediaplace_error_saving', { msg: err.message });
            setTimeout(function () {
                if (state && !state.saving) setSaveButton('fa-floppy-disk', t('mediaplace_save'));
            }, 2500);
        });
}

function restore() {
    if (!state || state.saving || !window.confirm(t('mediaplace_image_edit_restore_confirm'))) return;
    var filename = state.filename;
    state.saving = true;
    apiImageEditRestore(filename)
        .then(function () {
            finish(filename, filename);
        })
        .catch(function (err) {
            if (!state) return;
            state.saving = false;
            window.alert(t('mediaplace_error_saving', { msg: err.message }));
        });
}

function finish(original, result) {
    var now = Date.now();
    ctx.mediaForceCacheTokens[original] = now;
    ctx.mediaForceCacheTokens[result] = now;
    var reloadCat = ctx.getCurrentCat();
    closeImageEditor();
    ctx.setCurrentCat(reloadCat);
    ctx.loadFiles(reloadCat, true);
    ctx.showDetail(result);
}
