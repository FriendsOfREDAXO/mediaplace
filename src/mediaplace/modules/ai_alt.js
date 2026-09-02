/**
 * Optionale KI-Alt-Text-Generierung (siehe AiAltTextService::isAvailable()
 * -- rein soft-optional, ohne installiertes+konfiguriertes ai_platform-Addon
 * und aktivierte Einstellung "AI Alt-Text aktivieren" bleiben alle URLs am
 * #mp-root leer und diese Funktionen sind No-Ops). Zwei Teile:
 *
 * 1) Einzeldatei-Button (attachOwnFieldButton()/attachClassicFieldButton()) --
 *    wird direkt aus modules/detail.js aufgerufen, JEWEILS unmittelbar nach
 *    dem innerHTML-Rendern des Ziel-Containers (kein separates
 *    MutationObserver-Script mit eigenem Timing-Risiko).
 * 2) Kategorieuebergreifende Massengenerierung (openBulkPanel()), aus dem
 *    Zahnrad-Menue in core.js. Zwei Phasen -- Generieren (nur Vorschlaege,
 *    kein Schreiben) und Pruefen+Uebernehmen (Nutzer sieht/bearbeitet jeden
 *    Vorschlag, ein expliziter Klick schreibt) -- gleiches Review-vor-
 *    Speichern-Prinzip wie beim Einzeldatei-Button, nur ueber mehrere
 *    Dateien hinweg statt einem Formularfeld. Ein Generierungs-Lauf ist auf
 *    RUN_LIMIT Dateien begrenzt (siehe dortiger Kommentar) -- bei mehr
 *    fehlenden ALT-Texten "Weitere generieren" fuer den naechsten Abschnitt.
 *
 * Markup fuer das Bulk-Modal (.mp-cat-move-modal-overlay/.mp-bulk-progress-*)
 * ist bewusst dasselbe wie mediaplace's eigene Kategorie-Massenaktionen
 * (modules/categories.js, showBulkProgressModal()) -- gleiche Optik, gleicher
 * bereits bewaehrter Chunking-Vertrag fuer die Generierungs-Schleife
 * (processed/remaining, Abbruch bei processed===0, siehe dortige
 * Begruendung -- "processed" statt "succeeded", weil ein fehlgeschlagener
 * Vorschlag die Schleife trotzdem weiterlaufen lassen soll).
 */

var ctx = null;

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;
var qs = MPCore.helpers.qs;
var qsa = MPCore.helpers.qsa;
var mediaThumbSrc = MPCore.helpers.mediaThumbSrc;
var apiGenerateAiAltText = MPCore.api.apiGenerateAiAltText;
var apiAiAltBulkAction = MPCore.api.apiAiAltBulkAction;

export function isSvgFilename(filename) {
    return /\.svg$/i.test(filename || '');
}

// SVGs sind ein Vektorformat -- der Server hat keinen Rasterizer (siehe
// AiAltTextService::generateAltText()) und wuerde sie sonst ungeprueft als
// image/svg+xml an die Vision-API durchreichen, was dort meist mit einer
// leeren/fehlerhaften Antwort scheitert. Der Browser KANN SVG rendern (das
// ist buchstaeblich sein Job) -- also lassen wir ihn das tun: Datei laden,
// per <img> auf einen Canvas zeichnen, als PNG exportieren, das PNG statt
// der SVG-Datei zur KI schicken. Blob-URL statt der eigentlichen Datei-URL
// als img.src, damit das Canvas unabhaengig vom Ursprung der Mediendatei
// NIE als "tainted" gilt (same-origin waere zwar ohnehin gegeben, aber Blob-
// URLs machen das robust, falls Medien mal von anderswo ausgeliefert werden).
export function rasterizeSvgToPngDataUrl(filename, maxDim) {
    var url = mediaThumbSrc(filename, '', null, {}, [], ctx.getMediaBaseUrl());

    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error(t('mediaplace_ai_alt_error_svg_render'));
        return r.text();
    }).then(function (svgText) {
        return new Promise(function (resolve, reject) {
            var blobUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
            var img = new Image();
            img.onload = function () {
                // SVGs ohne explizite Breite/Hoehe/viewBox liefern hier den
                // Browser-Default (300x150) -- in beiden Faellen wird auf
                // maxDim skaliert (auch aufwaerts: ein Vektorbild verliert
                // dabei nichts, anders als ein Rasterbild).
                var w = img.naturalWidth || maxDim;
                var h = img.naturalHeight || maxDim;
                var scale = maxDim / Math.max(w, h);
                var canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(w * scale));
                canvas.height = Math.max(1, Math.round(h * scale));
                var context = canvas.getContext('2d');
                // Weisser statt transparenter Hintergrund -- Vision-APIs
                // interpretieren transparente Bereiche nicht einheitlich.
                context.fillStyle = '#fff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(blobUrl);
                try {
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = function () {
                URL.revokeObjectURL(blobUrl);
                reject(new Error(t('mediaplace_ai_alt_error_svg_render')));
            };
            img.src = blobUrl;
        });
    });
}

