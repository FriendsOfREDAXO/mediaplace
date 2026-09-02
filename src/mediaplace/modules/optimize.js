/**
 * Video optimieren (ffmpeg-Addon-Integration, siehe FfmpegIntegration.php) +
 * Bild optimieren (siehe ImageOptimizer.php) + Video-Detailanzeige
 * (ffprobe-Daten via ffmpeg-Addon). Sechste Extraktion aus core.js (siehe
 * DEV.md/Modularisierungs-Plan), nach dem gleichen Muster wie
 * modules/providers.js/modals.js/lightbox.js/focuspoint.js/cropper.js.
 *
 * Anders als Fokuspunkt/Crop kein eigener Canvas: der Optimieren-Job laeuft
 * im Hintergrund (Video: ffmpeg-Job-Engine mit Polling; Bild: synchron per
 * GD), das Detail-Panel bleibt normal sichtbar/bedienbar. Die Buttons leben
 * im geteilten Detail-Panel-Klick-Listener von core.js (kein eigener,
 * abgegrenzter Container wie bei Fokuspunkt/Crop) -- initOptimize() speichert
 * daher nur den ctx, registriert keine eigenen Listener.
 *
 * Bleibt vorerst Teil des Haupt-Bundles (statischer Import) -- Bild-
 * Optimieren ist ohnehin eine mediaplace-eigene Funktion (kein Fremd-Addon),
 * nur der Video-Teil haengt am optionalen ffmpeg-Addon. Eine addon-bedingte
 * Auslagerung wuerde die beiden trennen muessen; siehe DEV.md fuer den Stand
 * der Modularisierung.
 */

var optimizeVideoJobId = null;
var optimizeVideoPoll = null;

var ctx = null;

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;
var apiStartOptimizeVideo = MPCore.api.apiStartOptimizeVideo;
var apiPollOptimizeVideo = MPCore.api.apiPollOptimizeVideo;
var apiOptimizeImage = MPCore.api.apiOptimizeImage;
var apiLoadVideoDetails = MPCore.api.apiLoadVideoDetails;

/**
 * ctx-Vertrag:
 * - mediaForceCacheTokens: Objekt-Referenz (wird in-place mutiert)
 * - getCurrentCat()/getSelectedFile(): Zugriff auf noch-legacy-State
 * - loadFiles()/showDetail(): noch-legacy-Funktionen (nach Erfolg)
 */
export function initOptimize(theCtx) {
    ctx = theCtx;
}

// Kein eigener Canvas wie bei Crop/Metainfo -- der Job laeuft im
// Hintergrund (ffmpeg's eigene Job-Engine), das Detail-Panel bleibt
// waehrenddessen normal sichtbar/bedienbar, nur der Button + eine kleine
// Statuszeile darunter zeigen den Fortschritt.
export function startOptimizeVideo(filename, btn) {
    var statusEl = btn ? btn.parentNode.querySelector('.mp-video-optimize-status') : null;
    var setStatus = function (html) {
        if (!statusEl) return;
        statusEl.style.display = '';
        statusEl.innerHTML = html;
    };

    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-loading');
    }
    setStatus('<i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_optimize_video_starting'));

    apiStartOptimizeVideo(filename)
        .then(function (data) {
            if ('busy' === data.status) {
                setStatus('<i class="fa-solid fa-triangle-exclamation"></i> ' + (data.message || t('mediaplace_optimize_video_busy')));
                if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
                return;
            }
            if (!data.job) {
                throw new Error(data.error || 'no job id');
            }
            optimizeVideoJobId = data.job;
            pollOptimizeVideo(filename, data.job, btn, statusEl);
        })
        .catch(function (err) {
            setStatus('<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error_optimizing_video', { msg: err.message }));
            if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
        });
}

export function pollOptimizeVideo(filename, jobId, btn, statusEl) {
    if (optimizeVideoPoll) clearInterval(optimizeVideoPoll);

    var setStatus = function (html) {
        if (!statusEl) return;
        statusEl.style.display = '';
        statusEl.innerHTML = html;
    };

    var tick = function () {
        apiPollOptimizeVideo(jobId)
            .then(function (data) {
                if ('done' === data.status) {
                    clearInterval(optimizeVideoPoll);
                    optimizeVideoPoll = null;
                    optimizeVideoJobId = null;
                    setStatus('<i class="fa-solid fa-check"></i> ' + t('mediaplace_optimize_video_done'));
                    ctx.mediaForceCacheTokens[filename] = Date.now();
                    ctx.loadFiles(ctx.getCurrentCat(), true);
                    if (ctx.getSelectedFile() === filename) ctx.showDetail(filename);
                    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
                    return;
                }
                if ('error' === data.status) {
                    clearInterval(optimizeVideoPoll);
                    optimizeVideoPoll = null;
                    optimizeVideoJobId = null;
                    setStatus('<i class="fa-solid fa-triangle-exclamation"></i> ' + (data.message || t('mediaplace_optimize_video_failed')));
                    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
                    return;
                }
                var progress = 'finalizing' === data.status ? 99 : (parseInt(data.progress, 10) || 0);
                setStatus('<i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_optimize_video_progress', { percent: progress }));
            })
            .catch(function (err) {
                clearInterval(optimizeVideoPoll);
                optimizeVideoPoll = null;
                optimizeVideoJobId = null;
                setStatus('<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error_optimizing_video', { msg: err.message }));
                if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
            });
    };

    tick();
    optimizeVideoPoll = setInterval(tick, 1500);
}

