/**
 * Dateien umbenennen (Recht mediaplace[rename_files], siehe lib/MediaRename.php).
 *
 * Die Datei heisst nach dem Start sofort anders; die Verweise in der Datenbank ersetzt ein Job im
 * Hintergrund. Der Dialog zeigt den Fortschritt, darf aber jederzeit geschlossen werden. Solange
 * Jobs offen sind, setzt jede Backend-Seite sie ueber func=tick fort (startBackgroundTicker()).
 *
 * ctx-Vertrag:
 * - mediaForceCacheTokens: Objekt-Referenz (wird in-place mutiert)
 * - getCurrentCat(): aktuelle Kategorie
 * - loadFiles()/showDetail(): nach dem Umbenennen neu laden
 */

var ctx = null;

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;

export function initRename(theCtx) {
    ctx = theCtx;
}

function apiUrl(params) {
    var root = document.getElementById('mp-root');
    var url = (root && root.dataset.renameUrl) || 'index.php?rex-api-call=mediaplace_rename';
    var query = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return url + (url.indexOf('?') === -1 ? '?' : '&') + query;
}

function request(params, post) {
    var options = {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
    };
    if (post) {
        var root = document.getElementById('mp-root');
        var body = new FormData();
        Object.keys(post).forEach(function (k) { body.append(k, post[k]); });
        body.append('_csrf_token', (root && root.dataset.renameToken) || '');
        options.method = 'POST';
        options.body = body;
    }
    return fetch(apiUrl(params), options).then(function (r) {
        return r.json().then(function (json) {
            if (!r.ok || json.error) throw new Error(json.error || 'HTTP ' + r.status);
            return json;
        });
    });
}

function splitName(filename) {
    var dot = filename.lastIndexOf('.');
    return dot > 0 ? { base: filename.slice(0, dot), ext: filename.slice(dot) } : { base: filename, ext: '' };
}

