/**
 * MediaPlace – Classic Widget Interception
 *
 * Faengt die "Oeffnen"/"Hinzufuegen"/"Ansehen"-Buttons der klassischen
 * REX_MEDIA[n]- und REX_MEDIALIST[n]-Widgets (core/mediapool) per
 * Event-Delegation ab, bevor deren inline onclick (openREXMedia, ...)
 * das alte Popup-Fenster oeffnet, und nutzt stattdessen den MP3-Overlay.
 *
 * Bewusst NICHT ueberschrieben werden die globalen Funktionen
 * (openREXMedia, openMediaPool, ...) selbst, da TinyMCE und CKEditor5
 * diese direkt aufrufen und den zurueckgegebenen Popup-Window als
 * jQuery-Eventziel (rex:selectMedia) verwenden. Das waere bei einer
 * globalen Ueberschreibung nicht mehr kompatibel.
 */
(function () {
    'use strict';

    function qs(sel, ctx) {
        return (ctx || document).querySelector(sel);
    }

    function fireChange(el) {
        if (!el) return;
        var evt;
        try { evt = new Event('change', { bubbles: true }); }
        catch (e) { evt = document.createEvent('Event'); evt.initEvent('change', true, true); }
        el.dispatchEvent(evt);
    }

    function actionFromLink(link) {
        var icon = qs('i', link);
        if (!icon) return null;
        if (icon.classList.contains('rex-icon-open-mediapool')) return 'open';
        if (icon.classList.contains('rex-icon-add-media')) return 'add';
        if (icon.classList.contains('rex-icon-view-media')) return 'view';
        return null; // rex-icon-delete-media bleibt unveraendert
    }

    // ---- REX_MEDIA[n] (Einzelauswahl) ----
    function handleMediaWidget(wrapper, action) {
        var input = qs('input[id^="REX_MEDIA_"]', wrapper);
        if (!input) return;

        function setValue(filename) {
            input.value = filename;
            if (window.jQuery) {
                window.jQuery(input).trigger('change');
            } else {
                fireChange(input);
            }
        }

        if (action === 'view' && input.value) {
            MP3.openFile(input.value, setValue);
        } else {
            // 'open' und 'add' (Hochladen erfolgt im Overlay selbst ueber den Upload-Button)
            MP3.open(setValue);
        }
    }

    // ---- REX_MEDIALIST[n] (Mehrfachauswahl) ----
    function handleMedialistWidget(wrapper, action) {
        var select = qs('select[id^="REX_MEDIALIST_SELECT_"]', wrapper);
        if (!select) return;
        var listId = select.id.slice('REX_MEDIALIST_SELECT_'.length);

        function addFilenames(filenames) {
            filenames.forEach(function (filename) {
                var exists = Array.prototype.some.call(select.options, function (o) { return o.value === filename; });
                if (!exists) select.add(new Option(filename, filename));
            });
            if (typeof window.writeREXMedialist === 'function') {
                window.writeREXMedialist(listId);
            }
        }

        if (action === 'view') {
            var selected = null;
            for (var i = 0; i < select.options.length; i++) {
                if (select.options[i].selected) { selected = select.options[i]; break; }
            }
            if (selected) {
                MP3.openFile(selected.value);
                return;
            }
        }

        // 'open', 'add' und 'view' ohne Auswahl: Mehrfachauswahl-Overlay
        MP3.open(addFilenames, { multiple: true });
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest('a.btn-popup');
        if (!link) return;

        // Im Metainfo-Canvas nicht abfangen, sonst oeffnet sich rekursiv unser eigener Overlay.
        if (link.closest('#mp3-metainfo-canvas')) return;

        var wrapper = link.closest('.rex-js-widget-media, .rex-js-widget-medialist');
        if (!wrapper) return;

        var action = actionFromLink(link);
        if (!action) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        if (wrapper.classList.contains('rex-js-widget-medialist')) {
            handleMedialistWidget(wrapper, action);
        } else {
            handleMediaWidget(wrapper, action);
        }
    }, true); // Capture-Phase: laeuft vor dem inline onclick des Buttons

    // Hinweis: Der "Medienpool"-Popup-Link (mediapool/package.yml: popup: openMediaPool())
    // wird nicht mehr per JS abgefangen, sondern serverseitig in boot.php via
    // PAGES_PREPARED / rex_be_page::setPopup() direkt auf "MP3.open()" umgestellt.

})();
