/**
 * Typ-/Tag-/"Nur unbenutzte"-Filter, Sortierung und das mobile Filter-Dropdown.
 * Extraktion aus core.js (siehe DEV.md/Modularisierungs-Plan), Phase 8.
 *
 * Bewusst NICHT mit hierher gewandert: TYPE_EXTENSIONS/SORT_API_MAP/
 * fetchTypeCounts()/typeCounts (bleiben in core.js) -- das sind
 * Server-seitige Belange der Data-Loading-Domaene (buildMediaEndpoint()/
 * loadFiles()), keine Filter-Logik selbst. Dieses Modul liefert nur die
 * ECHTEN Zaehler (getTypeCounts()) ueber ctx zurueck, wenn vorhanden, und
 * faellt sonst auf eine rein client-seitige Zaehlung der bereits geladenen
 * Datei(en) zurueck (siehe updateFilterCounts()).
 */

import { applyCollectionFilter, collectionTagToName } from './collections.js';

var ctx = null;

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var escAttr = MP3Core.helpers.escAttr;
var qs = MP3Core.helpers.qs;
var qsa = MP3Core.helpers.qsa;
var apiCheckUnusedMedia = MP3Core.api.apiCheckUnusedMedia;

// ---- State ----
var currentFilter = 'all'; // all | images | videos | audio | documents | other
var currentSort = 'date_desc'; // date_desc | date_asc | filename_asc | filename_desc | title_asc | title_desc
var currentTagFilters = {}; // tagName -> true
var currentTagCatalog = []; // [{name,color}]
var currentTagCounts = {}; // tagName -> Dateianzahl, siehe SystemTagManager::getTagCounts()
var unusedOnlyFilter = false;
var unusedStatusCache = {};

