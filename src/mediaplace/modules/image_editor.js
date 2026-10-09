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
var ADJUSTMENTS = ['brightness', 'contrast', 'gamma', 'saturation'];

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
    var sliders = ADJUSTMENTS.map(function (key) {
        return '<label class="mp-ie-slider" data-adjust="' + key + '">' +
            '<span class="mp-ie-slider-label">' + escAttr(t('mediaplace_image_edit_' + key)) + '<output>0</output></span>' +
            '<input type="range" min="-100" max="100" step="1" value="0" data-adjust="' + key + '">' +
        '</label>';
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
                '<section class="mp-ie-section" data-section="geometry">' +
                    '<h3>' + t('mediaplace_image_edit_section_crop') + '</h3>' +
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
                '</section>' +
                '<section class="mp-ie-section" data-section="perspective">' +
                    '<h3>' + t('mediaplace_image_edit_section_perspective') + '</h3>' +
                    '<p class="mp-ie-hint mp-ie-perspective-hint">' + t('mediaplace_image_edit_perspective_hint') + '</p>' +
                    '<div class="mp-ie-buttons">' +
                        '<button type="button" class="mp-ie-btn" data-action="perspective-start"><i class="fa-solid fa-vector-square"></i> ' + t('mediaplace_image_edit_perspective_start') + '</button>' +
                        '<button type="button" class="mp-ie-btn mp-ie-btn-primary" data-action="perspective-apply">' + t('mediaplace_image_edit_apply') + '</button>' +
                        '<button type="button" class="mp-ie-btn" data-action="perspective-cancel">' + t('mediaplace_cancel') + '</button>' +
                        '<button type="button" class="mp-ie-btn" data-action="perspective-reset">' + t('mediaplace_reset') + '</button>' +
                    '</div>' +
                '</section>' +
                '<section class="mp-ie-section" data-section="adjust">' +
                    '<h3>' + t('mediaplace_image_edit_section_adjust') + '</h3>' +
                    sliders +
                    '<button type="button" class="mp-ie-link" data-action="adjust-reset">' + t('mediaplace_reset') + '</button>' +
                '</section>' +
                '<section class="mp-ie-section" data-section="save">' +
                    '<h3>' + t('mediaplace_image_edit_section_save') + '</h3>' +
                    '<label class="mp-ie-radio"><input type="radio" name="mp-ie-mode" value="copy"> ' + t('mediaplace_image_edit_mode_copy') + '</label>' +
                    '<div class="mp-ie-copy-name"><input type="text" class="mp-ie-name" aria-label="' + escAttr(t('mediaplace_image_edit_copy_name')) + '"><span class="mp-ie-ext"></span></div>' +
                    '<label class="mp-ie-radio"><input type="radio" name="mp-ie-mode" value="overwrite"> ' + t('mediaplace_image_edit_mode_overwrite') + '</label>' +
                    '<p class="mp-ie-hint mp-ie-overwrite-hint">' + t('mediaplace_image_edit_overwrite_hint') + '</p>' +
                    '<button type="button" class="mp-ie-btn mp-ie-restore" data-action="restore"><i class="fa-solid fa-clock-rotate-left"></i> ' + t('mediaplace_image_edit_restore') + '</button>' +
                '</section>' +
                '<p class="mp-ie-size" aria-live="polite"></p>' +
            '</aside>' +
        '</div>';
}

function defaultOps() {
    return { quarter: 0, flipH: false, flipV: false, perspective: null, angle: 0, crop: null, brightness: 0, contrast: 0, gamma: 0, saturation: 0 };
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
    ADJUSTMENTS.forEach(function (key) {
        el('input[data-adjust="' + key + '"]').value = '0';
    });
    updateOutputs();
}

function applyPermissions(info) {
    var caps = info.capabilities || {};
    el('[data-section="perspective"]').hidden = !caps.perspective;
    el('[data-section="adjust"]').hidden = !caps.adjust;

    var copyRadio = el('input[name="mp-ie-mode"][value="copy"]');
    var overwriteRadio = el('input[name="mp-ie-mode"][value="overwrite"]');
    copyRadio.closest('label').hidden = !info.canCopy;
    el('.mp-ie-copy-name').hidden = !info.canCopy;
    overwriteRadio.closest('label').hidden = !info.canOverwrite;
    el('.mp-ie-overwrite-hint').hidden = !info.canOverwrite;
    (info.canCopy ? copyRadio : overwriteRadio).checked = true;
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

function adjustLut(ops) {
    var f = Math.pow(2, ops.brightness / 100);
    var k = ops.contrast >= 0 ? 1 + ops.contrast / 50 : 1 + ops.contrast / 100;
    var g = Math.pow(2, ops.gamma / 50);
    var lut = new Uint8ClampedArray(256);
    for (var i = 0; i < 256; i++) {
        var v = i / 255;
        if (ops.brightness) v = Math.min(1, v * f);
        if (ops.contrast) v = Math.max(0, Math.min(1, k * v + 0.5 - 0.5 * k));
        if (ops.gamma) v = Math.pow(v, 1 / g);
        lut[i] = Math.round(v * 255);
    }
    return lut;
}

function stageAdjust(src) {
    var ops = state.ops;
    if (!ops.brightness && !ops.contrast && !ops.gamma && !ops.saturation) return src;
    var out = makeCanvas(src.width, src.height);
    var octx = out.getContext('2d');
    var img = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    var d = img.data;
    var lut = adjustLut(ops);
    var s = 1 + ops.saturation / 100;
    var lr = 0.2126 * (1 - s), lg = 0.7152 * (1 - s), lb = 0.0722 * (1 - s);
    for (var i = 0; i < d.length; i += 4) {
        var r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
        if (ops.saturation) {
            var rr = (lr + s) * r + lg * g + lb * b;
            var gg = lr * r + (lg + s) * g + lb * b;
            var bb = lr * r + lg * g + (lb + s) * b;
            r = rr; g = gg; b = bb;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
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
    if (dirty.adjust || !s.adjusted) {
        s.adjusted = stageAdjust(s.straighten);
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
    var image = perspective ? state.stages.geometry : state.stages.adjusted;

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
    if (perspective) {
        drawQuad(cssW, cssH);
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
    ADJUSTMENTS.forEach(function (key) {
        var out = qs('label[data-adjust="' + key + '"] output', canvas);
        if (out) out.textContent = String(state.ops[key]);
    });
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

function onCropPointerUp(e) {
    if (!drag) return;
    drag = null;
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
    state.mode = 'perspective';
    state.quadDraft = state.ops.perspective
        ? state.ops.perspective.map(function (p) { return p.slice(); })
        : [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]];
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
    render();
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
}

// ---- Bedienelemente ----

function onClick(e) {
    if (!state) return;
    if (e.target.closest('.mp-ie-back')) {
        closeImageEditor();
        return;
    }
    if (e.target.closest('.mp-ie-save')) {
        save();
        return;
    }
    if (e.target.closest('.mp-ie-reset-all')) {
        state.ops = defaultOps();
        state.aspect = 'free';
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
        case 'perspective-reset':
            if (state.mode === 'perspective') {
                state.quadDraft = [[0, 0], [1, 0], [1, 1], [0, 1]];
            } else {
                ops.perspective = null;
                state.dirty.perspective = true;
                resetCrop();
            }
            break;
        case 'adjust-reset':
            ADJUSTMENTS.forEach(function (key) {
                ops[key] = 0;
                el('input[data-adjust="' + key + '"]').value = '0';
            });
            state.dirty.adjust = true;
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
        state.ops[adjust] = parseInt(e.target.value, 10) || 0;
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
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Escape im Perspektivmodus verlässt nur diesen Modus. */
export function handleImageEditorEscape() {
    if (state && state.mode === 'perspective') {
        endPerspective(false);
        return true;
    }
    return false;
}

export function commitImageEditor() {
    save();
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
        ops.brightness || ops.contrast || ops.gamma || ops.saturation;
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