// Gemeinsamer Einstiegspunkt fuer beide Einzeldatei-Buttons: rastert SVGs
// clientseitig vor, ruft sonst den Server direkt mit der Datei auf.
function generateAiAltFor(filename) {
    if (!isSvgFilename(filename)) {
        return apiGenerateAiAltText(filename);
    }

    return rasterizeSvgToPngDataUrl(filename, 1024).then(function (dataUrl) {
        return apiGenerateAiAltText(filename, dataUrl);
    });
}

/**
 * ctx-Vertrag:
 * - getAiAltAvailable(): noch-legacy-State (read-only, true nur wenn Feature
 *   aktiv UND ai_platform verfuegbar, siehe data-ai-alt-url am #mp-root)
 * - getMediaBaseUrl(): siehe core.js/mediaThumbSrc()-Docblock in
 *   mediaplace-helpers.js -- fuer den SVG-Rasterisierungs-Fetch (nicht nur
 *   fuer Thumbnails) noetig, sonst schlaegt der Fetch in Unterordner-
 *   Installationen fehl.
 */
export function initAiAlt(theCtx) {
    ctx = theCtx;
}

function dispatchNativeInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Icon-only-Trigger statt ausgeschriebenem Button -- wird ins Feld-Label
// eingehaengt (siehe attachToLabel()), soll dort als kleines, ruhiges
// Zusatz-Icon wirken statt als eigener, das Formular optisch unruhig
// machender Block (siehe CHANGELOG/Nutzer-Feedback).
// Exportiert, weil modules/ai_tags.js dasselbe Icon-only-Label-Muster nutzt
// (gleiche Optik/Begruendung, siehe dortiger Import) -- keine zweite Kopie.
export function buildIconButton(titleKey) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-ai-icon-btn';
    btn.title = t(titleKey);
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    return btn;
}

// Haengt btn in das .mp-edit-label vor "container" (dessen direkter
// Vorgaenger im JSON-Widget-Markup, siehe fragments/mediaplace/detail_field.php)
// -- macht daraus per Modifier-Klasse eine Flex-Zeile (Label-Text links,
// Icon rechtsbuendig), ohne die geteilte .mp-edit-label-Regel selbst
// anzufassen (die gilt auch fuer alle anderen Feldtypen unveraendert).
// Liefert true bei Erfolg, damit der Aufrufer bei Misserfolg (kein
// passendes Label gefunden, z.B. im klassischen Canvas) selbst einen
// Fallback-Ort waehlen kann.
export function attachToLabel(container, btn) {
    var labelEl = container.previousElementSibling;
    if (!labelEl || !labelEl.classList.contains('mp-edit-label')) return false;
    labelEl.classList.add('mp-edit-label-with-ai');
    labelEl.appendChild(btn);
    return true;
}

function setBusy(btn, busy) {
    btn.disabled = busy;
    btn.classList.toggle('mp-ai-alt-busy', busy);
}

// Statuszeile fuer Fehlermeldungen -- eigenes Element statt Browser-title,
// damit ein Fehler sichtbar bleibt statt nur bei Hover auf das kleine Icon
// zu erscheinen. Wird nur bei tatsaechlicher Meldung eingeblendet.
function buildStatusEl() {
    var el = document.createElement('div');
    el.className = 'mp-ai-alt-status';
    el.style.display = 'none';
    return el;
}

function setStatus(statusEl, message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.style.display = message ? '' : 'none';
    statusEl.classList.toggle('mp-ai-alt-status-error', !!isError);
}

// ---- Einzeldatei: eigenes JSON-Alt-Feld (.mp-alt-wrap) ----

