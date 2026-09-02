/**
 * Generische Modal-Dialoge -- Ersatz fuer confirm()/prompt()/alert(), damit
 * im Overlay keine System-Dialoge auftauchen. Zweite Extraktion aus
 * core.js (siehe DEV.md/Modularisierungs-Plan), nach dem gleichen Muster
 * wie modules/providers.js.
 *
 * showRenameCategoryModal()/showMoveCategoryModal() nutzen dasselbe
 * ".mp-cat-move-modal-overlay"-Markup, leben aber in modules/categories.js
 * (eng an Kategorie-State gekoppelt) statt hier.
 *
 * showAlertModal() ersetzt reine Info-/Fehler-alert()-Aufrufe (z.B. nach
 * Sammlung anlegen/umbenennen/loeschen) -- gleiches Markup wie
 * showConfirmModal(), nur ohne Abbrechen-Button, da es dort keine echte
 * Entscheidung gibt.
 */

var ctx = null;

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;
var buildCategoryOptionsHtml = MPCore.helpers.buildCategoryOptionsHtml;
var apiFetchAllCategoriesFlat = MPCore.api.apiFetchAllCategoriesFlat;

/**
 * ctx-Vertrag: { overlay } -- nur showCategoryPickerModal() braucht das
 * Overlay-Root (dessen CSS ist "#mp-overlay .mp-catpick-modal"-gescoped,
 * anders als die uebrigen Modals hier, die direkt an document.body haengen).
 */
export function initModals(theCtx) {
    ctx = theCtx;
}

/**
 * Generischer Bestaetigungs-Dialog -- Ersatz fuer confirm(), gleiches
 * visuelles Muster wie showRenameCategoryModal()/showMoveCategoryModal()
 * (kein System-Dialog im Overlay). opts:
 * - icon, title, confirmLabel: Beschriftung (HTML-escaped)
 * - message: HTML-String fuer den Hinweistext (Aufrufer escaped selbst
 *   interpolierte Werte, z.B. Dateinamen, per escAttr())
 * - dangerous: true faerbt den Bestaetigen-Button rot (btn-danger)
 * - onConfirm(ctx): nur bei Klick auf "Bestaetigen" aufgerufen. ctx bietet
 *   ctx.close() (Dialog schliessen), ctx.setBusy(bool) (Spinner/Sperre
 *   waehrend eines async Aufrufs) und ctx.showError(msg) (Fehlertext im
 *   Dialog anzeigen, bleibt offen) -- der Aufrufer schliesst selbst erst
 *   nach Erfolg, damit bei einem Fehler der Dialog offen bleiben kann.
 */
export function showConfirmModal(opts) {
    var overlay = document.createElement('div');
    overlay.className = 'mp-cat-move-modal-overlay';
    overlay.innerHTML =
        '<div class="mp-cat-move-modal">' +
        '<h5 class="mp-cat-move-modal-title">' +
        '<i class="fa-solid ' + escAttr(opts.icon || 'fa-triangle-exclamation') + '"></i> ' + escAttr(opts.title || t('mediaplace_confirm')) + '</h5>' +
        '<p class="mp-cat-move-modal-info">' + opts.message + '</p>' +
        '<p class="mp-cat-move-modal-error" style="display:none"></p>' +
        '<div class="mp-cat-move-modal-actions">' +
        '<button class="mp-cat-move-modal-ok btn ' + (opts.dangerous ? 'btn-danger' : 'btn-primary') + ' btn-sm">' + escAttr(opts.confirmLabel || t('mediaplace_ok')) + '</button>' +
        '<button class="mp-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var errorEl = overlay.querySelector('.mp-cat-move-modal-error');
    var okBtn = overlay.querySelector('.mp-cat-move-modal-ok');
    var okLabel = escAttr(opts.confirmLabel || t('mediaplace_ok'));

    function onKeydown(e) {
        if (e.key === 'Escape') close();
    }

    function close() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKeydown);
    }

    document.addEventListener('keydown', onKeydown);
    overlay.querySelector('.mp-cat-move-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    okBtn.addEventListener('click', function () {
        if (typeof opts.onConfirm !== 'function') { close(); return; }
        opts.onConfirm({
            close: close,
            setBusy: function (busy) {
                okBtn.disabled = busy;
                okBtn.innerHTML = busy ? '<i class="fa-solid fa-spinner fa-spin"></i>' : okLabel;
                if (busy) { errorEl.style.display = 'none'; }
            },
            showError: function (msg) {
                errorEl.textContent = msg;
                errorEl.style.display = '';
            }
        });
    });
}

