/**
 * Grid-/Listen-/Media-Wall-Rendering fuer die Dateiansicht. Extraktion aus
 * core.js (siehe DEV.md/Modularisierungs-Plan), Phase 9.
 *
 * Bewusst NICHT mit hierher gewandert: die Low-Level-Helfer (formatBytes/
 * isImage/isVideo/fileIcon/formatDate/mediaThumbSrc) leben bereits in
 * MPCore.helpers (geteilt, nicht gebuendelt) -- hier werden sie nur benutzt.
 * updateStatus() bleibt in core.js (Data-Loading-Domaene, kennt
 * mediaTotal/statusBar), wird per ctx aufgerufen.
 */

import { splitSystemTags } from './collections.js';

var ctx = null;

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;
var formatBytes = MPCore.helpers.formatBytes;
var formatDate = MPCore.helpers.formatDate;
var isImage = MPCore.helpers.isImage;
var isVideo = MPCore.helpers.isVideo;
var fileIcon = MPCore.helpers.fileIcon;
var mediaThumbSrc = MPCore.helpers.mediaThumbSrc;

// Festes Grid-Querformat (previewHtml()); die Media-Wall nutzt stattdessen
// das natuerliche Seitenverhaeltnis der Datei (siehe cardAspectRatio()).
// Einzige Quelle der Wahrheit -- core.js importiert diese Konstante zurueck
// fuer initProviders()'s ctx.gridTileRatio statt sie zu duplizieren.
export var GRID_TILE_RATIO = '4 / 3';

// Einziger, wiederverwendeter IntersectionObserver fuer alle Video-Thumbs
// (siehe previewHtml()) -- lazy erzeugt, danach bei jedem Grid-/Media-Wall-
// Rendering (renderFilesGrid()/renderFilesMediaWall()) neu an die dann
// aktuellen .mp-video-thumb-img-Elemente gebunden (disconnect() +
// erneutes observe() ist billig und robust, statt einzeln nachzuverfolgen,
// welche Kacheln zwischen Renders neu/entfernt wurden).
var videoThumbObserver = null;

/**
 * ctx-Vertrag:
 * - grid: DOM-Ref (das Grid-Container-Element)
 * - getMultiMode()/getMultiSelected(): noch-legacy-State (Widget-Mehrfachauswahl)
 * - getBatchSelectMode()/getCollectionDragSelected(): noch-legacy-State
 *   (normale Mehrfachauswahl per Checkbox-Umschalter, siehe batchSelectMode)
 * - getSelectedFile(): noch-legacy-State (aktuell im Detail-Panel gezeigte Datei)
 * - getViewMode(): noch-legacy-State (grid | list | mediawall)
 * - getFeatures(): noch-legacy-State (features.tagging fuer renderFileTagDots())
 * - getMediaForceCacheTokens()/getLastLoadedFiles()/getMediaBaseUrl(): noch-legacy-State,
 *   durchgereicht an MPCore.helpers.mediaThumbSrc()
 * - getVideoThumbType()/getVideoThumbStatic(): noch-legacy-State (FfmpegIntegration-Konfiguration)
 * - updateStatus(count): noch-legacy-Funktion (Treffer-/Ladezaehler-Text)
 */
export function initGrid(theCtx) {
    ctx = theCtx;

    // Garantierter Datei-Icon-Fallback fuer Grid-Vorschaubilder (Bild UND
    // Video, siehe previewHtml()): das <img>-"error"-Event bubbelt NICHT, ein
    // normaler delegierter Handler wuerde es also nie erreichen. Ein
    // einziger, hier einmalig gebundener Capture-Phase-Listener auf document
    // sieht dagegen JEDES error-Event auf dem Weg zum Zielelement, unabhaengig
    // davon, wie viele Kacheln das Grid gerade rendert -- kein Listener pro
    // Bild noetig. Greift bei jedem Fehlschlag (ffmpeg fehlt, riesige/kaputte
    // Datei, Server-Fehler, Timeout), nicht nur bei den Faellen, die
    // previewHtml() bereits vorher erkennt. Erkennung ueber data-fallback-icon
    // statt einer bestimmten Klasse, damit ein Handler fuer beide
    // Vorschau-Arten reicht.
    document.addEventListener('error', function (e) {
        var img = e.target;
        if (!img || !img.getAttribute || !img.hasAttribute('data-fallback-icon')) {
            return;
        }
        var icon = img.getAttribute('data-fallback-icon') || 'fa-solid fa-file';
        var div = document.createElement('div');
        div.className = 'mp-icon';
        div.innerHTML = '<i class="' + icon + '"></i>';
        if (videoThumbObserver) {
            videoThumbObserver.unobserve(img);
        }
        if (img.parentNode) {
            img.parentNode.replaceChild(div, img);
        }
    }, true);
}