export function attachOwnFieldButton(wrap, filename) {
    if (!ctx.getAiAltAvailable() || !filename) return;
    if (wrap.hasAttribute('data-ai-alt-attached')) return;
    wrap.setAttribute('data-ai-alt-attached', '1');

    var langInputs = qs('.mp-lang-inputs', wrap);
    if (!langInputs) return;

    var btn = buildIconButton('mediaplace_ai_alt_generate');
    if (!attachToLabel(wrap, btn)) {
        // Fallback, falls kein Label gefunden wird (sollte im JSON-Widget-
        // Markup eigentlich immer der Fall sein) -- Icon-Button direkt vor
        // die Spracheingaben.
        wrap.insertBefore(btn, langInputs);
    }
    var statusEl = buildStatusEl();
    wrap.insertBefore(statusEl, langInputs);

    btn.addEventListener('click', function (e) {
        e.preventDefault();
        setStatus(statusEl, '', false);
        setBusy(btn, true);
        generateAiAltFor(filename).then(function (res) {
            setBusy(btn, false);
            var texts = res.texts || {};
            var wrote = false;
            Object.keys(texts).forEach(function (clangId) {
                var input = qs('.mp-lang-inputs [data-json-field][data-clang="' + clangId + '"]', wrap);
                if (input) {
                    input.value = texts[clangId];
                    dispatchNativeInput(input);
                    wrote = true;
                }
            });
            if (!wrote) setStatus(statusEl, t('mediaplace_ai_alt_error_generic'), true);
        }).catch(function (err) {
            setBusy(btn, false);
            setStatus(statusEl, err.message || t('mediaplace_ai_alt_error_network'), true);
        });
    });
}

// ---- Einzeldatei: klassisches med_alt-Feld im nativen Metainfo-Canvas ----

export function attachClassicFieldButton(canvas, filename) {
    if (!ctx.getAiAltAvailable() || !filename) return;

    var selectors = [
        'input[name="med_alt"]',
        'textarea[name="med_alt"]',
        'input[name="rex_media[med_alt]"]',
        'textarea[name="rex_media[med_alt]"]'
    ];
    var input = null;
    for (var i = 0; i < selectors.length; i++) {
        input = qs(selectors[i], canvas);
        if (input) break;
    }
    if (!input) return;

    var formGroup = input.closest('.form-group') || input.parentNode;
    if (!formGroup || formGroup.hasAttribute('data-ai-alt-attached')) return;
    formGroup.setAttribute('data-ai-alt-attached', '1');

    var btn = buildIconButton('mediaplace_ai_alt_generate');
    // Bootstrap-.form-group-Markup (nicht das JSON-Widget-Label) -- REDAXOs
    // Standard-Formular-Fragment (core/form/form.php) rendert
    // <dl class="form-group"><dt><label>...</label></dt><dd>...Feld...</dd></dl>,
    // das <label> steckt also in <dt>, ist KEIN direktes Kind von
    // .form-group -- ':scope > label' fand deshalb nie etwas, der Icon-Button
    // landete ueber den insertBefore()-Fallback unterhalb des (vollbreiten)
    // Eingabefelds statt im Label. Einfache Nachfahren-Suche behebt das.
    var classicLabel = qs('label', formGroup);
    if (classicLabel) {
        classicLabel.classList.add('mp-edit-label-with-ai', 'mp-edit-label-with-ai-classic');
        classicLabel.appendChild(btn);
    } else {
        input.parentNode.insertBefore(btn, input.nextSibling);
    }
    var statusEl = buildStatusEl();
    input.parentNode.insertBefore(statusEl, input.nextSibling);

    btn.addEventListener('click', function (e) {
        e.preventDefault();
        setStatus(statusEl, '', false);
        setBusy(btn, true);
        generateAiAltFor(filename).then(function (res) {
            setBusy(btn, false);
            var texts = res.texts || {};
            var firstKey = Object.keys(texts)[0];
            if (undefined === firstKey) {
                setStatus(statusEl, t('mediaplace_ai_alt_error_generic'), true);
                return;
            }
            input.value = texts[firstKey];
            dispatchNativeInput(input);
        }).catch(function (err) {
            setBusy(btn, false);
            setStatus(statusEl, err.message || t('mediaplace_ai_alt_error_network'), true);
        });
    });
}

// ---- Kategorieuebergreifende Massengenerierung (Zahnrad-Menue) ----