export function openRenameDialog(filename) {
    var parts = splitName(filename);
    var overlay = document.createElement('div');
    overlay.className = 'mp-cat-move-modal-overlay';
    overlay.innerHTML =
        '<div class="mp-cat-move-modal mp-rename-modal">' +
        '<h5 class="mp-cat-move-modal-title"><i class="fa-solid fa-i-cursor"></i> ' + t('mediaplace_rename_title') + '</h5>' +
        '<div class="mp-rename-form">' +
        '<p class="mp-cat-move-modal-info">' + t('mediaplace_rename_intro') + '</p>' +
        '<label class="mp-rename-label">' + t('mediaplace_rename_label') + '</label>' +
        '<div class="mp-rename-field"><input type="text" class="mp-cat-move-modal-input" value="' + escAttr(parts.base) + '" spellcheck="false" autocomplete="off">' +
        '<span class="mp-rename-ext">' + escAttr(parts.ext) + '</span></div>' +
        '<p class="mp-rename-preview"></p>' +
        '<p class="mp-cat-move-modal-error" style="display:none"></p>' +
        '<p class="mp-rename-hint">' + t('mediaplace_rename_external_hint') + '</p>' +
        '</div>' +
        '<div class="mp-rename-status" style="display:none"></div>' +
        '<div class="mp-cat-move-modal-actions">' +
        '<button class="mp-cat-move-modal-ok btn btn-primary btn-sm" disabled>' + t('mediaplace_rename_start') + '</button>' +
        '<button class="mp-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
        '</div></div>';
    document.body.appendChild(overlay);

    var input = overlay.querySelector('.mp-cat-move-modal-input');
    var preview = overlay.querySelector('.mp-rename-preview');
    var errorEl = overlay.querySelector('.mp-cat-move-modal-error');
    var okBtn = overlay.querySelector('.mp-cat-move-modal-ok');
    var cancelBtn = overlay.querySelector('.mp-cat-move-modal-cancel');
    var target = '';
    var checkTimer = null;
    var checkRun = 0;
    var polling = false;

    setTimeout(function () { input.focus(); input.select(); }, 0);

    function close() {
        polling = false;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
    }

    function showError(msg) {
        errorEl.textContent = msg || '';
        errorEl.style.display = msg ? '' : 'none';
    }

    // Live-Pruefung: zeigt den endgueltigen (normalisierten) Namen und ob er frei ist
    function check() {
        var run = ++checkRun;
        okBtn.disabled = true;
        request({ func: 'check', file: filename, name: input.value })
            .then(function (res) {
                if (run !== checkRun) return;
                target = res.target || '';
                preview.innerHTML = target ? t('mediaplace_rename_preview', { name: '<strong>' + escAttr(target) + '</strong>' }) : '';
                showError(res.error);
                okBtn.disabled = !!res.error || !target;
            })
            .catch(function (err) {
                if (run === checkRun) showError(err.message);
            });
    }

    function scheduleCheck() {
        clearTimeout(checkTimer);
        checkTimer = setTimeout(check, 250);
    }

    function renderStatus(job) {
        var box = overlay.querySelector('.mp-rename-status');
        var html;
        if ('done' === job.status) {
            html = '<p class="mp-rename-done"><i class="fa-solid fa-check"></i> ' + t('mediaplace_rename_done', {
                old: escAttr(job.old_filename), name: escAttr(job.new_filename), replaced: job.replaced
            }) + '</p>';
        } else if ('failed' === job.status) {
            html = '<p class="mp-cat-move-modal-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_rename_failed', { msg: escAttr(job.error) }) + '</p>' +
                '<p><button type="button" class="btn btn-default btn-sm mp-rename-retry">' + t('mediaplace_rename_retry') + '</button></p>';
        } else {
            var pct = job.tables_total ? Math.round(job.tables_done / job.tables_total * 100) : 0;
            html = '<p><i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_rename_running', { name: escAttr(job.new_filename) }) + '</p>' +
                '<div class="mp-bulk-progress-track"><div class="mp-bulk-progress-fill" style="width:' + pct + '%"></div></div>' +
                '<p class="mp-rename-progress">' + t('mediaplace_rename_progress', { done: job.tables_done, total: job.tables_total, replaced: job.replaced }) + '</p>' +
                '<p class="mp-rename-hint">' + t('mediaplace_rename_background') + '</p>';
        }
        box.innerHTML = html;
        var retry = box.querySelector('.mp-rename-retry');
        if (retry) {
            retry.addEventListener('click', function () {
                retry.disabled = true;
                request({ func: 'retry', id: job.id }, {}).then(function (res) { renderStatus(res); poll(job.id); })
                    .catch(function (err) { retry.disabled = false; showError(err.message); });
            });
        }
    }

    function poll(id) {
        polling = true;
        (function next() {
            if (!polling) return;
            request({ func: 'status', id: id })
                .then(function (job) {
                    if (!polling) return;
                    renderStatus(job);
                    if ('running' === job.status) setTimeout(next, 1000);
                    else polling = false;
                })
                .catch(function () { if (polling) setTimeout(next, 3000); });
        })();
    }

    function submit() {
        if (okBtn.disabled || !target) return;
        okBtn.disabled = true;
        okBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        showError('');
        request({ func: 'start' }, { file: filename, name: input.value })
            .then(function (job) {
                overlay.querySelector('.mp-rename-form').style.display = 'none';
                overlay.querySelector('.mp-rename-status').style.display = '';
                okBtn.style.display = 'none';
                cancelBtn.textContent = t('mediaplace_close');
                renderStatus(job);
                // Die Datei heisst ab jetzt anders: Raster und Detail sofort umstellen
                ctx.mediaForceCacheTokens[job.new_filename] = Date.now();
                ctx.loadFiles(ctx.getCurrentCat(), true);
                ctx.showDetail(job.new_filename);
                if ('running' === job.status) poll(job.id);
            })
            .catch(function (err) {
                okBtn.disabled = false;
                okBtn.innerHTML = t('mediaplace_rename_start');
                showError(err.message);
            });
    }

    function onKey(e) {
        if (e.key === 'Escape') close();
    }

    input.addEventListener('input', scheduleCheck);
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    });
    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
    check();
}

/**
 * Offene Umbenennungen still weiterbearbeiten, solange diese Backend-Seite offen ist
 * (der Server meldet per data-rename-pending, ob etwas offen ist).
 */
export function startBackgroundTicker() {
    var root = document.getElementById('mp-root');
    if (!root || root.dataset.renamePending !== '1') return;
    (function tick() {
        request({ func: 'tick' })
            .then(function (res) { if (res.pending) setTimeout(tick, 2000); })
            .catch(function () { /* naechster Seitenaufruf versucht es erneut */ });
    })();
}
