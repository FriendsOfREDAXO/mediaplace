/**
 * Cloud-Provider-Modul (siehe StorageProviderInterface/-Registry, mediaplace,
 * und lib/MediaplaceProvider.php im ersten Provider-Addon "nextcloud").
 *
 * Erste Extraktion aus core.js (siehe DEV.md/Modularisierungs-Plan) --
 * Referenz-Modul fuer alle folgenden Extraktionen. Singleton-Closure wie
 * core.js selbst (es gibt nur ein Overlay), kein Factory-Pattern noetig.
 *
 * ctx (siehe initProviders()) ist die Bruecke zu Funktionen/State, die noch
 * in core.js leben -- direkte core.js-Imports wuerden einen echten
 * Zirkelbezug erzeugen (core.js importiert dieses Modul umgekehrt fuer die
 * Event-Wiring-Aufrufe). Die Event-Listener-REGISTRIERUNG (sidebar/grid/
 * breadcrumb/search/detail-panel-Click) bleibt bewusst noch in core.js'
 * build() -- nur die schlanken if/return-Zweige rufen ab jetzt hierher
 * durch, statt die Logik selbst zu enthalten. Vollstaendig eigene Listener
 * pro Modul (das Ziel laut Plan) folgen, sobald build() selbst dran ist.
 */

import { showCategoryPickerModal } from './modals.js';

var ctx = null;
var providers = []; // [{id,label,icon}], aus #mp3-root data-providers
var gridMode = 'local'; // 'local' | 'provider'
var activeProvider = null; // provider-id
var activeProviderPath = '/';
var activeProviderPathSegments = []; // [{path,name}] fuer die Breadcrumb
var providerHasSearch = false;
var lastLoadedProviderEntries = [];

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var escAttr = MP3Core.helpers.escAttr;
var fileIcon = MP3Core.helpers.fileIcon;
var formatBytes = MP3Core.helpers.formatBytes;
var qsa = MP3Core.helpers.qsa;
var apiFetchProviderEntries = MP3Core.api.apiFetchProviderEntries;
var getProviderThumbnailUrl = MP3Core.api.getProviderThumbnailUrl;
var apiImportProviderFile = MP3Core.api.apiImportProviderFile;

/**
 * Von core.js einmalig am Ende von build() aufgerufen, sobald DOM-Refs
 * (ctx.overlay/grid/sidebar/breadcrumb/detailPanel) und die noch in
 * core.js verbliebenen Funktionen/State-Zugriffe (siehe unten) feststehen.
 *
 * ctx-Vertrag:
 * - overlay, grid, sidebar, breadcrumb, detailPanel: DOM-Refs (overlay nur
 *   fuer die mp3-provider-mode-Klasse, siehe openProvider()/closeProviderMode())
 * - gridTileRatio: string (GRID_TILE_RATIO aus core.js, geteilte Konstante
 *   fuer lokale + Provider-Kacheln)
 * - mediaForceCacheTokens: Objekt-Referenz (wird in-place mutiert)
 * - getOnMultiSelect()/getCurrentCat()/setCurrentCat()/getViewMode()/
 *   getOnSelect()/clearOnSelect(): Zugriff auf noch-legacy-State
 * - hideDetail()/setActiveCollection()/updateSidebarActiveState()/
 *   updateStatus()/close(): noch-legacy-Funktionen
 * showCategoryPickerModal() kommt direkt aus modules/modals.js (kein
 * Zirkelbezug: modals.js importiert providers.js nicht zurueck).
 */
export function initProviders(theCtx, providerList) {
    ctx = theCtx;
    providers = providerList || [];
}

/**
 * Sidebar-Sektion mit einem Wurzel-Eintrag pro Provider, KEIN verschachtelter,
 * eager geladener Ordnerbaum wie beim lokalen Kategoriebaum: eine entfernte
 * Quelle kann beliebig gross/tief sein, das waere fuers Eager-Rendering
 * ungeeignet. Navigation innerhalb eines Providers laeuft stattdessen ueber
 * Ordner-Kacheln im Grid selbst + eine eigene Breadcrumb
 * (openProviderFolder()), gleiches Muster wie z.B. das nextcloud-Addon es
 * fuer seine eigene Seite bereits nutzt. Im Mehrfachauswahl-Picker
 * (onMultiSelect) wird der Cloud-Bereich gar nicht erst angezeigt
 * (Import/Auswahl ist in dieser Version auf Einzeldateien beschraenkt).
 */