export function openBulkPanel() {
    var overlayEl = document.createElement('div');
    overlayEl.className = 'mp-cat-move-modal-overlay';
    overlayEl.innerHTML =
        '<div class="mp-cat-move-modal mp-bulk-progress-modal mp-ai-alt-bulk-modal">' +
        '<h5 class="mp-cat-move-modal-title"><i class="fa-solid fa-wand-magic-sparkles"></i> ' + escAttr(t('mediaplace_ai_alt_bulk_title')) + '</h5>' +
        '<p class="mp-cat-move-modal-info mp-bulk-progress-text"></p>' +
        '<p class="mp-cat-move-modal-info mp-ai-alt-bulk-svg-note" style="display:none"></p>' +
        '<div class="mp-bulk-progress-track"><div class="mp-bulk-progress-fill" style="width:0%"></div></div>' +
        '<div class="mp-ai-alt-review-list" style="display:none"></div>' +
        '<div class="mp-bulk-progress-errors" style="display:none"></div>' +
        '<div class="mp-cat-move-modal-actions">' +
        '<button type="button" class="mp-cat-move-modal-ok mp-ai-alt-bulk-start btn btn-primary btn-sm">' + escAttr(t('mediaplace_ai_alt_bulk_start')) + '</button>' +
        '<button type="button" class="mp-cat-move-modal-ok mp-ai-alt-bulk-continue btn btn-primary btn-sm" style="display:none">' + escAttr(t('mediaplace_ai_alt_bulk_continue')) + '</button>' +
        '<button type="button" class="mp-cat-move-modal-ok mp-ai-alt-bulk-apply btn btn-primary btn-sm" style="display:none">' + escAttr(t('mediaplace_ai_alt_bulk_apply')) + '</button>' +
        '<button type="button" class="mp-cat-move-modal-cancel mp-ai-alt-bulk-close">' + escAttr(t('mediaplace_close')) + '</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlayEl);

    var textEl = qs('.mp-bulk-progress-text', overlayEl);
    var svgNoteEl = qs('.mp-ai-alt-bulk-svg-note', overlayEl);
    var trackEl = qs('.mp-bulk-progress-track', overlayEl);
    var fillEl = qs('.mp-bulk-progress-fill', overlayEl);
    var listEl = qs('.mp-ai-alt-review-list', overlayEl);
    var errorsEl = qs('.mp-bulk-progress-errors', overlayEl);
    var startBtn = qs('.mp-ai-alt-bulk-start', overlayEl);
    var continueBtn = qs('.mp-ai-alt-bulk-continue', overlayEl);
    var applyBtn = qs('.mp-ai-alt-bulk-apply', overlayEl);
    var closeBtn = qs('.mp-ai-alt-bulk-close', overlayEl);

    // Obergrenze pro Generierungs-Lauf (nicht pro einzelnem Server-Request,
    // siehe BATCH_LIMIT_DEFAULT/-MAX in Api\AiAltBulk.php fuer den) --
    // begrenzt, wie lange ein einzelner "Alle generieren"-Klick unbeaufsichtigt
    // laeuft (jeder Eintrag ist ein echter, synchroner KI-Vision-Call, bei
    // vielen fehlenden ALT-Texten sonst potenziell viele Minuten) und wie
    // lang die Pruefliste auf einmal wird. "Weitere generieren" holt bei
    // Bedarf den naechsten Abschnitt nach, ohne bereits Generiertes zu verwerfen.
    var RUN_LIMIT = 25;

    var cancelled = false;
    var running = false;
    var clangById = {};
    var order = [];
    var rows = {};

    function close() {
        if (overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    }
    closeBtn.addEventListener('click', function () {
        if (running) cancelled = true;
        close();
    });
    overlayEl.addEventListener('click', function (e) {
        if (e.target === overlayEl && !running) close();
    });

    function addErrors(list) {
        if (!list || !list.length) return;
        errorsEl.style.display = '';
        list.forEach(function (err) {
            var block = document.createElement('div');
            block.className = 'mp-bulk-progress-error-item';
            block.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><div class="mp-bulk-progress-error-text"></div>';
            qs('.mp-bulk-progress-error-text', block).textContent = err.message || String(err);
            errorsEl.appendChild(block);
        });
    }

    function removeRow(filename) {
        var row = rows[filename];
        if (row && row.el.parentNode) row.el.parentNode.removeChild(row.el);
        delete rows[filename];
        order = order.filter(function (f) { return f !== filename; });
        if (0 === order.length) listEl.style.display = 'none';
    }

    function addReviewRow(item) {
        var row = document.createElement('div');
        row.className = 'mp-ai-alt-review-row';

        var thumbUrl = mediaThumbSrc(item.filename, 'rex_media_small', null, {}, [], ctx.getMediaBaseUrl());
        var largeUrl = mediaThumbSrc(item.filename, 'rex_media_medium', null, {}, [], ctx.getMediaBaseUrl());
        var clangIds = Object.keys(item.texts);
        var fieldsHtml = '';
        clangIds.forEach(function (clangId) {
            var clang = clangById[clangId];
            var label = clangIds.length > 1 ? '<span class="mp-ai-alt-review-clang">' + escAttr(clang ? clang.code : clangId) + '</span>' : '';
            fieldsHtml += '<div class="mp-ai-alt-review-field">' + label +
                '<textarea class="mp-ai-alt-review-input" data-clang="' + escAttr(clangId) + '" rows="2"></textarea>' +
                '</div>';
        });

        row.innerHTML =
            '<div class="mp-ai-alt-review-main">' +
            '<button type="button" class="mp-ai-alt-review-thumb-btn" title="' + escAttr(t('mediaplace_ai_alt_bulk_preview_toggle')) + '">' +
            '<img class="mp-ai-alt-review-thumb" src="' + escAttr(thumbUrl) + '" alt="" loading="lazy">' +
            '<i class="fa-solid fa-chevron-right mp-ai-alt-review-chevron"></i>' +
            '</button>' +
            '<div class="mp-ai-alt-review-body">' +
            '<strong class="mp-ai-alt-review-filename" title="' + escAttr(item.filename) + '">' + escAttr(item.filename) + '</strong>' +
            fieldsHtml +
            '</div>' +
            '<button type="button" class="mp-ai-alt-review-remove" title="' + escAttr(t('mediaplace_ai_alt_bulk_row_remove')) + '">' +
            '<i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="mp-ai-alt-review-preview" style="display:none">' +
            '<img class="mp-ai-alt-review-preview-img" alt="" loading="lazy">' +
            '</div>';

        // Werte per .value setzen statt in escAttr()-textarea-Inhalt, damit
        // Zeichen wie "</textarea>" im generierten Text nicht das Markup
        // aufbrechen koennen.
        clangIds.forEach(function (clangId) {
            var input = qs('.mp-ai-alt-review-input[data-clang="' + clangId + '"]', row);
            if (input) input.value = item.texts[clangId];
        });

        qs('.mp-ai-alt-review-remove', row).addEventListener('click', function () {
            removeRow(item.filename);
        });

        // Akkordeon: groessere Vorschau erst beim ersten Aufklappen laden
        // (nicht alle N Zeilen sofort in rex_media_medium nachladen).
        var previewEl = qs('.mp-ai-alt-review-preview', row);
        var thumbBtn = qs('.mp-ai-alt-review-thumb-btn', row);
        var previewImg = qs('.mp-ai-alt-review-preview-img', row);
        var previewLoaded = false;
        thumbBtn.addEventListener('click', function () {
            var open = 'none' === previewEl.style.display;
            if (open) {
                if (!previewLoaded) {
                    previewImg.src = largeUrl;
                    previewLoaded = true;
                }
                previewEl.style.display = '';
                thumbBtn.classList.add('mp-ai-alt-review-thumb-btn-open');
            } else {
                previewEl.style.display = 'none';
                thumbBtn.classList.remove('mp-ai-alt-review-thumb-btn-open');
            }
        });

        listEl.appendChild(row);
        listEl.style.display = '';
        rows[item.filename] = { el: row };
        order.push(item.filename);
    }

    apiAiAltBulkAction('count').then(function (res) {
        var total = parseInt(res.total, 10) || 0;
        var svgSkipped = parseInt(res.svgSkipped, 10) || 0;
        (res.clangs || []).forEach(function (clang) {
            clangById[String(clang.id)] = clang;
        });
        if (svgSkipped > 0) {
            svgNoteEl.textContent = t('mediaplace_ai_alt_bulk_svg_skipped', { count: svgSkipped });
            svgNoteEl.style.display = '';
        }
        if (0 === total) {
            textEl.textContent = t('mediaplace_ai_alt_bulk_none_missing');
            startBtn.style.display = 'none';
            return;
        }
        textEl.textContent = t('mediaplace_ai_alt_bulk_ready', { count: total });
    }).catch(function (err) {
        textEl.textContent = err.message;
    });

    // excludeList lebt ausserhalb von startGenerationRun(), damit "Weitere
    // generieren" (continueBtn) nahtlos an der vorherigen Ausschlussliste
    // weitermacht statt bereits gesehene Dateien erneut anzufragen.
    var excludeList = [];

    function finishGenerationRun(remaining) {
        running = false;
        trackEl.style.display = 'none';
        startBtn.style.display = 'none';
        continueBtn.disabled = false;
        applyBtn.disabled = false;

        if (order.length > 0) applyBtn.style.display = '';

        if (remaining > 0) {
            continueBtn.style.display = '';
            textEl.textContent = order.length > 0
                ? t('mediaplace_ai_alt_bulk_review_ready_more', { count: order.length, remaining: remaining })
                : t('mediaplace_ai_alt_bulk_run_limit_none', { remaining: remaining });
        } else {
            continueBtn.style.display = 'none';
            textEl.textContent = order.length > 0
                ? t('mediaplace_ai_alt_bulk_review_ready', { count: order.length })
                : t('mediaplace_ai_alt_bulk_none_generated');
        }
    }

    function runGenerationStep() {
        if (cancelled) return;
        apiAiAltBulkAction('generate_batch', { limit: 10, exclude: excludeList }).then(function (res) {
            (res.items || []).forEach(function (item) {
                addReviewRow(item);
                excludeList.push(item.filename);
            });
            (res.errors || []).forEach(function (err) {
                if (err && err.filename) excludeList.push(err.filename);
            });
            addErrors(res.errors);

            var remaining = parseInt(res.remaining, 10) || 0;
            var processed = parseInt(res.processed, 10) || 0;
            var totalEstimate = excludeList.length + remaining;
            var pct = totalEstimate > 0 ? Math.min(100, Math.round((excludeList.length / totalEstimate) * 100)) : 100;
            fillEl.style.width = pct + '%';
            textEl.textContent = t('mediaplace_ai_alt_bulk_progress', { done: order.length, remaining: remaining });

            var reachedRunLimit = excludeList.length >= RUN_LIMIT;
            if (remaining > 0 && processed > 0 && !cancelled && !reachedRunLimit) {
                runGenerationStep();
                return;
            }

            finishGenerationRun(remaining);
        }).catch(function (err) {
            running = false;
            trackEl.style.display = 'none';
            applyBtn.disabled = false;
            if (order.length > 0) applyBtn.style.display = '';
            // Wieder anzeigen statt endgueltig ausgeblendet zu lassen --
            // Netzwerkfehler soll den Lauf unterbrechen, nicht beenden.
            if (0 === order.length) {
                startBtn.style.display = '';
            } else {
                continueBtn.style.display = '';
            }
            addErrors([{ message: err.message }]);
            textEl.textContent = t('mediaplace_ai_alt_bulk_error');
        });
    }

    function startGenerationRun() {
        running = true;
        startBtn.style.display = 'none';
        continueBtn.style.display = 'none';
        applyBtn.disabled = true;
        trackEl.style.display = '';
        runGenerationStep();
    }

    startBtn.addEventListener('click', startGenerationRun);
    continueBtn.addEventListener('click', startGenerationRun);

    applyBtn.addEventListener('click', function () {
        applyBtn.disabled = true;
        closeBtn.disabled = true;
        continueBtn.disabled = true;

        var items = order.map(function (filename) {
            var row = rows[filename].el;
            var texts = {};
            qsa('.mp-ai-alt-review-input', row).forEach(function (input) {
                var value = input.value.trim();
                if (value) texts[input.getAttribute('data-clang')] = value;
            });
            return { filename: filename, texts: texts };
        });

        apiAiAltBulkAction('apply', { items: items }).then(function (res) {
            var succeeded = parseInt(res.succeeded, 10) || 0;
            var failed = (res.errors || []).length;
            (res.errors || []).forEach(function (err) {
                if (err && err.filename && rows[err.filename]) {
                    rows[err.filename].el.classList.add('mp-ai-alt-review-row-failed');
                }
            });
            order.slice().forEach(function (filename) {
                var hasError = (res.errors || []).some(function (err) { return err.filename === filename; });
                if (!hasError) removeRow(filename);
            });
            addErrors(res.errors);

            applyBtn.disabled = false;
            closeBtn.disabled = false;
            continueBtn.disabled = false;
            if (0 === order.length) {
                applyBtn.style.display = 'none';
                textEl.textContent = t('mediaplace_ai_alt_bulk_apply_done', { succeeded: succeeded });
            } else {
                textEl.textContent = t('mediaplace_ai_alt_bulk_apply_partial', { succeeded: succeeded, failed: failed });
            }
        }).catch(function (err) {
            applyBtn.disabled = false;
            closeBtn.disabled = false;
            continueBtn.disabled = false;
            addErrors([{ message: err.message }]);
            textEl.textContent = t('mediaplace_ai_alt_bulk_apply_error');
        });
    });
}