/**
 * Build preview HTML for a single media file. Genutzt von Grid- und Media-
 * Wall-Ansicht (renderFilesGrid()/renderFilesMediaWall()), beide per Slider
 * auf bis zu 360px CSS-Breite skalierbar (--mp-tile-size) -- deshalb der
 * eigene, groessere Media-Manager-Typ statt rex_media_small (200x200),
 * siehe install.php.
 *
 * @param {string|null} [ratioOverride] Explizites aspect-ratio (z.B. aus
 *   cardAspectRatio() fuer die Media-Wall). Ohne Angabe greift das feste
 *   Grid-Querformat (GRID_TILE_RATIO).
 */
export function previewHtml(file, ratioOverride) {
    var mediaForceCacheTokens = ctx.getMediaForceCacheTokens();
    var lastLoadedFiles = ctx.getLastLoadedFiles();
    var mediaBaseUrl = ctx.getMediaBaseUrl();

    if (isImage(file.filename)) {
        var src = mediaThumbSrc(file.filename, 'mediaplace_thumb', file, mediaForceCacheTokens, lastLoadedFiles, mediaBaseUrl);
        var ratio = (undefined !== ratioOverride) ? ratioOverride : GRID_TILE_RATIO;
        var style = ratio ? ' style="aspect-ratio:' + ratio + '"' : '';
        // loading="lazy": bei grossen Kategorien/"Alle Medien" sollen nicht
        // alle Kachel-Vorschaubilder gleichzeitig angefordert werden --
        // Browser laedt nur, was (bald) sichtbar ist. data-fallback-icon +
        // globaler error-Listener oben: Fallback aufs Datei-Icon, falls die
        // Generierung trotz Groessen-Check fehlschlaegt.
        return '<img data-fallback-icon="' + escAttr(fileIcon(file.filename)) + '" src="' + escAttr(src)
            + '" alt="' + escAttr(file.title || file.filename) + '" loading="lazy"' + style + '>';
    }
    // ffmpeg-Integration: Video-Vorschau (Media-Manager-Typ je nach
    // Einstellungen-Modus, siehe videoThumbType/FfmpegIntegration::
    // getActiveVideoThumbType()) statt des Datei-Icons, wenn ffmpeg
    // installiert ist UND die Video-Vorschau nicht auf "aus" steht (dann
    // ist videoThumbType ein leerer String). KEIN "src" hier (nur
    // data-video-thumb-src) -- initVideoThumbObserver() setzt/entfernt src
    // erst beim tatsaechlichen Sichtbarwerden bzw. Verlassen des
    // Viewports. Natives loading="lazy" allein reicht bei grossen Video-
    // Kategorien nicht: es LAEDT zwar nur nahe Kacheln, gibt aber einmal
    // geladene animierte WebPs beim Weiterscrollen nie wieder frei -- der
    // Speicherverbrauch waechst dann unbegrenzt mit der Anzahl je
    // gesehener Videos und kann den Tab zum Abstuerzen bringen ("Diese
    // Webseite wurde neu geladen, weil sie sehr viel Speicher
    // benoetigte"). Der IntersectionObserver setzt src beim Reinscrollen
    // und entfernt es wieder beim Rausscrollen -- der HTTP-Cache haelt die
    // Bytes weiter vor, ein erneutes Sichtbarwerden ist praktisch instant.
    // Gilt bewusst auch fuer den Standbild-Modus (dort waere es nicht
    // zwingend noetig, ein einzelnes Bild ist deutlich billiger als eine
    // Animation) -- ein einziger Mechanismus fuer beide Modi ist einfacher
    // zu pflegen als zwei.
    var videoThumbType = ctx.getVideoThumbType();
    if (videoThumbType && isVideo(file.filename)) {
        var videoSrc = mediaThumbSrc(file.filename, videoThumbType, file, mediaForceCacheTokens, lastLoadedFiles, mediaBaseUrl);
        var videoRatio = (undefined !== ratioOverride) ? ratioOverride : GRID_TILE_RATIO;
        var videoStyle = videoRatio ? ' style="aspect-ratio:' + videoRatio + '"' : '';
        // data-fallback-icon + globaler capture-phase "error"-Listener oben:
        // garantiert das Datei-Icon als Fallback, egal WARUM die Generierung
        // fehlschlaegt (ffmpeg fehlt, Server-Fehler, Timeout) -- nicht nur,
        // wenn videoThumbType bereits beim Seitenaufbau leer war.
        // Standbild-Modus: kein animiertes Bewegtbild mehr erkennbar, ein
        // kleines Video-Icon oben rechts als Overlay macht das trotzdem
        // klar (gleiches Muster wie z.B. YouTube/Instagram-Grids).
        var videoBadge = ctx.getVideoThumbStatic() ? '<span class="mp-video-badge"><i class="fa-solid fa-video"></i></span>' : '';
        return '<img class="mp-video-thumb-img" data-fallback-icon="' + escAttr(fileIcon(file.filename))
            + '" data-video-thumb-src="' + escAttr(videoSrc) + '" alt="' + escAttr(file.title || file.filename) + '"' + videoStyle + '>'
            + videoBadge;
    }
    return '<div class="mp-icon"><i class="' + fileIcon(file.filename) + '"></i></div>';
}