export function renderProvidersSection() {
    if (!providers.length || ctx.getOnMultiSelect()) return '';

    var html = '<div class="mp3-providers-wrap">';
    html += '<div class="mp3-providers-head"><span class="mp3-providers-title">' + t('mediaplace_cloud_providers') + '</span></div>';
    for (var i = 0; i < providers.length; i++) {
        var p = providers[i];
        html += '<a class="mp3-provider-root' + (activeProvider === p.id ? ' mp3-provider-root-active' : '') + '" data-provider-id="' + escAttr(p.id) + '" data-provider-label="' + escAttr(p.label) + '">' +
            '<i class="' + escAttr(p.icon || 'fa-solid fa-cloud') + '"></i> ' + escAttr(p.label) + '</a>';
    }
    html += '</div>';
    return html;
}

export function hasProviders() {
    return providers.length > 0;
}

export function isProviderMode() {
    return 'provider' === gridMode;
}

/** Aktive Provider-Sitzung beenden, zurueck zur normalen lokalen Ansicht. */
export function closeProviderMode() {
    if ('provider' !== gridMode) return;
    gridMode = 'local';
    activeProvider = null;
    activeProviderPath = '/';
    activeProviderPathSegments = [];
    providerHasSearch = false;
    lastLoadedProviderEntries = [];
    qsa('.mp3-provider-root', ctx.sidebar).forEach(function (el) {
        el.classList.remove('mp3-provider-root-active');
    });
    if (ctx.overlay) ctx.overlay.classList.remove('mp3-provider-mode');
}

/** Klick auf einen Provider-Wurzelknoten in der Sidebar. */
export function openProvider(providerId, label) {
    if ('provider' === gridMode && activeProvider === providerId) return; // schon aktiv
    closeProviderMode(); // vorherigen Provider (falls anderer) sauber verlassen
    ctx.hideDetail();
    gridMode = 'provider';
    activeProvider = providerId;
    activeProviderPath = '/';
    activeProviderPathSegments = [];
    if (ctx.overlay) ctx.overlay.classList.add('mp3-provider-mode');
    ctx.setActiveCollection(null);
    ctx.setCurrentCat(-1); // rein visuell: kein lokaler Kategorie-Eintrag mehr aktiv
    ctx.updateSidebarActiveState();
    qsa('.mp3-provider-root', ctx.sidebar).forEach(function (el) {
        el.classList.toggle('mp3-provider-root-active', el.getAttribute('data-provider-id') === providerId);
    });
    renderProviderBreadcrumb(label);
    loadProviderEntries();
}

/** Klick auf eine Ordner-Kachel im Provider-Grid -- eine Ebene tiefer navigieren. */
export function openProviderFolder(path, name) {
    ctx.hideDetail();
    activeProviderPath = path;
    activeProviderPathSegments.push({ path: path, name: name });
    renderProviderBreadcrumb();
    loadProviderEntries();
}

/** Breadcrumb-Klick: zurueck zu einer bereits besuchten Ebene (oder Wurzel). */
export function jumpToProviderBreadcrumb(index) {
    ctx.hideDetail();
    if (index < 0) {
        activeProviderPath = '/';
        activeProviderPathSegments = [];
    } else {
        activeProviderPathSegments = activeProviderPathSegments.slice(0, index + 1);
        activeProviderPath = activeProviderPathSegments[index].path;
    }
    renderProviderBreadcrumb();
    loadProviderEntries();
}

