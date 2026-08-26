/**
 * MediaPlace -- i18n-Schicht (frontend-tauglich, keine REDAXO-Backend-JS-
 * Abhaengigkeit). Statisches Uebersetzungs-Objekt direkt im Skript, gleiches
 * Muster wie assets/filepond_widget.js im filepond_uploader-Addon: keine
 * separate JSON-Datei, kein Nachladen, keine Abhaengigkeit von irgendeinem
 * Backend-only-JS-Objekt (das im Frontend nicht existieren wuerde, sobald
 * MediaPlace dort eingesetzt wird).
 *
 * Sprachauswahl: #mp3-root liefert data-mp3-lang (PHP-seitig aus
 * rex_i18n::getLocale(), siehe boot.php), Fallback document.documentElement.lang,
 * Fallback 'de_de'. initLang() muss explizit aufgerufen werden (siehe build()
 * in mediapool3.js) -- beim Laden dieses Scripts existiert #mp3-root evtl.
 * noch nicht.
 */
(function (Core) {
    'use strict';

    Core.i18n = Core.i18n || {};

    var TRANSLATIONS = {
        de_de: {
            widget_add_single: 'Medium auswählen',
            widget_add_multiple: 'Medium hinzufügen',
            widget_clear_all: 'Alle entfernen',
            widget_view_details: 'Details ansehen',
            widget_remove: 'Entfernen',
            widget_empty_single: 'Kein Medium ausgewählt',
            widget_empty_multiple: 'Keine Medien ausgewählt'
        },
        en_gb: {
            widget_add_single: 'Select media',
            widget_add_multiple: 'Add media',
            widget_clear_all: 'Remove all',
            widget_view_details: 'View details',
            widget_remove: 'Remove',
            widget_empty_single: 'No media selected',
            widget_empty_multiple: 'No media selected'
        }
    };

    var currentLang = 'de_de';

    function initLang() {
        var root = document.getElementById('mp3-root');
        var lang = (root && root.dataset.mp3Lang) || document.documentElement.lang || 'de_de';
        currentLang = TRANSLATIONS[lang] ? lang : 'de_de';
    }

    // {name}-Platzhalter-Interpolation, analog zu fileponds {current}/{total}-Muster.
    function t(key, vars) {
        var table = TRANSLATIONS[currentLang] || TRANSLATIONS.de_de;
        var str = table[key] || TRANSLATIONS.de_de[key] || key;
        if (vars) {
            Object.keys(vars).forEach(function (k) {
                str = str.replace('{' + k + '}', vars[k]);
            });
        }
        return str;
    }

    Core.i18n.t = t;
    Core.i18n.initLang = initLang;
})(window.MP3Core = window.MP3Core || {});
