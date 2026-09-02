/**
 * Kleine, wiederverwendbare Toast-Benachrichtigung (Erfolg/Fehler) --
 * bewusst eigenes Mini-Modul statt ctx-Bridge (siehe DEV.md-Modularisierungs-
 * Philosophie): braucht ausser der overlay-DOM-Referenz keinen weiteren
 * State, wird direkt von core.js UND modules/upload.js UND
 * modules/providers.js importiert (kein Zirkelbezug-Risiko, da toast.js
 * selbst nichts zurueck importiert).
 */

var overlay = null;

export function initToast(overlayEl) {
    overlay = overlayEl;
}

var DISMISS_MS = 4000;

/**
 * type: 'success' (Default) | 'error'. message: Klartext, kein HTML (wird
 * per textContent gesetzt).
 */
export function showToast(message, type) {
    if (!overlay || !message) return;

    var container = overlay.querySelector('#mp-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mp-toast-container';
        overlay.appendChild(container);
    }

    var isError = 'error' === type;
    var toast = document.createElement('div');
    toast.className = 'mp-toast' + (isError ? ' mp-toast-error' : ' mp-toast-success');
    toast.innerHTML = '<i class="fa-solid ' + (isError ? 'fa-triangle-exclamation' : 'fa-circle-check') + '"></i> <span class="mp-toast-text"></span>';
    toast.querySelector('.mp-toast-text').textContent = message;
    container.appendChild(toast);

    // Erzwingt einen Reflow, damit die CSS-Transition beim direkt danach
    // hinzugefuegten ".mp-toast-visible" tatsaechlich greift (sonst wuerde
    // der Browser Start- und Endzustand im selben Frame zusammenfassen,
    // keine sichtbare Einblend-Animation).
    void toast.offsetWidth;
    toast.classList.add('mp-toast-visible');

    var dismissed = false;
    function dismiss() {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(timer);
        toast.classList.remove('mp-toast-visible');
        setTimeout(function () { toast.remove(); }, 250);
    }
    var timer = setTimeout(dismiss, DISMISS_MS);
    toast.addEventListener('click', dismiss);
}