function renderProviderBreadcrumb(rootLabel) {
    if (!ctx.breadcrumb) return;
    var providerMeta = null;
    for (var i = 0; i < providers.length; i++) {
        if (providers[i].id === activeProvider) { providerMeta = providers[i]; break; }
    }
    var label = rootLabel || (providerMeta ? providerMeta.label : activeProvider);
    var icon = providerMeta ? providerMeta.icon : 'fa-solid fa-cloud';
    var html = '<a class="mp3-bc-item" data-provider-crumb="-1"><i class="' + escAttr(icon) + '"></i> ' + escAttr(label) + '</a>';
    for (var j = 0; j < activeProviderPathSegments.length; j++) {
        html += ' <i class="fa-solid fa-chevron-right mp3-bc-sep"></i> ';
        html += '<a class="mp3-bc-item" data-provider-crumb="' + j + '">' + escAttr(activeProviderPathSegments[j].name) + '</a>';
    }
    ctx.breadcrumb.innerHTML = html;
}

/** Suchfeld-Eingabe im Provider-Modus -- siehe hasSearch()-Aufrufer in core.js. */
export function hasSearch() {
    return providerHasSearch;
}

export function loadProviderEntries(search) {
    if (!activeProvider) return;
    ctx.grid.className = 'mp3-grid';
    ctx.grid.innerHTML = '<div style="padding:40px;text-align:center;color:#6c757d;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2em;"></i></div>';

    apiFetchProviderEntries(activeProvider, activeProviderPath, search)
        .then(function (payload) {
            if ('provider' !== gridMode) return; // Modus zwischenzeitlich verlassen
            providerHasSearch = !!payload.has_search;
            lastLoadedProviderEntries = payload.data || [];
            renderProviderFiles(lastLoadedProviderEntries);
        })
        .catch(function (err) {
            ctx.grid.innerHTML = '<div style="padding:40px;text-align:center;color:#c9302c;">' + escAttr(err.message) + '</div>';
        });
}

/**
 * Aktuell geladene Provider-Eintraege neu rendern (z.B. nach Ansicht-
 * Umschalten) -- von core.js' refreshDisplay() aufgerufen, wenn
 * isProviderMode() true ist.
 */
export function renderCurrentProviderEntries() {
    renderProviderFiles(lastLoadedProviderEntries);
}

/**
 * Respektiert den normalen Kacheln/Liste/Media-Wall-Umschalter (viewMode)
 * auch im Provider-Modus -- ohne das wuerde ein Umschalten ueber
 * refreshDisplay() (viewToggle-Klick-Handler) auf die lokale renderFiles()/
 * lastLoadedFiles zurueckfallen und den Cloud-Baum unvermittelt verlassen.
 * Media-Wall/Masonry faellt bewusst auf die normale Kachel-Darstellung
 * zurueck: Cloud-Eintraege haben kein width/height fuer ein echtes
 * Seitenverhaeltnis, ein eigenes Masonry-Layout dafuer wuerde optisch nicht
 * von der Kachelansicht abweichen.
 */
function renderProviderFiles(entries) {
    if ('list' === ctx.getViewMode()) {
        renderProviderList(entries);
    } else {
        renderProviderGrid(entries);
    }
    ctx.updateStatus(entries.length);
}

/**
 * Bewusst eigene, schlanke Kachel-Darstellung statt previewHtml()/
 * renderFilesGrid() wiederzuverwenden: eine Cloud-Datei ist noch keine
 * lokale rex_media-Zeile, hat also keine width/height/system_tags/... und
 * die Vorschau-Quelle ist ein voellig anderer Endpunkt (Provider-
 * Thumbnail-Proxy statt lokaler Media-Manager-Typ).
 */
function renderProviderGrid(entries) {
    var html = '';
    if (!entries.length) {
        html = '<div style="padding:40px;text-align:center;color:#6c757d;">' + escAttr(t('mediaplace_no_files')) + '</div>';
    }
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var isFolder = 'folder' === entry.type;
        html += '<div class="mp3-card mp3-provider-card" data-provider-path="' + escAttr(entry.path) + '" data-provider-type="' + escAttr(entry.type) + '" data-provider-name="' + escAttr(entry.name) + '">' +
            providerPreviewHtml(entry) +
            '<div class="mp3-info">' +
                '<span class="mp3-card-name" title="' + escAttr(entry.name) + '">' + escAttr(entry.name) + '</span>' +
                '<span class="mp3-fmeta">' + (isFolder ? '' : formatBytes(entry.filesize || 0)) + '</span>' +
            '</div>' +
        '</div>';
    }
    ctx.grid.className = 'mp3-grid';
    ctx.grid.innerHTML = html;
}