var FILTER_MAP = {
    all: null,
    images: function (f) { return /^image\//i.test(f.filetype); },
    videos: function (f) { return /^video\//i.test(f.filetype); },
    audio: function (f) { return /^audio\//i.test(f.filetype); },
    documents: function (f) { return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|txt|csv|rtf)$/i.test(f.filename); },
    other: function (f) {
        return !/^image\//i.test(f.filetype) &&
               !/^video\//i.test(f.filetype) &&
               !/^audio\//i.test(f.filetype) &&
               !/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|txt|csv|rtf)$/i.test(f.filename);
    }
};

/**
 * ctx-Vertrag:
 * - overlay: DOM-Ref
 * - getCanFilterUnused(): noch-legacy-State (MediaPermission::hasUnusedFilterAccess(),
 *   einmal aus #mp3-root data-* gelesen)
 * - getAllowedExtensions(): noch-legacy-State (harte Endungs-Beschraenkung, siehe open())
 * - isFileSelectable(filename): noch-legacy-Funktion
 * - getLastLoadedFiles(): noch-legacy-State
 * - getCurrentCat(): noch-legacy-State
 * - loadFiles(catId, reset)/refreshDisplay(): noch-legacy-Funktionen
 * - getTypeCounts()/getTypeCountsKey()/getCurrentTypeCountsKey(): noch-legacy-State
 *   (echte Server-Zaehler aus fetchTypeCounts(), bleibt in core.js -- Data-Loading-Domaene)
 */
export function initFilters(theCtx) {
    ctx = theCtx;
}

function isFileSelectable(filename) {
    return ctx.isFileSelectable(filename);
}

export function applyFilterSort(files) {
    var result = applyCollectionFilter(files.slice());

    var allowedExtensions = ctx.getAllowedExtensions();
    if (allowedExtensions) {
        result = result.filter(function (f) { return isFileSelectable(f.filename); });
    }

    // Tag-Filter wird inzwischen serverseitig angewandt (filter[tags], siehe
    // buildBaseFilterParams()/loadFiles() in core.js -- ein Tag-Wechsel loest
    // dort einen echten Reload aus, lastLoadedFiles enthaelt danach nur noch
    // Treffer). Dieser Client-Filter bleibt trotzdem als guenstiges,
    // redundantes Sicherheitsnetz stehen (z. B. falls hier mal Dateien aus
    // einer aelteren, noch nicht neu geladenen Seite landen).
    var selectedTags = Object.keys(currentTagFilters);
    if (selectedTags.length) {
        result = result.filter(function (f) {
            var tags = Array.isArray(f.system_tags) ? f.system_tags : [];
            for (var i = 0; i < tags.length; i++) {
                var n = tags[i] ? String(tags[i].name || '') : '';
                if (n && currentTagFilters[n]) {
                    return true;
                }
            }
            return false;
        });
    }

    // Filter
    var filterFn = FILTER_MAP[currentFilter];
    if (filterFn) {
        result = result.filter(filterFn);
    }

    // "Nur unbenutzte Medien" -- unabhaengig vom Typ-/Tag-Filter kombinierbar.
    // Dateien, deren Status noch nicht geprueft wurde (siehe loadFiles()),
    // werden herausgefiltert statt optimistisch angezeigt -- sonst wuerden
    // gerade erst nachgeladene Seiten kurz falsche Treffer zeigen.
    if (ctx.getCanFilterUnused() && unusedOnlyFilter) {
        result = result.filter(function (f) {
            return true === unusedStatusCache[f.filename];
        });
    }

    // Sort
    result.sort(function (a, b) {
        switch (currentSort) {
            case 'date_desc':
                return (b.createdate || '').localeCompare(a.createdate || '');
            case 'date_asc':
                return (a.createdate || '').localeCompare(b.createdate || '');
            case 'filename_asc':
                return (a.filename || '').localeCompare(b.filename || '', 'de', { sensitivity: 'base' });
            case 'filename_desc':
                return (b.filename || '').localeCompare(a.filename || '', 'de', { sensitivity: 'base' });
            case 'title_asc':
                return (a.title || a.filename || '').localeCompare(b.title || b.filename || '', 'de', { sensitivity: 'base' });
            case 'title_desc':
                return (b.title || b.filename || '').localeCompare(a.title || a.filename || '', 'de', { sensitivity: 'base' });
            case 'size_desc':
                return (b.filesize || 0) - (a.filesize || 0);
            case 'size_asc':
                return (a.filesize || 0) - (b.filesize || 0);
            default:
                return 0;
        }
    });

    return result;
}

export function updateFilterCounts() {
    if (!ctx.overlay) return;
    var selectedTags = Object.keys(currentTagFilters);
    // Echte Server-Zaehler (fetchTypeCounts(), core.js) sind kategorie-/such-/
    // tag-exakt (filter[tags] geht seit dem serverseitigen Tag-Filter mit in
    // denselben Request ein, siehe buildBaseFilterParams()) -- der Schluessel-
    // Vergleich stellt sicher, dass sie tatsaechlich zur aktuellen Auswahl
    // passen (kurz nach einem Tag-Wechsel, bevor der neue Fetch durch ist,
    // faellt es auf die client-seitige Zaehlung unten zurueck, genau wie bei
    // einem Kategoriewechsel).
    var typeCounts = ctx.getTypeCounts();
    var useServerCounts = typeCounts && ctx.getTypeCountsKey() === ctx.getCurrentTypeCountsKey();

    var base = null;
    if (!useServerCounts) {
        base = applyCollectionFilter(ctx.getLastLoadedFiles().slice());
        if (selectedTags.length) {
            base = base.filter(function (f) {
                var tags = Array.isArray(f.system_tags) ? f.system_tags : [];
                for (var i = 0; i < tags.length; i++) {
                    var n = tags[i] ? String(tags[i].name || '') : '';
                    if (n && currentTagFilters[n]) {
                        return true;
                    }
                }
                return false;
            });
        }
    }

    var btns = qsa('.mp3-filter-btn', ctx.overlay);
    btns.forEach(function (btn) {
        var type = btn.getAttribute('data-filter');
        var badge = btn.querySelector('.mp3-filter-count');
        if (!badge) return;
        if (useServerCounts && null !== typeCounts[type] && undefined !== typeCounts[type]) {
            badge.textContent = typeCounts[type];
            return;
        }
        var filterFn = FILTER_MAP[type];
        badge.textContent = filterFn ? base.filter(filterFn).length : base.length;
    });
}

/**
 * Rendert die Tag-Liste in die Sidebar (#mp3-tag-filter-section, siehe
 * renderCategories() in categories.js -- der Container wird bei JEDER
 * Sidebar-Neuzeichnung frisch angelegt, deshalb ruft renderCategories()
 * ctx.refreshTagFilterSection() selbst am Ende wieder auf). Fruehere Version
 * lebte als Dropdown-Portal im Filter-Bar-Bereich, siehe CHANGELOG.
 */
export function updateTagFilterOptions() {
    if (!ctx.overlay) return;
    var menu = document.getElementById('mp3-tag-filter-section');
    if (!menu) return;

    var selected = {};
    var selectedNames = Object.keys(currentTagFilters);
    for (var si = 0; si < selectedNames.length; si++) {
        selected[selectedNames[si]] = true;
    }

    var unique = {};
    var tags = Array.isArray(currentTagCatalog) ? currentTagCatalog : [];

    if (!tags.length) {
        var lastLoadedFiles = ctx.getLastLoadedFiles();
        for (var i = 0; i < lastLoadedFiles.length; i++) {
            var ft = Array.isArray(lastLoadedFiles[i].system_tags) ? lastLoadedFiles[i].system_tags : [];
            for (var j = 0; j < ft.length; j++) {
                var n = String((ft[j] && ft[j].name) || '').trim();
                if (collectionTagToName(n)) continue;
                if (n) unique[n] = true;
            }
        }
        tags = Object.keys(unique).sort(function (a, b) {
            return a.localeCompare(b, 'de', { sensitivity: 'base' });
        }).map(function (n) {
            return { name: n, color: '#4a90d9' };
        });
    } else {
        // Der Katalog (currentTagCatalog) enthaelt ALLE je angelegten Tags,
        // auch nie oder nicht mehr benutzte -- der Sidebar-Filter soll nur
        // tatsaechlich zugewiesene zeigen (siehe SystemTagManager::
        // getTagCounts(), echte Server-Zaehlung ueber den gesamten Bestand,
        // nicht nur bereits geladene Seiten).
        tags = tags.filter(function (tag) {
            var name = String((tag && tag.name) || '').trim();
            return !!name && (currentTagCounts[name] || 0) > 0;
        });
    }

    var listHtml = '';
    var visibleNames = {};
    for (var k = 0; k < tags.length; k++) {
        var name = String((tags[k] && tags[k].name) || '').trim();
        var color = String((tags[k] && tags[k].color) || '#4a90d9');
        if (collectionTagToName(name)) continue;
        if (!name || visibleNames[name]) continue;
        visibleNames[name] = true;
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
            color = '#4a90d9';
        }

        listHtml += '<button type="button" class="mp3-tag-filter-option' + (selected[name] ? ' is-selected' : '') + '" data-tag-name="' + escAttr(name) + '">';
        listHtml += '<span class="mp3-tag-dot" style="background:' + escAttr(color.toLowerCase()) + '"></span>';
        listHtml += '<span class="mp3-tag-filter-option-label">' + escAttr(name) + '</span>';
        listHtml += '<i class="fa-solid ' + (selected[name] ? 'fa-square-check' : 'fa-square') + '"></i>';
        listHtml += '</button>';
    }
    if (!listHtml) {
        listHtml = '<div class="mp3-tag-filter-empty">' + t('mediaplace_no_tags_found') + '</div>';
    }

    var selectedCount = Object.keys(currentTagFilters).length;
    var headHtml = '<div class="mp3-tag-section-head mp3-sidebar-section-head">' +
        '<span class="mp3-tag-section-title mp3-sidebar-section-title"><i class="fa-solid fa-tags"></i> ' + t('mediaplace_tags_section_title') +
        (selectedCount ? ' <span class="mp3-tag-section-count">' + selectedCount + '</span>' : '') +
        '</span>' +
        (selectedCount ? '<button type="button" class="mp3-tag-filter-clear-btn" title="' + escAttr(t('mediaplace_deselect_all_action')) + '"><i class="fa-solid fa-xmark"></i></button>' : '') +
        '<button type="button" class="mp3-sidebar-section-toggle" data-section="tags" title="' + escAttr(t('mediaplace_toggle_section')) + '"><i class="fa-solid fa-chevron-down"></i></button>' +
        '</div>';
    menu.innerHTML = headHtml + '<div class="mp3-sidebar-section-body"><div class="mp3-tag-filter-list">' + listHtml + '</div></div>';

    // Clean up stale selected tags that are not visible anymore
    var dirty = false;
    Object.keys(currentTagFilters).forEach(function (name) {
        if (!visibleNames[name]) {
            delete currentTagFilters[name];
            dirty = true;
        }
    });
    if (dirty) {
        updateTagFilterOptions();
    }
}