function initVideoThumbObserver(container) {
    var imgs = container.querySelectorAll('.mp-video-thumb-img[data-video-thumb-src]');
    if (!imgs.length) {
        return;
    }
    if (typeof IntersectionObserver === 'undefined') {
        // Kein IO-Support (sehr alter Browser): einfach sofort laden, kein
        // Speicher-Fallback moeglich -- besser als eine leere Kachel.
        for (var j = 0; j < imgs.length; j++) {
            imgs[j].src = imgs[j].getAttribute('data-video-thumb-src');
        }
        return;
    }
    if (videoThumbObserver) {
        videoThumbObserver.disconnect();
    }
    videoThumbObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            var img = entry.target;
            if (entry.isIntersecting) {
                if (!img.getAttribute('src')) {
                    img.src = img.getAttribute('data-video-thumb-src');
                }
            } else if (img.getAttribute('src')) {
                img.removeAttribute('src');
            }
        });
    }, { rootMargin: '300px 0px', threshold: 0.01 });

    for (var i = 0; i < imgs.length; i++) {
        videoThumbObserver.observe(imgs[i]);
    }
}

/**
 * Natuerliches Seitenverhaeltnis fuer die Media-Wall (Masonry-Ansicht),
 * geclampt gegen absurde Panorama-/Hochformat-Extreme -- ohne Clamp wuerde
 * z.B. ein extremes Hochkantbild eine einzelne Spalte beliebig lang und
 * damit das ganze Masonry-Layout unbrauchbar machen. Fehlt width/height
 * (kein Bild oder fehlende Metadaten), greift der CSS-Fallback (1/1).
 */
export function cardAspectRatio(file) {
    if (file.width && file.height && file.width > 0 && file.height > 0) {
        var r = file.width / file.height;
        r = Math.max(0.5, Math.min(r, 2.2));
        return r.toFixed(4);
    }
    return null;
}

export function renderFileTagDots(file) {
    // Nur echte Tags als Dots zeigen -- Sammlungs-Zugehoerigkeit (ebenfalls
    // ein System-Tag, nur am "collection:"-Praefix unterscheidbar) sah hier
    // wie ein ganz normaler Tag aus und war dadurch irrefuehrend, obwohl sie
    // ueberall sonst (Tag-Filter-Sidebar, editierbares Tags-Widget im Detail-
    // Panel) bereits bewusst ausgeblendet wird. Sammlungszugehoerigkeit bleibt
    // ueber die Sammlungen-Sidebar/das Sammlungen-verwalten-Menue sichtbar.
    var split = splitSystemTags(file && file.system_tags ? file.system_tags : []);
    var features = ctx.getFeatures();
    var tags = features.tagging ? split.normal : [];
    if (!tags.length) return '';

    if (tags.length > 5) {
        var colors = [];
        for (var c = 0; c < tags.length; c++) {
            var mixedColor = /^#[0-9a-fA-F]{6}$/.test(String(tags[c].color || '')) ? String(tags[c].color).toLowerCase() : '#4a90d9';
            if (colors.indexOf(mixedColor) === -1) {
                colors.push(mixedColor);
            }
            if (colors.length >= 8) break;
        }
        var step = 100 / Math.max(colors.length, 1);
        var stops = [];
        for (var s = 0; s < colors.length; s++) {
            var from = Math.round(s * step);
            var to = Math.round((s + 1) * step);
            stops.push(colors[s] + ' ' + from + '% ' + to + '%');
        }
        var mixedBg = 'conic-gradient(' + stops.join(', ') + ')';
        return '<div class="mp-file-tag-dots">' +
            '<span class="mp-file-tag-dot mp-file-tag-dot-mixed" style="background:' + escAttr(mixedBg) + '" title="' + escAttr(t('mediaplace_multiple_tags_count', { count: tags.length })) + '"></span>' +
            '<span class="mp-file-tag-more" title="' + escAttr(t('mediaplace_multiple_tags')) + '">' + t('mediaplace_multiple_tags') + '</span>' +
            '</div>';
    }

    var html = '<div class="mp-file-tag-dots">';
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i] || {};
        var tagName = String(tag.name || '').trim();
        if (!tagName) continue;
        var color = /^#[0-9a-fA-F]{6}$/.test(String(tag.color || '')) ? String(tag.color).toLowerCase() : '#4a90d9';
        html += '<span class="mp-file-tag-dot" style="background:' + escAttr(color) + '" title="' + escAttr(tagName) + '"></span>';
    }
    html += '</div>';
    return html;
}