function renderProviderList(entries) {
    var html = '<table class="mp3-list-table"><thead><tr>' +
        '<th class="mp3-list-th-preview"></th>' +
        '<th>' + t('mediaplace_name') + '</th>' +
        '<th>' + t('mediaplace_field_type') + '</th>' +
        '<th>' + t('mediaplace_field_size') + '</th>' +
        '<th>' + t('mediaplace_date') + '</th>' +
    '</tr></thead><tbody>';
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var isFolder = 'folder' === entry.type;
        html += '<tr class="mp3-list-row mp3-provider-card" data-provider-path="' + escAttr(entry.path) + '" data-provider-type="' + escAttr(entry.type) + '" data-provider-name="' + escAttr(entry.name) + '">';
        html += '<td class="mp3-list-cell-preview">' + (isFolder
            ? '<i class="fa-solid fa-folder"></i>'
            : (entry.hasThumbnail
                ? '<img data-fallback-icon="' + escAttr(fileIcon(entry.name)) + '" src="' + escAttr(getProviderThumbnailUrl(activeProvider, entry.path)) + '" alt="" loading="lazy">'
                : '<i class="' + escAttr(fileIcon(entry.name)) + '"></i>')) + '</td>';
        html += '<td class="mp3-list-cell-name"><div class="mp3-list-name-wrap"><span>' + escAttr(entry.name) + '</span></div></td>';
        html += '<td class="mp3-list-cell-type">' + escAttr(entry.filetype || '') + '</td>';
        html += '<td class="mp3-list-cell-size">' + (isFolder ? '' : formatBytes(entry.filesize || 0)) + '</td>';
        html += '<td class="mp3-list-cell-date">' + escAttr(entry.modified || '') + '</td>';
        html += '</tr>';
    }
    html += '</tbody></table>';
    ctx.grid.className = 'mp3-grid mp3-view-list';
    ctx.grid.innerHTML = html;
}

function providerPreviewHtml(entry) {
    if ('folder' === entry.type) {
        return '<div class="mp3-icon"><i class="fa-solid fa-folder"></i></div>';
    }
    if (!entry.hasThumbnail) {
        return '<div class="mp3-icon"><i class="' + escAttr(fileIcon(entry.name)) + '"></i></div>';
    }
    var src = getProviderThumbnailUrl(activeProvider, entry.path);
    // Gleicher garantierter Icon-Fallback wie bei lokalen Video-/Bild-
    // Vorschaubildern: data-fallback-icon + globaler capture-phase
    // error-Listener (siehe previewHtml()) greift automatisch mit, da er
    // rein auf dem Attribut matcht, nicht auf einer bestimmten Klasse.
    return '<img data-fallback-icon="' + escAttr(fileIcon(entry.name)) + '" src="' + escAttr(src) + '" alt="' + escAttr(entry.name) + '" loading="lazy" style="aspect-ratio:' + ctx.gridTileRatio + '">';
}

/**
 * Schlanker Mini-Detail-Bereich fuer eine Cloud-Datei (rein client-seitig
 * aus dem bereits geladenen entries-Response gebaut, kein Server-
 * Roundtrip): der normale showDetail()-Pfad verlangt zwingend eine echte
 * rex_media-Zeile (rex_api_mediaplace_json_metainfo.php, "Media not
 * found" sonst) -- eine noch nicht importierte Cloud-Datei kann den nie
 * durchlaufen, deshalb ein komplett eigener, einfacherer Ablauf.
 */