// ---- Mobiles Filter-Dropdown (Compact-Modus) ----
// Fasst Typ-Filter + "Nur unbenutzte" in einem Dropdown zusammen (Tags
// bewusst NICHT mit drin -- eigener Sidebar-Abschnitt bleibt getrennt).
var FILTER_TYPE_OPTIONS = [
    { value: 'all', labelKey: 'mediaplace_filter_all', icon: null },
    { value: 'images', labelKey: 'mediaplace_filter_images', icon: 'fa-image' },
    { value: 'videos', labelKey: 'mediaplace_filter_videos', icon: 'fa-film' },
    { value: 'audio', labelKey: 'mediaplace_filter_audio', icon: 'fa-music' },
    { value: 'documents', labelKey: 'mediaplace_filter_documents', icon: 'fa-file-lines' },
    { value: 'other', labelKey: 'mediaplace_filter_other', icon: 'fa-ellipsis' }
];

function filterTypeLabel(type) {
    for (var i = 0; i < FILTER_TYPE_OPTIONS.length; i++) {
        if (FILTER_TYPE_OPTIONS[i].value === type) return t(FILTER_TYPE_OPTIONS[i].labelKey);
    }
    return t('mediaplace_filter_all');
}

export function updateFilterDropdownLabel() {
    var label = qs('.mp3-filter-dropdown-label', ctx.overlay);
    if (!label) return;
    var text = filterTypeLabel(currentFilter);
    if (ctx.getCanFilterUnused() && unusedOnlyFilter) text += ' ' + t('mediaplace_plus_unused');
    label.textContent = text;
}