export function renderFiles(files) {
    var grid = ctx.grid;
    if (!files || !files.length) {
        // className explizit zuruecksetzen: bleibt sonst z. B. auf
        // "mp-grid mp-view-mediawall" (CSS-Mehrspalten) vom letzten
        // Render stehen und die Meldung wird von der Spalten-Engine
        // mitten im Inhalt in Fragmente zerrissen.
        grid.className = 'mp-grid';
        grid.innerHTML = '<div style="padding:40px;text-align:center;color:#6c757d;">' +
            '<i class="fa-solid fa-box-open" style="font-size:2em;display:block;margin-bottom:10px;"></i>' +
            t('mediaplace_no_files') + '</div>';
        ctx.updateStatus(0);
        return;
    }

    var viewMode = ctx.getViewMode();
    if (viewMode === 'list') {
        renderFilesList(files);
    } else if (viewMode === 'mediawall' || viewMode === 'masonry') {
        renderFilesMediaWall(files);
    } else {
        renderFilesGrid(files);
    }
    ctx.updateStatus(files.length);
}

export function renderFilesGrid(files) {
    var grid = ctx.grid;
    var multiMode = ctx.getMultiMode();
    var multiSelected = ctx.getMultiSelected();
    var batchSelectMode = ctx.getBatchSelectMode();
    var collectionDragSelected = ctx.getCollectionDragSelected();
    var html = '';
    var showCheck = multiMode || batchSelectMode;
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var isMultiSel = multiMode ? multiSelected[f.filename] : (batchSelectMode && collectionDragSelected[f.filename]);
        var displayName = f.title || f.filename;
        html += '<div class="mp-card' + (isMultiSel ? ' mp-card-multi-selected' : '') + '" draggable="true" data-filename="' + escAttr(f.filename) + '">' +
            (showCheck ? '<div class="mp-card-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></div>' : '') +
            previewHtml(f) +
            '<div class="mp-info">' +
                '<span class="mp-card-name" title="' + escAttr(f.filename) + '">' + escAttr(displayName) + '</span>' +
                (f.title ? '<span class="mp-fname" title="' + escAttr(f.filename) + '">' + escAttr(f.filename) + '</span>' : '') +
                '<span class="mp-fmeta">' + formatBytes(f.filesize) + '</span>' +
                renderFileTagDots(f) +
            '</div>' +
        '</div>';
    }
    grid.className = 'mp-grid';
    grid.innerHTML = html;
    initVideoThumbObserver(grid);
}