export function showProviderDetail(path, name) {
    if (!ctx.detailPanel) return;
    var entry = null;
    for (var i = 0; i < lastLoadedProviderEntries.length; i++) {
        if (lastLoadedProviderEntries[i].path === path) { entry = lastLoadedProviderEntries[i]; break; }
    }
    if (!entry) return;

    var isPicker = !!ctx.getOnSelect();
    var previewHtmlStr = entry.hasThumbnail
        ? '<img src="' + escAttr(getProviderThumbnailUrl(activeProvider, path)) + '" alt="' + escAttr(name) + '">'
        : '<div class="mp3-icon"><i class="' + escAttr(fileIcon(name)) + '"></i></div>';

    var html = '<div class="mp3-detail-inner">';
    html += '<div class="mp3-detail-header"><span class="mp3-detail-header-name" title="' + escAttr(name) + '">' + escAttr(name) + '</span></div>';
    html += '<div class="mp3-detail-preview">' + previewHtmlStr + '</div>';
    html += '<table class="mp3-detail-table">';
    html += '<tr><td>' + escAttr(t('mediaplace_field_filename')) + '</td><td>' + escAttr(name) + '</td></tr>';
    html += '<tr><td>' + escAttr(t('mediaplace_field_size')) + '</td><td>' + (entry.filesize ? formatBytes(entry.filesize) : '–') + '</td></tr>';
    if (entry.modified) {
        html += '<tr><td>' + escAttr(t('mediaplace_date')) + '</td><td>' + escAttr(entry.modified) + '</td></tr>';
    }
    html += '</table>';
    html += '<div class="mp3-detail-actions">';
    html += '<button type="button" class="mp3-image-optimize-btn mp3-provider-import-btn" data-provider-import-path="' + escAttr(path) + '" data-provider-import-name="' + escAttr(name) + '">' +
        '<i class="fa-solid fa-cloud-arrow-down"></i> ' + escAttr(isPicker ? t('mediaplace_provider_import_and_select') : t('mediaplace_provider_import')) +
        '</button>';
    html += '<div class="mp3-image-optimize-status mp3-provider-import-status" style="display:none"></div>';
    html += '</div>';
    html += '</div>';

    ctx.detailPanel.innerHTML = html;
    // Unbedingt setzen, nicht nur im Compact-Layout: .mp3-detail hat
    // width:0/overflow:hidden per Default (siehe mediaplace.css), diese
    // Klasse ist es, die das Panel ueberhaupt sichtbar macht -- auf dem
    // Desktop genauso wie im Compact-Modus. Gleiches Muster wie
    // showDetail() fuer lokale Dateien (detailPanel.classList.add(...)
    // dort ebenfalls unbedingt, nur der separate Resize-Handle ist
    // Compact-abhaengig).
    ctx.detailPanel.classList.add('mp3-detail-open');
}

/**
 * Zielkategorie abfragen statt stillschweigend currentCat/Wurzel zu
 * nehmen -- nutzt denselben showCategoryPickerModal() wie der reguläre
 * Sammlungs-Upload (core.js, per ctx durchgereicht).
 */
export function promptProviderImport(path, name, btn) {
    showCategoryPickerModal({
        icon: 'fa-solid fa-cloud-arrow-down',
        title: t('mediaplace_pick_import_category'),
        hint: t('mediaplace_import_category_hint', { name: '<strong>' + escAttr(name) + '</strong>' }),
        confirmLabel: t('mediaplace_provider_import'),
        selectedId: ctx.getCurrentCat(),
        onConfirm: function (catId) {
            importProviderFile(path, name, btn, catId);
        }
    });
}

function importProviderFile(path, name, btn, categoryId) {
    var statusEl = btn ? btn.parentNode.querySelector('.mp3-provider-import-status') : null;
    var setStatus = function (html) {
        if (!statusEl) return;
        statusEl.style.display = '';
        statusEl.innerHTML = html;
    };

    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    setStatus('<i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_provider_import_running'));

    apiImportProviderFile(activeProvider, path, categoryId)
        .then(function (result) {
            setStatus('<i class="fa-solid fa-check"></i> ' + t('mediaplace_provider_import_done'));
            ctx.mediaForceCacheTokens[result.filename] = Date.now();
            var cb = ctx.getOnSelect();
            if (cb) {
                ctx.clearOnSelect();
                cb(result.filename);
                ctx.close();
                return;
            }
            // Browse-Modus: kein Sprung in die lokale Ansicht -- weiter im
            // Provider stoebern und ggf. mehrere Dateien nacheinander
            // importieren bleibt so moeglich, ohne den Kontext zu verlieren.
        })
        .catch(function (err) {
            setStatus('<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error_importing_provider_file', { msg: err.message }));
            if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
        });
}