/**
 * Reiner Hinweis-/Fehler-Dialog -- Ersatz fuer alert(), gleiches Markup wie
 * showConfirmModal(), aber nur ein Button (kein Abbrechen, da es hier keine
 * echte Entscheidung gibt). opts: { icon, title, message (HTML-String,
 * Aufrufer escaped selbst interpolierte Werte), confirmLabel, dangerous
 * (rot statt blau) }. Gibt ein Promise zurueck, das beim Schliessen aufloest
 * (Klick auf OK/Backdrop, Escape oder Enter) -- fuer den ueberwiegenden Teil
 * der Aufrufer als reines "warten bis der Nutzer es gesehen hat" nuetzlich,
 * kann aber auch einfach ignoriert werden.
 */
export function showAlertModal(opts) {
    return new Promise(function (resolve) {
        var overlay = document.createElement('div');
        overlay.className = 'mp-cat-move-modal-overlay';
        overlay.innerHTML =
            '<div class="mp-cat-move-modal">' +
            '<h5 class="mp-cat-move-modal-title">' +
            '<i class="fa-solid ' + escAttr(opts.icon || 'fa-circle-info') + '"></i> ' + escAttr(opts.title || t('mediaplace_notice')) + '</h5>' +
            '<p class="mp-cat-move-modal-info">' + opts.message + '</p>' +
            '<div class="mp-cat-move-modal-actions">' +
            '<button class="mp-cat-move-modal-ok btn ' + (opts.dangerous ? 'btn-danger' : 'btn-primary') + ' btn-sm">' + escAttr(opts.confirmLabel || t('mediaplace_ok')) + '</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var okBtn = overlay.querySelector('.mp-cat-move-modal-ok');

        function onKeydown(e) {
            if (e.key === 'Escape' || e.key === 'Enter') close();
        }

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', onKeydown);
            resolve();
        }

        document.addEventListener('keydown', onKeydown);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        okBtn.addEventListener('click', close);
        setTimeout(function () { okBtn.focus(); }, 0);
    });
}

