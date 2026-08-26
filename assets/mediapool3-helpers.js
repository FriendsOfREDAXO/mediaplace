/**
 * MediaPlace -- generische Utility-Funktionen (reine Funktionen, kein
 * Modul-State). Ausgelagert aus mediapool3.js (Stufe C, Teil 1), gleiches
 * Alias-Prinzip wie mediapool3-api.js. getMediaCacheToken()/
 * withMediaCacheBuster()/mediaThumbSrc() bekommen den Cache-Token-Status
 * (mediaForceCacheTokens/lastLoadedFiles) explizit als Parameter statt ihn
 * per Closure zu lesen -- Aufrufer in mediapool3.js reichen ihre lokalen
 * Variablen weiterhin wie gehabt durch.
 */
(function (Core) {
    'use strict';

    Core.helpers = Core.helpers || {};

    var DEFAULT_MEDIA_PER_PAGE = 30;
    var MEDIA_PER_PAGE_OPTIONS = [30, 50, 100, 250];
    var DEFAULT_TILE_SIZE = 220;
    var TILE_SIZE_MIN = 140;
    var TILE_SIZE_MAX = 360;

    function qs(sel, ctx) {
        return (ctx || document).querySelector(sel);
    }

    function qsa(sel, ctx) {
        return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
    }

    function formatBytes(b) {
        b = parseInt(b, 10) || 0;
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    }

    function isImage(filename) {
        return /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico)$/i.test(filename || '');
    }

    function fileIcon(filename) {
        var ext = (filename || '').split('.').pop().toLowerCase();
        var icons = {
            pdf: 'fa-file-pdf',
            doc: 'fa-file-word', docx: 'fa-file-word',
            xls: 'fa-file-excel', xlsx: 'fa-file-excel',
            ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
            zip: 'fa-file-zipper', rar: 'fa-file-zipper', gz: 'fa-file-zipper',
            mp3: 'fa-file-audio', wav: 'fa-file-audio', ogg: 'fa-file-audio', flac: 'fa-file-audio',
            mp4: 'fa-file-video', avi: 'fa-file-video', mov: 'fa-file-video', webm: 'fa-file-video',
            txt: 'fa-file-lines', csv: 'fa-file-csv', log: 'fa-file-lines',
            html: 'fa-file-code', css: 'fa-file-code', js: 'fa-file-code',
            json: 'fa-file-code', xml: 'fa-file-code', php: 'fa-file-code'
        };
        return 'fa-solid ' + (icons[ext] || 'fa-file');
    }

    function escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function richTextToPlainText(raw) {
        var s = String(raw || '');
        if (!s) return '';

        // Preserve visible line breaks before stripping tags.
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
        s = s.replace(/<\/div>\s*<div[^>]*>/gi, '\n');

        if (s.indexOf('<') !== -1 && typeof document !== 'undefined') {
            var tmp = document.createElement('div');
            tmp.innerHTML = s;
            s = tmp.textContent || tmp.innerText || '';
        }

        // Normalize nbsp artifacts from TinyMCE and pasted content.
        s = s.replace(/&nbsp;/gi, ' ');
        s = s.replace(/\u00a0/g, ' ');
        s = s.replace(/\r\n?/g, '\n');
        s = s.replace(/^[ \t\u00a0]+/, '');

        return s;
    }

    function tinyPreviewText(value) {
        var text = richTextToPlainText(value);
        return text ? text.slice(0, 120) : '–';
    }

    function formatDate(v) {
        if (!v) return '–';
        var d = (typeof v === 'number' || /^\d{9,}$/.test(String(v)))
            ? new Date(Number(v) * 1000)
            : new Date(v);
        if (isNaN(d.getTime())) return String(v);
        var pad = function (n) { return n < 10 ? '0' + n : n; };
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function getFilenameExtension(filename) {
        var name = String(filename || '');
        var pos = name.lastIndexOf('.');
        if (pos < 0 || pos === name.length - 1) return '';
        return name.substring(pos + 1).toLowerCase();
    }

    function normalizeReplacementExtension(ext) {
        ext = String(ext || '').toLowerCase();
        if (ext === 'jpeg' || ext === 'jpe') return 'jpg';
        return ext;
    }

    function normalizeMediaPerPage(value) {
        var parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            return DEFAULT_MEDIA_PER_PAGE;
        }

        if (MEDIA_PER_PAGE_OPTIONS.indexOf(parsed) < 0) {
            return DEFAULT_MEDIA_PER_PAGE;
        }

        return parsed;
    }

    function normalizeTileSize(value) {
        var parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            return DEFAULT_TILE_SIZE;
        }
        return Math.max(TILE_SIZE_MIN, Math.min(parsed, TILE_SIZE_MAX));
    }

    function extensionsCompatible(sourceFilename, targetFilename) {
        var sourceExt = normalizeReplacementExtension(getFilenameExtension(sourceFilename));
        var targetExt = normalizeReplacementExtension(getFilenameExtension(targetFilename));
        if (!sourceExt || !targetExt) return false;
        return sourceExt === targetExt;
    }

    function getReplacementAcceptForFilename(filename) {
        var ext = normalizeReplacementExtension(getFilenameExtension(filename));
        if (ext === 'jpg') return '.jpg,.jpeg';
        if (!ext) return '';
        return '.' + ext;
    }

    function getMediaCacheToken(mediaOrFilename, forceTokens, loadedFiles) {
        forceTokens = forceTokens || {};
        loadedFiles = loadedFiles || [];
        var filenameFromArg = '';

        if (mediaOrFilename && typeof mediaOrFilename === 'object') {
            filenameFromArg = String(mediaOrFilename.filename || '');
            if (filenameFromArg && forceTokens[filenameFromArg]) {
                return String(forceTokens[filenameFromArg]);
            }
            if (mediaOrFilename.updatedate) return String(mediaOrFilename.updatedate);
            if (mediaOrFilename.filesize) return String(mediaOrFilename.filesize);
            return '';
        }

        var filename = String(mediaOrFilename || '');
        if (!filename) return '';

        if (forceTokens[filename]) {
            return String(forceTokens[filename]);
        }

        for (var i = 0; i < loadedFiles.length; i++) {
            var f = loadedFiles[i];
            if (String(f.filename || '') === filename) {
                if (f.updatedate) return String(f.updatedate);
                if (f.filesize) return String(f.filesize);
                break;
            }
        }

        return '';
    }

    function withMediaCacheBuster(url, mediaOrFilename, forceTokens, loadedFiles) {
        var token = getMediaCacheToken(mediaOrFilename, forceTokens, loadedFiles);
        if (!token) return url;
        return url + (url.indexOf('?') === -1 ? '?' : '&') + 'mp3v=' + encodeURIComponent(token);
    }

    function mediaThumbSrc(filename, mmType, cacheTokenSource, forceTokens, loadedFiles) {
        if (/\.svg$/i.test(filename || '')) {
            return withMediaCacheBuster('../media/' + encodeURIComponent(filename), cacheTokenSource, forceTokens, loadedFiles);
        }
        return withMediaCacheBuster('index.php?rex_media_type=' + mmType + '&rex_media_file=' + encodeURIComponent(filename), cacheTokenSource, forceTokens, loadedFiles);
    }

    function deepClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return value;
        }
    }

    function isObj(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    /**
     * Normalisiert Werte fuer den Dirty-Check-Vergleich (hasChanged()). Objekt-
     * Keys mit null/undefined-Wert werden komplett weggelassen, nicht nur auf
     * null vereinheitlicht -- collectJsonValuesFromDetail() liefert fuer jedes
     * bekannte Feld explizit einen Eintrag (auch null, wenn leer), waehrend der
     * vom Server geladene Original-Datensatz nie gesetzte Felder als fehlenden
     * Key liefert (siehe MetainfoJsonStorage::setFieldValue(), das leere Werte
     * per unset() entfernt statt sie als null zu speichern). Ohne dieses
     * Weglassen wuerde {feld: null} vs. {} faelschlich als Aenderung gelten und
     * der Speichern-Button schon direkt nach dem Laden aktiv erscheinen.
     */
    function normalizeCompare(v) {
        if (Array.isArray(v)) {
            return v.map(function (x) { return normalizeCompare(x); });
        }
        if (isObj(v)) {
            var keys = Object.keys(v).sort();
            var out = {};
            for (var i = 0; i < keys.length; i++) {
                var normalized = normalizeCompare(v[keys[i]]);
                if (null === normalized) continue;
                out[keys[i]] = normalized;
            }
            return out;
        }
        if (v === null || v === undefined) return null;
        return v;
    }

    function hasChanged(a, b) {
        return JSON.stringify(normalizeCompare(a)) !== JSON.stringify(normalizeCompare(b));
    }

    function isImageFile(filename) {
        return /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i.test(filename || '');
    }


    Core.helpers.qs = qs;
    Core.helpers.qsa = qsa;
    Core.helpers.formatBytes = formatBytes;
    Core.helpers.isImage = isImage;
    Core.helpers.fileIcon = fileIcon;
    Core.helpers.escAttr = escAttr;
    Core.helpers.richTextToPlainText = richTextToPlainText;
    Core.helpers.tinyPreviewText = tinyPreviewText;
    Core.helpers.formatDate = formatDate;
    Core.helpers.getFilenameExtension = getFilenameExtension;
    Core.helpers.normalizeReplacementExtension = normalizeReplacementExtension;
    Core.helpers.normalizeMediaPerPage = normalizeMediaPerPage;
    Core.helpers.normalizeTileSize = normalizeTileSize;
    Core.helpers.extensionsCompatible = extensionsCompatible;
    Core.helpers.getReplacementAcceptForFilename = getReplacementAcceptForFilename;
    Core.helpers.getMediaCacheToken = getMediaCacheToken;
    Core.helpers.withMediaCacheBuster = withMediaCacheBuster;
    Core.helpers.mediaThumbSrc = mediaThumbSrc;
    Core.helpers.deepClone = deepClone;
    Core.helpers.isObj = isObj;
    Core.helpers.normalizeCompare = normalizeCompare;
    Core.helpers.hasChanged = hasChanged;
    Core.helpers.isImageFile = isImageFile;
})(window.MP3Core = window.MP3Core || {});