function buildFilterDropdownMenuHtml() {
    var html = '';
    for (var i = 0; i < FILTER_TYPE_OPTIONS.length; i++) {
        var opt = FILTER_TYPE_OPTIONS[i];
        var active = currentFilter === opt.value;
        var optLabel = t(opt.labelKey);
        html += '<button type="button" class="mp3-filter-dropdown-option' + (active ? ' is-selected' : '') + '" data-filter="' + escAttr(opt.value) + '">' +
            (opt.icon ? '<i class="fa-solid ' + opt.icon + ' mp3-filter-dropdown-option-icon"></i>' : '<span class="mp3-filter-dropdown-option-spacer"></span>') +
            '<span class="mp3-filter-dropdown-option-label">' + escAttr(optLabel) + '</span>' +
            (active ? '<i class="fa-solid fa-check mp3-filter-dropdown-option-check"></i>' : '') +
            '</button>';
    }
    if (ctx.getCanFilterUnused()) {
        html += '<div class="mp3-filter-dropdown-separator"></div>';
        html += '<button type="button" class="mp3-filter-dropdown-unused-option' + (unusedOnlyFilter ? ' is-selected' : '') + '">' +
            '<i class="fa-solid fa-trash-can mp3-filter-dropdown-option-icon"></i>' +
            '<span class="mp3-filter-dropdown-option-label">' + t('mediaplace_unused_only') + '</span>' +
            '<i class="fa-solid ' + (unusedOnlyFilter ? 'fa-square-check' : 'fa-square') + ' mp3-filter-dropdown-option-check"></i>' +
            '</button>';
    }
    return html;
}

export function setFilterDropdownMenuOpen(open) {
    if (!ctx.overlay) return;
    var wrap = qs('.mp3-filter-dropdown-wrap', ctx.overlay);
    var toggle = qs('.mp3-filter-dropdown-toggle', ctx.overlay);
    var portal = document.getElementById('mp3-filter-dropdown-menu-portal');
    if (!wrap) return;
    wrap.classList.toggle('is-open', !!open);
    if (!portal) return;

    if (!open) {
        portal.classList.remove('mp3-filter-dropdown-menu-portal-open');
        return;
    }
    if (!toggle) return;

    portal.innerHTML = buildFilterDropdownMenuHtml();
    portal.classList.add('mp3-filter-dropdown-menu-portal-open');
    var rect = toggle.getBoundingClientRect();
    var menuW = Math.max(portal.offsetWidth, 200);
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
    var top = rect.bottom + 6;
    var menuH = portal.offsetHeight;
    if (top + menuH > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuH - 6);
    }
    portal.style.left = left + 'px';
    portal.style.top = top + 'px';
}