// Ersatz fuer window.prompt() (gleiche Optik/gleiches Markup wie die
// Kategorie-Modals): resolved mit dem getrimmten Eingabewert bei Klick auf
// OK/Enter, mit null bei Abbrechen/Escape/Klick auf Overlay -- exakt die
// gleiche Cancel-Semantik wie prompt() selbst.
export function showPromptModal(opts) {
    return new Promise(function (resolve) {
        // opts.datalist (optional): Liste bereits vorhandener Werte (z.B.
        // Sammlungsnamen) als natives <datalist> -- erlaubt weiterhin freien
        // Text (neuen Namen tippen), zeigt per Autocomplete/Dropdown-Pfeil
        // aber auch bestehende Werte zur Auswahl an, statt sie nur als reinen
        // Info-Text darzustellen, den man exakt selbst abtippen muesste
        // (siehe startBulkAddToCollection() in categories.js).
        var hasDatalist = Array.isArray(opts.datalist) && opts.datalist.length > 0;
        var datalistId = hasDatalist ? 'mp-prompt-modal-datalist-' + Math.random().toString(36).slice(2) : '';
        var overlay = document.createElement('div');
        overlay.className = 'mp-cat-move-modal-overlay';
        overlay.innerHTML =
            '<div class="mp-cat-move-modal">' +
            '<h5 class="mp-cat-move-modal-title"><i class="fa-solid ' + escAttr(opts.icon || 'fa-pen') + '"></i> ' + opts.title + '</h5>' +
            (opts.label ? '<p class="mp-cat-move-modal-info">' + opts.label + '</p>' : '') +
            '<input type="text" class="mp-cat-move-modal-input" value="' + escAttr(opts.value || '') + '"' + (hasDatalist ? ' list="' + datalistId + '"' : '') + '>' +
            (hasDatalist ? '<datalist id="' + datalistId + '">' + opts.datalist.map(function (v) { return '<option value="' + escAttr(v) + '">'; }).join('') + '</datalist>' : '') +
            '<div class="mp-cat-move-modal-actions">' +
            '<button class="mp-cat-move-modal-ok btn btn-primary btn-sm">' + escAttr(opts.confirmLabel || t('mediaplace_ok')) + '</button>' +
            '<button class="mp-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var input = overlay.querySelector('.mp-cat-move-modal-input');
        var okBtn = overlay.querySelector('.mp-cat-move-modal-ok');
        setTimeout(function () { input.focus(); input.select(); }, 0);

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        function submit() {
            var value = input.value.trim();
            close();
            resolve(value);
        }

        function cancel() {
            close();
            resolve(null);
        }

        overlay.querySelector('.mp-cat-move-modal-cancel').addEventListener('click', cancel);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) cancel();
        });
        okBtn.addEventListener('click', submit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });
    });
}

/**
 * Wiederverwendbarer Kategorie-Auswahl-Dialog (.mp-catpick-*) --
 * gemeinsame Basis fuer showCollectionUploadCategoryPicker() (core.js) und
 * promptProviderImport() (modules/providers.js) statt Modal-Markup pro
 * Aufrufer neu zu schreiben. options: {icon, title, hint (fertiges HTML),
 * confirmLabel, selectedId (optional, vorbelegte Kategorie), onConfirm(catId)}.
 */
export function showCategoryPickerModal(options) {
    var modal = document.createElement('div');
    modal.className = 'mp-catpick-modal';
    modal.innerHTML =
        '<div class="mp-catpick-box">' +
        '<div class="mp-catpick-title"><i class="' + escAttr(options.icon) + '"></i> ' + options.title + '</div>' +
        '<p class="mp-catpick-info">' + options.hint + '</p>' +
        '<select class="mp-catpick-select"><option value="0">' + t('mediaplace_root_no_category') + '</option></select>' +
        '<div class="mp-catpick-actions">' +
        '<button type="button" class="mp-catpick-cancel">' + t('mediaplace_cancel') + '</button>' +
        '<button type="button" class="mp-catpick-confirm">' + options.confirmLabel + '</button>' +
        '</div>' +
        '</div>';

    ctx.overlay.appendChild(modal);

    var select = modal.querySelector('.mp-catpick-select');
    // Flache, tiefensortierte Liste vom Server (dieselbe Route, die auch
    // den Sidebar-Baum liefert) statt verschachteltem catCache -- dessen
    // Kind-Struktur gibt es seit dem serverseitig gerenderten Baum nicht
    // mehr (siehe loadCategories()).
    apiFetchAllCategoriesFlat().then(function (cats) {
        select.innerHTML = '<option value="0">' + t('mediaplace_root_no_category') + '</option>' + buildCategoryOptionsHtml(cats, options.selectedId);
    }).catch(function () {
        // Bleibt bei der Stamm-Option, falls die Liste nicht geladen werden kann.
    });

    modal.querySelector('.mp-catpick-cancel').addEventListener('click', function () {
        modal.remove();
    });

    modal.querySelector('.mp-catpick-confirm').addEventListener('click', function () {
        var catId = parseInt(select.value || '0', 10);
        modal.remove();
        options.onConfirm(catId);
    });
}
