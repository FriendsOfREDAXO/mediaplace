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

    var container = overlay.querySelector('#mp3-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mp3-toast-container';
        overlay.appendChild(container);
    }

    var isError = 'error' === type;
    var toast = document.createElement('div');
    toast.className = 'mp3-toast' + (isError ? ' mp3-toast-error' : ' mp3-toast-success');
    toast.innerHTML = '<i class="fa-solid ' + (isError ? 'fa-triangle-exclamation' : 'fa-circle-check') + '"></i> <span class="mp3-toast-text"></span>';
    toast.querySelector('.mp3-toast-text').textContent = message;
    container.appendChild(toast);

    // Erzwingt einen Reflow, damit die CSS-Transition beim direkt danach
    // hinzugefuegten ".mp3-toast-visible" tatsaechlich greift (sonst wuerde
    // der Browser Start- und Endzustand im selben Frame zusammenfassen,
    // keine sichtbare Einblend-Animation).
    void toast.offsetWidth;
    toast.classList.add('mp3-toast-visible');

    var dismissed = false;
    function dismiss() {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(timer);
        toast.classList.remove('mp3-toast-visible');
        setTimeout(function () { toast.remove(); }, 250);
    }
    var timer = setTimeout(dismiss, DISMISS_MS);
    toast.addEventListener('click', dismiss);
}