// Anders als beim Video: kein Job/Poll-Zyklus (GD-Resize ist synchron
// schnell) und kein "bereits optimiert"-Zustand zu tracken -- der Button
// verschwindet nach Erfolg einfach von selbst, weil showDetail() das
// Detail-Panel mit frischen Daten neu rendert und optimize_image_available
// dann false ist.
export function startOptimizeImage(filename, btn) {
    var statusEl = btn ? btn.parentNode.querySelector('.mp-image-optimize-status') : null;
    var setStatus = function (html) {
        if (!statusEl) return;
        statusEl.style.display = '';
        statusEl.innerHTML = html;
    };

    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-loading');
    }
    setStatus('<i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_optimize_image_running'));

    apiOptimizeImage(filename)
        .then(function () {
            setStatus('<i class="fa-solid fa-check"></i> ' + t('mediaplace_optimize_image_done'));
            ctx.mediaForceCacheTokens[filename] = Date.now();
            ctx.loadFiles(ctx.getCurrentCat(), true);
            if (ctx.getSelectedFile() === filename) ctx.showDetail(filename);
        })
        .catch(function (err) {
            setStatus('<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error_optimizing_image', { msg: err.message }));
            if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
        });
}

// "Technische Details" (ffprobe-Daten via ffmpeg-Addon, siehe
// FfmpegIntegration::getVideoDetails()) -- lazy nachgeladen erst beim
// ersten Aufklappen, danach nur noch lokal ein-/ausgeblendet.
export function toggleVideoDetails(btn) {
    var body = btn.parentNode.querySelector('.mp-video-details-body');
    if (!body) return;
    var expanded = btn.getAttribute('aria-expanded') === 'true';

    if (expanded) {
        btn.setAttribute('aria-expanded', 'false');
        btn.querySelector('i').className = 'fa-solid fa-chevron-right';
        body.style.display = 'none';
        return;
    }

    btn.setAttribute('aria-expanded', 'true');
    btn.querySelector('i').className = 'fa-solid fa-chevron-down';
    body.style.display = '';

    if (body.dataset.loaded === '1') return;

    var filename = btn.getAttribute('data-video-details-file') || '';
    body.innerHTML = '<div class="mp-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_loading_more') + '</div>';

    apiLoadVideoDetails(filename)
        .then(function (details) {
            body.dataset.loaded = '1';
            body.innerHTML = renderVideoDetailsTable(details);
        })
        .catch(function (err) {
            body.innerHTML = '<div class="mp-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
        });
}

function renderVideoDetailsTable(d) {
    var rows = [
        ['mediaplace_video_details_duration', d.duration],
        ['mediaplace_video_details_dimensions', d.width && d.height ? (d.width + ' × ' + d.height + ' px') : ''],
        ['mediaplace_video_details_aspect_ratio', d.aspect_ratio],
        ['mediaplace_video_details_framerate', d.framerate ? (d.framerate + ' fps') : ''],
        ['mediaplace_video_details_format', d.format],
        ['mediaplace_video_details_bitrate', d.bitrate],
        ['mediaplace_video_details_video_codec', d.video_profile ? (d.video_codec + ' (' + d.video_profile + ')') : d.video_codec],
        ['mediaplace_video_details_audio_codec', d.audio_codec],
        ['mediaplace_video_details_audio_samplerate', d.audio_samplerate ? (d.audio_samplerate + ' Hz') : ''],
        ['mediaplace_video_details_audio_channels', d.audio_channels || '']
    ];
    var html = '<table class="mp-detail-table">';
    rows.forEach(function (row) {
        if (!row[1]) return;
        html += '<tr><td>' + escAttr(t(row[0])) + '</td><td>' + escAttr(String(row[1])) + '</td></tr>';
    });
    html += '</table>';
    return html;
}