// Setzt den Typ-Filter, egal ob per Pill (breiter Screen) oder per
// Dropdown-Option (Compact-Modus) ausgeloest -- haelt beide UIs synchron,
// damit ein Wechsel der Fensterbreite mitten in der Session nicht die
// falsche Auswahl anzeigt.
export function applyTypeFilter(type) {
    currentFilter = type || 'all';
    qsa('.mp3-filter-btn', ctx.overlay).forEach(function (b) {
        if (!b.classList.contains('mp3-unused-filter-btn')) {
            b.classList.toggle('mp3-filter-active', b.getAttribute('data-filter') === currentFilter);
        }
    });
    updateFilterDropdownLabel();
    // Server neu abfragen statt nur die bereits geladene(n) Seite(n)
    // umzusortieren -- lastLoadedFiles enthaelt sonst evtl. gar keine
    // Treffer des neu gewaehlten Typs (siehe buildMediaEndpoint(),
    // filter[types]). currentCat aendert sich dabei nicht, nur der
    // Typ-Filter -- loadFiles(reset=true) baut trotzdem die Liste neu auf.
    ctx.loadFiles(ctx.getCurrentCat(), true);
}

// Analog zu applyTypeFilter(): gemeinsame Logik fuer Pill-Button und
// Dropdown-Option, inkl. Nachladen des Unbenutzt-Status fuer bereits
// geladene, aber noch nicht geprueften Dateien (siehe loadFiles()).
export function toggleUnusedOnlyFilter() {
    unusedOnlyFilter = !unusedOnlyFilter;
    qsa('.mp3-unused-filter-btn', ctx.overlay).forEach(function (b) {
        b.classList.toggle('mp3-filter-active', unusedOnlyFilter);
    });
    updateFilterDropdownLabel();

    if (unusedOnlyFilter) {
        var uncheckedFilenames = ctx.getLastLoadedFiles()
            .map(function (f) { return f.filename; })
            .filter(function (fn) { return fn && !(fn in unusedStatusCache); });
        if (uncheckedFilenames.length) {
            apiCheckUnusedMedia(uncheckedFilenames)
                .then(function (unusedList) {
                    var unusedSet = {};
                    for (var u = 0; u < unusedList.length; u++) unusedSet[unusedList[u]] = true;
                    for (var j = 0; j < uncheckedFilenames.length; j++) {
                        unusedStatusCache[uncheckedFilenames[j]] = !!unusedSet[uncheckedFilenames[j]];
                    }
                    ctx.refreshDisplay();
                })
                .catch(function () {});
        }
    }
    ctx.refreshDisplay();
}

export function toggleTagFilter(name) {
    if (!name) return;
    if (currentTagFilters[name]) {
        delete currentTagFilters[name];
    } else {
        currentTagFilters[name] = true;
    }
}

export function clearTagFilters() {
    currentTagFilters = {};
}

/**
 * @return {list<string>} Namen der aktuell ausgewaehlten Tags -- genutzt von
 *   core.js fuer den serverseitigen Filter (filter[tags], siehe
 *   buildBaseFilterParams()/mediaListFetcher()/currentTypeCountsKey()).
 */
export function getSelectedTagFilters() {
    return Object.keys(currentTagFilters);
}

/** Setzt allen Filter-/Sortier-State fuer eine neue open()-Sitzung zurueck. */
export function resetFilterState(options) {
    var VALID_OPEN_FILTERS = ['all', 'images', 'videos', 'audio', 'documents', 'other'];
    currentFilter = (options.filter && VALID_OPEN_FILTERS.indexOf(options.filter) !== -1) ? options.filter : 'all';
    currentTagFilters = {};
    currentTagCatalog = [];
    currentTagCounts = {};
    unusedOnlyFilter = false;
    unusedStatusCache = {};
    currentSort = localStorage.getItem('mp3_sort') || 'date_desc';
}

export function getCurrentFilter() {
    return currentFilter;
}

export function getCurrentSort() {
    return currentSort;
}

export function setCurrentSort(value) {
    currentSort = value;
    localStorage.setItem('mp3_sort', currentSort);
}

export function getCurrentTagCatalog() {
    return currentTagCatalog;
}

export function setCurrentTagCatalog(v) {
    currentTagCatalog = v;
}

export function setCurrentTagCounts(v) {
    currentTagCounts = (v && typeof v === 'object') ? v : {};
}

export function getUnusedOnlyFilter() {
    return unusedOnlyFilter;
}

/** Objekt-Referenz -- Aufrufer duerfen direkt hineinschreiben (in-place mutiert). */
export function getUnusedStatusCache() {
    return unusedStatusCache;
}