export function renderFilesList(files) {
    var grid = ctx.grid;
    var multiMode = ctx.getMultiMode();
    var multiSelected = ctx.getMultiSelected();
    var batchSelectMode = ctx.getBatchSelectMode();
    var collectionDragSelected = ctx.getCollectionDragSelected();
    var selectedFile = ctx.getSelectedFile();
    var mediaForceCacheTokens = ctx.getMediaForceCacheTokens();
    var lastLoadedFiles = ctx.getLastLoadedFiles();
    var mediaBaseUrl = ctx.getMediaBaseUrl();
    var showCheck = multiMode || batchSelectMode;
    var html = '<table class="mp-list-table">';
    html += '<thead><tr>' +
        (showCheck ? '<th class="mp-list-th-check"></th>' : '') +
        '<th class="mp-list-th-preview"></th>' +
        '<th>' + t('mediaplace_name') + '</th>' +
        '<th>' + t('mediaplace_field_type') + '</th>' +
        '<th>' + t('mediaplace_field_size') + '</th>' +
        '<th>' + t('mediaplace_date') + '</th>' +
    '</tr></thead><tbody>';
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var sel = (selectedFile === f.filename) ? ' mp-list-row-selected' : '';
        var isMultiSel = multiMode ? multiSelected[f.filename] : (batchSelectMode && collectionDragSelected[f.filename]);
        if (isMultiSel) sel += ' mp-list-row-multi-selected';
        html += '<tr class="mp-list-row' + sel + '" data-filename="' + escAttr(f.filename) + '" draggable="true">';
        if (showCheck) {
            html += '<td class="mp-list-cell-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></td>';
        }
        html += '<td class="mp-list-cell-preview">';
        if (isImage(f.filename)) {
            var src = mediaThumbSrc(f.filename, 'rex_media_small', f, mediaForceCacheTokens, lastLoadedFiles, mediaBaseUrl);
            html += '<img data-fallback-icon="' + escAttr(fileIcon(f.filename)) + '" src="' + escAttr(src) + '" alt="" loading="lazy">';
        } else {
            html += '<i class="' + fileIcon(f.filename) + '"></i>';
        }
        html += '</td>';
        var listLabel = f.title ? escAttr(f.title) : escAttr(f.filename);
        var listTooltip = f.title ? escAttr(f.filename) : '';
        html += '<td class="mp-list-cell-name"' + (listTooltip ? ' title="' + listTooltip + '"' : '') + '><div class="mp-list-name-wrap"><span>' + listLabel + '</span>' + renderFileTagDots(f) + '</div></td>';
        html += '<td class="mp-list-cell-type">' + escAttr(f.filetype || '') + '</td>';
        html += '<td class="mp-list-cell-size">' + formatBytes(f.filesize) + '</td>';
        html += '<td class="mp-list-cell-date">' + formatDate(f.createdate) + '</td>';
        html += '</tr>';
    }
    html += '</tbody></table>';
    grid.className = 'mp-grid mp-view-list';
    grid.innerHTML = html;
}

export function renderFilesMediaWall(files) {
    var grid = ctx.grid;
    var multiMode = ctx.getMultiMode();
    var multiSelected = ctx.getMultiSelected();
    var batchSelectMode = ctx.getBatchSelectMode();
    var collectionDragSelected = ctx.getCollectionDragSelected();
    var selectedFile = ctx.getSelectedFile();
    var html = '';
    var showCheck = multiMode || batchSelectMode;
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var isSel = (selectedFile === f.filename);
        var isMultiSel = multiMode ? multiSelected[f.filename] : (batchSelectMode && collectionDragSelected[f.filename]);
        var displayName = f.title || f.filename;

        html += '<div class="mp-masonry-card' +
            (isSel ? ' mp-masonry-card-selected' : '') +
            (isMultiSel ? ' mp-masonry-card-multi' : '') +
            '" data-filename="' + escAttr(f.filename) + '" draggable="true">';

        // Overlay toolbar
        html += '<div class="mp-masonry-toolbar">';
        if (showCheck) {
            html += '<span class="mp-masonry-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></span>';
        }
        html += '</div>';

        // Media -- natuerliches Seitenverhaeltnis (siehe cardAspectRatio()) statt
        // fester Quadrat-/Breit-/Hoch-Buckets, fuer echten Masonry-Effekt.
        var wallRatio = cardAspectRatio(f);
        var wallMediaStyle = wallRatio ? ' style="aspect-ratio:' + wallRatio + '"' : '';
        html += '<div class="mp-masonry-media"' + wallMediaStyle + '>' + previewHtml(f, wallRatio) + '</div>';

        // Footer
        html += '<div class="mp-masonry-footer">' +
            '<span class="mp-masonry-name" title="' + escAttr(f.filename) + '">' + escAttr(displayName) + '</span>' +
            renderFileTagDots(f) +
            '<span class="mp-masonry-meta">' + formatBytes(f.filesize) + '</span>' +
            '</div>';

        html += '</div>';
    }
    grid.className = 'mp-grid mp-view-mediawall';
    grid.innerHTML = html;
    initVideoThumbObserver(grid);
}
