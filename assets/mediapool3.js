/**
 * MediaPlace – Overlay Media Picker
 * Uses FriendsOfREDAXO/api REST addon for data.
 * Image thumbnails via REDAXO Media Manager (same pattern as MediaNeo).
 */
(function () {
    'use strict';

    var DEFAULT_MEDIA_PER_PAGE = 30;
    var MEDIA_PER_PAGE_OPTIONS = [30, 50, 100, 250];
    var DEFAULT_TILE_SIZE = 220;
    var TILE_SIZE_MIN = 140;
    var TILE_SIZE_MAX = 360;

    // ---- State ----
    var overlay, sidebar, grid, gridWrap, searchInput, statusBar, breadcrumb, detailPanel, multiFooter, batchFooter;
    var scrollPillTrack, scrollPillThumb;
    var lightboxLayer, lightboxImage, lightboxCaption;
    var currentCat = -1;
    var onSelect = null;
    var onMultiSelect = null;  // callback for multi-select mode: receives array of filenames
    var multiMode = false;     // true when opened with multiple: true
    var multiSelected = {};    // filename → true (selected files in multi mode)
    var collectionDragSelected = {}; // filename -> true (normal mode batch selection for drag to collection)
    var built = false;
    // Wird bei jedem open()/close() erhoeht -- laufende loadFiles()/
    // loadCategories()-Requests aus einer VORHERIGEN Session pruefen das vor
    // dem Anwenden ihres Ergebnisses und brechen sonst ab. Ohne das konnte
    // ein Picker, der nicht sauber ueber close() beendet wurde (z.B. Klick auf
    // den "Medienpool"-Menuepunkt waehrend der Picker noch offen ist -- der
    // Menuepunkt ruft MP3.open() erneut per JS auf, kein echter Seitenwechsel,
    // siehe PAGES_PREPARED in boot.php), zwei parallel laufende Ladevorgaenge
    // erzeugen, die sich gegenseitig ueberschreiben und den Aufbau spuerbar
    // verlangsamen.
    var loadSessionId = 0;
    var MP3_STALE_SESSION = {};
    var catCache = {};     // id → { name, hasChildren, parent_id, children: [...], loaded: bool }
    var catPath = [];      // breadcrumb path: [{ id, name }, ...]
    var lastLoadedFiles = [];  // raw API result for client-side filter/sort
    var currentFilter = 'all'; // all | images | videos | audio | documents | other
    // Harte Endungs-Beschraenkung ueber MP3.open(cb, {allowedExtensions:[...]})
    // -- anders als currentFilter (nur Start-Tab, jederzeit umschaltbar) blendet
    // dies passende Dateien komplett aus dem Grid aus UND blockiert die Auswahl,
    // siehe applyFilterSort()/isFileSelectable(). null = keine Einschraenkung.
    var allowedExtensions = null;
    var currentTagFilters = {}; // tagName -> true
    var currentTagCatalog = []; // [{name,color}]
    // "Nur unbenutzte Medien"-Filter (eigenes Recht, siehe MediaPermission::
    // hasUnusedFilterAccess() + data-can-filter-unused am #mp3-root). Unabhaengig
    // vom Typ-/Tag-Filter kombinierbar, siehe applyFilterSort(). unusedStatusCache
    // wird inkrementell pro geladener Seite befuellt (loadFiles()), true = bekannt
    // unbenutzt, false = bekannt in Verwendung, Key fehlt = noch nicht geprueft.
    var canFilterUnused = false;
    // Kategorie 0 ("kein Ordner"/"Medienpool"-Wurzel) braucht ein eigenes
    // hasCategoryPerm(0), das viele auf einzelne Kategorien eingeschraenkte
    // User nicht haben (siehe MediaPermission::hasCategoryAccess(0) +
    // data-can-access-root-category am #mp3-root). Steuert, ob der
    // "Medienpool"-Sidebar-Link anklickbar ist -- ohne dieses Recht landete
    // man sonst zuverlaessig in einem 403, den loadFiles() zwar inzwischen
    // sauber auf "Alle Medien" abfaengt, aber besser gar nicht erst anbieten.
    var canAccessRootCategory = true;
    // rex_url::media() (PHP, boot.php -> #mp3-root data-media-base-url) --
    // Basis-URL fuer Original-Mediendateien (SVGs im Grid/Detail-Panel,
    // siehe mediaThumbSrc()), installationsunabhaengig berechnet statt per
    // relativem Pfad geraten. Siehe SKILL.md, Punkt zu absoluten "/media/"-Pfaden.
    var mediaBaseUrl = '';
    var unusedOnlyFilter = false;
    var unusedStatusCache = {};
    var currentSort = 'date_desc'; // date_desc | date_asc | filename_asc | filename_desc | title_asc | title_desc
    var mediaPage = 1;
    var mediaPerPage = DEFAULT_MEDIA_PER_PAGE;
    var mediaTotal = 0;
    var mediaHasMore = false;
    var mediaLoading = false;
    var mediaQuery = '';
    var mediaForceCacheTokens = {}; // filename -> token for forced cache bust after replace
    var selectedFile = null; // currently selected filename for detail view
    var viewMode = 'grid'; // grid | list | mediawall
    var COLLECTION_TAG_PREFIX = 'collection:';
    // Feature-Toggles (Einstellungsseite), gelesen von #mp3-root in build() --
    // gate Tagging-UI (System-Tags-Feld, Sidebar-Tag-Filter) bzw. Sammlungen-UI
    // (Sidebar-Sektion, Merken-Button, Drag&Drop) unabhaengig voneinander.
    var features = { tagging: true, collections: true, metainfoEditing: false, uploadResize: false };
    var uploadResizeWidth = 2000;
    var uploadResizeHeight = 2000;
    var activeCollectionId = null;
    var darkModeEnabled = false; // true = dark mode, false = light mode
    var mediaLinkPickFieldKey = null; // active media_link field key while picking from file grid
    var fullscreenMode = false;
    var lightboxOpen = false;
    var metainfoCanvasOpen = false;
    var metainfoCanvasFilename = null;
    var metainfoPickTarget = null; // { type: 'media', input } | { type: 'medialist', select, listId } while picking from the grid for a classic widget inside the metainfo canvas
    // Fokuspunkt-Canvas (Integration mit dem separaten focuspoint-Addon, nur
    // aktiv wenn canFocuspoint -- siehe #mp3-root data-focuspoint-available).
    // Speicherung laeuft bewusst weiter ueber das klassische Metainfo-Feld
    // (rex_media.med_focuspoint o.ae.), nicht ueber med_json_data.
    var canFocuspoint = false;
    var focuspointCanvasOpen = false;
    var focuspointFilename = null;
    var focuspointFields = []; // Liste der Fokuspunkt-Metainfo-Felder (meist nur ["med_focuspoint"])
    var focuspointTypes = {}; // typname -> {label, meta:[feldnamen]}
    var focuspointCurrent = {}; // feldname -> [x,y] (beim Oeffnen geladen)
    var focuspointActiveField = null;
    var focuspointActiveType = '';
    var focuspointPos = [50, 50]; // aktuelle [x,y] fuer focuspointActiveField
    var pageScrollTopBeforeOpen = 0;
    var pageMainScrollTopBeforeOpen = 0;
    var scrollPinRAF = null;
    var scrollPinDeadline = 0;
    var categorySearchTerm = '';

    // ---- Aus mediapool3-api.js / mediapool3-helpers.js eingebundene Funktionen ----
    // (Alias-Pattern: Funktionsreferenzen, kein State-Sharing noetig, siehe dortige Header-Kommentare)
    var getCategoriesApiUrl = MP3Core.api.getCategoriesApiUrl;
    var apiCheckUnusedMedia = MP3Core.api.apiCheckUnusedMedia;
    var apiFetchAllCategoriesFlat = MP3Core.api.apiFetchAllCategoriesFlat;
    var apiMoveCategory = MP3Core.api.apiMoveCategory;
    var getTagsApiUrl = MP3Core.api.getTagsApiUrl;
    var apiCollectionCatalogAction = MP3Core.api.apiCollectionCatalogAction;
    var apiLoadSystemTagsForFiles = MP3Core.api.apiLoadSystemTagsForFiles;
    var apiFetch = MP3Core.api.apiFetch;
    var apiFetchRaw = MP3Core.api.apiFetchRaw;
    var apiFetchMediaList = MP3Core.api.apiFetchMediaList;
    var apiUpload = MP3Core.api.apiUpload;
    var apiUploadJsonOrError = MP3Core.api.apiUploadJsonOrError;
    var apiUploadInit = MP3Core.api.apiUploadInit;
    var apiUploadChunk = MP3Core.api.apiUploadChunk;
    var apiUploadFinalize = MP3Core.api.apiUploadFinalize;
    var apiUploadAbort = MP3Core.api.apiUploadAbort;
    var apiUploadChunked = MP3Core.api.apiUploadChunked;
    var apiUpdate = MP3Core.api.apiUpdate;
    var apiDelete = MP3Core.api.apiDelete;
    var getJsonApiUrl = MP3Core.api.getJsonApiUrl;
    var apiLoadJsonMetainfo = MP3Core.api.apiLoadJsonMetainfo;
    var apiSaveJsonMetainfo = MP3Core.api.apiSaveJsonMetainfo;
    var apiLoadMetainfoForm = MP3Core.api.apiLoadMetainfoForm;
    var apiSaveMetainfoForm = MP3Core.api.apiSaveMetainfoForm;
    var apiCreateCategory = MP3Core.api.apiCreateCategory;
    var resolveFolderCategories = MP3Core.api.resolveFolderCategories;
    var apiRenameCategory = MP3Core.api.apiRenameCategory;
    var apiDeleteCategory = MP3Core.api.apiDeleteCategory;
    var apiReplaceFile = MP3Core.api.apiReplaceFile;
    var apiLoadFocuspointInfo = MP3Core.api.apiLoadFocuspointInfo;
    var apiSaveFocuspoint = MP3Core.api.apiSaveFocuspoint;
    var t = MP3Core.i18n.t;
    var qs = MP3Core.helpers.qs;
    var qsa = MP3Core.helpers.qsa;
    var formatBytes = MP3Core.helpers.formatBytes;
    var isImage = MP3Core.helpers.isImage;
    var fileIcon = MP3Core.helpers.fileIcon;
    var escAttr = MP3Core.helpers.escAttr;
    var formatDate = MP3Core.helpers.formatDate;
    var getFilenameExtension = MP3Core.helpers.getFilenameExtension;
    var normalizeReplacementExtension = MP3Core.helpers.normalizeReplacementExtension;
    var normalizeMediaPerPage = MP3Core.helpers.normalizeMediaPerPage;
    var normalizeTileSize = MP3Core.helpers.normalizeTileSize;
    var extensionsCompatible = MP3Core.helpers.extensionsCompatible;
    var getReplacementAcceptForFilename = MP3Core.helpers.getReplacementAcceptForFilename;
    var getMediaCacheToken = MP3Core.helpers.getMediaCacheToken;
    var withMediaCacheBuster = MP3Core.helpers.withMediaCacheBuster;
    var mediaThumbSrc = MP3Core.helpers.mediaThumbSrc;
    var deepClone = MP3Core.helpers.deepClone;
    var isObj = MP3Core.helpers.isObj;
    var normalizeCompare = MP3Core.helpers.normalizeCompare;
    var hasChanged = MP3Core.helpers.hasChanged;
    var isImageFile = MP3Core.helpers.isImageFile;
    var isResizableImageType = MP3Core.helpers.isResizableImageType;
    var resizeImageFile = MP3Core.helpers.resizeImageFile;

    // ---- Helpers ----


    // Media Wall scrollt seit der Masonry-Umstellung vertikal wie alle anderen
    // Ansichten -- das eigene horizontale Scroll-Pill-Widget (#mp3-scroll-pill)
    // und die frueher hier verzweigte scrollLeft/scrollWidth-Pagination sind
    // dadurch obsolet. isMediaWallMode() bleibt als zentraler Schalter stehen
    // (statt jede Aufrufstelle einzeln zu aendern) und liefert bewusst immer
    // false, bis das Widget entfernt oder ein neuer horizontaler Modus kommt.
    function isMediaWallMode() {
        return false;
    }

    function updateScrollPill() {
        if (!gridWrap || !scrollPillTrack || !scrollPillThumb) return;

        var active = isMediaWallMode();
        scrollPillTrack.style.display = active ? '' : 'none';
        if (!active) return;

        var maxScroll = Math.max(0, gridWrap.scrollWidth - gridWrap.clientWidth);
        var trackW = Math.max(1, scrollPillTrack.clientWidth);
        var minThumbW = 44;
        var thumbW = maxScroll > 0
            ? Math.max(minThumbW, Math.round(trackW * (gridWrap.clientWidth / Math.max(gridWrap.scrollWidth, 1))))
            : trackW;

        scrollPillThumb.style.width = thumbW + 'px';

        var maxThumbPos = Math.max(0, trackW - thumbW);
        var thumbPos = maxScroll > 0 ? Math.round((gridWrap.scrollLeft / maxScroll) * maxThumbPos) : 0;
        scrollPillThumb.style.transform = 'translateX(' + thumbPos + 'px)';

        scrollPillTrack.classList.toggle('is-disabled', maxScroll <= 0);
    }

    function focusWithoutScroll(el) {
        if (!el || typeof el.focus !== 'function') return;

        var doc = document.scrollingElement || document.documentElement;
        var beforeTop = doc ? doc.scrollTop : 0;
        var pageMain = qs('.rex-page-main-inner');
        var beforeMainTop = pageMain ? pageMain.scrollTop : 0;

        try {
            el.focus({ preventScroll: true });
        } catch (e) {
            el.focus();
        }

        if (doc && doc.scrollTop !== beforeTop) {
            doc.scrollTop = beforeTop;
        }
        if (pageMain && pageMain.scrollTop !== beforeMainTop) {
            pageMain.scrollTop = beforeMainTop;
        }
    }

    /**
     * Haelt die Scrollposition des Hintergrunds fuer eine kurze Zeit aktiv fest.
     * Ein einmaliges Zuruecksetzen reicht nicht: manche Backend-Themes/Browser
     * verschieben den Scroll asynchron (Fokus, Layout-Shift durch verschwindende
     * Scrollbar bei overflow:hidden, o.ae.) auch noch nach dem ersten Restore.
     */
    function pinScrollPosition(durationMs) {
        var doc = document.scrollingElement || document.documentElement;
        var pageMain = qs('.rex-page-main-inner');
        var targetDoc = pageScrollTopBeforeOpen;
        var targetMain = pageMainScrollTopBeforeOpen;
        scrollPinDeadline = Date.now() + (durationMs || 500);

        function step() {
            if (doc && doc.scrollTop !== targetDoc) {
                doc.scrollTop = targetDoc;
            }
            if (pageMain && pageMain.scrollTop !== targetMain) {
                pageMain.scrollTop = targetMain;
            }
            if (Date.now() < scrollPinDeadline) {
                scrollPinRAF = requestAnimationFrame(step);
            } else {
                scrollPinRAF = null;
            }
        }

        if (scrollPinRAF) {
            cancelAnimationFrame(scrollPinRAF);
        }
        step();
    }

    function stopScrollPin() {
        if (scrollPinRAF) {
            cancelAnimationFrame(scrollPinRAF);
            scrollPinRAF = null;
        }
        scrollPinDeadline = 0;
    }









    // Global setDarkMode function (must be accessible from click handlers)
    function setDarkMode(enabled) {
        darkModeEnabled = !!enabled;
        if (overlay) {
            overlay.classList.toggle('mp3-dark-mode', darkModeEnabled);
        }
        localStorage.setItem('mp3_dark_mode', darkModeEnabled ? '1' : '0');
        var darkToggleBtn = overlay ? qs('.mp3-dark-mode-toggle', overlay) : null;
        if (darkToggleBtn) {
            darkToggleBtn.classList.toggle('mp3-dark-mode-active', darkModeEnabled);
        }
    }




    /**
     * Kachelgroessen-Slider steuert --mp3-tile-size, genutzt sowohl von
     * .mp3-view-mediawall (columns:) als auch von der Kachel-Grundansicht
     * (grid-template-columns: minmax(), siehe mediapool3.css) -- in beiden
     * Faellen bestimmt er die Mindest-/Zielbreite einer Kachel. In der
     * Listenansicht hat er keine Wirkung (eigenes, festes Tabellen-Layout)
     * und wird dort ausgeblendet.
     */
    function updateTileSizeVisibility() {
        var control = qs('#mp3-tile-size-control', overlay);
        if (control) control.style.display = (viewMode !== 'list') ? '' : 'none';
    }

    // Analog zur Sidebar-Breite (SIDEBAR_MIN/MAX in initDragResize()) --
    // eigene Konstanten, weil Detail-Panel und Sidebar unabhaengig voneinander
    // sinnvolle Grenzen haben. Muss von showDetail()/hideDetail() aus
    // aufrufbar sein (Detail-Panel wird dynamisch geoeffnet/geschlossen,
    // anders als die immer sichtbare Sidebar) -- deshalb modul-weite Funktion
    // statt in initDragResize() eingeschlossen.
    var DETAIL_MIN_WIDTH = 280;
    var DETAIL_MAX_WIDTH = 640;
    function applyDetailWidth() {
        if (!detailPanel || !overlay || overlay.classList.contains('mp3-compact')) return;
        var saved = parseInt(localStorage.getItem('mp3_detail_width'), 10);
        if (!isNaN(saved)) {
            detailPanel.style.width = Math.max(DETAIL_MIN_WIDTH, Math.min(saved, DETAIL_MAX_WIDTH)) + 'px';
        }
    }

    function sanitizeCollectionName(name) {
        var next = String(name || '').trim();
        if (!next) return '';
        next = next.replace(/^collection\s*:\s*/i, '');
        return next.slice(0, 60);
    }

    function collectionNameToTag(name) {
        var clean = sanitizeCollectionName(name);
        if (!clean) return '';
        return COLLECTION_TAG_PREFIX + clean;
    }

    function collectionTagToName(tagName) {
        var raw = String(tagName || '');
        if (raw.toLowerCase().indexOf(COLLECTION_TAG_PREFIX) !== 0) {
            return '';
        }
        return sanitizeCollectionName(raw.substring(COLLECTION_TAG_PREFIX.length));
    }

    function normalizeSystemTags(tags) {
        var list = Array.isArray(tags) ? tags : [];
        var byName = {};
        for (var i = 0; i < list.length; i++) {
            var tag = list[i] || {};
            var name = String(tag.name || '').trim();
            if (!name) continue;
            if (!byName[name]) {
                byName[name] = {
                    name: name,
                    color: /^#[0-9a-fA-F]{6}$/.test(String(tag.color || '')) ? String(tag.color).toLowerCase() : '#4a90d9'
                };
            }
        }
        return Object.keys(byName).map(function (k) { return byName[k]; });
    }

    function isCollectionTagName(tagName) {
        return String(tagName || '').toLowerCase().indexOf(COLLECTION_TAG_PREFIX) === 0;
    }

    function splitSystemTags(tags) {
        var normalized = normalizeSystemTags(tags);
        var normal = [];
        var collections = [];
        for (var i = 0; i < normalized.length; i++) {
            if (isCollectionTagName(normalized[i].name)) {
                collections.push(normalized[i]);
            } else {
                normal.push(normalized[i]);
            }
        }
        return { normal: normal, collections: collections };
    }

    function mergeUniqueSystemTags(tagsA, tagsB) {
        return normalizeSystemTags((Array.isArray(tagsA) ? tagsA : []).concat(Array.isArray(tagsB) ? tagsB : []));
    }

    function getCollectionTagColor(name) {
        var targetTag = collectionNameToTag(name);
        if (!targetTag) return '#4a90d9';
        for (var i = 0; i < currentTagCatalog.length; i++) {
            var item = currentTagCatalog[i] || {};
            if (String(item.name || '') === targetTag && /^#[0-9a-fA-F]{6}$/.test(String(item.color || ''))) {
                return String(item.color).toLowerCase();
            }
        }
        return '#4a90d9';
    }

    function getCollectionsForCurrentCategory() {
        var map = {};

        for (var i = 0; i < currentTagCatalog.length; i++) {
            var tagItem = currentTagCatalog[i] || {};
            var name = collectionTagToName(tagItem.name || '');
            if (!name) continue;
            if (!map[name]) {
                map[name] = {
                    id: name,
                    name: name,
                    color: /^#[0-9a-fA-F]{6}$/.test(String(tagItem.color || '')) ? String(tagItem.color).toLowerCase() : '#4a90d9',
                    filesCount: 0
                };
            }
        }

        for (var j = 0; j < lastLoadedFiles.length; j++) {
            var tags = normalizeSystemTags(lastLoadedFiles[j].system_tags || []);
            for (var k = 0; k < tags.length; k++) {
                var collName = collectionTagToName(tags[k].name);
                if (!collName) continue;
                if (!map[collName]) {
                    map[collName] = {
                        id: collName,
                        name: collName,
                        color: /^#[0-9a-fA-F]{6}$/.test(String(tags[k].color || '')) ? String(tags[k].color).toLowerCase() : '#4a90d9',
                        filesCount: 0
                    };
                }
                map[collName].filesCount += 1;
            }
        }

        if (activeCollectionId && !map[activeCollectionId]) {
            map[activeCollectionId] = {
                id: activeCollectionId,
                name: activeCollectionId,
                color: '#4a90d9',
                filesCount: 0
            };
        }

        return Object.keys(map)
            .map(function (key) { return map[key]; })
            .sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' });
            });
    }

    function getLoadedFilesForCollection(name) {
        var tag = collectionNameToTag(name);
        if (!tag) return [];
        return lastLoadedFiles.filter(function (f) {
            var tags = normalizeSystemTags(f.system_tags || []);
            for (var i = 0; i < tags.length; i++) {
                if (tags[i].name === tag) return true;
            }
            return false;
        });
    }

    function updateCachedFileSystemTags(filename, tags) {
        var normalized = normalizeSystemTags(tags);
        for (var i = 0; i < lastLoadedFiles.length; i++) {
            if (String(lastLoadedFiles[i].filename || '') === String(filename || '')) {
                lastLoadedFiles[i].system_tags = normalized;
                break;
            }
        }
    }

    function withCollectionMembership(tags, collectionName, enable) {
        var list = normalizeSystemTags(tags);
        var targetTag = collectionNameToTag(collectionName);
        if (!targetTag) return list;

        var found = false;
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].name || '') === targetTag) {
                found = true;
                if (!enable) {
                    list.splice(i, 1);
                }
                break;
            }
        }

        if (enable && !found) {
            list.push({
                name: targetTag,
                color: getCollectionTagColor(collectionName)
            });
        }

        return list;
    }

    function renameCollectionOnLoadedFiles(oldName, newName) {
        var files = getLoadedFilesForCollection(oldName);
        if (!files.length) return Promise.resolve(0);

        var updated = 0;
        var jobs = files.map(function (file) {
            var tags = withCollectionMembership(file.system_tags || [], oldName, false);
            tags = withCollectionMembership(tags, newName, true);
            return apiSaveJsonMetainfo(file.filename, { __system_tags: tags }).then(function () {
                updateCachedFileSystemTags(file.filename, tags);
                updated += 1;
            });
        });

        return Promise.all(jobs).then(function () { return updated; });
    }

    function deleteCollectionOnLoadedFiles(name) {
        var files = getLoadedFilesForCollection(name);
        if (!files.length) return Promise.resolve(0);

        var updated = 0;
        var jobs = files.map(function (file) {
            var tags = withCollectionMembership(file.system_tags || [], name, false);
            return apiSaveJsonMetainfo(file.filename, { __system_tags: tags }).then(function () {
                updateCachedFileSystemTags(file.filename, tags);
                updated += 1;
            });
        });

        return Promise.all(jobs).then(function () { return updated; });
    }

    function setFileCollectionMembership(filename, collectionName, enable) {
        if (!filename || !collectionName) {
            return Promise.resolve(false);
        }

        return apiLoadJsonMetainfo(filename)
            .then(function (meta) {
                var tags = withCollectionMembership(meta.system_tags || [], collectionName, enable);
                return apiSaveJsonMetainfo(filename, { __system_tags: tags })
                    .then(function () {
                        updateCachedFileSystemTags(filename, tags);
                        if (selectedFile === filename) {
                            detailOriginalSystemTags = deepClone(tags);
                        }
                        return true;
                    });
            });
    }

    function getActiveCollection() {
        if (!activeCollectionId) {
            return null;
        }

        var list = getCollectionsForCurrentCategory();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(activeCollectionId)) {
                return list[i];
            }
        }

        return {
            id: activeCollectionId,
            name: activeCollectionId,
            filesCount: 0,
            color: '#4a90d9'
        };
    }

    function setActiveCollection(id) {
        activeCollectionId = id ? String(id) : null;
        if (activeCollectionId) {
            localStorage.setItem('mp3_active_collection', activeCollectionId);
        } else {
            localStorage.removeItem('mp3_active_collection');
        }
    }

    function isFileInActiveCollection(filename) {
        var col = getActiveCollection();
        if (!col || !filename) return false;
        var file = null;
        for (var i = 0; i < lastLoadedFiles.length; i++) {
            if (String(lastLoadedFiles[i].filename || '') === String(filename)) {
                file = lastLoadedFiles[i];
                break;
            }
        }
        if (!file) return false;
        var tags = normalizeSystemTags(file.system_tags || []);
        var targetTag = collectionNameToTag(col.name);
        for (var j = 0; j < tags.length; j++) {
            if (String(tags[j].name || '') === targetTag) {
                return true;
            }
        }
        return false;
    }

    function toggleFileInActiveCollection(filename) {
        var col = getActiveCollection();
        if (!col || !filename) return Promise.resolve(false);
        var next = !isFileInActiveCollection(filename);
        return setFileCollectionMembership(filename, col.name, next)
            .then(function () { return next; });
    }

    function createCollection(catId, name) {
        var clean = sanitizeCollectionName(name);
        if (!clean) return Promise.resolve(null);
        var list = getCollectionsForCurrentCategory();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].name || '').toLowerCase() === clean.toLowerCase()) {
                return Promise.resolve(null);
            }
        }

        return apiCollectionCatalogAction('collection_create', {
            name: collectionNameToTag(clean),
            color: '#4a90d9'
        }).then(function (json) {
            currentTagCatalog = Array.isArray(json.catalog) ? json.catalog : currentTagCatalog;
            return { id: clean, name: clean, filesCount: 0, color: '#4a90d9' };
        });
    }

    function renameCollection(catId, colId, name) {
        var oldName = sanitizeCollectionName(colId);
        var clean = sanitizeCollectionName(name);
        if (!oldName || !clean) return Promise.resolve(0);
        if (oldName.toLowerCase() === clean.toLowerCase()) return Promise.resolve(0);

        return apiCollectionCatalogAction('collection_rename', {
            old_name: collectionNameToTag(oldName),
            new_name: collectionNameToTag(clean)
        }).then(function (json) {
            currentTagCatalog = Array.isArray(json.catalog) ? json.catalog : currentTagCatalog;
            var updated = parseInt(json.affected_files, 10) || 0;

            for (var i = 0; i < lastLoadedFiles.length; i++) {
                var tags = withCollectionMembership(lastLoadedFiles[i].system_tags || [], oldName, false);
                tags = withCollectionMembership(tags, clean, true);
                lastLoadedFiles[i].system_tags = tags;
            }

            if (String(activeCollectionId).toLowerCase() === oldName.toLowerCase()) {
                setActiveCollection(clean);
            }

            return updated;
        });
    }

    function deleteCollection(catId, colId) {
        var name = sanitizeCollectionName(colId);
        if (!name) return Promise.resolve(0);

        return apiCollectionCatalogAction('collection_delete', {
            name: collectionNameToTag(name)
        }).then(function (json) {
            currentTagCatalog = Array.isArray(json.catalog) ? json.catalog : currentTagCatalog;
            var updated = parseInt(json.affected_files, 10) || 0;

            for (var i = 0; i < lastLoadedFiles.length; i++) {
                lastLoadedFiles[i].system_tags = withCollectionMembership(lastLoadedFiles[i].system_tags || [], name, false);
            }

            if (String(activeCollectionId).toLowerCase() === name.toLowerCase()) {
                setActiveCollection(null);
            }

            return updated;
        });
    }

    function renderCollectionsSection() {
        var list = getCollectionsForCurrentCategory();
        var html = '<div class="mp3-collections-wrap">';
        html += '<div class="mp3-collections-head">';
        html += '<span class="mp3-collections-title"><i class="fa-solid fa-photo-film"></i> ' + t('mediaplace_collections') + '</span>';
        html += '<button type="button" class="mp3-collection-add-btn" title="' + escAttr(t('mediaplace_create_collection')) + '"><i class="fa-solid fa-plus"></i></button>';
        html += '</div>';

        if (!list.length) {
            html += '<div class="mp3-collection-empty">' + t('mediaplace_no_collections_yet') + '</div>';
        } else {
            html += '<div class="mp3-collections-list">';
            for (var i = 0; i < list.length; i++) {
                var col = list[i];
                html += '<div class="mp3-collection-row">';
                html += '<a class="mp3-collection' + (String(activeCollectionId || '').toLowerCase() === String(col.id || '').toLowerCase() ? ' mp3-collection-active' : '') + '" data-collection-id="' + escAttr(col.id) + '">';
                html += '<i class="fa-solid fa-compact-disc"></i> ' + escAttr(col.name) + ' <span class="mp3-collection-count">' + (parseInt(col.filesCount, 10) || 0) + '</span>';
                html += '</a>';
                html += '<button type="button" class="mp3-collection-rename-btn" data-collection-id="' + escAttr(col.id) + '" title="' + escAttr(t('mediaplace_rename_collection')) + '"><i class="fa-solid fa-pen"></i></button>';
                html += '<button type="button" class="mp3-collection-delete-btn" data-collection-id="' + escAttr(col.id) + '" title="' + escAttr(t('mediaplace_delete_collection')) + '"><i class="fa-solid fa-trash-can"></i></button>';
                html += '</div>';
            }
            html += '</div>';
        }

        if (activeCollectionId) {
            html += '<div class="mp3-collection-help">' + t('mediaplace_collection_help_active', { name: escAttr(activeCollectionId) }) + '</div>';
        } else {
            html += '<div class="mp3-collection-help">' + t('mediaplace_collection_help_inactive') + '</div>';
        }

        html += '</div>';
        return html;
    }

    function applyCollectionFilter(files) {
        var col = getActiveCollection();
        if (!col || !col.name) {
            return files;
        }
        var targetTag = collectionNameToTag(col.name);
        if (!targetTag) return files;
        return files.filter(function (f) {
            var tags = normalizeSystemTags(f.system_tags || []);
            for (var i = 0; i < tags.length; i++) {
                if (String(tags[i].name || '') === targetTag) {
                    return true;
                }
            }
            return false;
        });
    }

    // qs/qsa/formatBytes/mediaThumbSrc/apiFetch/... jetzt in mediapool3-helpers.js
    // bzw. mediapool3-api.js (siehe Alias-Block oben) -- Kommentare dazu leben dort.

    function setFullscreenMode(enabled) {
        fullscreenMode = !!enabled;
        if (!overlay) return;
        overlay.classList.toggle('mp3-fullscreen-mode', fullscreenMode);
        var btn = qs('.mp3-fullscreen-toggle', overlay);
        if (!btn) return;
        btn.innerHTML = fullscreenMode
            ? '<i class="fa-solid fa-compress"></i>'
            : '<i class="fa-solid fa-expand"></i>';
        btn.title = fullscreenMode ? t('mediaplace_restore_window_size') : t('mediaplace_fullscreen');
    }

    function openLightbox(src, caption) {
        if (!lightboxLayer || !lightboxImage) return;
        if (!src) return;
        lightboxImage.src = src;
        lightboxImage.alt = caption || '';
        if (lightboxCaption) {
            lightboxCaption.textContent = caption || '';
            lightboxCaption.style.display = caption ? '' : 'none';
        }
        lightboxLayer.classList.add('mp3-lightbox-open');
        lightboxOpen = true;
    }

    function closeLightbox() {
        if (!lightboxLayer) return;
        lightboxLayer.classList.remove('mp3-lightbox-open');
        if (lightboxImage) {
            lightboxImage.removeAttribute('src');
        }
        lightboxOpen = false;
    }

    // ---- Filter / Sort ----
    // Endungslisten fuer den serverseitigen filter[types]-Parameter (api-Addon
    // Media.php bzw. rex_api_mediaplace_media_list.php Fallback, beide per
    // Dateiendung statt MIME-Type). "other" hat bewusst keine Liste -- als
    // "alles ausser den anderen vier" gibt es dafuer keinen server-seitigen
    // Ausdruck (kein NOT-IN), bleibt daher rein client-seitig gefiltert wie
    // bisher (siehe applyTypeFilter()/loadFiles()).
    var TYPE_EXTENSIONS = {
        images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'tif', 'tiff', 'heic', 'heif'],
        videos: ['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v', 'mpeg', 'mpg'],
        audio: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'oga'],
        documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'csv', 'rtf']
    };

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

    function fileExtension(filename) {
        var name = String(filename || '');
        var dot = name.lastIndexOf('.');
        return dot > -1 ? name.substring(dot + 1).toLowerCase() : '';
    }

    // Zentrale Pruefung fuer die harte Endungs-Beschraenkung (allowedExtensions,
    // siehe open()) -- von applyFilterSort() (Grid-Sichtbarkeit) UND den
    // Auswahl-Bestaetigungen (Auswaehlen-Button/Mehrfachauswahl-Bestaetigen)
    // genutzt, damit eine nicht erlaubte Datei weder anzeigbar noch waehlbar ist.
    function isFileSelectable(filename) {
        if (!allowedExtensions) return true;
        return allowedExtensions.indexOf(fileExtension(filename)) !== -1;
    }

    function applyFilterSort(files) {
        var result = applyCollectionFilter(files.slice());

        if (allowedExtensions) {
            result = result.filter(function (f) { return isFileSelectable(f.filename); });
        }

        // Tag filter (independent from type filter)
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
        if (canFilterUnused && unusedOnlyFilter) {
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

    /**
     * Re-render files from the cached lastLoadedFiles with current filter/sort.
     */
    function refreshDisplay() {
        // Suchtext wird bereits serverseitig ueber filter[term] angewandt
        // (siehe buildMediaEndpoint()) -- lastLoadedFiles enthaelt nur noch
        // Treffer, hier bleiben nur Typ-/Tag-Filter und Sortierung.
        var filtered = applyFilterSort(lastLoadedFiles);
        renderFiles(filtered);
        if (!multiMode) {
            updateCollectionDragSelectionUI();
        }
        updateScrollPill();
        updateFilterCounts();
        updatePaginationUi(filtered);
    }

    function updateFilterCounts() {
        if (!overlay) return;
        var selectedTags = Object.keys(currentTagFilters);
        // Echte Server-Zaehler (fetchTypeCounts()) sind kategorie-/such-exakt,
        // kennen aber keine Tags (siehe dortiger Kommentar) -- bei aktivem
        // Tag-Filter faellt der Zaehler deshalb auf die alte, rein
        // client-seitige Zaehlung innerhalb der bereits geladenen Seite(n)
        // zurueck (gleiche Einschraenkung wie vorher, jetzt nur noch auf
        // diesen Fall begrenzt statt immer).
        var useServerCounts = typeCounts && typeCountsKey === currentTypeCountsKey() && !selectedTags.length;

        var base = null;
        if (!useServerCounts) {
            base = applyCollectionFilter(lastLoadedFiles.slice());
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

        var btns = qsa('.mp3-filter-btn', overlay);
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



    // TODO: Nutzt unseren eigenen Endpunkt (rex_api_mediaplace_categories), weil
    // das FriendsOfRedaxo/api-Addon (media/category/update) bewusst nur den Namen
    // aendern laesst, kein parent_id. Sobald das api-Addon eine echte Move-Route
    // anbietet: hier auf API_BASE + 'media/category/' + catId umstellen und den
    // Move-Teil in lib/rex_api_mediaplace_categories.php entfernen.




    function updateTagFilterOptions() {
        if (!overlay) return;
        var menu = document.getElementById('mp3-tag-filter-menu-portal');
        var label = qs('.mp3-tag-filter-label', overlay);
        if (!menu || !label) return;

        var selected = {};
        var selectedNames = Object.keys(currentTagFilters);
        for (var si = 0; si < selectedNames.length; si++) {
            selected[selectedNames[si]] = true;
        }

        var unique = {};
        var tags = Array.isArray(currentTagCatalog) ? currentTagCatalog : [];

        if (!tags.length) {
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
        }

        var html = '';
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

            html += '<button type="button" class="mp3-tag-filter-option' + (selected[name] ? ' is-selected' : '') + '" data-tag-name="' + escAttr(name) + '">';
            html += '<span class="mp3-tag-dot" style="background:' + escAttr(color.toLowerCase()) + '"></span>';
            html += '<span class="mp3-tag-filter-option-label">' + escAttr(name) + '</span>';
            html += '<i class="fa-solid ' + (selected[name] ? 'fa-square-check' : 'fa-square') + '"></i>';
            html += '</button>';
        }
        if (!html) {
            html = '<div class="mp3-tag-filter-empty">' + t('mediaplace_no_tags_found') + '</div>';
        }
        menu.innerHTML = html;

        var selectedCount = Object.keys(currentTagFilters).length;
        if (selectedCount === 0) {
            label.textContent = t('mediaplace_all_tags');
        } else if (selectedCount === 1) {
            label.textContent = Object.keys(currentTagFilters)[0];
        } else {
            label.textContent = t('mediaplace_tags_count', { count: selectedCount });
        }

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

    // Positioniert/zeigt das Portal analog zu openCatMenu() -- .is-open auf
    // .mp3-tag-filter-wrap bleibt fuer den Toggle-Button selbst (Chevron-Drehung
    // etc.), das eigentliche Menue lebt im Portal (siehe Kommentar bei
    // tagFilterHtml in build()).
    function setTagFilterMenuOpen(open) {
        if (!overlay) return;
        var wrap = qs('.mp3-tag-filter-wrap', overlay);
        var toggle = qs('.mp3-tag-filter-toggle', overlay);
        var portal = document.getElementById('mp3-tag-filter-menu-portal');
        if (!wrap) return;
        wrap.classList.toggle('is-open', !!open);
        if (!portal) return;

        if (!open) {
            portal.classList.remove('mp3-tag-filter-menu-portal-open');
            return;
        }
        if (!toggle) return;

        portal.classList.add('mp3-tag-filter-menu-portal-open');
        var rect = toggle.getBoundingClientRect();
        var menuW = Math.max(portal.offsetWidth, 220);
        var left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
        var top = rect.bottom + 6;
        var menuH = portal.offsetHeight;
        if (top + menuH > window.innerHeight - 8) {
            top = Math.max(8, rect.top - menuH - 6);
        }
        portal.style.left = left + 'px';
        portal.style.top = top + 'px';
    }

    // ---- Mobiles Filter-Dropdown (Compact-Modus) ----
    // Fasst Typ-Filter + "Nur unbenutzte" in einem Dropdown zusammen (Tags
    // bewusst NICHT mit drin -- eigenes Dropdown bleibt getrennt). Gleiches
    // Portal-Prinzip wie beim Tag-Filter, aber eigener Portal/State, weil
    // hier zwei unabhaengig kombinierbare Dinge in einem Menue stecken
    // (Typ-Filter radio-artig ueber data-filter, "Nur unbenutzte" ein
    // eigenstaendiger Toggle) -- bleibt dadurch auf Mobile genauso
    // kombinierbar wie die Pills auf breiten Screens.
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

    function updateFilterDropdownLabel() {
        var label = qs('.mp3-filter-dropdown-label', overlay);
        if (!label) return;
        var text = filterTypeLabel(currentFilter);
        if (canFilterUnused && unusedOnlyFilter) text += ' ' + t('mediaplace_plus_unused');
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
        if (canFilterUnused) {
            html += '<div class="mp3-filter-dropdown-separator"></div>';
            html += '<button type="button" class="mp3-filter-dropdown-unused-option' + (unusedOnlyFilter ? ' is-selected' : '') + '">' +
                '<i class="fa-solid fa-trash-can mp3-filter-dropdown-option-icon"></i>' +
                '<span class="mp3-filter-dropdown-option-label">' + t('mediaplace_unused_only') + '</span>' +
                '<i class="fa-solid ' + (unusedOnlyFilter ? 'fa-square-check' : 'fa-square') + ' mp3-filter-dropdown-option-check"></i>' +
                '</button>';
        }
        return html;
    }

    function setFilterDropdownMenuOpen(open) {
        if (!overlay) return;
        var wrap = qs('.mp3-filter-dropdown-wrap', overlay);
        var toggle = qs('.mp3-filter-dropdown-toggle', overlay);
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
    function applyTypeFilter(type) {
        currentFilter = type || 'all';
        qsa('.mp3-filter-btn', overlay).forEach(function (b) {
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
        loadFiles(currentCat, true);
    }

    // Analog zu applyTypeFilter(): gemeinsame Logik fuer Pill-Button und
    // Dropdown-Option, inkl. Nachladen des Unbenutzt-Status fuer bereits
    // geladene, aber noch nicht geprueften Dateien (siehe loadFiles()).
    function toggleUnusedOnlyFilter() {
        unusedOnlyFilter = !unusedOnlyFilter;
        qsa('.mp3-unused-filter-btn', overlay).forEach(function (b) {
            b.classList.toggle('mp3-filter-active', unusedOnlyFilter);
        });
        updateFilterDropdownLabel();

        if (unusedOnlyFilter) {
            var uncheckedFilenames = lastLoadedFiles
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
                        refreshDisplay();
                    })
                    .catch(function () {});
            }
        }
        refreshDisplay();
    }

    // ---- API ----
    // (siehe mediapool3-api.js -- Kommentare zu den einzelnen Funktionen leben dort)

    // ---- Detail Panel (JSON Widget System) ----
    var detailOriginalTitle = '';
    var detailOriginalJson = {};
    var detailOriginalSystemTags = [];
    var detailOriginalCollectionSystemTags = [];
    var detailFieldDefs = [];
    var detailClangs = [];
    var detailSystemTagCatalog = [];
    // widget_type -> function(key, panelEl) fuer Feldtypen, die ein anderes Addon
    // per MP3.registerFieldCollector() angemeldet hat (siehe collectJsonValuesFromDetail()
    // und MetainfoWidget::getRegisteredTypes() in PHP).
    var fieldCollectors = {};



    function toggleInlineEdit(fieldEl, editing) {
        if (!fieldEl) return;
        var display = qs('.mp3-edit-display', fieldEl);
        var editWrap = qs('.mp3-inline-edit-wrap', fieldEl);
        var input = qs('.mp3-edit-input[data-json-field], #mp3-detail-title-input', fieldEl);
        if (!display || !editWrap || !input) return;

        display.style.display = editing ? 'none' : '';
        editWrap.style.display = editing ? '' : 'none';
        fieldEl.classList.toggle('mp3-inline-edit-open', editing);

        if (editing) {
            setTimeout(function () {
                input.focus();
                if (typeof input.select === 'function') input.select();
            }, 0);
        }
    }

    function updateInlineDisplay(fieldEl) {
        if (!fieldEl) return;
        var displayTextEl = qs('.mp3-edit-display .mp3-edit-text', fieldEl);
        var input = qs('.mp3-edit-input[data-json-field], #mp3-detail-title-input', fieldEl);
        if (!displayTextEl || !input) return;
        var text = String(input.value || '').trim();
        if (text) {
            displayTextEl.textContent = text;
            displayTextEl.classList.remove('mp3-edit-placeholder');
        } else {
            displayTextEl.textContent = t('mediaplace_click_to_edit');
            displayTextEl.classList.add('mp3-edit-placeholder');
        }
    }

    /**
     * Klick auf JEDEN Feld-Speichern-Button loest denselben Gesamt-Save aus
     * (saveDetail() speichert immer alle geaenderten Felder, nicht nur das
     * eine) -- bei mehr als einem geaenderten Feld waeren mehrere sichtbare
     * Speichern-Buttons also irrefuehrend (alle tun exakt dasselbe). Deshalb
     * erst alle Dirty-Zustaende sammeln, dann nur bei genau einem geaenderten
     * Feld dessen Button zeigen; bei mehreren nur der globale Button im
     * fixierten Footer (.mp3-detail-save-btn, siehe updateDetailSaveState()).
     */
    function updateFieldSaveButtons(currentTitle, currentJson) {
        if (!detailPanel) return;

        var titleField = detailPanel.querySelector('.mp3-edit-field[data-field-key="__title"]');
        var titleDirty = titleField ? hasChanged(currentTitle, detailOriginalTitle) : false;
        if (titleField) titleField.classList.toggle('mp3-field-dirty', titleDirty);

        var dirtyFieldEls = [];
        if (titleDirty && titleField) dirtyFieldEls.push(titleField);

        var fieldDirtyMap = {};
        detailFieldDefs.forEach(function (field) {
            var key = String(field.key || '');
            if (!key) return;
            var fieldEl = detailPanel.querySelector('.mp3-json-field[data-field-key="' + key + '"]');
            if (!fieldEl) return;
            var cur = Object.prototype.hasOwnProperty.call(currentJson, key) ? currentJson[key] : null;
            var orig = Object.prototype.hasOwnProperty.call(detailOriginalJson, key) ? detailOriginalJson[key] : null;
            var dirty = hasChanged(cur, orig);
            fieldDirtyMap[key] = dirty;
            fieldEl.classList.toggle('mp3-field-dirty', dirty);
            if (dirty) dirtyFieldEls.push(fieldEl);
        });

        var systemField = detailPanel.querySelector('.mp3-json-field[data-field-key="__system_tags"]');
        var systemDirty = systemField ? hasChanged(collectSystemTagsFromDetail(), detailOriginalSystemTags) : false;
        if (systemField) {
            systemField.classList.toggle('mp3-field-dirty', systemDirty);
            if (systemDirty) dirtyFieldEls.push(systemField);
        }

        var showPerFieldButtons = dirtyFieldEls.length === 1;

        if (titleField) {
            var titleSaveBtn = qs('.mp3-field-save-btn', titleField);
            if (titleSaveBtn) titleSaveBtn.style.display = (titleDirty && showPerFieldButtons) ? '' : 'none';
        }

        detailFieldDefs.forEach(function (field) {
            var key = String(field.key || '');
            if (!key) return;
            var fieldEl = detailPanel.querySelector('.mp3-json-field[data-field-key="' + key + '"]');
            if (!fieldEl) return;
            var saveBtn = qs('.mp3-field-save-btn', fieldEl);
            if (saveBtn) saveBtn.style.display = (fieldDirtyMap[key] && showPerFieldButtons) ? '' : 'none';
        });

        if (systemField) {
            var systemSaveBtn = qs('.mp3-field-save-btn', systemField);
            if (systemSaveBtn) systemSaveBtn.style.display = (systemDirty && showPerFieldButtons) ? '' : 'none';
        }
    }




    // ---- Metainfo-Feld-Bearbeitung ----
    function openMetainfoCanvas(filename, label) {
        if (!overlay || !filename) return;
        if (focuspointCanvasOpen) closeFocuspointCanvas();

        metainfoCanvasOpen = true;
        metainfoCanvasFilename = filename;
        // REDAXOs Metainfo-Formular kann eigene TinyMCE-Feldtypen rendern
        // (klassisches Metainfo-Addon, nicht unser JSON-Feldsystem), deren
        // Dialoge ebenfalls ueber #mp3-overlay liegen muessen.
        document.body.classList.add('mp3-embedded-editor-active');

        var content = qs('.mp3-content', overlay);
        if (content) content.classList.add('mp3-editor-mode');

        var canvas = qs('#mp3-metainfo-canvas', overlay);
        if (canvas) canvas.style.display = '';

        var saveBtn = qs('.mp3-metainfo-canvas-save', canvas);
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
            saveBtn.title = '';
            saveBtn.classList.remove('mp3-detail-save-success', 'mp3-detail-save-error');
        }

        var titleEl = qs('.mp3-metainfo-canvas-title', canvas);
        if (titleEl) titleEl.textContent = label || filename;

        var formEl = document.getElementById('mp3-metainfo-form');
        if (formEl) formEl.innerHTML = '<div class="mp3-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_loading_more') + '</div>';

        apiLoadMetainfoForm(filename)
            .then(function (html) {
                if (!formEl || metainfoCanvasFilename !== filename) return;
                formEl.innerHTML = html || '<p class="mp3-metainfo-canvas-empty text-muted">' + t('mediaplace_metainfo_readonly_empty') + '</p>';
                // Bootstrap-select initialisiert dynamisch eingefuegte Selects nicht automatisch.
                if (window.jQuery && window.jQuery.fn && window.jQuery.fn.selectpicker) {
                    window.jQuery('.selectpicker', formEl).selectpicker();
                }
                // metainfo_lang_fields: Klick-/Input-Handler sind auf document delegiert und
                // funktionieren bereits, aber das versteckte JSON-Feld jedes Sprachfelds wird
                // nur beim initialen Seitenladen befuellt (rex:ready) -- ohne diesen Aufruf
                // waere es hier leer und wuerde beim Speichern bestehende Uebersetzungen loeschen.
                if (typeof window.initializeRepeaterFields === 'function') {
                    window.initializeRepeaterFields();
                }
            })
            .catch(function (err) {
                if (!formEl) return;
                formEl.innerHTML = '<div class="mp3-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
            });

        if (canvas) canvas.scrollTop = 0;
    }

    function commitMetainfoCanvas() {
        if (!metainfoCanvasOpen || !metainfoCanvasFilename) return;
        var formEl = document.getElementById('mp3-metainfo-form');
        if (!formEl) return;

        var saveBtn = qs('.mp3-metainfo-canvas-save', overlay);
        if (saveBtn) saveBtn.disabled = true;

        apiSaveMetainfoForm(metainfoCanvasFilename, new FormData(formEl))
            .then(function () {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> ' + t('mediaplace_saved');
                    saveBtn.classList.add('mp3-detail-save-success');
                }
                // Kurze Erfolgs-Rueckmeldung, bevor der Canvas schliesst -- ohne die
                // wechselt die Ansicht sofort zurueck ins Grid, was wie ein Fehlschlag
                // wirken kann (siehe Feedback: "es wechselt sofort in den browse mode").
                setTimeout(function () {
                    closeMetainfoCanvas();
                }, 700);
            })
            .catch(function (err) {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error');
                    saveBtn.title = t('mediaplace_error_saving', { msg: err.message });
                    saveBtn.classList.add('mp3-detail-save-error');
                    setTimeout(function () {
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
                        saveBtn.title = '';
                        saveBtn.classList.remove('mp3-detail-save-error');
                    }, 1800);
                }
                console.error('MP3 metainfo save failed:', err);
            });
    }

    function closeMetainfoCanvas() {
        metainfoCanvasOpen = false;
        metainfoCanvasFilename = null;
        document.body.classList.remove('mp3-embedded-editor-active');

        var content = qs('.mp3-content', overlay);
        if (content) content.classList.remove('mp3-editor-mode');
        var canvas = qs('#mp3-metainfo-canvas', overlay);
        if (canvas) canvas.style.display = 'none';
    }

    // Klick auf "Oeffnen"/"Hinzufuegen" eines klassischen REX_MEDIA[n]/
    // REX_MEDIALIST[n]-Widgets innerhalb des Metainfo-Canvas: statt REDAXOs
    // natives Popup blendet MP3 den Canvas kurz aus, zeigt das eigene Grid
    // zum Auswaehlen, und kehrt danach zum (unveraendert im DOM verbliebenen,
    // nicht neu geladenen) Formular zurueck.
    function startMetainfoPick(wrapper, isList) {
        if (!wrapper || !metainfoCanvasOpen) return;

        if (isList) {
            var select = qs('select[id^="REX_MEDIALIST_SELECT_"]', wrapper);
            if (!select) return;
            metainfoPickTarget = { type: 'medialist', select: select, listId: select.id.slice('REX_MEDIALIST_SELECT_'.length) };
            multiMode = true;
            multiSelected = {};
            overlay.classList.add('mp3-multi-mode');
            if (multiFooter) multiFooter.style.display = '';
            updateMultiUI();
        } else {
            var input = qs('input[id^="REX_MEDIA_"]', wrapper);
            if (!input) return;
            metainfoPickTarget = { type: 'media', input: input };
        }

        var canvas = qs('#mp3-metainfo-canvas', overlay);
        if (canvas) canvas.style.display = 'none';
        var content = qs('.mp3-content', overlay);
        if (content) content.classList.remove('mp3-editor-mode');
        overlay.classList.add('mp3-metainfo-pick-mode');

        var banner = qs('#mp3-metainfo-pick-banner', overlay);
        if (banner) {
            var text = qs('.mp3-metainfo-pick-banner-text', banner);
            if (text) text.textContent = t(isList ? 'mediaplace_metainfo_pick_hint_multi' : 'mediaplace_metainfo_pick_hint');
            banner.style.display = '';
        }
    }

    function endMetainfoPick() {
        var wasMedialist = !!metainfoPickTarget && 'medialist' === metainfoPickTarget.type;
        metainfoPickTarget = null;
        multiMode = false;
        multiSelected = {};
        overlay.classList.remove('mp3-multi-mode');
        overlay.classList.remove('mp3-metainfo-pick-mode');
        if (multiFooter) multiFooter.style.display = 'none';
        if (wasMedialist) updateMultiUI();
        var banner = qs('#mp3-metainfo-pick-banner', overlay);
        if (banner) banner.style.display = 'none';

        var canvas = qs('#mp3-metainfo-canvas', overlay);
        if (canvas) canvas.style.display = '';
        var content = qs('.mp3-content', overlay);
        if (content) content.classList.add('mp3-editor-mode');
    }

    function finishMetainfoMediaPick(filename) {
        if (!metainfoPickTarget || 'media' !== metainfoPickTarget.type) return;
        var input = metainfoPickTarget.input;
        input.value = filename;
        if (window.jQuery) {
            window.jQuery(input).trigger('change');
        } else {
            var evt;
            try { evt = new Event('change', { bubbles: true }); }
            catch (e) { evt = document.createEvent('Event'); evt.initEvent('change', true, true); }
            input.dispatchEvent(evt);
        }
        endMetainfoPick();
    }

    function finishMetainfoMedialistPick(filenames) {
        if (!metainfoPickTarget || 'medialist' !== metainfoPickTarget.type) return;
        var select = metainfoPickTarget.select;
        var listId = metainfoPickTarget.listId;
        filenames.forEach(function (filename) {
            var exists = Array.prototype.some.call(select.options, function (o) { return o.value === filename; });
            if (!exists) select.add(new Option(filename, filename));
        });
        if (typeof window.writeREXMedialist === 'function') {
            window.writeREXMedialist(listId);
        }
        endMetainfoPick();
    }

    // ---- Fokuspunkt-Canvas (Integration mit dem focuspoint-Addon) ----
    // Eigenstaendiger Canvas-Block (nicht der Metainfo-Canvas oben) -- andere
    // Body-Struktur (Bild+Crosshair+Live-Vorschau statt Formular), teilt aber
    // dasselbe "Hauptbereich uebernehmen"-Konzept (Grid wird verdeckt, Header
    // mit Zurueck/Titel/Speichern).

    function focuspointTypeNames() {
        return Object.keys(focuspointTypes).sort(function (a, b) {
            return a.localeCompare(b, 'de', { sensitivity: 'base' });
        });
    }

    function updateFocuspointFieldSelect() {
        var canvas = qs('#mp3-focuspoint-canvas', overlay);
        if (!canvas) return;
        var wrap = qs('.mp3-focuspoint-field-wrap', canvas);
        var sel = qs('.mp3-focuspoint-field-select', canvas);
        if (!wrap || !sel) return;
        if (focuspointFields.length <= 1) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = '';
        var html = '';
        for (var i = 0; i < focuspointFields.length; i++) {
            var f = focuspointFields[i];
            html += '<option value="' + escAttr(f) + '"' + (f === focuspointActiveField ? ' selected' : '') + '>' + escAttr(f) + '</option>';
        }
        sel.innerHTML = html;
    }

    function updateFocuspointTypeSelect() {
        var canvas = qs('#mp3-focuspoint-canvas', overlay);
        if (!canvas) return;
        var sel = qs('.mp3-focuspoint-type-select', canvas);
        if (!sel) return;
        var names = focuspointTypeNames();
        if (!names.length) {
            sel.innerHTML = '<option value="">' + t('mediaplace_no_focuspoint_type') + '</option>';
            sel.disabled = true;
            return;
        }
        sel.disabled = false;
        var html = '<option value="">' + t('mediaplace_choose_preview') + '</option>';
        for (var i = 0; i < names.length; i++) {
            var typeObj = focuspointTypes[names[i]];
            var label = (typeObj && typeObj.label) ? typeObj.label : names[i];
            html += '<option value="' + escAttr(names[i]) + '"' + (names[i] === focuspointActiveType ? ' selected' : '') + '>' + escAttr(label) + '</option>';
        }
        sel.innerHTML = html;
    }

    function updateFocuspointMarker() {
        var canvas = qs('#mp3-focuspoint-canvas', overlay);
        if (!canvas) return;
        var marker = qs('.mp3-focuspoint-marker', canvas);
        if (marker) {
            marker.style.left = focuspointPos[0] + '%';
            marker.style.top = focuspointPos[1] + '%';
        }
        var coords = qs('.mp3-focuspoint-coords', canvas);
        if (coords) coords.textContent = focuspointPos[0].toFixed(1) + '% | ' + focuspointPos[1].toFixed(1) + '%';
    }

    function updateFocuspointPreview() {
        var canvas = qs('#mp3-focuspoint-canvas', overlay);
        if (!canvas) return;
        var wrap = qs('.mp3-focuspoint-preview-wrap', canvas);
        var img = qs('.mp3-focuspoint-preview-img', canvas);
        if (!wrap || !img) return;
        if (!focuspointActiveType || !focuspointFilename) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = '';
        var xy = focuspointPos[0].toFixed(1) + ',' + focuspointPos[1].toFixed(1);
        // Live, uncached Vorschau ueber den rex-api-call des focuspoint-Addons
        // selbst (rex_api_focuspoint) -- exakt derselbe Mechanismus, den auch
        // dessen eigenes fp_panel.php nutzt, kein eigener Crop-Simulationscode.
        img.src = 'index.php?rex-api-call=focuspoint&file=' + encodeURIComponent(focuspointFilename) +
            '&type=' + encodeURIComponent(focuspointActiveType) + '&xy=' + encodeURIComponent(xy) + '&_=' + Date.now();
    }

    function focuspointPositionFromEvent(e, wrap) {
        var rect = wrap.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
    }

    // Defensive Zahl-Normalisierung: das focuspoint-Addon liefert Koordinaten
    // je nach Codepfad mal als PHP-Int, mal als String zurueck (str2fp()
    // parst per Regex), was via JSON mal als Zahl, mal als String ankommt.
    // Serverseitig bereits auf float gecastet (siehe FocuspointIntegration::
    // getFocus()), hier trotzdem nochmal defensiv, statt sich implizit auf
    // die Typisierung eines fremden Addons zu verlassen.
    function focuspointPosOrDefault(raw) {
        if (!Array.isArray(raw) || raw.length < 2) return [50, 50];
        var x = parseFloat(raw[0]);
        var y = parseFloat(raw[1]);
        return [isNaN(x) ? 50 : x, isNaN(y) ? 50 : y];
    }

    function setFocuspointActiveField(field) {
        focuspointActiveField = field;
        focuspointPos = field ? focuspointPosOrDefault(focuspointCurrent[field]) : [50, 50];
        updateFocuspointFieldSelect();
        updateFocuspointMarker();
        updateFocuspointPreview();
    }

    function openFocuspointCanvas(filename) {
        if (!overlay || !canFocuspoint || !filename) return;
        if (metainfoCanvasOpen) closeMetainfoCanvas();

        focuspointCanvasOpen = true;
        focuspointFilename = filename;
        focuspointFields = [];
        focuspointTypes = {};
        focuspointCurrent = {};
        focuspointActiveField = null;
        focuspointActiveType = '';
        focuspointPos = [50, 50];

        var content = qs('.mp3-content', overlay);
        if (content) content.classList.add('mp3-focuspoint-mode');

        var canvas = qs('#mp3-focuspoint-canvas', overlay);
        if (!canvas) return;
        canvas.style.display = '';

        var titleEl = qs('.mp3-focuspoint-canvas-title', canvas);
        if (titleEl) titleEl.textContent = 'Fokuspunkt: ' + filename;

        var img = qs('.mp3-focuspoint-image', canvas);
        if (img) img.src = mediaThumbSrc(filename, 'rex_media_large', filename, mediaForceCacheTokens, lastLoadedFiles, mediaBaseUrl);

        updateFocuspointFieldSelect();
        updateFocuspointTypeSelect();
        updateFocuspointMarker();
        updateFocuspointPreview();
        canvas.scrollTop = 0;

        apiLoadFocuspointInfo(filename)
            .then(function (info) {
                // Stale-Check: Canvas kann zwischenzeitlich fuer eine andere
                // Datei geoeffnet oder geschlossen worden sein.
                if (!focuspointCanvasOpen || focuspointFilename !== filename) return;
                focuspointFields = info.fields;
                focuspointTypes = info.types;
                focuspointCurrent = info.current;
                var defaultField = focuspointFields.indexOf('med_focuspoint') !== -1 ? 'med_focuspoint' : (focuspointFields[0] || null);
                setFocuspointActiveField(defaultField);
                // Direkt den ersten verfuegbaren Typ vorauswaehlen statt leer zu
                // starten -- die Live-Vorschau ist damit sofort sichtbar, ohne
                // dass der Nutzer erst manuell einen Typ waehlen muss.
                var typeNames = focuspointTypeNames();
                focuspointActiveType = typeNames.length ? typeNames[0] : '';
                updateFocuspointTypeSelect();
                updateFocuspointPreview();
            })
            .catch(function (err) {
                var coords = qs('.mp3-focuspoint-coords', canvas);
                if (coords) coords.textContent = t('mediaplace_error_loading', { msg: (err && err.message ? err.message : t('mediaplace_unknown')) });
                console.error('MP3 focuspoint info failed:', err);
            });
    }

    function commitFocuspointCanvas() {
        if (!focuspointCanvasOpen || !focuspointActiveField || !focuspointFilename) return;
        var canvas = qs('#mp3-focuspoint-canvas', overlay);
        var saveBtn = canvas ? qs('.mp3-focuspoint-canvas-save', canvas) : null;
        var xy = focuspointPos[0].toFixed(1) + ',' + focuspointPos[1].toFixed(1);

        if (saveBtn) saveBtn.disabled = true;
        apiSaveFocuspoint(focuspointFilename, focuspointActiveField, xy)
            .then(function () {
                focuspointCurrent[focuspointActiveField] = focuspointPos.slice();
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> ' + t('mediaplace_saved');
                    saveBtn.classList.add('mp3-detail-save-success');
                }
                // Schliesst den Canvas nach kurzer Erfolgs-Rueckmeldung automatisch
                // (Detail-Panel wird dadurch wieder sichtbar, siehe closeFocuspointCanvas())
                // -- "Speichern" fungiert hier als "Speichern & zurueck", analog zu
                // "Zurueck" selbst, statt den Nutzer im leeren Canvas stehen zu lassen.
                setTimeout(function () {
                    closeFocuspointCanvas();
                }, 700);
            })
            .catch(function (err) {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error');
                    saveBtn.title = t('mediaplace_error_saving', { msg: err.message });
                    saveBtn.classList.add('mp3-detail-save-error');
                    setTimeout(function () {
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
                        saveBtn.title = '';
                        saveBtn.classList.remove('mp3-detail-save-error');
                    }, 1800);
                }
                console.error('MP3 focuspoint save failed:', err);
            });
    }

    function closeFocuspointCanvas() {
        focuspointCanvasOpen = false;
        focuspointFilename = null;
        focuspointFields = [];
        focuspointTypes = {};
        focuspointCurrent = {};
        focuspointActiveField = null;
        focuspointActiveType = '';
        focuspointPos = [50, 50];

        var content = qs('.mp3-content', overlay);
        if (content) content.classList.remove('mp3-focuspoint-mode');
        var canvas = qs('#mp3-focuspoint-canvas', overlay);
        if (canvas) canvas.style.display = 'none';
    }

    function updateAltHint(wrap) {
        if (!wrap) return;
        var altKey = String(wrap.getAttribute('data-alt-key') || '');
        var decCb = wrap.querySelector('[data-json-field="' + altKey + '-decorative"]');
        var isDecorative = decCb ? !!decCb.checked : false;
        var hasText = false;
        var inputs = wrap.querySelectorAll('[data-json-field="' + altKey + '"][data-clang], [data-json-field="' + altKey + '"]:not([data-clang])');
        inputs.forEach(function (inp) {
            if (String(inp.value || '').trim()) hasText = true;
        });
        var hint = wrap.querySelector('.mp3-alt-hint');
        var needsHint = !isDecorative && !hasText;
        if (needsHint && !hint) {
            hint = document.createElement('div');
            hint.className = 'mp3-alt-hint';
            hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_alt_missing_hint');
            wrap.insertBefore(hint, wrap.firstChild);
        } else if (!needsHint && hint) {
            hint.remove();
        }
        // Show/hide lang inputs depending on decorative state
        var langWrap = wrap.querySelector('.mp3-lang-inputs');
        if (langWrap) langWrap.style.display = isDecorative ? 'none' : '';
    }


    function repaintTagsWidget(widgetWrap) {
        if (!widgetWrap) return;
        var hidden = qs('[data-widget="tags-value"]', widgetWrap);
        var listWrap = qs('.mp3-tags-list', widgetWrap);
        if (!hidden || !listWrap) return;
        var tags = [];
        try { tags = JSON.parse(hidden.value || '[]'); } catch (e) { tags = []; }
        if (!Array.isArray(tags)) tags = [];
        var html = '';
        for (var i = 0; i < tags.length; i++) {
            var item = tags[i];
            var tagName = typeof item === 'string' ? item : String((item && item.name) || '');
            var tagColor = typeof item === 'object' && item && /^#[0-9a-fA-F]{6}$/.test(String(item.color || '')) ? String(item.color).toLowerCase() : '#4a90d9';
            if (!tagName) continue;
            html += '<span class="mp3-tag-item">';
            html += '<span class="mp3-tag-dot" style="background:' + escAttr(tagColor) + '"></span> ' + escAttr(tagName);
            html += ' <input type="color" class="mp3-tag-color" data-tag="' + escAttr(tagName) + '" value="' + escAttr(tagColor) + '">';
            html += ' <button type="button" class="mp3-tag-remove" data-tag="' + escAttr(tagName) + '"><i class="fa-solid fa-xmark"></i></button>';
            html += '</span>';
        }
        listWrap.innerHTML = html;
    }

    function collectTagNames(values) {
        var names = [];
        var seen = Object.create(null);
        if (!Array.isArray(values)) return names;
        for (var i = 0; i < values.length; i++) {
            var item = values[i];
            var name = typeof item === 'string' ? item : String((item && item.name) || '');
            name = String(name || '').trim();
            if (!name || seen[name]) continue;
            seen[name] = true;
            names.push(name);
        }
        return names;
    }

    function renderSystemTagSuggestionOptions(catalog, selectedNames) {
        var selected = Object.create(null);
        for (var i = 0; i < selectedNames.length; i++) {
            selected[selectedNames[i]] = true;
        }

        var html = '';
        for (var j = 0; j < (catalog || []).length; j++) {
            var item = catalog[j];
            var name = item && item.name ? String(item.name).trim() : '';
            if (!name) continue;
            if (isCollectionTagName(name)) continue;
            if (selected[name]) continue;
            html += '<option value="' + escAttr(name) + '"></option>';
        }
        return html;
    }

    function repaintSystemTagSuggestions() {
        if (!detailPanel) return;
        var datalist = detailPanel.querySelector('#mp3-system-tags-suggestions');
        var hidden = detailPanel.querySelector('.mp3-json-field[data-field-key="__system_tags"] [data-widget="tags-value"]');
        if (!datalist || !hidden) return;

        var values = [];
        try { values = JSON.parse(hidden.value || '[]'); } catch (e) { values = []; }
        if (!Array.isArray(values)) values = [];

        datalist.innerHTML = renderSystemTagSuggestionOptions(detailSystemTagCatalog || [], collectTagNames(values));
    }

    function applyTagColorChange(colorInput) {
        if (!colorInput) return;
        var colorWrap = colorInput.closest('.mp3-tags-widget');
        var colorHidden = colorWrap ? qs('[data-widget="tags-value"]', colorWrap) : null;
        var colorTag = colorInput.getAttribute('data-tag');
        if (!colorHidden || !colorTag) return;

        var colorValues = [];
        try { colorValues = JSON.parse(colorHidden.value || '[]'); } catch (e) { colorValues = []; }
        if (!Array.isArray(colorValues)) colorValues = [];

        for (var vi = 0; vi < colorValues.length; vi++) {
            var name = typeof colorValues[vi] === 'string' ? colorValues[vi] : String((colorValues[vi] && colorValues[vi].name) || '');
            if (name === colorTag) {
                colorValues[vi] = { name: colorTag, color: String(colorInput.value || '#4a90d9').toLowerCase() };
            }
        }

        colorHidden.value = JSON.stringify(colorValues);
        repaintTagsWidget(colorWrap);
        updateDetailSaveState();
    }




    function setMediaLinkPickMode(fieldKey) {
        mediaLinkPickFieldKey = fieldKey || null;
        if (!overlay || !detailPanel) return;

        overlay.classList.toggle('mp3-media-link-pick-mode', !!mediaLinkPickFieldKey);

        qsa('.mp3-media-link-widget', detailPanel).forEach(function (widget) {
            var input = qs('[data-json-field]', widget);
            var key = input ? input.getAttribute('data-json-field') : null;
            var active = !!mediaLinkPickFieldKey && key === mediaLinkPickFieldKey;

            widget.classList.toggle('mp3-media-link-widget-pick-active', active);

            var hint = qs('.mp3-media-link-pick-hint', widget);
            if (hint) {
                hint.style.display = active ? '' : 'none';
            }
        });
    }

    function repaintMediaLinkWidget(widgetWrap) {
        if (!widgetWrap) return;
        var input = qs('[data-json-field]', widgetWrap);
        if (!input) return;
        var filename = String(input.value || '').trim();
        var preview = qs('.mp3-media-link-preview', widgetWrap);
        if (!filename || !isImageFile(filename)) {
            if (preview) preview.remove();
            return;
        }
        var previewSrc = mediaThumbSrc(filename, 'rex_media_small', filename, mediaForceCacheTokens, lastLoadedFiles, mediaBaseUrl);
        var previewHtml = '<img src="' + escAttr(previewSrc) + '" alt="">';
        if (preview) {
            preview.innerHTML = previewHtml;
        } else {
            var div = document.createElement('div');
            div.className = 'mp3-media-link-preview';
            div.innerHTML = previewHtml;
            widgetWrap.appendChild(div);
        }
    }


    function collectJsonValuesFromDetail() {
        var json = {};
        detailFieldDefs.forEach(function (field) {
            var key = field.key;
            var widget = String(field.widget_type || 'text');

            // Von einem anderen Addon per MP3.registerFieldCollector() registrierter
            // Feldtyp (siehe MetainfoWidget::getRegisteredTypes() in PHP) -- hat
            // Vorrang vor den eingebauten Zweigen, falls ein widget_type kollidiert.
            if (fieldCollectors[widget]) {
                json[key] = fieldCollectors[widget](key, detailPanel);
                return;
            }

            if (widget === 'tags') {
                var hidden = detailPanel.querySelector('[data-json-field="' + key + '"][data-widget="tags-value"]');
                if (!hidden || !hidden.value) {
                    json[key] = null;
                    return;
                }
                try {
                    var parsed = JSON.parse(hidden.value);
                    json[key] = Array.isArray(parsed) && parsed.length ? parsed : null;
                } catch (e) {
                    json[key] = null;
                }
                return;
            }

            if (widget === 'alt') {
                var langInputs = qsa('[data-json-field="' + key + '"][data-clang]', detailPanel);
                var textMap = {};
                for (var i = 0; i < langInputs.length; i++) {
                    var v = String(langInputs[i].value || '').trim();
                    var cid = String(langInputs[i].getAttribute('data-clang') || '');
                    if (v) textMap[cid] = v;
                }
                var decorativeEl = detailPanel.querySelector('[data-json-field="' + key + '-decorative"]');
                var decorative = decorativeEl ? !!decorativeEl.checked : false;
                if (!decorative && Object.keys(textMap).length === 0) {
                    json[key] = null;
                } else {
                    json[key] = { text: textMap, decorative: decorative };
                }
                return;
            }

            // media_link rendert immer nur ein einzelnes, nicht sprachgebundenes
            // Eingabefeld (siehe detail_field_body_media_link.php) -- unabhaengig
            // davon, ob das Feld als "mehrsprachig" angelegt wurde. Muss deshalb
            // VOR dem generischen field.translatable-Zweig behandelt werden,
            // sonst sucht dieser nach [data-clang]-Unterfeldern, die es fuer
            // diesen Widget-Typ nie gibt, und der Wert wird nie gespeichert.
            if (widget === 'media_link') {
                var linkEl = detailPanel.querySelector('[data-json-field="' + key + '"]');
                var linkScalar = linkEl ? String(linkEl.value || '').trim() : '';
                json[key] = linkScalar || null;
                return;
            }

            if (widget === 'checkbox') {
                var cbEl = detailPanel.querySelector('[data-json-field="' + key + '"]');
                json[key] = cbEl ? !!cbEl.checked : false;
                return;
            }

            if (widget === 'select') {
                var selEl = detailPanel.querySelector('[data-json-field="' + key + '"]');
                if (!selEl) {
                    json[key] = null;
                    return;
                }
                if (field.options && field.options.multiple) {
                    var chosen = [];
                    for (var so = 0; so < selEl.options.length; so++) {
                        if (selEl.options[so].selected) chosen.push(selEl.options[so].value);
                    }
                    json[key] = chosen.length ? chosen : null;
                } else {
                    json[key] = selEl.value || null;
                }
                return;
            }

            if (field.translatable) {
                var inputs = qsa('[data-json-field="' + key + '"][data-clang]', detailPanel);
                var map = {};
                for (var j = 0; j < inputs.length; j++) {
                    var text = String(inputs[j].value || '').trim();
                    var clangId = String(inputs[j].getAttribute('data-clang') || '');
                    if (text) map[clangId] = text;
                }
                json[key] = Object.keys(map).length ? map : null;
                return;
            }

            var el = detailPanel.querySelector('[data-json-field="' + key + '"]');
            var scalar = el ? String(el.value || '').trim() : '';
            json[key] = scalar ? scalar : null;
        });
        return json;
    }

    function collectSystemTagsFromDetail() {
        if (!detailPanel) return [];
        var hidden = detailPanel.querySelector('[data-json-field="__system_tags"][data-widget="tags-value"]');
        if (!hidden || !hidden.value) return [];

        var parsed = [];
        try {
            parsed = JSON.parse(hidden.value || '[]');
        } catch (e) {
            parsed = [];
        }

        if (!Array.isArray(parsed)) return [];
        var out = [];
        var seen = {};
        for (var i = 0; i < parsed.length; i++) {
            var item = parsed[i];
            var name = typeof item === 'string' ? item : String((item && item.name) || '');
            var color = typeof item === 'object' && item && /^#[0-9a-fA-F]{6}$/.test(String(item.color || '')) ? String(item.color).toLowerCase() : '#4a90d9';
            name = String(name || '').trim();
            if (isCollectionTagName(name)) continue;
            if (!name || seen[name]) continue;
            seen[name] = true;
            out.push({ name: name, color: color });
        }
        return out;
    }

    function updateDetailSaveState() {
        if (!detailPanel) return;
        var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
        if (!saveBtn) return;

        var titleEl = detailPanel.querySelector('#mp3-detail-title-input');
        var currentTitle = titleEl ? String(titleEl.value || '').trim() : '';
        var currentJson = collectJsonValuesFromDetail();
        var currentSystemTags = collectSystemTagsFromDetail();
        var changed = hasChanged(currentTitle, detailOriginalTitle)
            || hasChanged(currentJson, detailOriginalJson)
            || hasChanged(currentSystemTags, detailOriginalSystemTags);

        saveBtn.disabled = !changed;
        saveBtn.classList.toggle('is-dirty', changed);

        updateFieldSaveButtons(currentTitle, currentJson);
        qsa('.mp3-edit-field-inline, .mp3-json-field', detailPanel).forEach(updateInlineDisplay);
    }

    function saveDetail() {
        if (!selectedFile || !detailPanel) return;
        var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
        var titleEl = detailPanel.querySelector('#mp3-detail-title-input');
        var currentTitle = titleEl ? String(titleEl.value || '').trim() : '';
        var currentJson = collectJsonValuesFromDetail();
        var currentSystemTags = collectSystemTagsFromDetail();

        var titleChanged = hasChanged(currentTitle, detailOriginalTitle);
        var jsonChanged = hasChanged(currentJson, detailOriginalJson);
        var systemTagsChanged = hasChanged(currentSystemTags, detailOriginalSystemTags);
        if (!titleChanged && !jsonChanged && !systemTagsChanged) {
            updateDetailSaveState();
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + t('mediaplace_saving');
        }

        var requests = [];
        if (titleChanged) {
            requests.push(apiUpdate(selectedFile, { title: currentTitle }));
        }
        if (jsonChanged || systemTagsChanged) {
            var payload = deepClone(currentJson);
            payload.__system_tags = mergeUniqueSystemTags(currentSystemTags, detailOriginalCollectionSystemTags);
            requests.push(apiSaveJsonMetainfo(selectedFile, payload));
        }

        Promise.all(requests)
            .then(function () {
                detailOriginalTitle = currentTitle;
                detailOriginalJson = deepClone(currentJson);
                detailOriginalSystemTags = deepClone(currentSystemTags);

                if (titleChanged) {
                    var card = grid.querySelector('.mp3-card[data-filename="' + selectedFile + '"]');
                    if (card) {
                        var nameEl = card.querySelector('.mp3-card-name');
                        if (nameEl) nameEl.textContent = currentTitle || selectedFile;
                        var fnameEl = card.querySelector('.mp3-fname');
                        if (currentTitle) {
                            if (!fnameEl) {
                                fnameEl = document.createElement('span');
                                fnameEl.className = 'mp3-fname';
                                fnameEl.title = selectedFile;
                                fnameEl.textContent = selectedFile;
                                var infoEl = card.querySelector('.mp3-info');
                                if (infoEl) infoEl.insertBefore(fnameEl, infoEl.querySelector('.mp3-fmeta'));
                            }
                        } else if (fnameEl) {
                            fnameEl.remove();
                        }
                    }
                    var row = grid.querySelector('.mp3-list-row[data-filename="' + selectedFile + '"]');
                    if (row) {
                        var nameCell = row.querySelector('.mp3-list-cell-name');
                        if (nameCell) {
                            nameCell.textContent = currentTitle || selectedFile;
                            nameCell.title = currentTitle ? selectedFile : '';
                        }
                    }
                    var masonryCard = grid.querySelector('.mp3-masonry-card[data-filename="' + selectedFile + '"]');
                    if (masonryCard) {
                        var masonryName = masonryCard.querySelector('.mp3-masonry-name');
                        if (masonryName) {
                            masonryName.textContent = currentTitle || selectedFile;
                            masonryName.title = selectedFile;
                        }
                    }
                    for (var i = 0; i < lastLoadedFiles.length; i++) {
                        if (lastLoadedFiles[i].filename === selectedFile) {
                            lastLoadedFiles[i].title = currentTitle;
                            break;
                        }
                    }
                }

                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> ' + t('mediaplace_saved');
                    saveBtn.classList.add('mp3-detail-save-success');
                    setTimeout(function () {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
                        saveBtn.classList.remove('mp3-detail-save-success');
                        updateDetailSaveState();
                    }, 1200);
                }

                // After saving system tags: refresh catalog + filter options
                if (systemTagsChanged && selectedFile) {
                    apiLoadSystemTagsForFiles([selectedFile]).then(function (payload) {
                        currentTagCatalog = Array.isArray(payload.catalog) ? payload.catalog : [];
                        var ft = payload.file_tags || {};
                        var selectedFileTags = Array.isArray(ft[selectedFile]) ? ft[selectedFile] : [];
                        var splitTags = splitSystemTags(selectedFileTags);
                        detailOriginalCollectionSystemTags = deepClone(splitTags.collections);
                        for (var k = 0; k < lastLoadedFiles.length; k++) {
                            if (lastLoadedFiles[k].filename === selectedFile) {
                                lastLoadedFiles[k].system_tags = selectedFileTags;
                                break;
                            }
                        }
                        updateTagFilterOptions();
                    }).catch(function () {});
                }
            })
            .catch(function (err) {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_error');
                    saveBtn.title = t('mediaplace_error_saving', { msg: err.message });
                    saveBtn.classList.add('mp3-detail-save-error');
                    setTimeout(function () {
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save');
                        saveBtn.title = t('mediaplace_save_changes');
                        saveBtn.classList.remove('mp3-detail-save-error');
                        updateDetailSaveState();
                    }, 1800);
                }
                console.error('MP3 save detail failed:', err);
            });
    }

    function showDetail(filename) {
        selectedFile = filename;
        if (!detailPanel) return;

        qsa('.mp3-card', grid).forEach(function (c) {
            c.classList.toggle('mp3-card-selected', c.getAttribute('data-filename') === filename);
        });
        qsa('.mp3-list-row', grid).forEach(function (r) {
            r.classList.toggle('mp3-list-row-selected', r.getAttribute('data-filename') === filename);
        });
        qsa('.mp3-masonry-card', grid).forEach(function (r) {
            r.classList.toggle('mp3-masonry-card-selected', r.getAttribute('data-filename') === filename);
        });

        detailPanel.classList.add('mp3-detail-open');
        detailPanel.innerHTML = '<div class="mp3-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> Lade Details…</div>';
        applyDetailWidth();
        var detailResizeHandle = qs('#mp3-detail-resize-handle', overlay);
        if (detailResizeHandle) detailResizeHandle.style.display = overlay.classList.contains('mp3-compact') ? 'none' : '';

        // Alle Info-Felder (inkl. is_in_use) berechnet der eigene Endpunkt jetzt
        // selbst (siehe buildFastInfoFields() in
        // rex_api_mediaplace_json_metainfo.php) -- ein Fetch statt vorher
        // zwei (frueher zusaetzlich media/{filename}/info vom api-Addon).
        apiLoadJsonMetainfo(filename, true)
            .then(function (payload) {
                renderDetail(payload);
            })
            .catch(function (err) {
                detailPanel.innerHTML = '<div class="mp3-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
            });
    }

    function hideDetail() {
        selectedFile = null;
        setMediaLinkPickMode(null);
        if (detailPanel) {
            detailPanel.classList.remove('mp3-detail-open');
            detailPanel.innerHTML = '';
            detailPanel.style.width = '';
        }
        var detailResizeHandle = qs('#mp3-detail-resize-handle', overlay);
        if (detailResizeHandle) detailResizeHandle.style.display = 'none';
        qsa('.mp3-card', grid).forEach(function (c) {
            c.classList.remove('mp3-card-selected');
        });
        qsa('.mp3-list-row', grid).forEach(function (r) {
            r.classList.remove('mp3-list-row-selected');
        });
        qsa('.mp3-masonry-card', grid).forEach(function (r) {
            r.classList.remove('mp3-masonry-card-selected');
        });
    }


    /**
     * Baut das Detail-Panel aus dem serverseitig vorgerenderten detail_html
     * (siehe rex_api_mediaplace_json_metainfo::renderDetailHtml() +
     * fragments/mediaplace/detail_panel.php) -- ersetzt die frueheren
     * ~140 Zeilen JS-String-Konkatenation. Interaktion (Klick/Keydown/Input/
     * Change) haengt per Event-Delegation auf overlay und wird dadurch nicht
     * beruehrt. Setzt nur noch die JS-Dirty-Check-Baselines und erledigt,
     * was echte Laufzeitinformation braucht, die PHP zum Renderzeitpunkt
     * nicht kennen kann (Auswaehlen-Button-Sichtbarkeit, erzwungener
     * Cache-Buster nach Datei-Ersetzen).
     */
    function renderDetail(jsonPayload) {
        var jsonData = (jsonPayload && isObj(jsonPayload.data)) ? jsonPayload.data : {};
        detailFieldDefs = (jsonPayload && Array.isArray(jsonPayload.fields)) ? jsonPayload.fields : [];
        detailClangs = (jsonPayload && Array.isArray(jsonPayload.clangs)) ? jsonPayload.clangs : [];
        detailSystemTagCatalog = (jsonPayload && Array.isArray(jsonPayload.system_tag_catalog)) ? jsonPayload.system_tag_catalog : [];
        var allSystemTags = (jsonPayload && Array.isArray(jsonPayload.system_tags)) ? jsonPayload.system_tags : [];
        var splitSystem = splitSystemTags(allSystemTags);
        detailOriginalSystemTags = deepClone(splitSystem.normal);
        detailOriginalCollectionSystemTags = deepClone(splitSystem.collections);
        detailOriginalTitle = String((jsonPayload && jsonPayload.title) || '');
        detailOriginalJson = deepClone(jsonData);
        // Checkbox-Felder liefern in collectJsonValuesFromDetail() immer ein echtes
        // Bool (nie null), damit "explizit Nein" von "nie gesetzt" unterscheidbar
        // bleibt. Ein Feld, das fuer diese Datei noch nie gespeichert wurde, fehlt
        // im Server-Datensatz dagegen komplett -- ohne dieses Nachziehen wuerde der
        // Dirty-Check das faelschlich als Aenderung werten (false vs. fehlender Key).
        detailFieldDefs.forEach(function (field) {
            if ('checkbox' === field.widget_type && !Object.prototype.hasOwnProperty.call(detailOriginalJson, field.key)) {
                detailOriginalJson[field.key] = false;
            }
        });

        detailPanel.innerHTML = (jsonPayload && jsonPayload.detail_html) || '';

        // Cache-Buster nach Datei-Ersetzen erzwingen (mediaForceCacheTokens),
        // falls der Server-Render noch die vorherige updatedate eingebettet hat.
        if (selectedFile && mediaForceCacheTokens[selectedFile]) {
            var forceToken = String(mediaForceCacheTokens[selectedFile]);
            qsa('.mp3-detail-preview img, .mp3-detail-preview source, .mp3-lightbox-open-btn', detailPanel).forEach(function (el) {
                ['src', 'data-lightbox-src'].forEach(function (attr) {
                    var val = el.getAttribute(attr);
                    if (!val) return;
                    var next = val.replace(/([?&])mp3v=[^&]*/, '$1mp3v=' + encodeURIComponent(forceToken));
                    if (next === val) {
                        next = val + (val.indexOf('?') === -1 ? '?' : '&') + 'mp3v=' + encodeURIComponent(forceToken);
                    }
                    el.setAttribute(attr, next);
                });
            });
        }

        // "Auswaehlen"-Button: PHP kennt den Aufrufmodus (Picker vs. reines
        // Durchsuchen) nicht, daher immer gerendert und hier ein-/ausgeblendet.
        var selectBtn = qs('.mp3-detail-select-btn', detailPanel);
        if (selectBtn) selectBtn.style.display = (onSelect || onMultiSelect) ? '' : 'none';

        updateDetailSaveState();
    }


    // ---- Rendering ----

    // Grid-Ansicht (Kacheln) bekommt bewusst ein festes Querformat statt des
    // natuerlichen Seitenverhaeltnisses -- gleichmaessige Zeilenhoehen statt
    // "springendem" Grid. Nur die Media-Wall (Masonry, siehe cardAspectRatio())
    // zeigt das echte Format.
    var GRID_TILE_RATIO = '4 / 3';

    /**
     * Build preview HTML for a single media file. Genutzt von Grid- und Media-
     * Wall-Ansicht (renderFilesGrid()/renderFilesMediaWall()), beide per Slider
     * auf bis zu 360px CSS-Breite skalierbar (--mp3-tile-size) -- deshalb der
     * eigene, groessere Media-Manager-Typ statt rex_media_small (200x200),
     * siehe install.php.
     *
     * @param {string|null} [ratioOverride] Explizites aspect-ratio (z.B. aus
     *   cardAspectRatio() fuer die Media-Wall). Ohne Angabe greift das feste
     *   Grid-Querformat (GRID_TILE_RATIO).
     */
    function previewHtml(file, ratioOverride) {
        if (isImage(file.filename)) {
            var src = mediaThumbSrc(file.filename, 'mediaplace_thumb', file, mediaForceCacheTokens, lastLoadedFiles, mediaBaseUrl);
            var ratio = (undefined !== ratioOverride) ? ratioOverride : GRID_TILE_RATIO;
            var style = ratio ? ' style="aspect-ratio:' + ratio + '"' : '';
            return '<img src="' + escAttr(src) + '" alt="' + escAttr(file.title || file.filename) + '"' + style + '>';
        }
        return '<div class="mp3-icon"><i class="' + fileIcon(file.filename) + '"></i></div>';
    }

    /**
     * Natuerliches Seitenverhaeltnis fuer die Media-Wall (Masonry-Ansicht),
     * geclampt gegen absurde Panorama-/Hochformat-Extreme -- ohne Clamp wuerde
     * z.B. ein extremes Hochkantbild eine einzelne Spalte beliebig lang und
     * damit das ganze Masonry-Layout unbrauchbar machen. Fehlt width/height
     * (kein Bild oder fehlende Metadaten), greift der CSS-Fallback (1/1).
     */
    function cardAspectRatio(file) {
        if (file.width && file.height && file.width > 0 && file.height > 0) {
            var r = file.width / file.height;
            r = Math.max(0.5, Math.min(r, 2.2));
            return r.toFixed(4);
        }
        return null;
    }

    function renderFileTagDots(file) {
        // Normale Tags und Sammlungs-Zugehoerigkeit sind beides System-Tags (nur am
        // "collection:"-Praefix unterscheidbar), aber zwei getrennt abschaltbare
        // Features -- je nach Toggle-Stand nur die jeweils passende Teilmenge zeigen.
        var split = splitSystemTags(file && file.system_tags ? file.system_tags : []);
        var tags = (features.tagging ? split.normal : []).concat(features.collections ? split.collections : []);
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
            return '<div class="mp3-file-tag-dots">' +
                '<span class="mp3-file-tag-dot mp3-file-tag-dot-mixed" style="background:' + escAttr(mixedBg) + '" title="' + escAttr(t('mediaplace_multiple_tags_count', { count: tags.length })) + '"></span>' +
                '<span class="mp3-file-tag-more" title="' + escAttr(t('mediaplace_multiple_tags')) + '">' + t('mediaplace_multiple_tags') + '</span>' +
                '</div>';
        }

        var html = '<div class="mp3-file-tag-dots">';
        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i] || {};
            var tagName = String(tag.name || '').trim();
            if (!tagName) continue;
            var color = /^#[0-9a-fA-F]{6}$/.test(String(tag.color || '')) ? String(tag.color).toLowerCase() : '#4a90d9';
            html += '<span class="mp3-file-tag-dot" style="background:' + escAttr(color) + '" title="' + escAttr(tagName) + '"></span>';
        }
        html += '</div>';
        return html;
    }

    function renderFiles(files) {
        if (!files || !files.length) {
            // className explizit zuruecksetzen: bleibt sonst z. B. auf
            // "mp3-grid mp3-view-mediawall" (CSS-Mehrspalten) vom letzten
            // Render stehen und die Meldung wird von der Spalten-Engine
            // mitten im Inhalt in Fragmente zerrissen.
            grid.className = 'mp3-grid';
            grid.innerHTML = '<div style="padding:40px;text-align:center;color:#6c757d;">' +
                '<i class="fa-solid fa-box-open" style="font-size:2em;display:block;margin-bottom:10px;"></i>' +
                t('mediaplace_no_files') + '</div>';
            updateStatus(0);
            return;
        }

        if (viewMode === 'list') {
            renderFilesList(files);
        } else if (viewMode === 'mediawall' || viewMode === 'masonry') {
            renderFilesMediaWall(files);
        } else {
            renderFilesGrid(files);
        }
        updateStatus(files.length);
    }

    function renderFilesGrid(files) {
        var html = '';
        var activeCollection = features.collections ? getActiveCollection() : null;
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var isMultiSel = multiMode && multiSelected[f.filename];
            var inCollection = activeCollection ? isFileInActiveCollection(f.filename) : false;
            var displayName = f.title || f.filename;
            html += '<div class="mp3-card' + (isMultiSel ? ' mp3-card-multi-selected' : '') + '" draggable="true" data-filename="' + escAttr(f.filename) + '">' +
                (multiMode ? '<div class="mp3-card-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></div>' : '') +
                (activeCollection ? '<button type="button" class="mp3-collection-toggle-btn' + (inCollection ? ' is-active' : '') + '" data-toggle-collection-file="' + escAttr(f.filename) + '" title="' + escAttr(inCollection ? t('mediaplace_remove_from_collection') : t('mediaplace_add_to_collection')) + '"><i class="fa-solid fa-bookmark"></i></button>' : '') +
                previewHtml(f) +
                '<div class="mp3-info">' +
                    '<span class="mp3-card-name" title="' + escAttr(f.filename) + '">' + escAttr(displayName) + '</span>' +
                    (f.title ? '<span class="mp3-fname" title="' + escAttr(f.filename) + '">' + escAttr(f.filename) + '</span>' : '') +
                    '<span class="mp3-fmeta">' + formatBytes(f.filesize) + '</span>' +
                    renderFileTagDots(f) +
                '</div>' +
            '</div>';
        }
        grid.className = 'mp3-grid';
        grid.innerHTML = html;
    }

    function renderFilesList(files) {
        var activeCollection = features.collections ? getActiveCollection() : null;
        var html = '<table class="mp3-list-table">';
        html += '<thead><tr>' +
            (multiMode ? '<th class="mp3-list-th-check"></th>' : '') +
            '<th class="mp3-list-th-preview"></th>' +
            '<th>' + t('mediaplace_name') + '</th>' +
            (activeCollection ? '<th class="mp3-list-th-collection" title="' + escAttr(t('mediaplace_collection')) + '">★</th>' : '') +
            '<th>' + t('mediaplace_field_type') + '</th>' +
            '<th>' + t('mediaplace_field_size') + '</th>' +
            '<th>' + t('mediaplace_date') + '</th>' +
        '</tr></thead><tbody>';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var sel = (selectedFile === f.filename) ? ' mp3-list-row-selected' : '';
            var isMultiSel = multiMode && multiSelected[f.filename];
            if (isMultiSel) sel += ' mp3-list-row-multi-selected';
            html += '<tr class="mp3-list-row' + sel + '" data-filename="' + escAttr(f.filename) + '" draggable="true">';
            if (multiMode) {
                html += '<td class="mp3-list-cell-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></td>';
            }
            html += '<td class="mp3-list-cell-preview">';
            if (isImage(f.filename)) {
                var src = mediaThumbSrc(f.filename, 'rex_media_small', f, mediaForceCacheTokens, lastLoadedFiles, mediaBaseUrl);
                html += '<img src="' + escAttr(src) + '" alt="">';
            } else {
                html += '<i class="' + fileIcon(f.filename) + '"></i>';
            }
            html += '</td>';
            var listLabel = f.title ? escAttr(f.title) : escAttr(f.filename);
            var listTooltip = f.title ? escAttr(f.filename) : '';
            html += '<td class="mp3-list-cell-name"' + (listTooltip ? ' title="' + listTooltip + '"' : '') + '><div class="mp3-list-name-wrap"><span>' + listLabel + '</span>' + renderFileTagDots(f) + '</div></td>';
            if (activeCollection) {
                var rowInCollection = isFileInActiveCollection(f.filename);
                html += '<td class="mp3-list-cell-collection">' +
                    '<button type="button" class="mp3-collection-toggle-btn' + (rowInCollection ? ' is-active' : '') + '" data-toggle-collection-file="' + escAttr(f.filename) + '" title="' + (rowInCollection ? t('mediaplace_remove_from_collection') : t('mediaplace_add_to_collection')) + '"><i class="fa-solid fa-bookmark"></i></button>' +
                    '</td>';
            }
            html += '<td class="mp3-list-cell-type">' + escAttr(f.filetype || '') + '</td>';
            html += '<td class="mp3-list-cell-size">' + formatBytes(f.filesize) + '</td>';
            html += '<td class="mp3-list-cell-date">' + formatDate(f.createdate) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        grid.className = 'mp3-grid mp3-view-list';
        grid.innerHTML = html;
    }

    function renderFilesMediaWall(files) {
        var activeCollection = features.collections ? getActiveCollection() : null;
        var html = '';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var isSel = (selectedFile === f.filename);
            var isMultiSel = multiMode && multiSelected[f.filename];
            var inCollection = activeCollection ? isFileInActiveCollection(f.filename) : false;
            var displayName = f.title || f.filename;

            html += '<div class="mp3-masonry-card' +
                (isSel ? ' mp3-masonry-card-selected' : '') +
                (isMultiSel ? ' mp3-masonry-card-multi' : '') +
                '" data-filename="' + escAttr(f.filename) + '" draggable="true">';

            // Overlay toolbar
            html += '<div class="mp3-masonry-toolbar">';
            if (multiMode) {
                html += '<span class="mp3-masonry-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></span>';
            }
            if (activeCollection) {
                html += '<button type="button" class="mp3-collection-toggle-btn' + (inCollection ? ' is-active' : '') + '" data-toggle-collection-file="' + escAttr(f.filename) + '" title="' + (inCollection ? t('mediaplace_remove_from_collection') : t('mediaplace_add_to_collection')) + '"><i class="fa-solid fa-bookmark"></i></button>';
            }
            html += '</div>';

            // Media -- natuerliches Seitenverhaeltnis (siehe cardAspectRatio()) statt
            // fester Quadrat-/Breit-/Hoch-Buckets, fuer echten Masonry-Effekt.
            var wallRatio = cardAspectRatio(f);
            var wallMediaStyle = wallRatio ? ' style="aspect-ratio:' + wallRatio + '"' : '';
            html += '<div class="mp3-masonry-media"' + wallMediaStyle + '>' + previewHtml(f, wallRatio) + '</div>';

            // Footer
            html += '<div class="mp3-masonry-footer">' +
                '<span class="mp3-masonry-name" title="' + escAttr(f.filename) + '">' + escAttr(displayName) + '</span>' +
                renderFileTagDots(f) +
                '<span class="mp3-masonry-meta">' + formatBytes(f.filesize) + '</span>' +
                '</div>';

            html += '</div>';
        }
        grid.className = 'mp3-grid mp3-view-mediawall';
        grid.innerHTML = html;
    }

    function applyCategorySearchFilter() {
        if (!sidebar) return;

        var input = qs('.mp3-cat-search-input', sidebar);
        var term = String((input ? input.value : categorySearchTerm) || '').trim().toLowerCase();
        categorySearchTerm = term;

        var headers = qsa('.mp3-cat-header', sidebar);
        var nodes = qsa('.mp3-cat-node', sidebar);
        var childrenBlocks = qsa('.mp3-cat-children', sidebar);
        var emptyHint = qs('.mp3-cat-search-empty', sidebar);

        if (!term) {
            headers.forEach(function (el) { el.classList.remove('mp3-cat-hidden'); });
            nodes.forEach(function (el) { el.classList.remove('mp3-cat-hidden', 'mp3-cat-match'); });
            childrenBlocks.forEach(function (el) { el.classList.remove('mp3-cat-hidden'); });
            if (emptyHint) emptyHint.remove();
            return;
        }

        headers.forEach(function (header) {
            var label = qs('.mp3-cat', header);
            var text = String(label ? label.textContent : '').toLowerCase();
            header.classList.toggle('mp3-cat-hidden', text.indexOf(term) === -1);
        });

        nodes.forEach(function (node) {
            var label = qs('.mp3-cat', node);
            var text = String(label ? label.textContent : '').toLowerCase();
            var isMatch = text.indexOf(term) !== -1;
            node.classList.toggle('mp3-cat-match', isMatch);
            node.classList.toggle('mp3-cat-hidden', !isMatch);
        });

        // Keep category path visible for each matching node. Zugeklappte
        // Vorfahren-Knoten muessen zusaetzlich "mp3-cat-node-open" bekommen --
        // ihr .mp3-cat-children-Block ist per CSS sonst display:none (siehe
        // mediapool3.css), das reine Entfernen von "mp3-cat-hidden" wuerde den
        // Treffer also nicht sichtbar machen.
        nodes.forEach(function (node) {
            if (!node.classList.contains('mp3-cat-match')) return;
            var parent = node.parentElement;
            while (parent && parent !== sidebar) {
                var parentNode = parent.closest('.mp3-cat-node');
                if (!parentNode) break;
                parentNode.classList.remove('mp3-cat-hidden');
                parentNode.classList.add('mp3-cat-node-open');
                var toggleIcon = parentNode.querySelector(':scope > .mp3-cat-row .mp3-cat-toggle');
                if (toggleIcon) {
                    toggleIcon.classList.remove('fa-chevron-right');
                    toggleIcon.classList.add('fa-chevron-down');
                }
                parent = parentNode.parentElement;
            }
        });

        childrenBlocks.forEach(function (block) {
            var visible = !!qs('.mp3-cat-node:not(.mp3-cat-hidden)', block);
            block.classList.toggle('mp3-cat-hidden', !visible);
        });

        var visibleHeaders = headers.filter(function (el) { return !el.classList.contains('mp3-cat-hidden'); }).length;
        var visibleNodes = nodes.filter(function (el) { return !el.classList.contains('mp3-cat-hidden'); }).length;
        if ((visibleHeaders + visibleNodes) === 0) {
            if (!emptyHint) {
                emptyHint = document.createElement('div');
                emptyHint.className = 'mp3-cat-search-empty';
                sidebar.insertBefore(emptyHint, qs('.mp3-cat-tree', sidebar) || sidebar.firstChild);
            }
            emptyHint.textContent = t('mediaplace_no_category_found');
        } else if (emptyHint) {
            emptyHint.remove();
        }
    }

    /**
     * Baut die statische Sidebar-Huelle (Suche, "Alle Medien"/"Medienpool",
     * Baum-Container, Sammlungen-Container) und fuellt den Baum mit dem vom
     * Server gerenderten treeHtml (siehe loadCategories()). Kategorie-Icons/
     * Aktionsmenue/Einrueckung leben jetzt in fragments/mediaplace/
     * (category_children.php/category_node.php) statt hier als JS-String.
     */
    function renderCategories(treeHtml) {
        var html = '<div class="mp3-cat-search-wrap">' +
            '<i class="fa-solid fa-magnifying-glass"></i>' +
            '<input type="text" class="mp3-cat-search-input" placeholder="' + escAttr(t('mediaplace_search_category_placeholder')) + '" value="' + escAttr(categorySearchTerm) + '">' +
            '</div>' +
            '<div class="mp3-cat-tree">' +
                '<div class="mp3-cat-header">' +
                    '<a class="mp3-cat' + (currentCat === -1 ? ' mp3-cat-active' : '') + '" data-cat="-1">' +
                        '<i class="fa-solid fa-layer-group"></i> ' + t('mediaplace_all_media') + '</a>' +
                '</div>' +
                '<div class="mp3-cat-header">' +
                    (canAccessRootCategory
                        ? '<a class="mp3-cat' + (currentCat === 0 ? ' mp3-cat-active' : '') + '" data-cat="0">' +
                            '<i class="fa-solid fa-house"></i> ' + t('mediaplace_root_media') + '</a>'
                        : '<span class="mp3-cat mp3-cat-disabled" title="' + escAttr(t('mediaplace_root_media_no_access')) + '">' +
                            '<i class="fa-solid fa-house"></i> ' + t('mediaplace_root_media') + '</span>') +
                    (canAccessRootCategory
                        ? '<button class="mp3-cat-add-btn" data-add-parent="0" title="' + escAttr(t('mediaplace_new_category')) + '">' +
                            '<i class="fa-solid fa-folder-plus"></i></button>'
                        : '') +
                '</div>' +
                (treeHtml || '') +
            '</div>' +
            (features.collections ? '<div id="mp3-collections-section">' + renderCollectionsSection() + '</div>' : '');
        sidebar.innerHTML = html;
        applyCategorySearchFilter();
        closeCatMenu();
    }

    /**
     * Nur die aktive Kategorie im Baum markieren -- reine DOM-Klassen-
     * Aktualisierung, kein Nachladen. Fuer reine Navigation (Kategorie
     * anklicken, Breadcrumb, ...), bei der sich die Baumstruktur selbst
     * nicht aendert.
     */
    function updateSidebarActiveState() {
        qsa('.mp3-cat', sidebar).forEach(function (el) {
            var id = parseInt(el.getAttribute('data-cat'), 10);
            el.classList.toggle('mp3-cat-active', id === currentCat);
        });
        closeCatMenu();
    }

    /**
     * Nur den Sammlungen-Abschnitt neu rendern (Mitgliederzahl, aktive
     * Sammlung, ...) -- der Kategorie-Baum kommt vom Server und aendert sich
     * dabei nicht, ein voller loadCategories()-Request waere unnoetig.
     */
    function refreshCollectionsSection() {
        if (!features.collections) return;
        var section = document.getElementById('mp3-collections-section');
        if (section) section.innerHTML = renderCollectionsSection();
        closeCatMenu();
    }

    /**
     * Baut das Kategorie-Aktionsmenue (Umbenennen/Verschieben/Unterkategorie/
     * Loeschen) dynamisch in #mp3-cat-menu-portal und positioniert es an
     * anchorBtn. Portal statt Inline-Dropdown, weil overflow-y:auto der
     * Sidebar ein absolut positioniertes Kind sonst am Rand abschneidet.
     */
    function openCatMenu(id, name, anchorBtn) {
        var portal = document.getElementById('mp3-cat-menu-portal');
        if (!portal || !anchorBtn) return;

        // Umbenennen/Verschieben/Loeschen brauchen Zugriff auf die
        // Elternkategorie (siehe category_node.php/data-can-manage) -- ohne
        // diesen Zugriff nur "Unterkategorie" anbieten, statt Aktionen zu
        // zeigen, die serverseitig ohnehin mit 403 abgelehnt wuerden.
        var canManage = anchorBtn.getAttribute('data-can-manage') !== '0';

        var html = '';
        if (canManage) {
            html += '<button class="mp3-cat-rename-btn" data-rename-cat="' + id + '"><i class="fa-solid fa-pen"></i> ' + t('mediaplace_rename') + '</button>' +
                '<button class="mp3-cat-move-btn" data-move-cat="' + id + '"><i class="fa-solid fa-folder-tree"></i> ' + t('mediaplace_move') + '</button>';
        }
        html += '<button class="mp3-cat-add-btn mp3-cat-add-sub" data-add-parent="' + id + '"><i class="fa-solid fa-plus"></i> ' + t('mediaplace_subcategory') + '</button>';
        if (canManage) {
            html += '<button class="mp3-cat-delete-btn" data-delete-cat="' + id + '" data-delete-cat-name="' + escAttr(name) + '"><i class="fa-solid fa-trash-can"></i> ' + t('mediaplace_delete') + '</button>';
        }
        portal.innerHTML = html;
        portal.classList.add('mp3-cat-menu-portal-open');
        portal.setAttribute('data-open-for', String(id));
        anchorBtn.classList.add('mp3-cat-menu-btn-active');

        var rect = anchorBtn.getBoundingClientRect();
        var menuW = portal.offsetWidth;
        var menuH = portal.offsetHeight;
        var left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
        var top = rect.bottom + 2;
        if (top + menuH > window.innerHeight - 8) {
            top = Math.max(8, rect.top - menuH - 2);
        }
        portal.style.left = left + 'px';
        portal.style.top = top + 'px';
    }

    function closeCatMenu() {
        var portal = document.getElementById('mp3-cat-menu-portal');
        if (!portal) return;
        portal.classList.remove('mp3-cat-menu-portal-open');
        portal.removeAttribute('data-open-for');
        portal.innerHTML = '';
        qsa('.mp3-cat-menu-btn.mp3-cat-menu-btn-active', overlay).forEach(function (b) {
            b.classList.remove('mp3-cat-menu-btn-active');
        });
    }

    /**
     * Show an inline input field in the sidebar to create a new category.
     */
    function showCategoryInput(parentId) {
        // Remove any existing input first
        var existing = qs('.mp3-cat-new-wrap', sidebar);
        if (existing) existing.remove();

        // Build the inline input
        var wrap = document.createElement('div');
        wrap.className = 'mp3-cat-new-wrap';

        var indent = 12;
        if (parentId > 0) {
            // Calculate depth based on catPath or simple nesting
            var depth = 0;
            var pid = parentId;
            while (pid > 0 && catCache[pid]) {
                depth++;
                pid = catCache[pid].parent_id || 0;
            }
            indent = (depth + 1) * 16;
        }

        wrap.innerHTML =
            '<div class="mp3-cat-new-input-row" style="padding-left:' + indent + 'px;">' +
                '<i class="fa-solid fa-folder-plus mp3-cat-new-icon"></i>' +
                '<input type="text" class="mp3-cat-new-input" data-parent="' + parentId + '" ' +
                    'placeholder="' + escAttr(t('mediaplace_category_name_placeholder')) + '" autocomplete="off">' +
                '<button type="button" class="mp3-cat-new-confirm" title="' + escAttr(t('mediaplace_create')) + '"><i class="fa-solid fa-check"></i></button>' +
                '<button type="button" class="mp3-cat-new-cancel" title="' + escAttr(t('mediaplace_cancel')) + '"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<p class="mp3-cat-new-error" style="display:none;padding-left:' + indent + 'px;"></p>';

        // Insert at the right position
        if (parentId === 0) {
            // After root "Medienpool" entry, before first child list
            var tree = qs('.mp3-cat-tree', sidebar);
            if (tree) {
                var firstChildren = qs('.mp3-cat-children', tree);
                if (firstChildren) {
                    tree.insertBefore(wrap, firstChildren);
                } else {
                    tree.appendChild(wrap);
                }
            }
        } else {
            // After the parent category node
            var parentNode = qs('.mp3-cat-node[data-cat-id="' + parentId + '"]', sidebar);
            if (parentNode) {
                // Insert after the parent node's <a> and before children
                parentNode.appendChild(wrap);
            }
        }

        // Focus the input
        var input = qs('.mp3-cat-new-input', wrap);
        if (input) {
            setTimeout(function () { input.focus(); }, 50);
        }
    }

    /**
     * Legt die Kategorie aus dem inline-Eingabefeld an (Enter-Taste oder
     * Bestaetigen-Button, siehe showCategoryInput()). Nach Erfolg wird die
     * Eltern-Kette der neuen Kategorie aufgeklappt (expandCategoryPath()) --
     * loadCategories() baut den Baum sonst komplett eingeklappt neu auf und
     * die gerade angelegte Unterkategorie waere unsichtbar.
     */
    function submitNewCategory(input) {
        var name = input.value.trim();
        if (!name) return;
        var parentId = parseInt(input.getAttribute('data-parent'), 10) || 0;
        input.disabled = true;
        var wrap = input.closest('.mp3-cat-new-wrap');
        var confirmBtn = wrap ? qs('.mp3-cat-new-confirm', wrap) : null;
        if (confirmBtn) confirmBtn.disabled = true;

        apiCreateCategory(name, parentId)
            .then(function () {
                catCache = {};
                catPath = [];
                return loadCategories();
            })
            .then(function () {
                if (parentId > 0) expandCategoryPath(parentId);
            })
            .catch(function (err) {
                console.error('MP3 createCategory error:', err);
                var errorEl = wrap ? qs('.mp3-cat-new-error', wrap) : null;
                if (errorEl) {
                    errorEl.textContent = categoryErrorMessage(err, 'mediaplace_error_creating');
                    errorEl.style.display = '';
                }
                input.disabled = false;
                if (confirmBtn) confirmBtn.disabled = false;
                input.focus();
            });
    }

    /**
     * Klappt die Eltern-Kette von catId im Baum auf (nutzt catCache, das
     * loadCategories() gerade neu befuellt hat), damit eine Kategorie nach
     * dem Anlegen/Navigieren sichtbar ist statt hinter zugeklappten Aesten
     * zu verschwinden.
     */
    function expandCategoryPath(catId) {
        var chain = [];
        var id = catId;
        while (id > 0 && catCache[id]) {
            chain.push(id);
            id = catCache[id].parent_id || 0;
        }
        chain.forEach(function (cid) {
            var node = qs('.mp3-cat-node[data-cat-id="' + cid + '"]', sidebar);
            if (node && !node.classList.contains('mp3-cat-node-open')) {
                toggleCategory(cid);
            }
        });
    }

    /**
     * Build the breadcrumb path from catCache by walking parent_id up.
     */
    function buildBreadcrumb(catId) {
        catPath = [];
        var id = catId;
        while (id > 0 && catCache[id]) {
            catPath.unshift({ id: id, name: catCache[id].name });
            id = catCache[id].parent_id || 0;
        }
        renderBreadcrumb();
    }

    function renderBreadcrumb() {
        if (!breadcrumb) return;
        var html = canAccessRootCategory
            ? '<a class="mp3-bc-item" data-cat="0"><i class="fa-solid fa-house"></i></a>'
            : '<span class="mp3-bc-item mp3-bc-item-disabled" title="' + escAttr(t('mediaplace_root_media_no_access')) + '"><i class="fa-solid fa-house"></i></span>';
        for (var i = 0; i < catPath.length; i++) {
            html += ' <i class="fa-solid fa-chevron-right mp3-bc-sep"></i> ';
            html += '<a class="mp3-bc-item" data-cat="' + catPath[i].id + '">' + escAttr(catPath[i].name) + '</a>';
        }
        breadcrumb.innerHTML = html;
    }

    function updateStatus(count) {
        if (statusBar) {
            var txt = t('mediaplace_hits', { count: count });
            if (mediaTotal > 0) {
                txt += ' | ' + t('mediaplace_loaded_of', { loaded: lastLoadedFiles.length, total: mediaTotal });
            }
            statusBar.textContent = txt;
        }
        updateHeaderInfo(count);
    }

    // currentSort -> api-Addon-Sortsyntax "feld:richtung" (ListHelper::parseSort()).
    // Ohne dieses Mapping sortiert der Server IMMER nach filename asc (Default
    // sowohl im api-Addon als auch im eigenen Fallback) und die Sortier-Auswahl
    // im UI wirkt nur auf die eine bereits geladene Seite -- bei mehr Dateien
    // als mediaPerPage kann die "neueste" Datei alphabetisch weit hinten liegen
    // und dadurch in "Alle Medien" gar nicht erst mitgeladen werden, obwohl sie
    // im Sortier-Ergebnis eigentlich ganz oben stehen muesste.
    var SORT_API_MAP = {
        date_desc: 'createdate:desc',
        date_asc: 'createdate:asc',
        filename_asc: 'filename:asc',
        filename_desc: 'filename:desc',
        title_asc: 'title:asc',
        title_desc: 'title:desc',
        size_desc: 'filesize:desc',
        size_asc: 'filesize:asc'
    };

    // Gemeinsamer Filter-Anteil (Kategorie/Suche/Rechte) fuer die eigentliche
    // Medienliste UND fetchTypeCounts() -- beide muessen exakt denselben
    // Ausschnitt beschreiben, sonst passen Zaehler und geladene Treffer nicht
    // zusammen. Tags bleiben bewusst aussen vor: sie sind MediaPlace's eigenes
    // System (rex_mediaplace_media_tags), die Medienliste (weder api-Addon
    // noch der eigene Fallback) kennt sie nicht -- Tag-Filterung bleibt
    // client-seitig auf den bereits geladenen Dateien (siehe applyFilterSort()).
    function buildBaseFilterParams() {
        // filter[term] durchsucht serverseitig Dateiname UND Titel (inkl.
        // "quoted phrases" und type:jpg,png) -- api-Addon CHANGELOG 1.3 (#64).
        // filter[permitted_only]=1: der klassische Medienpool gibt jedem
        // Backend-User mit Basis-Medienrecht Leserecht auf ALLE Kategorien
        // (siehe api-Addon PR #78), das api-Addon spiegelt das seit dessen
        // Fix per Default exakt nach. MediaPlace will bewusst die strengere
        // Kategorie-Rechtefilterung -- ohne dieses Flag wuerde ab der Version,
        // die den Fix bringt, sonst still wieder der permissive Default
        // greifen (data-api-media-list-secure="1", kein Fallback mehr aktiv).
        var params = '&filter[permitted_only]=1';
        // catId -1 = alle Medien (kein Kategorie-Filter)
        if (currentCat >= 0) {
            params += '&filter[category_id]=' + currentCat;
        }
        if (mediaQuery) {
            params += '&filter[term]=' + encodeURIComponent(mediaQuery);
        }
        return params;
    }

    function buildMediaEndpoint() {
        var endpoint = 'media?per_page=' + mediaPerPage + '&page=' + mediaPage + buildBaseFilterParams();
        // Harter Server-Filter analog zum Typ-Tab -- "other" hat keine
        // Endungsliste (siehe TYPE_EXTENSIONS-Kommentar) und bleibt daher wie
        // bisher rein client-seitig gefiltert.
        if (TYPE_EXTENSIONS[currentFilter]) {
            endpoint += '&filter[types]=' + encodeURIComponent(TYPE_EXTENSIONS[currentFilter].join(','));
        }
        if (SORT_API_MAP[currentSort]) {
            endpoint += '&sort=' + encodeURIComponent(SORT_API_MAP[currentSort]);
        }
        return endpoint;
    }

    // ---- Typ-Zaehler (Filter-Tabs) ----
    // lastLoadedFiles enthaelt nur die bereits geladene(n) Seite(n) -- ein
    // reiner Client-Count daraus (fruehere Implementierung) zeigt bei grossen
    // Kategorien falsche/0-Zaehler fuer Typen, die noch nicht mitgeladen
    // wurden. Holt stattdessen pro Typ die echte Gesamtzahl vom Server
    // (per_page=1, nur meta.total wird gebraucht) -- 5 sehr leichte Requests,
    // gecacht ueber typeCountsKey (Kategorie+Suche), damit ein reiner
    // Typ-Tab-Wechsel oder Tag-Filter keinen erneuten Abruf ausloest.
    var typeCounts = null; // { all, images, videos, audio, documents, other }
    var typeCountsKey = null;
    var typeCountsRequestId = 0;

    function currentTypeCountsKey() {
        return currentCat + '|' + mediaQuery;
    }

    function fetchTypeCounts() {
        var key = currentTypeCountsKey();
        typeCountsKey = key;
        var requestId = ++typeCountsRequestId;
        var base = buildBaseFilterParams();

        function fetchCount(typeKey) {
            var endpoint = 'media?per_page=1&page=1' + base;
            if (TYPE_EXTENSIONS[typeKey]) {
                endpoint += '&filter[types]=' + encodeURIComponent(TYPE_EXTENSIONS[typeKey].join(','));
            }
            return apiFetchMediaList(endpoint)
                .then(function (payload) {
                    var meta = (payload && payload.meta) ? payload.meta : {};
                    return parseInt(meta.total, 10) || 0;
                })
                .catch(function () { return null; });
        }

        Promise.all([
            fetchCount('all'),
            fetchCount('images'),
            fetchCount('videos'),
            fetchCount('audio'),
            fetchCount('documents')
        ]).then(function (results) {
            if (requestId !== typeCountsRequestId || key !== currentTypeCountsKey()) return;
            var all = results[0];
            var images = results[1];
            var videos = results[2];
            var audio = results[3];
            var documents = results[4];
            if (null === all) {
                typeCounts = null;
                return;
            }
            var known = [images, videos, audio, documents].every(function (v) { return null !== v; });
            typeCounts = {
                all: all,
                images: images,
                videos: videos,
                audio: audio,
                documents: documents,
                // "other" hat keinen eigenen Server-Ausdruck (kein NOT-IN),
                // daher per Subtraktion -- kann leicht daneben liegen, wenn
                // eine Datei durch keine der vier Listen erfasst wird UND
                // gleichzeitig ein Zaehl-Request fehlschlug, ist dann aber
                // schon durch "known" abgefangen (undefined statt falscher Wert).
                other: known ? Math.max(0, all - images - videos - audio - documents) : null
            };
            updateFilterCounts();
        });
    }

    // visibleFiles: die tatsaechlich sichtbaren (gefilterten) Dateiobjekte,
    // nicht nur eine Anzahl -- fuer die Gesamtgroesse der aktuellen Ansicht
    // (nur ueber bereits geladene Seiten aufsummiert, nicht den ganzen Pool,
    // gleiche Grenze wie bei applyFilterSort()/lastLoadedFiles generell).
    function updatePaginationUi(visibleFiles) {
        if (!overlay) return;
        var footer = qs('.mp3-page-footer', overlay);
        if (!footer) return;
        var btn = qs('.mp3-load-more-btn', footer);
        var info = qs('.mp3-page-info', footer);
        if (!btn || !info) return;

        var loaded = lastLoadedFiles.length;
        var total = mediaTotal || loaded;
        if (mediaLoading) {
            info.textContent = t('mediaplace_loading_more');
            btn.style.display = 'none';
            return;
        }

        var totalSize = 0;
        for (var i = 0; i < visibleFiles.length; i++) {
            totalSize += parseInt(visibleFiles[i].filesize, 10) || 0;
        }

        info.textContent = t('mediaplace_visible_summary', { count: visibleFiles.length, size: formatBytes(totalSize), loaded: loaded, total: total });
        btn.style.display = mediaHasMore ? '' : 'none';
    }

    /**
     * Update the header info bar: shows current category and file count.
     */
    function updateHeaderInfo(count) {
        var el = document.getElementById('mp3-header-info');
        if (!el) return;

        var catName = '';
        if (currentCat === -1) {
            catName = t('mediaplace_all_media');
        } else if (currentCat === 0) {
            catName = t('mediaplace_no_category');
        } else if (catCache[currentCat]) {
            catName = catCache[currentCat].name;
        }

        var parts = [];
        if (catName) {
            parts.push('<i class="fa-solid fa-folder-open mp3-hi-icon"></i> ' + escAttr(catName));
        }
        var activeCol = getActiveCollection();
        if (activeCol) {
            parts.push('<i class="fa-solid fa-compact-disc mp3-hi-icon"></i> ' + escAttr(activeCol.name));
        }
        if (typeof count === 'number') {
            parts.push('<i class="fa-solid fa-images mp3-hi-icon"></i> ' + count);
        }

        el.innerHTML = parts.join('<span class="mp3-hi-sep">|</span>');
    }

    /**
     * Wechselt die Grid-Ansicht in eine andere Kategorie (wie ein Klick auf die
     * Kategorie in der Sidebar) -- genutzt nach dem Verschieben von Dateien per
     * Detail-Panel-Dropdown oder Drag&Drop, damit man dort landet, wo die Datei(en)
     * jetzt liegen, statt sie nur aus der aktuellen Ansicht zu entfernen.
     */
    function navigateToCategory(catId) {
        currentCat = catId;
        localStorage.setItem('mp3_cat', String(catId));
        setActiveCollection(null);
        buildBreadcrumb(catId);
        updateSidebarActiveState();
        loadFiles(catId, true);
    }

    // ---- Data Loading ----
    function loadFiles(catId, reset) {
        currentCat = catId;

        if (reset) {
            mediaPage = 1;
            mediaHasMore = true;
            mediaTotal = 0;
            lastLoadedFiles = [];
            currentTagCatalog = [];
            if (grid) {
                grid.className = 'mp3-grid';
                grid.innerHTML = '<div style="padding:40px;text-align:center;">' +
                    '<i class="fa-solid fa-spinner fa-spin" style="font-size:2em;color:#3c4d60;"></i></div>';
            }
            // Nur neu abrufen, wenn sich Kategorie/Suche seit dem letzten
            // Abruf geaendert haben -- ein reiner Typ-Tab-Wechsel (ebenfalls
            // ein reset=true-Reload, siehe applyTypeFilter()) hat denselben
            // Schluessel und braucht keinen erneuten Zaehl-Request.
            if (typeCountsKey !== currentTypeCountsKey()) {
                fetchTypeCounts();
            }
        }

        if (!mediaHasMore || mediaLoading) {
            updatePaginationUi([]);
            return;
        }

        mediaLoading = true;
        var mySession = loadSessionId;

        var endpoint = buildMediaEndpoint();

        apiFetchMediaList(endpoint)
            .then(function (payload) {
                if (mySession !== loadSessionId) throw MP3_STALE_SESSION;
                var files = (payload && Array.isArray(payload.data)) ? payload.data : [];
                var meta = (payload && payload.meta) ? payload.meta : {};
                mediaTotal = parseInt(meta.total, 10) || 0;
                var page = parseInt(meta.page, 10) || mediaPage;
                var totalPages = parseInt(meta.total_pages, 10) || page;
                mediaHasMore = page < totalPages;
                mediaPage = page + 1;

                var taggedFiles = files.slice();
                var filenames = taggedFiles.map(function (f) { return f.filename; }).filter(Boolean);

                // Unbenutzt-Status nur abfragen, wenn der Filter aktiv ist (eigenes
                // Recht + Toggle) -- pro geladener Seite, nicht fuer den ganzen Pool
                // (siehe rex_api_mediaplace_unused.php). Eigener catch(), damit
                // ein Fehler hier nicht das Laden der Seite insgesamt blockiert.
                var unusedPromise = (canFilterUnused && unusedOnlyFilter && filenames.length)
                    ? apiCheckUnusedMedia(filenames).catch(function () { return null; })
                    : Promise.resolve(null);

                return Promise.all([apiLoadSystemTagsForFiles(filenames), unusedPromise])
                    .then(function (results) {
                        var tagsPayload = results[0];
                        var unusedList = results[1];
                        var fileTags = tagsPayload.file_tags || {};
                        currentTagCatalog = Array.isArray(tagsPayload.catalog) ? tagsPayload.catalog : currentTagCatalog;

                        for (var i = 0; i < taggedFiles.length; i++) {
                            var fn = String(taggedFiles[i].filename || '');
                            taggedFiles[i].system_tags = Array.isArray(fileTags[fn]) ? fileTags[fn] : [];
                        }

                        if (Array.isArray(unusedList)) {
                            var unusedSet = {};
                            for (var u = 0; u < unusedList.length; u++) unusedSet[unusedList[u]] = true;
                            for (var j = 0; j < filenames.length; j++) {
                                unusedStatusCache[filenames[j]] = !!unusedSet[filenames[j]];
                            }
                        }

                        if (reset) {
                            lastLoadedFiles = taggedFiles;
                        } else {
                            lastLoadedFiles = lastLoadedFiles.concat(taggedFiles);
                        }
                    })
                    .catch(function () {
                        for (var i = 0; i < taggedFiles.length; i++) {
                            taggedFiles[i].system_tags = [];
                        }
                        if (reset) {
                            lastLoadedFiles = taggedFiles;
                        } else {
                            lastLoadedFiles = lastLoadedFiles.concat(taggedFiles);
                        }
                    });
            })
            .then(function () {
                if (mySession !== loadSessionId) throw MP3_STALE_SESSION;
                updateTagFilterOptions();
                // Sammlungen-Abschnitt neu rendern, sobald Katalog-/Tag-Daten da
                // sind, damit Sammlungen beim ersten Oeffnen sichtbar sind.
                refreshCollectionsSection();
                refreshDisplay();
            })
            .catch(function (err) {
                if (err === MP3_STALE_SESSION) return;

                // Kein Zugriff auf die aktuell gewaehlte Kategorie (z.B.
                // Erstaufruf landet per Default auf Kategorie 0 "kein Ordner",
                // die viele auf einzelne Kategorien eingeschraenkte User gar
                // nicht haben -- siehe MediaPermission::hasCategoryAccess()).
                // Statt der generischen "API nicht erreichbar"-Meldung
                // automatisch auf "Alle Medien" ausweichen: dank serverseitiger
                // Rechtefilterung zeigt das ohnehin nur die eigenen Kategorien,
                // der User landet also direkt bei seinen Dateien statt vor
                // einem Fehler zu stehen.
                if (err && 403 === err.status && -1 !== currentCat) {
                    // mediaLoading wird erst im Cleanup-.then() NACH diesem
                    // catch() zurueckgesetzt -- ein synchroner Retry hier waere
                    // sonst durch die eigene mediaLoading-Guard oben blockiert
                    // (kein Fetch, kein refreshDisplay(), Grid haengt dauerhaft
                    // im Spinner-Zustand fest). Deshalb hier vorab freigeben.
                    mediaLoading = false;
                    // Breadcrumb/Sidebar synchron nachziehen: navigateToCategory()
                    // hat sie schon VOR diesem fehlgeschlagenen loadFiles()-Aufruf
                    // auf die urspruenglich gewaehlte (nicht erlaubte) Kategorie
                    // gesetzt -- ohne das hier zu korrigieren, zeigen sie weiterhin
                    // die alte Kategorie, waehrend das Grid bereits "Alle Medien"
                    // laedt (sah aus wie: gewaehlte Kategorie enthaelt Dateien, die
                    // eigentlich aus "Alle Medien" stammen).
                    currentCat = -1;
                    localStorage.setItem('mp3_cat', '-1');
                    buildBreadcrumb(-1);
                    updateSidebarActiveState();
                    loadFiles(-1, true);
                    return;
                }

                if (reset) {
                    lastLoadedFiles = [];
                    currentTagCatalog = [];
                    updateTagFilterOptions();
                    if (err && 403 === err.status) {
                        grid.innerHTML = '<div style="padding:40px;text-align:center;color:#6c757d;">' +
                            '<i class="fa-solid fa-folder-open"></i> ' + t('mediaplace_no_category_access') + '</div>';
                    } else {
                        grid.innerHTML = '<div style="padding:40px;text-align:center;color:#c9302c;">' +
                            '<i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_api_error', { msg: escAttr(err.message) }) +
                            '<br><small style="color:#6c757d;">' + t('mediaplace_api_check_hint') + '</small></div>';
                    }
                }
                console.error('MP3 loadFiles error:', err);
            })
            .then(function () {
                // Stale Session (siehe loadSessionId oben): mediaLoading/Pagination
                // NICHT anfassen -- die neuere, noch laufende Session hat das
                // laengst selbst zurueckgesetzt, ein spaeteres Ueberschreiben hier
                // wuerde faelschlich "nicht mehr am Laden" signalisieren, waehrend
                // die neue Session noch aktiv laedt.
                if (mySession !== loadSessionId) return;
                mediaLoading = false;
                var visibleFiles = applyFilterSort(lastLoadedFiles);
                var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
                if (q) {
                    visibleFiles = visibleFiles.filter(function (f) {
                        var filename = String(f.filename || '').toLowerCase();
                        var title = String(f.title || '').toLowerCase();
                        return filename.indexOf(q) !== -1 || title.indexOf(q) !== -1;
                    });
                }
                updatePaginationUi(visibleFiles);
            });
    }

    /**
     * Holt den kompletten Kategoriebaum als fertiges HTML vom Server (siehe
     * rex_api_mediaplace_categories::renderTreeHtml(), fragments/
     * mediaplace/) und baut die Sidebar neu auf. Ersetzt das fruehere
     * lazy Nachladen pro Ebene (api-Addon media/category) -- bei der
     * ueberschaubaren Kategorienzahl typischer Installationen lohnt sich ein
     * Request fuer den ganzen Baum mehr als ein Request pro Aufklappen.
     *
     * catCache ist danach nur noch eine FLACHE id -> {name, parent_id}-Map
     * (Auf-/Zuklapp-Zustand lebt seitdem rein im DOM, siehe toggleCategory()) --
     * genutzt fuer Namens-/Parent-Lookups (Umbenennen-Prompt, Move-Modal,
     * Breadcrumb, Einrueck-Berechnung beim Anlegen).
     */
    function loadCategories() {
        // Aufklapp-Zustand vor dem Neuaufbau merken und danach wiederherstellen
        // -- der frisch vom Server gerenderte Baum ist immer komplett
        // eingeklappt (siehe renderTreeHtml()), sonst wuerde jeder Reload
        // (nach Umbenennen/Verschieben/Loeschen) den ganzen Baum zuklappen.
        var openIds = qsa('.mp3-cat-node.mp3-cat-node-open', sidebar).map(function (n) {
            return n.getAttribute('data-cat-id');
        });
        var mySession = loadSessionId;

        var baseUrl = getCategoriesApiUrl();
        var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'current_cat=' + currentCat;
        return fetch(url, {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (json) {
                // Stale Session (siehe loadSessionId-Kommentar bei der
                // Deklaration): ein neuerer open()/close() ist inzwischen
                // dazwischengekommen, dieses Ergebnis nicht mehr anwenden.
                if (mySession !== loadSessionId) return;
                var list = Array.isArray(json.categories) ? json.categories : [];
                catCache = {};
                for (var i = 0; i < list.length; i++) {
                    var c = list[i];
                    catCache[c.id] = { name: c.name, parent_id: c.parent_id || 0 };
                }
                renderCategories(typeof json.tree_html === 'string' ? json.tree_html : '');
                openIds.forEach(function (id) {
                    var node = qs('.mp3-cat-node[data-cat-id="' + id + '"]', sidebar);
                    if (!node) return;
                    node.classList.add('mp3-cat-node-open');
                    var icon = node.querySelector(':scope > .mp3-cat-row .mp3-cat-toggle');
                    if (icon) {
                        icon.classList.remove('fa-chevron-right');
                        icon.classList.add('fa-chevron-down');
                    }
                });
            })
            .catch(function (err) {
                if (mySession !== loadSessionId) return;
                console.error('MP3 loadCategories error:', err);
                renderCategories('');
            });
    }

    /**
     * Kategorie im Baum auf-/zuklappen -- rein lokal (Klasse auf .mp3-cat-node
     * + Chevron-Icon umschalten), kein Request mehr: der ganze Baum ist seit
     * loadCategories() bereits im DOM, nur per CSS ausgeblendet
     * (.mp3-cat-children ohne .mp3-cat-node-open am Elternknoten, siehe
     * mediapool3.css).
     */
    function toggleCategory(catId) {
        var node = qs('.mp3-cat-node[data-cat-id="' + catId + '"]', sidebar);
        if (!node) return;
        var isOpen = node.classList.toggle('mp3-cat-node-open');
        var icon = qs('.mp3-cat-toggle[data-toggle-cat="' + catId + '"]', node);
        if (icon) {
            icon.classList.toggle('fa-chevron-right', !isOpen);
            icon.classList.toggle('fa-chevron-down', isOpen);
        }
    }

    // ---- Ordner-Upload: rekursives Einlesen von per Drag&Drop abgelegten Ordnern ----

    /**
     * Liest einen einzelnen FileSystemEntry (Datei oder Ordner) rekursiv aus.
     * Gibt ein Promise zurueck, das zu einer flachen Liste { file, folderPath }
     * aufloest. folderPath ist '' fuer Dateien auf oberster Ebene, sonst z.B.
     * "schuhe/nike" (ohne fuehrenden/abschliessenden Slash).
     */
    function readFileSystemEntry(entry, prefix) {
        return new Promise(function (resolve) {
            if (entry.isFile) {
                entry.file(function (file) {
                    resolve([{ file: file, folderPath: prefix }]);
                }, function () { resolve([]); });
                return;
            }

            if (!entry.isDirectory) {
                resolve([]);
                return;
            }

            var reader = entry.createReader();
            var collected = [];
            var childPrefix = prefix ? prefix + '/' + entry.name : entry.name;

            function readBatch() {
                reader.readEntries(function (batch) {
                    if (!batch.length) {
                        Promise.all(collected.map(function (child) {
                            return readFileSystemEntry(child, childPrefix);
                        })).then(function (nested) {
                            var flat = [];
                            nested.forEach(function (list) { flat = flat.concat(list); });
                            resolve(flat);
                        });
                        return;
                    }
                    // readEntries() liefert maximal ~100 Eintraege pro Aufruf und muss
                    // wiederholt aufgerufen werden, bis ein leeres Array zurueckkommt.
                    collected = collected.concat(batch);
                    readBatch();
                }, function () { resolve([]); });
            }

            readBatch();
        });
    }

    /**
     * Liest alle per Drag&Drop abgelegten DataTransferItems (Dateien + Ordner)
     * rekursiv aus. Faellt auf null zurueck, wenn der Browser webkitGetAsEntry()
     * nicht unterstuetzt (Aufrufer nutzt dann die flache dataTransfer.files-Liste).
     */
    function readDroppedItems(dataTransferItems) {
        var entries = [];
        var sawAny = false;
        for (var i = 0; i < dataTransferItems.length; i++) {
            var item = dataTransferItems[i];
            sawAny = true;
            var entry = (typeof item.webkitGetAsEntry === 'function') ? item.webkitGetAsEntry() : null;
            if (!entry) return null;
            entries.push(entry);
        }
        if (!sawAny) return null;

        return Promise.all(entries.map(function (entry) {
            return readFileSystemEntry(entry, '');
        })).then(function (nested) {
            var flat = [];
            nested.forEach(function (list) { flat = flat.concat(list); });
            return flat;
        });
    }

    // ---- Upload ----
    function doUpload(fileList) {
        if (!fileList || !fileList.length) return;

        var files = Array.prototype.slice.call(fileList);

        // In collection mode: ask which category to upload to, then assign to collection
        if (currentCat === -1) {
            var col = getActiveCollection();
            showCollectionUploadCategoryPicker(files, col);
            return;
        }

        startUpload(files, currentCat, null);
    }

    /**
     * Verarbeitet per Drag&Drop abgelegte Ordner: legt fuer jeden Ordnerpfad eine
     * (wiederverwendete oder neu angelegte) Unterkategorie unter der aktuellen
     * Kategorie an und laedt die Dateien jeweils in die passende Kategorie hoch.
     * entries: [{ file, folderPath }] aus readDroppedItems().
     */
    function doFolderUpload(entries) {
        if (!entries || !entries.length) return;

        // Sammlungs-Modus kennt keine Kategorie-Struktur -> Ordnerpfade ignorieren
        // und wie eine normale Dateiliste behandeln (bestehender Picker-Dialog).
        if (currentCat === -1) {
            doUpload(entries.map(function (e) { return e.file; }));
            return;
        }

        var folderPaths = [];
        var seen = {};
        entries.forEach(function (e) {
            if (e.folderPath && !seen[e.folderPath]) {
                seen[e.folderPath] = true;
                folderPaths.push(e.folderPath);
            }
        });

        if (!folderPaths.length) {
            // Keine echten Ordner dabei (nur Dateien auf oberster Ebene)
            startUpload(entries.map(function (e) { return e.file; }), currentCat, null);
            return;
        }

        resolveFolderCategories(currentCat, folderPaths)
            .then(function (pathToCatId) {
                var files = entries.map(function (e) {
                    var file = e.file;
                    file.__mp3CategoryId = e.folderPath ? pathToCatId[e.folderPath] : currentCat;
                    return file;
                });
                startUpload(files, currentCat, null);
                catCache = {};
                catPath = [];
                loadCategories();
            })
            .catch(function (err) {
                console.error('MP3 folder upload category resolution failed:', err);
                showGridError(t('mediaplace_error_creating_folder_categories', { msg: ((err && err.message) ? err.message : String(err)) }));
            });
    }

    /**
     * Zeigt eine gut lesbare, dauerhafte Fehlermeldung oberhalb des Grids an
     * (statt eines schwer lesbaren nativen alert()). Den vollen Fehler gibt es
     * zusaetzlich in der Konsole.
     */
    function showGridError(message) {
        if (!gridWrap) return;
        var existing = qs('.mp3-grid-error', gridWrap.parentNode);
        if (existing) existing.remove();

        var banner = document.createElement('div');
        banner.className = 'mp3-grid-error';
        banner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span class="mp3-grid-error-text"></span>' +
            '<button type="button" class="mp3-grid-error-close" title="' + escAttr(t('mediaplace_close')) + '"><i class="fa-solid fa-xmark"></i></button>';
        banner.querySelector('.mp3-grid-error-text').textContent = message;
        banner.querySelector('.mp3-grid-error-close').addEventListener('click', function () {
            banner.remove();
        });
        gridWrap.parentNode.insertBefore(banner, gridWrap);
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
    function showConfirmModal(opts) {
        var overlay = document.createElement('div');
        overlay.className = 'mp3-cat-move-modal-overlay';
        overlay.innerHTML =
            '<div class="mp3-cat-move-modal">' +
            '<h5 class="mp3-cat-move-modal-title">' +
            '<i class="fa-solid ' + escAttr(opts.icon || 'fa-triangle-exclamation') + '"></i> ' + escAttr(opts.title || t('mediaplace_confirm')) + '</h5>' +
            '<p class="mp3-cat-move-modal-info">' + opts.message + '</p>' +
            '<p class="mp3-cat-move-modal-error" style="display:none"></p>' +
            '<div class="mp3-cat-move-modal-actions">' +
            '<button class="mp3-cat-move-modal-ok btn ' + (opts.dangerous ? 'btn-danger' : 'btn-primary') + ' btn-sm">' + escAttr(opts.confirmLabel || t('mediaplace_ok')) + '</button>' +
            '<button class="mp3-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var errorEl = overlay.querySelector('.mp3-cat-move-modal-error');
        var okBtn = overlay.querySelector('.mp3-cat-move-modal-ok');
        var okLabel = escAttr(opts.confirmLabel || t('mediaplace_ok'));

        function onKeydown(e) {
            if (e.key === 'Escape') close();
        }

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', onKeydown);
        }

        document.addEventListener('keydown', onKeydown);
        overlay.querySelector('.mp3-cat-move-modal-cancel').addEventListener('click', close);
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
     * Verstaendliche Fehlermeldung fuer Kategorie-Aktionen (Umbenennen/
     * Verschieben/Loeschen): 403 kommt ausschliesslich von
     * MediaPermission::hasParentCategoryAccess() (siehe rex_api_mediaplace_categories.php)
     * -- dafuer eine feste, erklaerende Meldung statt des rohen "Permission
     * denied"-Servertexts. Andere Fehler (z.B. "Kategorie nicht leer")
     * bleiben unveraendert mit ihrem eigentlichen Text.
     */
    function categoryErrorMessage(err, fallbackKey) {
        if (err && 403 === err.status) {
            return t('mediaplace_cat_permission_denied');
        }
        return t(fallbackKey, { msg: err.message });
    }

    // Gleiches Prinzip wie categoryErrorMessage(), fuer Datei- statt
    // Kategorie-Operationen (Upload/Loeschen/Verschieben). Faengt insbesondere
    // den Fall ab, dass die installierte FriendsOfRedaxo/api-Version
    // permitted_only noch nicht kaskadierend auswertet (siehe apiUpload()/
    // apiDelete()/apiUpdate() in mediapool3-api.js) -- ein 403 beim Arbeiten
    // in einer Unterkategorie einer freigegebenen Kategorie ist dann kein
    // unerwarteter Fehler, sondern genau dieser (bekannte, temporaere) Fall.
    function mediaErrorMessage(err, fallbackKey) {
        if (err && 403 === err.status) {
            return t('mediaplace_media_permission_denied');
        }
        return t(fallbackKey, { msg: err.message });
    }

    /**
     * Gleiches Modal-Muster wie showMoveCategoryModal() (Textfeld statt
     * Auswahlliste) -- kein prompt(), damit Umbenennen/Verschieben optisch
     * konsistent sind und keine System-Dialoge im Overlay auftauchen.
     */
    function showRenameCategoryModal(catId, catName) {
        var overlay = document.createElement('div');
        overlay.className = 'mp3-cat-move-modal-overlay';
        overlay.innerHTML =
            '<div class="mp3-cat-move-modal">' +
            '<h5 class="mp3-cat-move-modal-title">' +
            '<i class="fa-solid fa-pen"></i> ' + t('mediaplace_rename_category') + '</h5>' +
            '<p class="mp3-cat-move-modal-info">' + t('mediaplace_new_name_for', { name: '<strong>' + escAttr(catName) + '</strong>' }) + '</p>' +
            '<input type="text" class="mp3-cat-move-modal-input" value="' + escAttr(catName) + '">' +
            '<p class="mp3-cat-move-modal-error" style="display:none"></p>' +
            '<div class="mp3-cat-move-modal-actions">' +
            '<button class="mp3-cat-move-modal-ok btn btn-primary btn-sm">' + t('mediaplace_rename') + '</button>' +
            '<button class="mp3-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var input = overlay.querySelector('.mp3-cat-move-modal-input');
        var errorEl = overlay.querySelector('.mp3-cat-move-modal-error');
        var okBtn = overlay.querySelector('.mp3-cat-move-modal-ok');
        setTimeout(function () { input.focus(); input.select(); }, 0);

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        function submit() {
            var nextName = input.value.trim();
            if (!nextName || nextName === catName) {
                close();
                return;
            }
            okBtn.disabled = true;
            okBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            errorEl.style.display = 'none';
            apiRenameCategory(catId, nextName)
                .then(function () {
                    if (catCache[catId]) catCache[catId].name = nextName;
                    buildBreadcrumb(currentCat);
                    close();
                    loadCategories();
                })
                .catch(function (err) {
                    errorEl.textContent = categoryErrorMessage(err, 'mediaplace_error_renaming');
                    errorEl.style.display = '';
                    okBtn.disabled = false;
                    okBtn.innerHTML = t('mediaplace_rename');
                });
        }

        overlay.querySelector('.mp3-cat-move-modal-cancel').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        okBtn.addEventListener('click', submit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });
    }

    // Ersatz fuer window.prompt() (gleiche Optik/gleiches Markup wie die
    // Kategorie-Modals): resolved mit dem getrimmten Eingabewert bei Klick auf
    // OK/Enter, mit null bei Abbrechen/Escape/Klick auf Overlay -- exakt die
    // gleiche Cancel-Semantik wie prompt() selbst.
    function showPromptModal(opts) {
        return new Promise(function (resolve) {
            var overlay = document.createElement('div');
            overlay.className = 'mp3-cat-move-modal-overlay';
            overlay.innerHTML =
                '<div class="mp3-cat-move-modal">' +
                '<h5 class="mp3-cat-move-modal-title"><i class="fa-solid ' + escAttr(opts.icon || 'fa-pen') + '"></i> ' + opts.title + '</h5>' +
                (opts.label ? '<p class="mp3-cat-move-modal-info">' + opts.label + '</p>' : '') +
                '<input type="text" class="mp3-cat-move-modal-input" value="' + escAttr(opts.value || '') + '">' +
                '<div class="mp3-cat-move-modal-actions">' +
                '<button class="mp3-cat-move-modal-ok btn btn-primary btn-sm">' + escAttr(opts.confirmLabel || t('mediaplace_ok')) + '</button>' +
                '<button class="mp3-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
                '</div>' +
                '</div>';
            document.body.appendChild(overlay);

            var input = overlay.querySelector('.mp3-cat-move-modal-input');
            var okBtn = overlay.querySelector('.mp3-cat-move-modal-ok');
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

            overlay.querySelector('.mp3-cat-move-modal-cancel').addEventListener('click', cancel);
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

    function showMoveCategoryModal(catId, catName) {
        // Build a modal that lets the user pick a new parent for this category
        var overlay = document.createElement('div');
        overlay.className = 'mp3-cat-move-modal-overlay';
        overlay.innerHTML =
            '<div class="mp3-cat-move-modal">' +
            '<h5 class="mp3-cat-move-modal-title">' +
            '<i class="fa-solid fa-folder-tree"></i> ' + t('mediaplace_move_category') + '</h5>' +
            '<p class="mp3-cat-move-modal-info">' + t('mediaplace_new_parent_for', { name: '<strong>' + escAttr(catName) + '</strong>' }) + '</p>' +
            '<select class="mp3-cat-move-modal-select">' +
            '<option value="">' + t('mediaplace_loading_ellipsis') + '</option>' +
            '</select>' +
            '<p class="mp3-cat-move-modal-error" style="display:none"></p>' +
            '<div class="mp3-cat-move-modal-actions">' +
            '<button class="mp3-cat-move-modal-ok btn btn-primary btn-sm">' + t('mediaplace_move') + '</button>' +
            '<button class="mp3-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var select = overlay.querySelector('.mp3-cat-move-modal-select');
        var errorEl = overlay.querySelector('.mp3-cat-move-modal-error');

        // "(Hauptverzeichnis)" nur anbieten, wenn der User ueberhaupt dorthin
        // verschieben darf (hasParentCategoryAccess(0), siehe canAccessRootCategory) --
        // sonst waere das Ziel im Picker waehlbar, das Verschieben serverseitig
        // aber immer mit 403 abgelehnt.
        var rootOption = canAccessRootCategory ? ('<option value="0">' + t('mediaplace_root_category') + '</option>') : '';

        // Collect all sub-ids of catId to exclude them from picker. catCache
        // ist seit dem serverseitig gerenderten Baum nur noch eine flache
        // id -> {name, parent_id}-Map (siehe loadCategories()), daher hier
        // ueber alle Eintraege nach parent_id suchen statt eine verschachtelte
        // children-Liste zu durchlaufen.
        function collectSubIds(id) {
            var ids = [id];
            for (var cid in catCache) {
                var c = catCache[cid];
                if (c && c.parent_id === id) {
                    ids = ids.concat(collectSubIds(parseInt(cid, 10)));
                }
            }
            return ids;
        }
        var excludeIds = collectSubIds(catId);

        apiFetchAllCategoriesFlat().then(function (cats) {
            var opts = rootOption;
            for (var i = 0; i < cats.length; i++) {
                var cat = cats[i];
                if (excludeIds.indexOf(cat.id) !== -1) continue;
                var indent = '';
                for (var d = 0; d < cat.depth; d++) indent += '\u00a0\u00a0';
                opts += '<option value="' + escAttr(String(cat.id)) + '">' + indent + escAttr(cat.name) + '</option>';
            }
            select.innerHTML = opts;
        }).catch(function () {
            select.innerHTML = rootOption;
        });

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        overlay.querySelector('.mp3-cat-move-modal-cancel').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        overlay.querySelector('.mp3-cat-move-modal-ok').addEventListener('click', function () {
            var newParentId = parseInt(select.value || '0', 10);
            var okBtn = overlay.querySelector('.mp3-cat-move-modal-ok');
            okBtn.disabled = true;
            okBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            errorEl.style.display = 'none';
            apiMoveCategory(catId, newParentId)
                .then(function () {
                    catCache = {};
                    catPath = [];
                    close();
                    loadCategories();
                })
                .catch(function (err) {
                    errorEl.textContent = categoryErrorMessage(err, 'mediaplace_error_moving');
                    errorEl.style.display = '';
                    okBtn.disabled = false;
                    okBtn.innerHTML = t('mediaplace_move');
                });
        });
    }

    function showCollectionUploadCategoryPicker(files, collection) {
        var colName = collection ? collection.name : '';
        var modal = document.createElement('div');
        modal.className = 'mp3-catpick-modal';
        modal.innerHTML =
            '<div class="mp3-catpick-box">' +
            '<div class="mp3-catpick-title"><i class="fa-solid fa-folder-open"></i> ' + t('mediaplace_pick_upload_category') + '</div>' +
            '<p class="mp3-catpick-info">' + t('mediaplace_upload_category_hint', { name: '<strong>' + escAttr(colName) + '</strong>' }) + '</p>' +
            '<select class="mp3-catpick-select"><option value="0">' + t('mediaplace_root_no_category') + '</option></select>' +
            '<div class="mp3-catpick-actions">' +
            '<button type="button" class="mp3-catpick-cancel">' + t('mediaplace_cancel') + '</button>' +
            '<button type="button" class="mp3-catpick-confirm">' + t('mediaplace_upload') + '</button>' +
            '</div>' +
            '</div>';

        overlay.appendChild(modal);

        var select = modal.querySelector('.mp3-catpick-select');
        // Flache, tiefensortierte Liste vom Server (dieselbe Route, die auch
        // den Sidebar-Baum liefert) statt verschachteltem catCache -- dessen
        // Kind-Struktur gibt es seit dem serverseitig gerenderten Baum nicht
        // mehr (siehe loadCategories()).
        apiFetchAllCategoriesFlat().then(function (cats) {
            var opts = '<option value="0">' + t('mediaplace_root_no_category') + '</option>';
            for (var i = 0; i < cats.length; i++) {
                var cat = cats[i];
                opts += '<option value="' + escAttr(String(cat.id)) + '">' + '    '.repeat(cat.depth) + escAttr(cat.name) + '</option>';
            }
            select.innerHTML = opts;
        }).catch(function () {
            // Bleibt bei der Stamm-Option, falls die Liste nicht geladen werden kann.
        });

        modal.querySelector('.mp3-catpick-cancel').addEventListener('click', function () {
            modal.remove();
        });

        modal.querySelector('.mp3-catpick-confirm').addEventListener('click', function () {
            var catId = parseInt(select.value || '0', 10);
            modal.remove();
            startUpload(files, catId, collection ? collection.name : null);
        });
    }

    // isResizableImageType()/resizeImageFile() leben in MP3Core.helpers (geteilt
    // mit mediapool3_widget.js fuer dessen eigenen Direkt-Upload).
    function maybeResizeUploadFile(file) {
        if (!features.uploadResize || !isResizableImageType(file.type)) {
            return Promise.resolve(file);
        }
        return resizeImageFile(file, uploadResizeWidth, uploadResizeHeight);
    }

    function startUpload(files, catId, assignToCollectionName) {

        var total = files.length;

        // Build upload tracker UI
        var html = '<div class="mp3-upload-tracker">';
        html += '<div class="mp3-upload-header">' +
            '<i class="fa-solid fa-cloud-arrow-up"></i> ' +
            '<span class="mp3-upload-title">' + t('mediaplace_upload_title', { count: total, unit: t(total === 1 ? 'mediaplace_file_singular' : 'mediaplace_file_plural') }) + '</span>' +
            '</div>';
        html += '<div class="mp3-upload-progress-bar"><div class="mp3-upload-progress-fill" id="mp3-progress-fill"></div></div>';
        html += '<div class="mp3-upload-list" id="mp3-upload-list">';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var icon = isImage(f.name) ? 'fa-image' : fileIcon(f.name).replace('fa-solid ', '');
            html += '<div class="mp3-upload-item" id="mp3-upl-' + i + '">' +
                '<i class="fa-solid ' + icon + ' mp3-upload-item-icon"></i>' +
                '<span class="mp3-upload-item-name">' + escAttr(f.name) + '</span>' +
                '<span class="mp3-upload-item-size">' + formatBytes(f.size) + '</span>' +
                '<span class="mp3-upload-item-status"><i class="fa-solid fa-clock mp3-upload-pending"></i></span>' +
            '</div>';
        }
        html += '</div>';
        html += '<div class="mp3-upload-summary" id="mp3-upload-summary"></div>';
        html += '</div>';
        grid.className = 'mp3-grid';
        grid.innerHTML = html;

        var done = 0;
        var failed = 0;
        var uploadedFilenames = []; // track successfully uploaded filenames for collection assignment

        // Upload one at a time sequentially
        function uploadNext(idx) {
            if (idx >= files.length) {
                // All done — optionally assign to collection
                var finalize = function () {
                    var summaryEl = document.getElementById('mp3-upload-summary');
                    if (summaryEl) {
                        var msg = t('mediaplace_upload_summary', { done: done, total: total });
                        if (failed > 0) msg += t('mediaplace_upload_failed_suffix', { count: failed });
                        if (assignToCollectionName && uploadedFilenames.length) {
                            msg += t('mediaplace_upload_assign_collection', { name: escAttr(assignToCollectionName) });
                        }
                        summaryEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#28a745;"></i> ' + msg;
                    }
                    setTimeout(function () { loadFiles(currentCat, true); }, 1500);
                };

                if (assignToCollectionName && uploadedFilenames.length) {
                    var assigns = uploadedFilenames.map(function (fn) {
                        return setFileCollectionMembership(fn, assignToCollectionName, true);
                    });
                    Promise.all(assigns).then(finalize).catch(finalize);
                } else {
                    finalize();
                }
                return;
            }

            var itemEl = document.getElementById('mp3-upl-' + idx);
            if (itemEl) {
                var statusEl = itemEl.querySelector('.mp3-upload-item-status');
                statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mp3-upload-spinning"></i>';
                itemEl.classList.add('mp3-upload-active');
            }

            var uploadFile = files[idx];
            // Ordner-Upload weist einzelnen Dateien ihre eigene (aus dem Ordnerpfad
            // aufgeloeste) Kategorie zu; ohne das faellt jede Datei auf catId zurueck.
            var uploadCatId = (uploadFile.__mp3CategoryId != null) ? uploadFile.__mp3CategoryId : catId;
            var onFileProgress = function (sent, total) {
                if (!itemEl) return;
                var st = itemEl.querySelector('.mp3-upload-item-status');
                if (st) st.textContent = Math.round((sent / total) * 100) + '%';
            };
            maybeResizeUploadFile(uploadFile)
                .then(function (fileToSend) {
                    return apiUpload(fileToSend, uploadCatId, onFileProgress);
                })
                .then(function (resp) {
                    done++;
                    // API returns { filename: '...' } — use that (server may rename)
                    var resultName = (resp && resp.filename) ? resp.filename : uploadFile.name;
                    uploadedFilenames.push(resultName);
                    if (itemEl) {
                        var st = itemEl.querySelector('.mp3-upload-item-status');
                        st.innerHTML = '<i class="fa-solid fa-circle-check mp3-upload-ok"></i>';
                        itemEl.classList.remove('mp3-upload-active');
                        itemEl.classList.add('mp3-upload-done');
                    }
                })
                .catch(function (err) {
                    failed++;
                    console.error('MP3 upload failed:', uploadFile.name, err);
                    if (itemEl) {
                        var st = itemEl.querySelector('.mp3-upload-item-status');
                        st.innerHTML = '<i class="fa-solid fa-circle-xmark mp3-upload-fail"></i>';
                        // Titel statt sichtbarem Text -- die Zeile ist fuer den
                        // Icon-only-Status ausgelegt, ein 403 in einer
                        // Unterkategorie (siehe mediaErrorMessage()) soll aber
                        // beim Hover erklaerbar sein statt nur "fehlgeschlagen".
                        st.title = mediaErrorMessage(err, 'mediaplace_error_uploading');
                        itemEl.classList.remove('mp3-upload-active');
                        itemEl.classList.add('mp3-upload-failed');
                    }
                })
                .then(function () {
                    // Update progress bar
                    var pct = Math.round(((done + failed) / total) * 100);
                    var fillEl = document.getElementById('mp3-progress-fill');
                    if (fillEl) fillEl.style.width = pct + '%';
                    uploadNext(idx + 1);
                });
        }

        uploadNext(0);
    }

    // ---- Clipboard Paste Upload ----
    function readClipboardAndUpload() {
        if (!navigator.clipboard || !navigator.clipboard.read) return;
        navigator.clipboard.read().then(function (items) {
            var files = [];
            var promises = [];
            items.forEach(function (item) {
                item.types.forEach(function (type) {
                    if (type.indexOf('image/') === 0 || type === 'application/octet-stream') {
                        promises.push(
                            item.getType(type).then(function (blob) {
                                var ext = type.split('/')[1] || 'bin';
                                ext = ext.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
                                var name = 'paste-' + Date.now() + '.' + ext;
                                files.push(new File([blob], name, { type: type }));
                            })
                        );
                    }
                });
            });
            Promise.all(promises).then(function () {
                if (!files.length) return;
                if (gridWrap) {
                    gridWrap.classList.add('mp3-pasteover');
                    setTimeout(function () { gridWrap.classList.remove('mp3-pasteover'); }, 300);
                }
                doUpload(files);
            });
        }).catch(function () {
            // Permission denied or clipboard empty – silently ignore
        });
    }

    // ---- Build Overlay DOM ----
    function build() {
        if (built) return;
        built = true;

        var root = document.getElementById('mp3-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'mp3-root';
            document.body.appendChild(root);
        }

        // Muss vor dem restlichen Markup-Aufbau laufen, da build() weiter unten
        // bereits t()-Aufrufe fuer die Overlay-Texte enthalten wird (siehe
        // MediaPlace-i18n-Stufe -- aktuell nur Widget-JS migriert, das Overlay
        // selbst folgt in Folge-Slices).
        MP3Core.i18n.initLang();

        // Feature-Toggles (Einstellungsseite -> boot.php -> #mp3-root data-*),
        // Default "an" falls das Attribut fehlt (z.B. waehrend der Entwicklung
        // ohne Cache-Neuaufbau).
        features.tagging = !root.dataset.featureTagging || root.dataset.featureTagging === '1';
        features.collections = !root.dataset.featureCollections || root.dataset.featureCollections === '1';
        features.metainfoEditing = root.dataset.featureMetainfoEditing === '1';
        features.uploadResize = root.dataset.featureUploadResize === '1';
        uploadResizeWidth = parseInt(root.dataset.uploadResizeWidth, 10) || 2000;
        uploadResizeHeight = parseInt(root.dataset.uploadResizeHeight, 10) || 2000;
        canFilterUnused = root.dataset.canFilterUnused === '1';
        canFocuspoint = root.dataset.focuspointAvailable === '1';
        canAccessRootCategory = !root.dataset.canAccessRootCategory || root.dataset.canAccessRootCategory === '1';
        mediaBaseUrl = root.dataset.mediaBaseUrl || '';

        // Menu-Inhalt lebt NICHT mehr inline in .mp3-tag-filter-wrap, sondern
        // als Portal (#mp3-tag-filter-menu-portal, siehe setTagFilterMenuOpen())
        // -- gleicher Grund wie beim Kategorie-Aktionsmenue (#mp3-cat-menu-portal):
        // die Filter-Leiste ist im Compact-Modus horizontal scrollbar
        // (overflow-x:auto), das schneidet ein absolut positioniertes Kind sonst ab.
        var tagFilterHtml = features.tagging
            ? '<div class="mp3-tag-filter-wrap">' +
                '<button type="button" class="mp3-tag-filter-toggle" title="' + escAttr(t('mediaplace_filter_by_tags')) + '">' +
                    '<span class="mp3-tag-filter-label">' + t('mediaplace_all_tags') + '</span>' +
                    '<i class="fa-solid fa-chevron-down"></i>' +
                '</button>' +
            '</div>'
            : '';

        // Eigenes Recht (siehe MediaPermission::hasUnusedFilterAccess()), nicht
        // Teil von features -- deshalb separate Bedingung statt im selben
        // Feature-Toggle-Muster wie Tagging/Sammlungen.
        var unusedFilterHtml = canFilterUnused
            ? '<button type="button" class="mp3-filter-btn mp3-unused-filter-btn" title="' + escAttr(t('mediaplace_unused_only_hint')) + '">' +
                '<i class="fa-solid fa-trash-can"></i> ' + t('mediaplace_unused_only') + '</button>'
            : '';

        root.innerHTML =
            '<div id="mp3-overlay">' +
                '<div class="mp3-modal">' +
                    '<div class="mp3-header">' +
                        '<span class="mp3-title"><i class="fa-solid fa-photo-film"></i> MediaPlace</span>' +
                        '<span class="mp3-header-info" id="mp3-header-info"></span>' +
                        '<div class="mp3-header-tools">' +
                            '<button class="mp3-mobile-cat-btn" title="' + escAttr(t('mediaplace_categories')) + '"><i class="fa-solid fa-folder-tree"></i></button>' +
                            '<div class="mp3-search-wrap">' +
                                '<i class="fa-solid fa-magnifying-glass"></i>' +
                                '<input type="text" class="mp3-search" placeholder="' + escAttr(t('mediaplace_search_placeholder')) + '">' +
                            '</div>' +
                            '<select class="mp3-sort-select" title="' + escAttr(t('mediaplace_sorting')) + '">' +
                                '<option value="date_desc">' + t('mediaplace_sort_newest') + '</option>' +
                                '<option value="date_asc">' + t('mediaplace_sort_oldest') + '</option>' +
                                '<option value="filename_asc">' + t('mediaplace_sort_filename_az') + '</option>' +
                                '<option value="filename_desc">' + t('mediaplace_sort_filename_za') + '</option>' +
                                '<option value="title_asc">' + t('mediaplace_sort_title_az') + '</option>' +
                                '<option value="title_desc">' + t('mediaplace_sort_title_za') + '</option>' +
                                '<option value="size_desc">' + t('mediaplace_sort_size_desc') + '</option>' +
                                '<option value="size_asc">' + t('mediaplace_sort_size_asc') + '</option>' +
                            '</select>' +
                            '<div class="mp3-view-toggle">' +
                                '<button class="mp3-view-btn mp3-view-active" data-view="grid" title="' + escAttr(t('mediaplace_tiles')) + '"><i class="fa-solid fa-table-cells"></i></button>' +
                                '<button class="mp3-view-btn" data-view="list" title="' + escAttr(t('mediaplace_list')) + '"><i class="fa-solid fa-list"></i></button>' +
                                '<button class="mp3-view-btn" data-view="mediawall" title="' + escAttr(t('mediaplace_media_wall')) + '"><i class="fa-solid fa-table-cells-large"></i></button>' +
                            '</div>' +
                            '<label class="mp3-upload-btn" title="' + escAttr(t('mediaplace_upload_files')) + '">' +
                                '<i class="fa-solid fa-cloud-arrow-up"></i>' +
                                '<span class="mp3-upload-label">' + t('mediaplace_upload') + '</span>' +
                                '<input type="file" multiple style="display:none">' +
                            '</label>' +
                        '</div>' +
                        '<div class="mp3-admin-menu-wrap">' +
                            '<button type="button" class="mp3-admin-menu-btn" title="' + escAttr(t('mediaplace_admin_menu_title')) + '"><i class="fa-solid fa-gear"></i></button>' +
                            '<div class="mp3-admin-menu" id="mp3-admin-menu"></div>' +
                        '</div>' +
                        '<button type="button" class="mp3-dark-mode-toggle" title="' + escAttr(t('mediaplace_dark_mode')) + '"><i class="fa-solid fa-moon"></i></button>' +
                        '<button type="button" class="mp3-fullscreen-toggle" title="' + escAttr(t('mediaplace_fullscreen')) + '"><i class="fa-solid fa-expand"></i></button>' +
                        '<button type="button" class="mp3-close" title="' + escAttr(t('mediaplace_close')) + '"><i class="fa-solid fa-xmark"></i></button>' +
                    '</div>' +
                    '<div class="mp3-body">' +
                        '<div class="mp3-sidebar" id="mp3-sidebar"></div>' +
                        '<div class="mp3-sidebar-resize-handle" id="mp3-sidebar-resize-handle" title="' + escAttr(t('mediaplace_resize_handle_title')) + '"></div>' +
                        '<div class="mp3-sidebar-backdrop" id="mp3-sidebar-backdrop"></div>' +
                        '<div class="mp3-content">' +
                            '<div class="mp3-filter-bar">' +
                                '<div class="mp3-filter-pills">' +
                                    '<button class="mp3-filter-btn mp3-filter-active" data-filter="all">' +
                                        t('mediaplace_filter_all') + ' <span class="mp3-filter-count">0</span></button>' +
                                    '<button class="mp3-filter-btn" data-filter="images">' +
                                        '<i class="fa-solid fa-image"></i> ' + t('mediaplace_filter_images') + ' <span class="mp3-filter-count">0</span></button>' +
                                    '<button class="mp3-filter-btn" data-filter="videos">' +
                                        '<i class="fa-solid fa-film"></i> ' + t('mediaplace_filter_videos') + ' <span class="mp3-filter-count">0</span></button>' +
                                    '<button class="mp3-filter-btn" data-filter="audio">' +
                                        '<i class="fa-solid fa-music"></i> ' + t('mediaplace_filter_audio') + ' <span class="mp3-filter-count">0</span></button>' +
                                    '<button class="mp3-filter-btn" data-filter="documents">' +
                                        '<i class="fa-solid fa-file-lines"></i> ' + t('mediaplace_filter_documents') + ' <span class="mp3-filter-count">0</span></button>' +
                                    '<button class="mp3-filter-btn" data-filter="other">' +
                                        '<i class="fa-solid fa-ellipsis"></i> ' + t('mediaplace_filter_other') + ' <span class="mp3-filter-count">0</span></button>' +
                                    unusedFilterHtml +
                                '</div>' +
                                '<div class="mp3-filter-dropdown-wrap">' +
                                    '<button type="button" class="mp3-filter-dropdown-toggle" title="' + escAttr(t('mediaplace_filter_title')) + '">' +
                                        '<span class="mp3-filter-dropdown-label">' + t('mediaplace_filter_all') + '</span>' +
                                        '<i class="fa-solid fa-chevron-down"></i>' +
                                    '</button>' +
                                '</div>' +
                                tagFilterHtml +
                            '</div>' +
                            '<div class="mp3-metainfo-pick-banner" id="mp3-metainfo-pick-banner" style="display:none">' +
                                '<span class="mp3-metainfo-pick-banner-text"></span>' +
                                '<button type="button" class="mp3-metainfo-pick-cancel"><i class="fa-solid fa-arrow-left"></i> ' + t('mediaplace_back') + '</button>' +
                            '</div>' +
                            '<div class="mp3-breadcrumb" id="mp3-breadcrumb"></div>' +
                            '<div class="mp3-status" id="mp3-status"></div>' +
                            '<div class="mp3-grid-wrap" id="mp3-grid-wrap">' +
                                '<div class="mp3-grid" id="mp3-grid"></div>' +
                                '<div class="mp3-scroll-pill" id="mp3-scroll-pill"><div class="mp3-scroll-pill-thumb" id="mp3-scroll-pill-thumb"></div></div>' +
                            '</div>' +
                            '<div class="mp3-page-footer">' +
                                '<div class="mp3-page-size">' +
                                    '<label for="mp3-per-page-select">' + t('mediaplace_per_page') + '</label>' +
                                    '<select id="mp3-per-page-select" class="mp3-per-page-select">' +
                                        '<option value="30">30</option>' +
                                        '<option value="50">50</option>' +
                                        '<option value="100">100</option>' +
                                        '<option value="250">250</option>' +
                                    '</select>' +
                                '</div>' +
                                '<div class="mp3-tile-size-control" id="mp3-tile-size-control">' +
                                    '<i class="fa-solid fa-table-cells" title="' + escAttr(t('mediaplace_smaller_tiles')) + '"></i>' +
                                    '<input type="range" id="mp3-tile-size-slider" class="mp3-tile-size-slider" min="140" max="360" step="10" title="' + escAttr(t('mediaplace_tile_size')) + '">' +
                                    '<i class="fa-solid fa-table-cells-large" title="' + escAttr(t('mediaplace_larger_tiles')) + '"></i>' +
                                '</div>' +
                                '<button type="button" class="mp3-load-more-btn" style="display:none"><i class="fa-solid fa-angles-down"></i> ' + t('mediaplace_load_more') + '</button>' +
                                '<span class="mp3-page-info"></span>' +
                            '</div>' +
                            '<div class="mp3-focuspoint-canvas" id="mp3-focuspoint-canvas" style="display:none">' +
                                '<div class="mp3-focuspoint-canvas-header">' +
                                    '<button type="button" class="mp3-focuspoint-canvas-back" title="' + escAttr(t('mediaplace_back_to_overview')) + '">' +
                                        '<i class="fa-solid fa-arrow-left"></i> ' + t('mediaplace_back') +
                                    '</button>' +
                                    '<div class="mp3-focuspoint-canvas-title"></div>' +
                                    '<button type="button" class="mp3-focuspoint-canvas-save">' +
                                        '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save') +
                                    '</button>' +
                                '</div>' +
                                '<div class="mp3-focuspoint-toolbar">' +
                                    '<div class="mp3-focuspoint-field-wrap" style="display:none">' +
                                        '<label>' + t('mediaplace_field') + '</label>' +
                                        '<select class="mp3-focuspoint-field-select"></select>' +
                                    '</div>' +
                                    '<div class="mp3-focuspoint-type-wrap">' +
                                        '<label>' + t('mediaplace_preview') + '</label>' +
                                        '<select class="mp3-focuspoint-type-select"></select>' +
                                    '</div>' +
                                    '<span class="mp3-focuspoint-coords"></span>' +
                                    '<button type="button" class="mp3-focuspoint-reset-btn" title="' + escAttr(t('mediaplace_reset_to_loaded_value')) + '"><i class="fa-solid fa-rotate-left"></i> ' + t('mediaplace_reset') + '</button>' +
                                    '<button type="button" class="mp3-focuspoint-remove-btn" title="' + escAttr(t('mediaplace_remove_focuspoint')) + '"><i class="fa-solid fa-xmark"></i> ' + t('mediaplace_remove') + '</button>' +
                                '</div>' +
                                '<div class="mp3-focuspoint-canvas-body">' +
                                    '<div class="mp3-focuspoint-image-wrap">' +
                                        '<img class="mp3-focuspoint-image" alt="">' +
                                        '<div class="mp3-focuspoint-marker"></div>' +
                                    '</div>' +
                                    '<div class="mp3-focuspoint-preview-wrap" style="display:none">' +
                                        '<img class="mp3-focuspoint-preview-img" alt="">' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="mp3-editor-canvas" id="mp3-metainfo-canvas" style="display:none">' +
                                '<div class="mp3-editor-canvas-header">' +
                                    '<button type="button" class="mp3-metainfo-canvas-back" title="' + escAttr(t('mediaplace_back_to_overview')) + '">' +
                                        '<i class="fa-solid fa-arrow-left"></i> ' + t('mediaplace_back') +
                                    '</button>' +
                                    '<div class="mp3-metainfo-canvas-title"></div>' +
                                    '<button type="button" class="mp3-metainfo-canvas-save">' +
                                        '<i class="fa-solid fa-floppy-disk"></i> ' + t('mediaplace_save') +
                                    '</button>' +
                                '</div>' +
                                '<div class="mp3-editor-canvas-body">' +
                                    '<form id="mp3-metainfo-form" class="mp3-metainfo-canvas-form"></form>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="mp3-detail-resize-handle" id="mp3-detail-resize-handle" title="' + escAttr(t('mediaplace_resize_handle_title')) + '" style="display:none"></div>' +
                        '<div class="mp3-detail" id="mp3-detail"></div>' +
                    '</div>' +
                    '<div class="mp3-cat-menu-portal" id="mp3-cat-menu-portal"></div>' +
                    '<div class="mp3-tag-filter-menu-portal" id="mp3-tag-filter-menu-portal"></div>' +
                    '<div class="mp3-filter-dropdown-menu-portal" id="mp3-filter-dropdown-menu-portal"></div>' +
                    '<div class="mp3-resize-handle" id="mp3-resize-handle"></div>' +
                    '<div class="mp3-multi-footer" id="mp3-multi-footer" style="display:none">' +
                        '<div class="mp3-multi-left">' +
                            '<button class="mp3-multi-select-all"><i class="fa-solid fa-square-check"></i> ' + t('mediaplace_select_all') + '</button>' +
                            '<span class="mp3-multi-count">' + t('mediaplace_files_selected', { count: 0 }) + '</span>' +
                        '</div>' +
                        '<button class="mp3-multi-confirm"><i class="fa-solid fa-check"></i> ' + t('mediaplace_apply_selection') + '</button>' +
                    '</div>' +
                    '<div class="mp3-batch-footer" id="mp3-batch-footer" style="display:none">' +
                        '<div class="mp3-batch-left">' +
                            '<button type="button" class="mp3-batch-select-all"><i class="fa-solid fa-square-check"></i> ' + t('mediaplace_select_all') + '</button>' +
                            '<span class="mp3-batch-count">' + t('mediaplace_files_selected', { count: 0 }) + '</span>' +
                        '</div>' +
                        '<div class="mp3-batch-actions">' +
                            '<button type="button" class="mp3-batch-delete-btn"><i class="fa-solid fa-trash-can"></i> ' + t('mediaplace_delete_selection') + '</button>' +
                            '<button type="button" class="mp3-batch-clear-btn"><i class="fa-solid fa-xmark"></i> ' + t('mediaplace_deselect_all_action') + '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="mp3-lightbox" id="mp3-lightbox">' +
                    '<button type="button" class="mp3-lightbox-close" title="' + escAttr(t('mediaplace_close')) + '"><i class="fa-solid fa-xmark"></i></button>' +
                    '<img class="mp3-lightbox-image" alt="">' +
                    '<div class="mp3-lightbox-caption"></div>' +
                '</div>' +
            '</div>';

        overlay   = qs('#mp3-overlay');
        overlay.setAttribute('tabindex', '-1');
        sidebar   = qs('#mp3-sidebar');
        grid      = qs('#mp3-grid');
        gridWrap  = qs('#mp3-grid-wrap');
        scrollPillTrack = qs('#mp3-scroll-pill');
        scrollPillThumb = qs('#mp3-scroll-pill-thumb');
        searchInput = qs('.mp3-search', overlay);
        statusBar = qs('#mp3-status');
        breadcrumb = qs('#mp3-breadcrumb');
        detailPanel = qs('#mp3-detail');
        multiFooter = qs('#mp3-multi-footer');
        batchFooter = qs('#mp3-batch-footer');
        lightboxLayer = qs('#mp3-lightbox');
        lightboxImage = qs('.mp3-lightbox-image', overlay);
        lightboxCaption = qs('.mp3-lightbox-caption', overlay);

        // ---- Drag-Move & Resize ----
        var interacting = false; // true during drag/resize – suppress backdrop close
        (function initDragResize() {
            var modal = qs('.mp3-modal', overlay);
            var header = qs('.mp3-header', overlay);
            var handle = qs('#mp3-resize-handle');
            var sidebarHandle = qs('#mp3-sidebar-resize-handle');
            var detailHandle = qs('#mp3-detail-resize-handle');
            var dragging = false, resizing = false;
            var startX, startY, startW, startH, startLeft, startTop;

            function isMobile() { return window.innerWidth <= 768; }

            // Gespeicherte Sidebar-Breite anwenden (Desktop only -- im Compact-
            // Modus wird die Sidebar zum Offcanvas mit eigener fester Breite,
            // siehe CSS .mp3-compact .mp3-sidebar).
            var SIDEBAR_MIN = 180;
            var SIDEBAR_MAX = 480;
            function applySidebarWidth() {
                if (!sidebar || isMobile() || overlay.classList.contains('mp3-compact')) return;
                var saved = parseInt(localStorage.getItem('mp3_sidebar_width'), 10);
                if (!isNaN(saved)) {
                    sidebar.style.width = Math.max(SIDEBAR_MIN, Math.min(saved, SIDEBAR_MAX)) + 'px';
                }
            }
            applySidebarWidth();

            // Track compact mode via ResizeObserver
            var COMPACT_BREAKPOINT = 760;
            if (typeof ResizeObserver !== 'undefined') {
                var compactObserver = new ResizeObserver(function (entries) {
                    for (var i = 0; i < entries.length; i++) {
                        var w = entries[i].contentRect.width;
                        var isCompact = w < COMPACT_BREAKPOINT;
                        var wasCompact = overlay.classList.contains('mp3-compact');
                        if (isCompact !== wasCompact) {
                            overlay.classList.toggle('mp3-compact', isCompact);
                            // Close sidebar & detail when leaving compact mode
                            if (!isCompact) {
                                if (sidebar) {
                                    sidebar.classList.remove('mp3-sidebar-open');
                                    var bd = qs('#mp3-sidebar-backdrop');
                                    if (bd) bd.classList.remove('mp3-backdrop-open');
                                }
                                applySidebarWidth();
                            } else if (sidebar) {
                                // Eigene Breite raus, damit sie das feste Compact-Offcanvas-Maß nicht ueberstimmt
                                sidebar.style.width = '';
                            }
                        }
                    }
                });
                compactObserver.observe(modal);
            }

            // ---- Drag move via header ----
            header.addEventListener('mousedown', function (e) {
                if (isMobile() || overlay.classList.contains('mp3-fullscreen-mode')) return;
                if (e.target.closest('.mp3-close, .mp3-header-tools, input, select, button, label')) return;
                dragging = true;
                interacting = true;
                var rect = modal.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;
                e.preventDefault();
            });

            // ---- Resize via handle ----
            handle.addEventListener('mousedown', function (e) {
                if (isMobile() || overlay.classList.contains('mp3-fullscreen-mode')) return;
                resizing = true;
                interacting = true;
                var rect = modal.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startW = rect.width;
                startH = rect.height;
                startLeft = rect.left;
                startTop = rect.top;
                e.preventDefault();
            });

            // ---- Sidebar-Breite per Drag-Handle (rechte Kante) ----
            if (sidebarHandle && sidebar) {
                var resizingSidebar = false;
                var sidebarStartX = 0, sidebarStartWidth = 0;

                sidebarHandle.addEventListener('mousedown', function (e) {
                    if (isMobile() || overlay.classList.contains('mp3-compact')) return;
                    resizingSidebar = true;
                    interacting = true;
                    sidebarStartX = e.clientX;
                    sidebarStartWidth = sidebar.getBoundingClientRect().width;
                    sidebarHandle.classList.add('mp3-resizing');
                    e.preventDefault();
                });

                document.addEventListener('mousemove', function (e) {
                    if (!resizingSidebar) return;
                    var dx = e.clientX - sidebarStartX;
                    var newWidth = Math.max(SIDEBAR_MIN, Math.min(sidebarStartWidth + dx, SIDEBAR_MAX));
                    sidebar.style.width = newWidth + 'px';
                });

                document.addEventListener('mouseup', function () {
                    if (!resizingSidebar) return;
                    resizingSidebar = false;
                    sidebarHandle.classList.remove('mp3-resizing');
                    localStorage.setItem('mp3_sidebar_width', String(Math.round(sidebar.getBoundingClientRect().width)));
                    setTimeout(function () { interacting = false; }, 0);
                });

                // Doppelklick auf den Handle setzt die Breite zurueck
                sidebarHandle.addEventListener('dblclick', function () {
                    if (isMobile() || overlay.classList.contains('mp3-compact')) return;
                    sidebar.style.width = '';
                    localStorage.removeItem('mp3_sidebar_width');
                });
            }

            // ---- Detail-Panel-Breite per Drag-Handle (linke Kante) ----
            // Gleiches Muster wie die Sidebar oben, aber der Handle sitzt an
            // der LINKEN statt rechten Kante -- nach links ziehen (dx negativ)
            // soll die Breite VERGROESSERN, daher `startWidth - dx` statt `+`.
            if (detailHandle && detailPanel) {
                var resizingDetail = false;
                var detailStartX = 0, detailStartWidth = 0;

                detailHandle.addEventListener('mousedown', function (e) {
                    if (isMobile() || overlay.classList.contains('mp3-compact')) return;
                    resizingDetail = true;
                    interacting = true;
                    detailStartX = e.clientX;
                    detailStartWidth = detailPanel.getBoundingClientRect().width;
                    detailHandle.classList.add('mp3-resizing');
                    e.preventDefault();
                });

                document.addEventListener('mousemove', function (e) {
                    if (!resizingDetail) return;
                    var dx = e.clientX - detailStartX;
                    var newWidth = Math.max(DETAIL_MIN_WIDTH, Math.min(detailStartWidth - dx, DETAIL_MAX_WIDTH));
                    detailPanel.style.width = newWidth + 'px';
                });

                document.addEventListener('mouseup', function () {
                    if (!resizingDetail) return;
                    resizingDetail = false;
                    detailHandle.classList.remove('mp3-resizing');
                    localStorage.setItem('mp3_detail_width', String(Math.round(detailPanel.getBoundingClientRect().width)));
                    setTimeout(function () { interacting = false; }, 0);
                });

                // Doppelklick auf den Handle setzt die Breite zurueck
                detailHandle.addEventListener('dblclick', function () {
                    if (isMobile() || overlay.classList.contains('mp3-compact')) return;
                    detailPanel.style.width = '';
                    localStorage.removeItem('mp3_detail_width');
                });
            }

            document.addEventListener('mousemove', function (e) {
                if (dragging) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    var newLeft = startLeft + dx;
                    var newTop = startTop + dy;
                    // Constrain to viewport
                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 100));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
                    modal.style.position = 'fixed';
                    modal.style.left = newLeft + 'px';
                    modal.style.top = newTop + 'px';
                    modal.style.margin = '0';
                    modal.style.transform = 'none';
                }
                if (resizing) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    var newW = Math.max(480, startW + dx);
                    var newH = Math.max(320, startH + dy);
                    // Don't exceed viewport
                    newW = Math.min(newW, window.innerWidth - startLeft);
                    newH = Math.min(newH, window.innerHeight - startTop);
                    modal.style.width = newW + 'px';
                    modal.style.maxWidth = 'none';
                    modal.style.height = newH + 'px';
                }
            });

            document.addEventListener('mouseup', function () {
                if (dragging || resizing) {
                    dragging = false;
                    resizing = false;
                    // Delay clearing interacting so the backdrop click handler doesn't fire
                    setTimeout(function () { interacting = false; }, 0);
                }
            });

            // Double-click header to reset size/position
            header.addEventListener('dblclick', function (e) {
                if (isMobile()) return;
                if (e.target.closest('.mp3-close')) return;
                modal.style.position = '';
                modal.style.left = '';
                modal.style.top = '';
                modal.style.margin = '';
                modal.style.transform = '';
                modal.style.width = '';
                modal.style.maxWidth = '';
                modal.style.height = '';
            });
        })();

        // ---- Events ----

        // Close button
        qs('.mp3-close', overlay).addEventListener('click', close);

        // Dark Mode Toggle
        // setDarkMode is defined globally and called from button click handlers

        var darkToggleBtn = qs('.mp3-dark-mode-toggle', overlay);
        if (darkToggleBtn) {
            darkToggleBtn.addEventListener('click', function () {
                setDarkMode(!darkModeEnabled);
            });
        }

        // ---- Verwaltungs-Menue: klassische Medienpool-Unterseiten (Struktur, Hochladen,
        // Synchronisation, ggf. von Drittaddons wie mediatools/ffmpeg eingeklinkte Seiten) ----
        (function initAdminMenu() {
            var wrap = qs('.mp3-admin-menu-wrap', overlay);
            var btn = qs('.mp3-admin-menu-btn', overlay);
            var menu = qs('#mp3-admin-menu', overlay);
            if (!wrap || !btn || !menu) return;

            var root = document.getElementById('mp3-root');
            var subpages = [];
            try {
                subpages = root && root.dataset.subpages ? JSON.parse(root.dataset.subpages) : [];
            } catch (e) {
                subpages = [];
            }

            if (!subpages.length) {
                wrap.style.display = 'none';
                return;
            }

            menu.innerHTML = subpages.map(function (p) {
                return '<a href="' + escAttr(p.href) + '"><i class="' + escAttr(p.icon) + '"></i> ' + escAttr(p.title) + '</a>';
            }).join('');

            // Klassische Seiten in einem Popup-Fenster oeffnen (wie der alte Medienpool
            // es tut), statt den Hintergrund/Overlay durch echte Navigation zu verlassen.
            menu.addEventListener('click', function (e) {
                var link = e.target.closest('a');
                if (!link) return;
                e.preventDefault();
                if (typeof window.newPoolWindow === 'function') {
                    window.newPoolWindow(link.getAttribute('href'));
                } else {
                    window.open(link.getAttribute('href'), '_blank');
                }
                wrap.classList.remove('mp3-admin-menu-open');
            });

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                wrap.classList.toggle('mp3-admin-menu-open');
            });

            document.addEventListener('click', function (e) {
                if (!wrap.classList.contains('mp3-admin-menu-open')) return;
                if (e.target.closest('.mp3-admin-menu-wrap')) return;
                wrap.classList.remove('mp3-admin-menu-open');
            });
        })();

        // Kategorie-Aktionsmenue schliessen bei Klicks ausserhalb des Overlays
        // (Klicks innerhalb erledigt der delegierte overlay-Handler oben bereits).
        document.addEventListener('click', function (e) {
            if (e.target.closest('#mp3-overlay')) return;
            closeCatMenu();
        });

        // Click backdrop to close (but not after drag/resize)
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && !interacting) close();
        });

        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('mp3-open')) {
                if (lightboxOpen) {
                    closeLightbox();
                    return;
                }
                if (metainfoPickTarget) {
                    endMetainfoPick();
                    return;
                }
                close();
                return;
            }

            if ((e.key === 'f' || e.key === 'F') && overlay.classList.contains('mp3-open')) {
                var active = document.activeElement;
                var isEditable = active && (
                    active.tagName === 'INPUT' ||
                    active.tagName === 'TEXTAREA' ||
                    active.tagName === 'SELECT' ||
                    active.tagName === 'IFRAME' ||
                    active.isContentEditable
                );
                if (isEditable) {
                    return;
                }
                e.preventDefault();
                setFullscreenMode(!fullscreenMode);
            }

        });

        // Add category button (event delegation). Auf overlay statt sidebar,
        // weil das Kategorie-Aktionsmenue als Portal (#mp3-cat-menu-portal)
        // ausserhalb der Sidebar haengt (siehe openCatMenu()) und seine
        // Buttons sonst nicht ueber Delegation erreichbar waeren.
        overlay.addEventListener('click', function (e) {
            // Kategorie-Aktionsmenue: schliesst bei jedem Klick zunaechst,
            // toggelt bei Klick auf den Kebab-Button erneut auf.
            var catMenuBtn = e.target.closest('.mp3-cat-menu-btn');
            var wasOpenFor = catMenuBtn ? catMenuBtn.getAttribute('data-cat-menu-toggle') : null;
            var portal = document.getElementById('mp3-cat-menu-portal');
            var wasOpen = portal && portal.classList.contains('mp3-cat-menu-portal-open') &&
                portal.getAttribute('data-open-for') === wasOpenFor;
            closeCatMenu();
            if (catMenuBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (!wasOpen) {
                    var catId = parseInt(wasOpenFor, 10) || 0;
                    var catName = catMenuBtn.getAttribute('data-cat-menu-name') || String(catId);
                    openCatMenu(catId, catName, catMenuBtn);
                }
                return;
            }

            var collectionAddBtn = e.target.closest('.mp3-collection-add-btn');
            if (collectionAddBtn) {
                e.preventDefault();
                e.stopPropagation();
                showPromptModal({
                    icon: 'fa-photo-film',
                    title: t('mediaplace_create_collection'),
                    label: t('mediaplace_prompt_collection_name'),
                    confirmLabel: t('mediaplace_create'),
                }).then(function (collectionName) {
                    if (null === collectionName) return;
                    createCollection(currentCat, collectionName)
                        .then(function (created) {
                            if (!created) {
                                alert(t('mediaplace_collection_create_failed'));
                                return;
                            }
                            setActiveCollection(created.id);
                            refreshCollectionsSection();
                            refreshDisplay();
                            alert(t('mediaplace_collection_activated_hint'));
                        })
                        .catch(function (err) {
                            alert(t('mediaplace_error_creating_collection', { msg: err.message }));
                        });
                });
                return;
            }

            var collectionRenameBtn = e.target.closest('.mp3-collection-rename-btn');
            if (collectionRenameBtn) {
                e.preventDefault();
                e.stopPropagation();
                var renameCollectionId = String(collectionRenameBtn.getAttribute('data-collection-id') || '');
                if (!renameCollectionId) return;
                var collectionList = getCollectionsForCurrentCategory();
                var currentCollectionName = '';
                for (var ci = 0; ci < collectionList.length; ci++) {
                    if (String(collectionList[ci].id) === renameCollectionId) {
                        currentCollectionName = String(collectionList[ci].name || '');
                        break;
                    }
                }
                showPromptModal({
                    icon: 'fa-pen',
                    title: t('mediaplace_rename_collection'),
                    label: t('mediaplace_prompt_rename_collection'),
                    value: currentCollectionName,
                    confirmLabel: t('mediaplace_rename'),
                }).then(function (nextCollectionName) {
                    if (null === nextCollectionName) return;
                    renameCollection(currentCat, renameCollectionId, nextCollectionName)
                        .then(function (updatedCount) {
                            if (updatedCount <= 0) {
                                alert(t('mediaplace_collection_renamed_empty'));
                                return;
                            }
                            refreshCollectionsSection();
                            refreshDisplay();
                            if (selectedFile) showDetail(selectedFile);
                        })
                        .catch(function (err) {
                            alert(t('mediaplace_error_renaming_collection', { msg: err.message }));
                        });
                });
                return;
            }

            var collectionDeleteBtn = e.target.closest('.mp3-collection-delete-btn');
            if (collectionDeleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                var deleteCollectionId = String(collectionDeleteBtn.getAttribute('data-collection-id') || '');
                if (!deleteCollectionId) return;
                showConfirmModal({
                    title: t('mediaplace_delete_collection'),
                    message: t('mediaplace_confirm_delete_collection', { name: '<strong>' + escAttr(deleteCollectionId) + '</strong>' }),
                    confirmLabel: t('mediaplace_delete'),
                    dangerous: true,
                    onConfirm: function (ctx) {
                        ctx.setBusy(true);
                        deleteCollection(currentCat, deleteCollectionId)
                            .then(function (updatedCount) {
                                ctx.close();
                                refreshCollectionsSection();
                                refreshDisplay();
                                if (selectedFile) showDetail(selectedFile);
                                if (updatedCount <= 0) {
                                    alert(t('mediaplace_collection_deleted_empty'));
                                }
                            })
                            .catch(function (err) {
                                ctx.setBusy(false);
                                ctx.showError(t('mediaplace_error_deleting_collection', { msg: err.message }));
                            });
                    }
                });
                return;
            }

            var addBtn = e.target.closest('.mp3-cat-add-btn');
            if (addBtn) {
                e.preventDefault();
                e.stopPropagation();
                var parentId = parseInt(addBtn.getAttribute('data-add-parent'), 10) || 0;
                showCategoryInput(parentId);
                return;
            }

            var renameBtn = e.target.closest('.mp3-cat-rename-btn');
            if (renameBtn) {
                e.preventDefault();
                e.stopPropagation();
                var renameId = parseInt(renameBtn.getAttribute('data-rename-cat'), 10) || 0;
                if (renameId <= 0 || !catCache[renameId]) return;
                showRenameCategoryModal(renameId, String(catCache[renameId].name || ''));
                return;
            }

            var moveBtn = e.target.closest('.mp3-cat-move-btn');
            if (moveBtn) {
                e.preventDefault();
                e.stopPropagation();
                var moveCatId = parseInt(moveBtn.getAttribute('data-move-cat'), 10) || 0;
                if (moveCatId <= 0) return;
                var moveCatName = catCache[moveCatId] ? String(catCache[moveCatId].name || moveCatId) : String(moveCatId);
                showMoveCategoryModal(moveCatId, moveCatName);
                return;
            }

            var deleteBtn = e.target.closest('.mp3-cat-delete-btn');
            if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                var deleteCatId = parseInt(deleteBtn.getAttribute('data-delete-cat'), 10) || 0;
                if (deleteCatId <= 0) return;
                var deleteCatName = deleteBtn.getAttribute('data-delete-cat-name') || String(deleteCatId);
                showConfirmModal({
                    title: t('mediaplace_delete_category'),
                    message: t('mediaplace_confirm_delete_category', { name: '<strong>' + escAttr(deleteCatName) + '</strong>' }),
                    confirmLabel: t('mediaplace_delete'),
                    dangerous: true,
                    onConfirm: function (ctx) {
                        ctx.setBusy(true);
                        apiDeleteCategory(deleteCatId)
                            .then(function () {
                                ctx.close();
                                catCache = {};
                                catPath = [];
                                if (currentCat === deleteCatId) {
                                    navigateToCategory(0);
                                }
                                loadCategories();
                            })
                            .catch(function (err) {
                                ctx.setBusy(false);
                                ctx.showError(categoryErrorMessage(err, 'mediaplace_error_deleting'));
                            });
                    }
                });
                return;
            }
        });

        // Category input confirm/cancel (event delegation)
        sidebar.addEventListener('keydown', function (e) {
            var input = e.target.closest('.mp3-cat-new-input');
            if (!input) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                submitNewCategory(input);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                var wrap = qs('.mp3-cat-new-wrap', sidebar);
                if (wrap) wrap.remove();
            }
        });

        sidebar.addEventListener('click', function (e) {
            var confirmBtn = e.target.closest('.mp3-cat-new-confirm');
            if (confirmBtn) {
                e.preventDefault();
                e.stopPropagation();
                var input = qs('.mp3-cat-new-input', confirmBtn.closest('.mp3-cat-new-wrap'));
                if (input) submitNewCategory(input);
                return;
            }
            var cancelBtn = e.target.closest('.mp3-cat-new-cancel');
            if (cancelBtn) {
                e.preventDefault();
                e.stopPropagation();
                var wrap = cancelBtn.closest('.mp3-cat-new-wrap');
                if (wrap) wrap.remove();
            }
        });

        sidebar.addEventListener('focusout', function (e) {
            var input = e.target.closest('.mp3-cat-new-input');
            if (!input || input.disabled) return;
            // Small delay to allow Enter to fire first
            setTimeout(function () {
                if (document.activeElement !== input) {
                    var wrap = qs('.mp3-cat-new-wrap', sidebar);
                    if (wrap) wrap.remove();
                }
            }, 150);
        });

        // Category search (event delegation)
        sidebar.addEventListener('input', function (e) {
            if (!e.target.closest('.mp3-cat-search-input')) return;
            applyCategorySearchFilter();
        });

        sidebar.addEventListener('keydown', function (e) {
            var searchInput = e.target.closest('.mp3-cat-search-input');
            if (!searchInput) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                searchInput.value = '';
                applyCategorySearchFilter();
                focusWithoutScroll(searchInput);
            }
        });

        // Category clicks (event delegation)
        sidebar.addEventListener('click', function (e) {
            e.preventDefault();

            var collection = e.target.closest('.mp3-collection');
            if (collection) {
                e.stopPropagation();
                var collectionId = String(collection.getAttribute('data-collection-id') || '');
                if (!collectionId) return;
                // Toggle: Sammlung XOR Kategorie. Wenn Sammlung aktiv, verlasse Kategorie-Modus
                if (String(activeCollectionId) === collectionId) {
                    setActiveCollection(null);
                } else {
                    setActiveCollection(collectionId);
                }
                // Reset category to -1 (show all) when entering collection mode
                currentCat = activeCollectionId ? -1 : 0;
                localStorage.setItem('mp3_cat', String(currentCat));
                buildBreadcrumb(currentCat);
                refreshCollectionsSection();
                updateSidebarActiveState();
                loadFiles(currentCat, true);
                return;
            }

            // Toggle arrow click: expand/collapse subcategories
            var toggleIcon = e.target.closest('.mp3-cat-toggle');
            if (toggleIcon) {
                e.stopPropagation();
                var toggleId = parseInt(toggleIcon.getAttribute('data-toggle-cat'), 10);
                toggleCategory(toggleId);
                return;
            }

            // Category name click: navigate to that category (exit collection mode)
            var cat = e.target.closest('.mp3-cat');
            // mp3-cat-disabled (z.B. "Medienpool" ohne hasCategoryPerm(0)) ist
            // ein <span> ohne data-cat -- ohne diese Pruefung wuerde catId
            // unten zu NaN werden und currentCat kaputt setzen.
            if (!cat || cat.classList.contains('mp3-cat-disabled') || !cat.hasAttribute('data-cat')) return;
            var catId = parseInt(cat.getAttribute('data-cat'), 10);
            currentCat = catId;
            localStorage.setItem('mp3_cat', catId);
            // Exit collection mode when clicking a category
            setActiveCollection(null);

            // Mark active in sidebar
            qsa('.mp3-cat', sidebar).forEach(function (c) {
                c.classList.remove('mp3-cat-active');
            });
            cat.classList.add('mp3-cat-active');

            // Auto-expand if has children and not yet open. hasChildren/open
            // leben nicht mehr in catCache (der Baum kommt komplett vom
            // Server, siehe loadCategories()) -- stattdessen am DOM ablesen:
            // ein Chevron-Icon bedeutet Kinder vorhanden.
            var catNode = catId > 0 ? qs('.mp3-cat-node[data-cat-id="' + catId + '"]', sidebar) : null;
            // ":scope > .mp3-cat-row" statt qs() ueber alle Nachfahren, sonst
            // wuerde ein Chevron eines (versteckten) Enkel-Knotens faelschlich
            // mitgezaehlt -- .mp3-cat-children liegt als Geschwister neben,
            // nicht innerhalb von .mp3-cat-row.
            var hasOwnToggle = catNode && catNode.querySelector(':scope > .mp3-cat-row .mp3-cat-toggle');
            if (catNode && hasOwnToggle && !catNode.classList.contains('mp3-cat-node-open')) {
                toggleCategory(catId);
            }

            // Update breadcrumb and load files
            buildBreadcrumb(catId);
            loadFiles(catId, true);
        });

        // Drag & Drop media -> collection
        function getDraggedFilenames(dt) {
            var filenames = [];
            if (!dt) return filenames;
            var multi = String(dt.getData('text/mp3-filenames') || '').trim();
            if (multi) {
                filenames = multi.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            } else {
                var single = String(dt.getData('text/mp3-filename') || dt.getData('text/plain') || '').trim();
                if (single) filenames = [single];
            }
            return filenames;
        }

        sidebar.addEventListener('dragover', function (e) {
            var collectionRow = e.target.closest('.mp3-collection-row');
            if (collectionRow) {
                e.preventDefault();
                collectionRow.classList.add('mp3-collection-drop-target');
                return;
            }
            var catRow = e.target.closest('.mp3-cat');
            if (catRow && !catRow.classList.contains('mp3-cat-disabled')) {
                e.preventDefault();
                catRow.classList.add('mp3-cat-drop-target');
            }
        });

        sidebar.addEventListener('dragleave', function (e) {
            var collectionRow = e.target.closest('.mp3-collection-row');
            if (collectionRow) {
                if (collectionRow.contains(e.relatedTarget)) return;
                collectionRow.classList.remove('mp3-collection-drop-target');
                return;
            }
            var catRow = e.target.closest('.mp3-cat');
            if (catRow) {
                if (catRow.contains(e.relatedTarget)) return;
                catRow.classList.remove('mp3-cat-drop-target');
            }
        });

        sidebar.addEventListener('drop', function (e) {
            var collectionRow = e.target.closest('.mp3-collection-row');
            if (collectionRow) {
                e.preventDefault();
                collectionRow.classList.remove('mp3-collection-drop-target');

                var collection = collectionRow.querySelector('.mp3-collection[data-collection-id]');
                if (!collection) return;
                var collectionId = String(collection.getAttribute('data-collection-id') || '');
                if (!collectionId) return;

                var filenames = getDraggedFilenames(e.dataTransfer);
                if (!filenames.length) return;

                var promises = filenames.map(function (fn) {
                    return setFileCollectionMembership(fn, collectionId, true);
                });
                Promise.all(promises)
                    .then(function () {
                        if (!multiMode) {
                            clearCollectionDragSelection();
                        }
                        setActiveCollection(collectionId);
                        refreshCollectionsSection();
                        refreshDisplay();
                        if (selectedFile && filenames.indexOf(selectedFile) !== -1) showDetail(selectedFile);
                    })
                    .catch(function (err) {
                        alert(t('mediaplace_error_assigning_collection', { msg: err.message }));
                    });
                return;
            }

            // Medien per Drag&Drop einer anderen Kategorie zuordnen
            var catRow = e.target.closest('.mp3-cat');
            // mp3-cat-disabled hat kein data-cat -- ohne diese Pruefung wuerde
            // "|| 0" unten das Ziel faelschlich auf Kategorie 0 setzen.
            if (catRow && !catRow.classList.contains('mp3-cat-disabled') && catRow.hasAttribute('data-cat')) {
                e.preventDefault();
                catRow.classList.remove('mp3-cat-drop-target');

                var targetCatId = parseInt(catRow.getAttribute('data-cat'), 10) || 0;
                var catFilenames = getDraggedFilenames(e.dataTransfer);
                if (!catFilenames.length) return;

                var updatePromises = catFilenames.map(function (fn) {
                    return apiUpdate(fn, { category_id: targetCatId });
                });
                Promise.all(updatePromises)
                    .then(function () {
                        if (!multiMode) {
                            clearCollectionDragSelection();
                        }
                        navigateToCategory(targetCatId);
                        if (selectedFile && catFilenames.indexOf(selectedFile) !== -1) showDetail(selectedFile);
                    })
                    .catch(function (err) {
                        alert(mediaErrorMessage(err, 'mediaplace_error_moving_to_category'));
                    });
            }
        });

        // Breadcrumb clicks (event delegation)
        breadcrumb.addEventListener('click', function (e) {
            var item = e.target.closest('.mp3-bc-item');
            // mp3-bc-item-disabled (Medienpool-Wurzel ohne hasCategoryPerm(0))
            // ist ein <span> ohne data-cat -- siehe Kategorie-Klick-Handler oben.
            if (!item || item.classList.contains('mp3-bc-item-disabled') || !item.hasAttribute('data-cat')) return;
            e.preventDefault();
            var catId = parseInt(item.getAttribute('data-cat'), 10);
            currentCat = catId;
            localStorage.setItem('mp3_cat', catId);
            buildBreadcrumb(catId);
            updateSidebarActiveState();
            loadFiles(catId, true);
        });

        // Card/row clicks (event delegation) — show detail panel or toggle multi-select
        grid.addEventListener('click', function (e) {
            var quickCollectionBtn = e.target.closest('.mp3-collection-toggle-btn');
            if (quickCollectionBtn) {
                var quickFilename = quickCollectionBtn.getAttribute('data-toggle-collection-file');
                if (!quickFilename || !getActiveCollection()) return;

                quickCollectionBtn.disabled = true;
                toggleFileInActiveCollection(quickFilename)
                    .then(function () {
                        refreshCollectionsSection();
                        refreshDisplay();
                        if (selectedFile === quickFilename) {
                            showDetail(quickFilename);
                        }
                    })
                    .catch(function (err) {
                        alert(t('mediaplace_error_updating_collection', { msg: err.message }));
                    })
                    .then(function () {
                        quickCollectionBtn.disabled = false;
                    });
                return;
            }

            var card = e.target.closest('.mp3-card') || e.target.closest('.mp3-list-row') || e.target.closest('.mp3-masonry-card');
            if (!card) return;
            var filename = card.getAttribute('data-filename');
            if (!filename) return;

            if (metainfoPickTarget && 'media' === metainfoPickTarget.type) {
                finishMetainfoMediaPick(filename);
                return;
            }

            if (mediaLinkPickFieldKey && detailPanel) {
                var targetInput = detailPanel.querySelector('[data-json-field="' + mediaLinkPickFieldKey + '"]');
                if (targetInput) {
                    targetInput.value = filename;
                    repaintMediaLinkWidget(targetInput.closest('.mp3-media-link-widget'));
                    setMediaLinkPickMode(null);
                    updateDetailSaveState();
                    return;
                }
                setMediaLinkPickMode(null);
            }

            if (multiMode) {
                // Toggle selection
                if (multiSelected[filename]) {
                    delete multiSelected[filename];
                } else {
                    multiSelected[filename] = true;
                }
                updateMultiUI();
                return;
            }

            // Normal mode: Cmd/Ctrl+click toggles batch selection (Sammlungs-
            // Drag und/oder Mehrfach-Loeschen, siehe mp3-batch-footer) -- bewusst
            // NICHT mehr an features.collections gekoppelt: Mehrfach-Loeschen
            // soll auch funktionieren, wenn Sammlungen deaktiviert sind.
            if (e.metaKey || e.ctrlKey) {
                toggleCollectionDragSelection(filename);
                return;
            }

            showDetail(filename);
        });

        grid.addEventListener('dragstart', function (e) {
            var item = e.target.closest('.mp3-card') || e.target.closest('.mp3-list-row') || e.target.closest('.mp3-masonry-card');
            if (!item) return;
            var filename = String(item.getAttribute('data-filename') || '');
            if (!filename || !e.dataTransfer) return;
            // Carry selected files if dragged card is part of selection.
            var selectedMap = multiMode ? multiSelected : collectionDragSelected;
            var dragFiles = (Object.keys(selectedMap).length > 0 && selectedMap[filename])
                ? Object.keys(selectedMap)
                : [filename];
            e.dataTransfer.setData('text/mp3-filenames', dragFiles.join(','));
            e.dataTransfer.setData('text/mp3-filename', filename);
            e.dataTransfer.setData('text/plain', filename);
            e.dataTransfer.effectAllowed = 'copy';

            // Create a small drag image so the card doesn't obscure the sidebar drop targets
            var thumb = item.querySelector('img');
            var ghost = document.createElement('div');
            ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;width:64px;height:64px;border-radius:6px;overflow:hidden;background:#222;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;';
            if (thumb && thumb.src) {
                var img = document.createElement('img');
                img.src = thumb.src;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                ghost.appendChild(img);
            } else {
                ghost.style.fontSize = '24px';
                ghost.textContent = '\uD83D\uDCC4';
            }
            // Badge for multi-file drag
            if (dragFiles.length > 1) {
                var badge = document.createElement('div');
                badge.textContent = dragFiles.length;
                badge.style.cssText = 'position:absolute;bottom:2px;right:2px;background:#e44;color:#fff;font-size:11px;font-weight:700;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;line-height:1;';
                ghost.style.position = 'relative';
                ghost.appendChild(badge);
            }
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 32, 32);
            setTimeout(function () { ghost.remove(); }, 0);

            item.classList.add('mp3-card-dragging');
        });

        grid.addEventListener('dragend', function (e) {
            var item = e.target.closest('.mp3-card') || e.target.closest('.mp3-list-row') || e.target.closest('.mp3-masonry-card');
            if (item) item.classList.remove('mp3-card-dragging');
        });

        // Detail panel events (event delegation)
        overlay.addEventListener('click', function (e) {
            var fsBtn = e.target.closest('.mp3-fullscreen-toggle');
            if (fsBtn) {
                setFullscreenMode(!fullscreenMode);
                return;
            }

            var openLbBtn = e.target.closest('.mp3-lightbox-open-btn');
            if (openLbBtn) {
                openLightbox(
                    openLbBtn.getAttribute('data-lightbox-src') || '',
                    openLbBtn.getAttribute('data-lightbox-caption') || ''
                );
                return;
            }

            var openFpBtn = e.target.closest('.mp3-focuspoint-edit-btn');
            if (openFpBtn) {
                openFocuspointCanvas(openFpBtn.getAttribute('data-focuspoint-file') || '');
                return;
            }

            var closeLbBtn = e.target.closest('.mp3-lightbox-close');
            if (closeLbBtn) {
                closeLightbox();
                return;
            }

            if (e.target.classList && e.target.classList.contains('mp3-lightbox')) {
                closeLightbox();
                return;
            }

            var selAllBtn = e.target.closest('.mp3-multi-select-all');
            if (selAllBtn) {
                toggleSelectAll();
                return;
            }

            var confirmBtn = e.target.closest('.mp3-multi-confirm');
            if (confirmBtn) {
                if (metainfoPickTarget && 'medialist' === metainfoPickTarget.type) {
                    finishMetainfoMedialistPick(Object.keys(multiSelected));
                    return;
                }
                if (onMultiSelect) onMultiSelect(Object.keys(multiSelected).filter(isFileSelectable));
                close();
                return;
            }

            var batchSelectAllBtn = e.target.closest('.mp3-batch-select-all');
            if (batchSelectAllBtn) {
                toggleCollectionDragSelectAll();
                return;
            }

            var batchClearBtn = e.target.closest('.mp3-batch-clear-btn');
            if (batchClearBtn) {
                clearCollectionDragSelection();
                return;
            }

            var batchDeleteBtn = e.target.closest('.mp3-batch-delete-btn');
            if (batchDeleteBtn) {
                var batchFilenames = Object.keys(collectionDragSelected);
                if (!batchFilenames.length) return;
                showConfirmModal({
                    title: t('mediaplace_delete_selection'),
                    message: t('mediaplace_confirm_delete_files', {
                        count: batchFilenames.length,
                        unit: (1 === batchFilenames.length ? t('mediaplace_file_singular') : t('mediaplace_file_plural'))
                    }),
                    confirmLabel: t('mediaplace_delete'),
                    dangerous: true,
                    onConfirm: function (ctx) {
                        ctx.setBusy(true);
                        var deleted = [];
                        var skipped = [];
                        var failed = [];

                        function deleteNext(i) {
                            if (i >= batchFilenames.length) {
                                lastLoadedFiles = lastLoadedFiles.filter(function (f) { return deleted.indexOf(f.filename) === -1; });
                                deleted.forEach(function (fn) {
                                    delete collectionDragSelected[fn];
                                    delete multiSelected[fn];
                                });
                                if (selectedFile && deleted.indexOf(selectedFile) !== -1) hideDetail();
                                updateCollectionDragSelectionUI();
                                if (multiMode) updateMultiUI();
                                refreshDisplay();

                                if (!skipped.length && !failed.length) {
                                    ctx.close();
                                    return;
                                }
                                ctx.setBusy(false);
                                var msg = t('mediaplace_deleted_count', { count: deleted.length });
                                if (skipped.length) msg += ' ' + t('mediaplace_skipped_in_use', { list: skipped.join(', ') });
                                if (failed.length) msg += ' ' + t('mediaplace_failed_list', { list: failed.join(', ') });
                                ctx.showError(msg);
                                return;
                            }

                            var batchFilename = batchFilenames[i];
                            apiDelete(batchFilename)
                                .then(function () {
                                    deleted.push(batchFilename);
                                })
                                .catch(function (err) {
                                    if (err && /in use/i.test(err.message)) {
                                        skipped.push(batchFilename);
                                    } else {
                                        failed.push(batchFilename);
                                    }
                                })
                                .then(function () {
                                    deleteNext(i + 1);
                                });
                        }

                        deleteNext(0);
                    }
                });
                return;
            }

            var selectBtn = e.target.closest('.mp3-detail-select-btn');
            if (selectBtn) {
                var fn = selectBtn.getAttribute('data-filename');
                if (multiMode) {
                    if (multiSelected[fn]) delete multiSelected[fn];
                    else multiSelected[fn] = true;
                    updateMultiUI();
                    hideDetail();
                } else if (onSelect && fn && isFileSelectable(fn)) {
                    onSelect(fn);
                    close();
                }
                return;
            }

            var deleteBtn = e.target.closest('.mp3-detail-delete-btn');
            if (deleteBtn) {
                var delFilename = deleteBtn.getAttribute('data-filename');
                var inUse = deleteBtn.getAttribute('data-in-use') === '1';
                if (inUse) {
                    alert(t('mediaplace_file_in_use_cannot_delete'));
                    return;
                }
                showConfirmModal({
                    title: t('mediaplace_delete_file'),
                    message: t('mediaplace_confirm_delete_file', { name: '<strong>' + escAttr(delFilename) + '</strong>' }),
                    confirmLabel: t('mediaplace_delete'),
                    dangerous: true,
                    onConfirm: function (ctx) {
                        ctx.setBusy(true);
                        apiDelete(delFilename)
                            .then(function () {
                                ctx.close();
                                lastLoadedFiles = lastLoadedFiles.filter(function (f) { return f.filename !== delFilename; });
                                delete multiSelected[delFilename];
                                delete collectionDragSelected[delFilename];
                                hideDetail();
                                refreshDisplay();
                                if (multiMode) updateMultiUI();
                                else updateCollectionDragSelectionUI();
                            })
                            .catch(function (err) {
                                ctx.setBusy(false);
                                ctx.showError(mediaErrorMessage(err, 'mediaplace_error_deleting'));
                            });
                    }
                });
                return;
            }

            var collectionBtn = e.target.closest('.mp3-detail-collection-btn');
            if (collectionBtn) {
                var collectionFilename = collectionBtn.getAttribute('data-filename');
                if (!collectionFilename || !getActiveCollection()) return;
                collectionBtn.disabled = true;
                toggleFileInActiveCollection(collectionFilename)
                    .then(function () {
                        refreshCollectionsSection();
                        refreshDisplay();
                        showDetail(collectionFilename);
                    })
                    .catch(function (err) {
                        alert(t('mediaplace_error_updating_collection', { msg: err.message }));
                    })
                    .then(function () {
                        collectionBtn.disabled = false;
                    });
                return;
            }

            var loadMoreBtn = e.target.closest('.mp3-load-more-btn');
            if (loadMoreBtn) {
                loadFiles(currentCat, false);
                return;
            }

            var closeBtn = e.target.closest('.mp3-detail-close');
            if (closeBtn) {
                hideDetail();
                return;
            }

            var inlineToggle = e.target.closest('.mp3-edit-display[data-inline-toggle]');
            if (inlineToggle) {
                var inlineField = inlineToggle.closest('.mp3-edit-field');
                if (inlineField) toggleInlineEdit(inlineField, true);
                return;
            }

            var saveBtn = e.target.closest('.mp3-detail-save-btn');
            if (saveBtn) {
                saveDetail();
                return;
            }

            var fieldSaveBtn = e.target.closest('.mp3-field-save-btn');
            if (fieldSaveBtn) {
                saveDetail();
                return;
            }

            var mediaPickBtn = e.target.closest('.mp3-media-link-picker');
            if (mediaPickBtn) {
                var fieldKey = mediaPickBtn.getAttribute('data-field');
                if (!fieldKey) return;
                setMediaLinkPickMode(mediaLinkPickFieldKey === fieldKey ? null : fieldKey);
                return;
            }

            var mediaClearBtn = e.target.closest('.mp3-media-link-clear');
            if (mediaClearBtn) {
                var clearFieldKey = mediaClearBtn.getAttribute('data-field');
                var clearInput = clearFieldKey ? detailPanel.querySelector('[data-json-field="' + clearFieldKey + '"]') : null;
                if (clearInput) {
                    clearInput.value = '';
                    repaintMediaLinkWidget(mediaClearBtn.closest('.mp3-media-link-widget'));
                    if (mediaLinkPickFieldKey === clearFieldKey) {
                        setMediaLinkPickMode(null);
                    }
                    updateDetailSaveState();
                }
                return;
            }

            var addTagBtn = e.target.closest('.mp3-tags-add-btn');
            if (addTagBtn) {
                var wrap = addTagBtn.closest('.mp3-tags-widget');
                var tagsInput = wrap ? qs('.mp3-tags-input', wrap) : null;
                var hiddenInput = wrap ? qs('[data-widget="tags-value"]', wrap) : null;
                if (!wrap || !tagsInput || !hiddenInput) return;
                var newTag = String(tagsInput.value || '').trim();
                if (!newTag) return;
                var list = [];
                try { list = JSON.parse(hiddenInput.value || '[]'); } catch (e1) { list = []; }
                if (!Array.isArray(list)) list = [];
                var exists = false;
                for (var li = 0; li < list.length; li++) {
                    var existingName = typeof list[li] === 'string' ? list[li] : String((list[li] && list[li].name) || '');
                    if (existingName === newTag) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    if (wrap.closest('.mp3-json-field[data-field-key="__system_tags"]') && isCollectionTagName(newTag)) {
                        alert(t('mediaplace_collection_tags_hint'));
                        return;
                    }
                    var color = '#4a90d9';
                    if (wrap.closest('.mp3-json-field[data-field-key="__system_tags"]') && Array.isArray(detailSystemTagCatalog)) {
                        for (var ci = 0; ci < detailSystemTagCatalog.length; ci++) {
                            var c = detailSystemTagCatalog[ci];
                            if (c && c.name === newTag && /^#[0-9a-fA-F]{6}$/.test(String(c.color || ''))) {
                                color = String(c.color).toLowerCase();
                                break;
                            }
                        }
                    }
                    list.push({ name: newTag, color: color });
                }
                hiddenInput.value = JSON.stringify(list);
                tagsInput.value = '';
                repaintTagsWidget(wrap);
                if (wrap.closest('.mp3-json-field[data-field-key="__system_tags"]')) {
                    repaintSystemTagSuggestions();
                }
                updateDetailSaveState();
                return;
            }

            var removeTagBtn = e.target.closest('.mp3-tag-remove');
            if (removeTagBtn) {
                var removeWrap = removeTagBtn.closest('.mp3-tags-widget');
                var removeHidden = removeWrap ? qs('[data-widget="tags-value"]', removeWrap) : null;
                var removeTag = removeTagBtn.getAttribute('data-tag');
                if (!removeHidden || !removeTag) return;
                var values = [];
                try { values = JSON.parse(removeHidden.value || '[]'); } catch (e2) { values = []; }
                if (!Array.isArray(values)) values = [];
                values = values.filter(function (t) {
                    var name = typeof t === 'string' ? t : String((t && t.name) || '');
                    return name !== removeTag;
                });
                removeHidden.value = JSON.stringify(values);
                repaintTagsWidget(removeWrap);
                if (removeWrap.closest('.mp3-json-field[data-field-key="__system_tags"]')) {
                    repaintSystemTagSuggestions();
                }
                updateDetailSaveState();
                return;
            }

            var langToggleBtn = e.target.closest('.mp3-lang-toggle');
            if (langToggleBtn) {
                var target = langToggleBtn.getAttribute('data-lang-toggle');
                var langGroup = target ? detailPanel.querySelector('.mp3-lang-group[data-lang-group="' + target + '"]') : null;
                var extra = langGroup ? qs('.mp3-lang-extra', langGroup) : null;
                if (!extra) return;
                var open = extra.style.display !== 'none';
                if (open) {
                    extra.style.display = 'none';
                    langToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i> ' + qsa('.mp3-lang-row', extra).length + ' weitere Sprache' + (qsa('.mp3-lang-row', extra).length > 1 ? 'n' : '');
                } else {
                    extra.style.display = '';
                    langToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Weitere Sprachen ausblenden';
                }
                return;
            }
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.closest('.mp3-tags-input')) {
                e.preventDefault();
                var tagWrap = e.target.closest('.mp3-tags-widget');
                var addBtn = tagWrap ? qs('.mp3-tags-add-btn', tagWrap) : null;
                if (addBtn) addBtn.click();
                return;
            }

            if (e.key === 'Enter' && e.target.closest('.mp3-inline-edit-wrap')) {
                e.preventDefault();
                saveDetail();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.closest('#mp3-detail')) {
                e.preventDefault();
                saveDetail();
                return;
            }

            if (e.key === 'Escape' && e.target.closest('#mp3-detail')) {
                updateDetailSaveState();
            }
        });

        overlay.addEventListener('input', function (e) {
            if (!e.target.closest('#mp3-detail')) return;

            var tagColorInput = e.target.closest('.mp3-tag-color');
            if (tagColorInput) {
                applyTagColorChange(tagColorInput);
                return;
            }

            if (!(e.target.matches('#mp3-detail-title-input') || e.target.hasAttribute('data-json-field'))) return;

            // ALT text input → update hint live
            var altWrap = e.target.closest('.mp3-alt-wrap');
            if (altWrap) {
                updateAltHint(altWrap);
            }

            var maybeField = e.target.closest('.mp3-edit-field');
            if (maybeField) updateInlineDisplay(maybeField);
            updateDetailSaveState();
        });

        overlay.addEventListener('change', function (e) {
            var perPageSelect = e.target.closest('.mp3-per-page-select');
            if (perPageSelect) {
                var nextPerPage = normalizeMediaPerPage(perPageSelect.value);
                perPageSelect.value = String(nextPerPage);

                if (nextPerPage !== mediaPerPage) {
                    mediaPerPage = nextPerPage;
                    localStorage.setItem('mp3_per_page', String(mediaPerPage));
                    loadFiles(currentCat, true);
                }
                return;
            }

            // Move file to a different category
            var moveCatSelect = e.target.closest('.mp3-move-file-select');
            if (moveCatSelect && selectedFile) {
                var newCatId = parseInt(moveCatSelect.value || '0', 10);
                var prevValue = moveCatSelect.getAttribute('data-current-cat') || '0';
                moveCatSelect.disabled = true;

                var movedFile = selectedFile;
                apiUpdate(movedFile, { category_id: newCatId })
                    .then(function () {
                        moveCatSelect.setAttribute('data-current-cat', String(newCatId));

                        // Update local cache
                        for (var i = 0; i < lastLoadedFiles.length; i++) {
                            if (lastLoadedFiles[i].filename === movedFile) {
                                lastLoadedFiles[i].category_id = newCatId;
                                break;
                            }
                        }

                        // Datei liegt jetzt in einer anderen Kategorie -> Ansicht dorthin
                        // wechseln, statt sie nur aus der aktuellen Liste zu entfernen.
                        if (currentCat >= 0 && newCatId !== currentCat) {
                            navigateToCategory(newCatId);
                            showDetail(movedFile);
                        }
                    })
                    .catch(function (err) {
                        alert(mediaErrorMessage(err, 'mediaplace_error_moving'));
                        moveCatSelect.value = prevValue;
                    })
                    .then(function () {
                        moveCatSelect.disabled = false;
                    });
                return;
            }

            var replaceInput = e.target.closest('.mp3-detail-replace-input');
            if (replaceInput) {
                var file = replaceInput.files && replaceInput.files[0] ? replaceInput.files[0] : null;
                if (!file || !selectedFile) return;

                if (!extensionsCompatible(selectedFile, file.name)) {
                    var allowed = getReplacementAcceptForFilename(selectedFile).replace(/,/g, ' oder ');
                    alert(t('mediaplace_invalid_extension', { allowed: allowed }));
                    replaceInput.value = '';
                    return;
                }

                var replaceLabel = replaceInput.closest('.mp3-detail-replace-btn');
                if (replaceLabel) replaceLabel.classList.add('is-loading');

                var reloadCat = currentCat;
                var reloadQuery = mediaQuery;

                apiReplaceFile(selectedFile, file)
                    .then(function () {
                        mediaForceCacheTokens[selectedFile] = Date.now();
                        currentCat = reloadCat;
                        localStorage.setItem('mp3_cat', String(reloadCat));
                        mediaQuery = reloadQuery;
                        if (searchInput) searchInput.value = reloadQuery;
                        buildBreadcrumb(reloadCat);
                        updateSidebarActiveState();
                        loadFiles(reloadCat, true);
                        showDetail(selectedFile);
                    })
                    .catch(function (err) {
                        alert(t('mediaplace_error_replacing_file', { msg: err.message }));
                    })
                    .then(function () {
                        if (replaceLabel) replaceLabel.classList.remove('is-loading');
                        replaceInput.value = '';
                    });
                return;
            }

            if (!e.target.closest('#mp3-detail')) return;
            var tagColorInput = e.target.closest('.mp3-tag-color');
            if (tagColorInput) {
                applyTagColorChange(tagColorInput);
                return;
            }
            // Decorative checkbox toggled → update ALT hint
            var decCb = e.target.closest('[data-json-field$="-decorative"]');
            if (decCb) {
                updateAltHint(decCb.closest('.mp3-alt-wrap'));
            }
        });

        // Search (client-side filter, combined with type filter/sort)
        var searchTimer;
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                mediaQuery = searchInput.value.trim();
                loadFiles(currentCat, true);
            }, 200);
        });

        gridWrap.addEventListener('scroll', function () {
            updateScrollPill();
            if (mediaLoading || !mediaHasMore) return;
            var threshold = 180;
            if (isMediaWallMode()) {
                if ((gridWrap.scrollLeft + gridWrap.clientWidth) >= (gridWrap.scrollWidth - threshold)) {
                    loadFiles(currentCat, false);
                }
            } else {
                if ((gridWrap.scrollTop + gridWrap.clientHeight) >= (gridWrap.scrollHeight - threshold)) {
                    loadFiles(currentCat, false);
                }
            }
        });

        if (scrollPillTrack && scrollPillThumb) {
            var draggingPill = false;
            var dragStartX = 0;
            var dragStartScrollLeft = 0;

            scrollPillThumb.addEventListener('mousedown', function (e) {
                if (!isMediaWallMode()) return;
                draggingPill = true;
                dragStartX = e.clientX;
                dragStartScrollLeft = gridWrap.scrollLeft;
                e.preventDefault();
            });

            scrollPillTrack.addEventListener('mousedown', function (e) {
                if (!isMediaWallMode()) return;
                if (e.target === scrollPillThumb) return;

                var rect = scrollPillTrack.getBoundingClientRect();
                var trackW = Math.max(1, rect.width);
                var thumbW = Math.max(1, scrollPillThumb.getBoundingClientRect().width);
                var maxThumbPos = Math.max(1, trackW - thumbW);
                var clickX = Math.max(0, Math.min(trackW, e.clientX - rect.left));
                var thumbPos = Math.max(0, Math.min(maxThumbPos, clickX - (thumbW / 2)));
                var maxScroll = Math.max(0, gridWrap.scrollWidth - gridWrap.clientWidth);
                gridWrap.scrollLeft = maxScroll > 0 ? Math.round((thumbPos / maxThumbPos) * maxScroll) : 0;
                updateScrollPill();
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (!draggingPill) return;
                var trackW = Math.max(1, scrollPillTrack.clientWidth);
                var thumbW = Math.max(1, scrollPillThumb.getBoundingClientRect().width);
                var maxThumbPos = Math.max(1, trackW - thumbW);
                var maxScroll = Math.max(0, gridWrap.scrollWidth - gridWrap.clientWidth);
                var scrollPerPx = maxScroll / maxThumbPos;
                gridWrap.scrollLeft = dragStartScrollLeft + ((e.clientX - dragStartX) * scrollPerPx);
                updateScrollPill();
            });

            document.addEventListener('mouseup', function () {
                draggingPill = false;
            });
        }

        window.addEventListener('resize', function () {
            updateScrollPill();
        });

        // Sort dropdown
        var sortSelect = qs('.mp3-sort-select', overlay);
        sortSelect.addEventListener('change', function () {
            currentSort = sortSelect.value;
            localStorage.setItem('mp3_sort', currentSort);
            refreshDisplay();
        });

        // View toggle (grid / list)
        var viewToggle = qs('.mp3-view-toggle', overlay);
        viewToggle.addEventListener('click', function (e) {
            var btn = e.target.closest('.mp3-view-btn');
            if (!btn) return;
            var mode = btn.getAttribute('data-view');
            if (mode === viewMode) return;
            viewMode = mode;
            localStorage.setItem('mp3_view', viewMode);
            qsa('.mp3-view-btn', viewToggle).forEach(function (b) {
                b.classList.toggle('mp3-view-active', b.getAttribute('data-view') === mode);
            });
            updateTileSizeVisibility();
            refreshDisplay();
        });

        // Tile size slider (Kachel- und Media-Wall-Ansicht)
        var tileSizeSliderEl = qs('.mp3-tile-size-slider', overlay);
        if (tileSizeSliderEl) {
            tileSizeSliderEl.addEventListener('input', function () {
                var size = normalizeTileSize(tileSizeSliderEl.value);
                overlay.style.setProperty('--mp3-tile-size', size + 'px');
                localStorage.setItem('mp3_tile_size', String(size));
            });
        }



        // Mobile category offcanvas
        var mobileCatBtn = qs('.mp3-mobile-cat-btn', overlay);
        var sidebarBackdrop = qs('#mp3-sidebar-backdrop');

        function openSidebar() {
            sidebar.classList.add('mp3-sidebar-open');
            if (sidebarBackdrop) sidebarBackdrop.classList.add('mp3-backdrop-open');
        }

        function closeSidebar() {
            sidebar.classList.remove('mp3-sidebar-open');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('mp3-backdrop-open');
        }

        mobileCatBtn.addEventListener('click', function () {
            if (sidebar.classList.contains('mp3-sidebar-open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        // Close sidebar on category select (mobile)
        sidebar.addEventListener('click', function (e) {
            if (e.target.closest('.mp3-cat') && window.innerWidth <= 768) {
                closeSidebar();
            }
        });

        // Sidebar backdrop click to close
        if (sidebarBackdrop) {
            sidebarBackdrop.addEventListener('click', function () {
                closeSidebar();
            });
        }

        // Filter buttons (event delegation on filter bar)
        var filterBar = qs('.mp3-filter-bar', overlay);
        filterBar.addEventListener('click', function (e) {
            // Unabhaengiger Toggle, kein data-filter -- deshalb vor dem
            // generischen Typ-Filter-Handler unten geprueft, sonst wuerde
            // currentFilter faelschlich auf 'all' zurueckgesetzt.
            var unusedBtn = e.target.closest('.mp3-unused-filter-btn');
            if (unusedBtn) {
                toggleUnusedOnlyFilter();
                return;
            }

            var btn = e.target.closest('.mp3-filter-btn');
            if (!btn) return;
            applyTypeFilter(btn.getAttribute('data-filter') || 'all');
        });
        updateFilterDropdownLabel();

        // Delegiert auf overlay statt nur .mp3-tag-filter-wrap: die Optionen
        // leben jetzt im Portal (#mp3-tag-filter-menu-portal, siehe
        // setTagFilterMenuOpen()) ausserhalb von .mp3-tag-filter-wrap. Das
        // mobile Filter-Dropdown (#mp3-filter-dropdown-menu-portal) folgt
        // demselben Muster -- eigenes Portal, eigener Toggle, aber die
        // Auswahl-Logik selbst laeuft ueber dieselben applyTypeFilter()/
        // toggleUnusedOnlyFilter()-Funktionen wie die Desktop-Pills, damit
        // beide UIs immer synchron bleiben (Kombinierbarkeit von Typ-Filter
        // und "Nur unbenutzte" bleibt dadurch identisch zum Desktop).
        overlay.addEventListener('click', function (e) {
            var toggle = e.target.closest('.mp3-tag-filter-toggle');
            if (toggle) {
                e.stopPropagation();
                var wrap = qs('.mp3-tag-filter-wrap', overlay);
                var isOpen = !!wrap && wrap.classList.contains('is-open');
                setTagFilterMenuOpen(!isOpen);
                return;
            }

            var option = e.target.closest('.mp3-tag-filter-option');
            if (option) {
                e.stopPropagation();
                var name = String(option.getAttribute('data-tag-name') || '').trim();
                if (!name) return;
                if (currentTagFilters[name]) {
                    delete currentTagFilters[name];
                } else {
                    currentTagFilters[name] = true;
                }
                updateTagFilterOptions();
                refreshDisplay();
                return;
            }

            var filterToggle = e.target.closest('.mp3-filter-dropdown-toggle');
            if (filterToggle) {
                e.stopPropagation();
                var fWrap = qs('.mp3-filter-dropdown-wrap', overlay);
                var fIsOpen = !!fWrap && fWrap.classList.contains('is-open');
                setFilterDropdownMenuOpen(!fIsOpen);
                return;
            }

            var typeOption = e.target.closest('.mp3-filter-dropdown-option');
            if (typeOption) {
                e.stopPropagation();
                applyTypeFilter(typeOption.getAttribute('data-filter') || 'all');
                setFilterDropdownMenuOpen(true); // re-render mit neuem Selected-Zustand, Menue bleibt offen
                return;
            }

            var unusedOption = e.target.closest('.mp3-filter-dropdown-unused-option');
            if (unusedOption) {
                e.stopPropagation();
                toggleUnusedOnlyFilter();
                setFilterDropdownMenuOpen(true); // re-render, Menue bleibt offen (kombinierbar)
                return;
            }

            if (!e.target.closest('.mp3-tag-filter-wrap') && !e.target.closest('#mp3-tag-filter-menu-portal')) {
                setTagFilterMenuOpen(false);
            }
            if (!e.target.closest('.mp3-filter-dropdown-wrap') && !e.target.closest('#mp3-filter-dropdown-menu-portal')) {
                setFilterDropdownMenuOpen(false);
            }
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                setTagFilterMenuOpen(false);
                setFilterDropdownMenuOpen(false);
                if (focuspointCanvasOpen) {
                    closeFocuspointCanvas();
                }
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && focuspointCanvasOpen) {
                e.preventDefault();
                commitFocuspointCanvas();
            }
        });

        updateTagFilterOptions();

        // Metainfo-Canvas events
        var metainfoCanvas = qs('#mp3-metainfo-canvas', overlay);
        if (metainfoCanvas) {
            metainfoCanvas.addEventListener('click', function (e) {
                if (e.target.closest('.mp3-metainfo-canvas-back')) {
                    closeMetainfoCanvas();
                } else if (e.target.closest('.mp3-metainfo-canvas-save')) {
                    commitMetainfoCanvas();
                }
            });
            var metainfoForm = qs('#mp3-metainfo-form', metainfoCanvas);
            if (metainfoForm) {
                metainfoForm.addEventListener('submit', function (e) {
                    e.preventDefault();
                    commitMetainfoCanvas();
                });
            }
        }

        // Fokuspunkt Canvas events
        var focuspointCanvas = qs('#mp3-focuspoint-canvas', overlay);
        if (focuspointCanvas) {
            focuspointCanvas.addEventListener('click', function (e) {
                if (e.target.closest('.mp3-focuspoint-canvas-back')) {
                    closeFocuspointCanvas();
                    return;
                }
                if (e.target.closest('.mp3-focuspoint-canvas-save')) {
                    commitFocuspointCanvas();
                    return;
                }
                if (e.target.closest('.mp3-focuspoint-reset-btn')) {
                    focuspointPos = focuspointActiveField ? focuspointPosOrDefault(focuspointCurrent[focuspointActiveField]) : [50, 50];
                    updateFocuspointMarker();
                    updateFocuspointPreview();
                    return;
                }
                if (e.target.closest('.mp3-focuspoint-remove-btn')) {
                    focuspointPos = [50, 50];
                    updateFocuspointMarker();
                    updateFocuspointPreview();
                    return;
                }
                var imageWrap = e.target.closest('.mp3-focuspoint-image-wrap');
                if (imageWrap) {
                    focuspointPos = focuspointPositionFromEvent(e, imageWrap);
                    updateFocuspointMarker();
                    updateFocuspointPreview();
                }
            });

            focuspointCanvas.addEventListener('change', function (e) {
                var typeSel = e.target.closest('.mp3-focuspoint-type-select');
                if (typeSel) {
                    focuspointActiveType = typeSel.value || '';
                    updateFocuspointPreview();
                    return;
                }
                var fieldSel = e.target.closest('.mp3-focuspoint-field-select');
                if (fieldSel) {
                    setFocuspointActiveField(fieldSel.value || null);
                }
            });
        }

        // "Nativ bearbeiten"-Button (echte Metainfo-Felder im eigenen Canvas)
        overlay.addEventListener('click', function (e) {
            var metaBtn = e.target.closest('.mp3-metainfo-canvas-open');
            if (!metaBtn) return;
            var mf = String(metaBtn.getAttribute('data-canvas-file') || '').trim();
            var mLbl = String(metaBtn.getAttribute('data-canvas-label') || mf);
            if (mf) openMetainfoCanvas(mf, mLbl);
        });

        // Zurueck-Button des Grid-Auswahl-Banners (startMetainfoPick())
        overlay.addEventListener('click', function (e) {
            if (e.target.closest('.mp3-metainfo-pick-cancel') && metainfoPickTarget) {
                endMetainfoPick();
            }
        });

        // Upload via button
        var uploadInput = qs('.mp3-upload-btn input[type="file"]', overlay);
        uploadInput.addEventListener('change', function (e) {
            if (e.target.files && e.target.files.length) {
                doUpload(e.target.files);
            }
            e.target.value = '';
        });

        // Drag & Drop — only external files, ignore internal card drags
        function hasExternalFiles(dt) {
            if (!dt || !dt.types) return false;
            var hasFiles = false;
            for (var i = 0; i < dt.types.length; i++) {
                if (dt.types[i] === 'Files') hasFiles = true;
                // Internal drags (e.g. card images) set text/html or text/plain
                if (dt.types[i] === 'text/html' || dt.types[i] === 'text/plain') return false;
            }
            return hasFiles;
        }

        gridWrap.addEventListener('dragover', function (e) {
            if (!hasExternalFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            gridWrap.classList.add('mp3-dragover');
        });

        gridWrap.addEventListener('dragleave', function (e) {
            e.preventDefault();
            e.stopPropagation();
            gridWrap.classList.remove('mp3-dragover');
        });

        gridWrap.addEventListener('drop', function (e) {
            gridWrap.classList.remove('mp3-dragover');
            if (!hasExternalFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopImmediatePropagation();

            // dataTransfer.items/.files sind nach diesem Event-Tick nicht mehr
            // zuverlaessig lesbar -> synchron sichern, bevor es async weitergeht.
            var fallbackFiles = e.dataTransfer.files;
            var dtItems = e.dataTransfer.items;

            // Ordner per Drag&Drop: rekursiv einlesen und je Ordner eine passende
            // Kategorie anlegen/wiederverwenden. Faellt auf die flache Dateiliste
            // zurueck, wenn der Browser webkitGetAsEntry() nicht unterstuetzt oder
            // beim Einlesen etwas schiefgeht.
            var entriesPromise = null;
            try {
                entriesPromise = dtItems ? readDroppedItems(dtItems) : null;
            } catch (err) {
                console.error('MP3 readDroppedItems failed, falling back to flat file list:', err);
                entriesPromise = null;
            }

            if (entriesPromise) {
                entriesPromise.then(function (entries) {
                    if (entries && entries.length) {
                        doFolderUpload(entries);
                    } else if (fallbackFiles && fallbackFiles.length) {
                        doUpload(fallbackFiles);
                    }
                }).catch(function (err) {
                    console.error('MP3 folder read failed, falling back to flat file list:', err);
                    if (fallbackFiles && fallbackFiles.length) {
                        doUpload(fallbackFiles);
                    }
                });
                return;
            }

            if (fallbackFiles && fallbackFiles.length) {
                doUpload(fallbackFiles);
            }
        });

        // Paste from Clipboard via Cmd+V (paste event fires when modal has focus)
        document.addEventListener('paste', function (e) {
            if (!overlay || !overlay.classList.contains('mp3-open')) return;
            // Skip when actively typing in a text field
            var active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

            var cd = e.clipboardData || window.clipboardData;
            if (!cd || !cd.items || !cd.items.length) return;

            var files = [];
            for (var i = 0; i < cd.items.length; i++) {
                var item = cd.items[i];
                if (item.kind === 'file') {
                    var file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (!files.length) return;
            e.preventDefault();
            if (gridWrap) {
                gridWrap.classList.add('mp3-pasteover');
                setTimeout(function () { gridWrap.classList.remove('mp3-pasteover'); }, 300);
            }
            doUpload(files);
        });
    }

    // ---- Multi-Select Helpers ----
    function getVisibleFilenames() {
        var filenames = [];
        qsa('.mp3-card, .mp3-list-row, .mp3-masonry-card', grid).forEach(function (el) {
            var fn = el.getAttribute('data-filename');
            if (fn) filenames.push(fn);
        });
        return filenames;
    }

    function updateCollectionDragSelectionUI() {
        qsa('.mp3-card', grid).forEach(function (c) {
            var fn = c.getAttribute('data-filename');
            c.classList.toggle('mp3-card-multi-selected', !!collectionDragSelected[fn]);
        });

        qsa('.mp3-list-row', grid).forEach(function (r) {
            var fn = r.getAttribute('data-filename');
            r.classList.toggle('mp3-list-row-multi-selected', !!collectionDragSelected[fn]);
        });

        qsa('.mp3-masonry-card', grid).forEach(function (m) {
            var fn = m.getAttribute('data-filename');
            m.classList.toggle('mp3-masonry-card-multi', !!collectionDragSelected[fn]);
        });

        if (batchFooter) {
            var count = Object.keys(collectionDragSelected).length;
            // Footer (und damit auch "Alle auswaehlen" darin) erscheint erst,
            // wenn bereits mindestens eine Datei markiert ist -- kein
            // dauerhaft sichtbarer Einstiegspunkt fuer eine leere Auswahl.
            batchFooter.style.display = count > 0 ? '' : 'none';
            var batchCountEl = qs('.mp3-batch-count', batchFooter);
            if (batchCountEl) batchCountEl.textContent = t('mediaplace_files_selected_dynamic', { count: count, unit: (1 === count ? t('mediaplace_file_singular') : t('mediaplace_file_plural')) });

            var visible = getVisibleFilenames();
            var allSelected = visible.length > 0 && visible.every(function (fn) { return !!collectionDragSelected[fn]; });
            var batchSelAllBtn = qs('.mp3-batch-select-all', batchFooter);
            if (batchSelAllBtn) {
                batchSelAllBtn.innerHTML = '<i class="fa-solid ' + (allSelected ? 'fa-square' : 'fa-square-check') + '"></i> ' +
                    (allSelected ? t('mediaplace_deselect_all') : t('mediaplace_select_all'));
            }
        }
    }

    function toggleCollectionDragSelection(filename) {
        if (!filename) return;
        if (collectionDragSelected[filename]) {
            delete collectionDragSelected[filename];
        } else {
            collectionDragSelected[filename] = true;
        }
        updateCollectionDragSelectionUI();
    }

    function clearCollectionDragSelection() {
        collectionDragSelected = {};
        updateCollectionDragSelectionUI();
    }

    function toggleCollectionDragSelectAll() {
        var visible = getVisibleFilenames();
        var allSelected = visible.length > 0 && visible.every(function (fn) { return !!collectionDragSelected[fn]; });
        if (allSelected) {
            visible.forEach(function (fn) { delete collectionDragSelected[fn]; });
        } else {
            visible.forEach(function (fn) { collectionDragSelected[fn] = true; });
        }
        updateCollectionDragSelectionUI();
    }

    function toggleSelectAll() {
        var visible = getVisibleFilenames();
        // If all visible are selected → deselect all, otherwise select all
        var allSelected = visible.length > 0 && visible.every(function (fn) { return !!multiSelected[fn]; });
        if (allSelected) {
            // Deselect all visible
            visible.forEach(function (fn) { delete multiSelected[fn]; });
        } else {
            // Select all visible
            visible.forEach(function (fn) { multiSelected[fn] = true; });
        }
        updateMultiUI();
    }

    function updateMultiUI() {
        var keys = Object.keys(multiSelected);
        var count = keys.length;
        var visible = getVisibleFilenames();
        var allSelected = visible.length > 0 && visible.every(function (fn) { return !!multiSelected[fn]; });

        // Update select-all button text -- erscheint erst, wenn bereits
        // mindestens eine Datei manuell ausgewaehlt wurde, kein dauerhaft
        // sichtbarer Einstiegspunkt direkt bei leerer Auswahl.
        var selAllBtn = qs('.mp3-multi-select-all', multiFooter);
        if (selAllBtn) {
            selAllBtn.style.display = count > 0 ? '' : 'none';
            selAllBtn.innerHTML = '<i class="fa-solid ' + (allSelected ? 'fa-square' : 'fa-square-check') + '"></i> ' +
                (allSelected ? t('mediaplace_deselect_all') : t('mediaplace_select_all'));
        }

        // Update footer
        if (multiFooter) {
            var countEl = qs('.mp3-multi-count', multiFooter);
            if (countEl) {
                countEl.textContent = t('mediaplace_files_selected_dynamic', { count: count, unit: (1 === count ? t('mediaplace_file_singular') : t('mediaplace_file_plural')) });
            }
        }

        // Update card checkboxes
        qsa('.mp3-card', grid).forEach(function (c) {
            var fn = c.getAttribute('data-filename');
            var isSel = !!multiSelected[fn];
            c.classList.toggle('mp3-card-multi-selected', isSel);
            var chk = qs('.mp3-card-check i', c);
            if (chk) {
                chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
            }
        });

        // Update list row checkboxes
        qsa('.mp3-list-row', grid).forEach(function (r) {
            var fn = r.getAttribute('data-filename');
            var isSel = !!multiSelected[fn];
            r.classList.toggle('mp3-list-row-multi-selected', isSel);
            var chk = qs('.mp3-list-cell-check i', r);
            if (chk) {
                chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
            }
        });

        // Update masonry checks
        qsa('.mp3-masonry-card', grid).forEach(function (r) {
            var fn = r.getAttribute('data-filename');
            var isSel = !!multiSelected[fn];
            r.classList.toggle('mp3-masonry-card-multi', isSel);
            var chk = qs('.mp3-masonry-check i', r);
            if (chk) {
                chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
            }
        });
    }

    // ---- Open / Close ----
    function open(callbackOrOpts, opts) {
        // Invalidiert alle noch laufenden Requests einer vorherigen, nicht
        // sauber geschlossenen Session (siehe loadSessionId-Kommentar oben).
        loadSessionId++;

        // Scrollposition VOR jeglicher DOM-Manipulation erfassen (build() kann beim
        // allerersten Aufruf eine grosse DOM-Struktur einfuegen). Das REDAXO-Backend
        // scrollt ueber <html> (html { overflow-y: scroll }), nicht ueber <body>.
        var scrollDoc = document.scrollingElement || document.documentElement;
        pageScrollTopBeforeOpen = scrollDoc ? scrollDoc.scrollTop : 0;
        var scrollPageMain = qs('.rex-page-main-inner');
        pageMainScrollTopBeforeOpen = scrollPageMain ? scrollPageMain.scrollTop : 0;

        build();

        // Support both: MP3.open(cb) and MP3.open(cb, { multiple: true })
        // and MP3.open({ multiple: true, onSelect: cb })
        var callback, options;
        if (typeof callbackOrOpts === 'function') {
            callback = callbackOrOpts;
            options = opts || {};
        } else if (typeof callbackOrOpts === 'object' && callbackOrOpts) {
            options = callbackOrOpts;
            callback = options.onSelect || null;
        } else {
            callback = null;
            options = {};
        }

        multiMode = !!options.multiple;
        multiSelected = {};
        collectionDragSelected = {};
        mediaLinkPickFieldKey = null;
        closeLightbox();
        setFullscreenMode(false);
        onSelect = (!multiMode && typeof callback === 'function') ? callback : null;
        onMultiSelect = (multiMode && typeof callback === 'function') ? callback : null;

        // Reset modal position/size on open
        var modal = qs('.mp3-modal', overlay);
        if (modal) {
            modal.style.position = '';
            modal.style.left = '';
            modal.style.top = '';
            modal.style.margin = '';
            modal.style.transform = '';
            modal.style.width = '';
            modal.style.maxWidth = '';
            modal.style.height = '';
        }

        overlay.classList.add('mp3-open');
        overlay.classList.toggle('mp3-multi-mode', multiMode);
        // Kein overflow:hidden auf html/body: Da beide im REDAXO-Backend eine feste
        // height:100% haben (html { overflow-y: scroll; height: 100% }), klappt
        // overflow:hidden jeglichen Inhalt unterhalb der Viewport-Hoehe weg, wodurch
        // scrollTop auf 0 einrastet -- unabhaengig davon, was man danach zurueckschreibt.
        // Das Overlay liegt ohnehin als position:fixed vollflaechig ueber allem und faengt
        // alle Klick-/Wheel-Events ab, ein zusaetzliches Scroll-Lock ist nicht noetig.
        // Scrollposition des Hintergrunds trotzdem fuer ~500ms aktiv festhalten, falls
        // z.B. der Fokus-Aufruf unten (preventScroll) in manchen Browsern doch scrollt.
        pinScrollPosition(500);
        // Focus overlay so paste events (Cmd+V) are received without triggering scroll jumps.
        setTimeout(function () {
            focusWithoutScroll(overlay);
        }, 50);
        searchInput.value = '';
        // Default -1 ("Alle Medien"): sicherer Startpunkt fuer jeden User,
        // unabhaengig von individuellen Kategorie-Rechten -- "Medienpool"
        // (Kategorie 0, "kein Ordner") braucht ein eigenes Recht, das viele
        // auf einzelne Kategorien eingeschraenkte User gar nicht haben (siehe
        // loadFiles()-Fallback weiter unten).
        currentCat = parseInt(localStorage.getItem('mp3_cat') || '-1', 10);
        catCache = {};
        catPath = [];
        lastLoadedFiles = [];
        mediaPage = 1;
        mediaTotal = 0;
        mediaHasMore = false;
        mediaLoading = false;
        mediaQuery = '';
        mediaPerPage = normalizeMediaPerPage(localStorage.getItem('mp3_per_page'));
        // options.filter: Typ-Tab vorauswaehlen (z.B. 'images' fuers Bild-Einfuegen
        // in TinyMCE), rein als Startwert -- Nutzer kann jederzeit auf einen
        // anderen Tab wechseln, keine harte Beschraenkung der Auswahl.
        var VALID_OPEN_FILTERS = ['all', 'images', 'videos', 'audio', 'documents', 'other'];
        currentFilter = (options.filter && VALID_OPEN_FILTERS.indexOf(options.filter) !== -1) ? options.filter : 'all';
        // options.allowedExtensions: im Gegensatz zu options.filter eine harte
        // Einschraenkung -- nicht passende Dateien werden aus dem Grid entfernt
        // und koennen nicht ausgewaehlt werden (siehe isFileSelectable()).
        allowedExtensions = Array.isArray(options.allowedExtensions)
            ? options.allowedExtensions
                .map(function (ext) { return String(ext || '').trim().toLowerCase().replace(/^\./, ''); })
                .filter(Boolean)
            : null;
        if (allowedExtensions && !allowedExtensions.length) allowedExtensions = null;
        currentTagFilters = {};
        currentTagCatalog = [];
        unusedOnlyFilter = false;
        unusedStatusCache = {};
        currentSort = localStorage.getItem('mp3_sort') || 'date_desc';
        viewMode = localStorage.getItem('mp3_view') || 'grid';
        // Backward-compat: old value "masonry" now maps to "mediawall"
        if (viewMode === 'masonry') {
            viewMode = 'mediawall';
        }
        if (viewMode !== 'grid' && viewMode !== 'list' && viewMode !== 'mediawall') {
            viewMode = 'grid';
        }
        setActiveCollection(features.collections ? (localStorage.getItem('mp3_active_collection') || null) : null);
        setDarkMode(localStorage.getItem('mp3_dark_mode') === '1');
        closeFocuspointCanvas();

        // Show/hide multi footer
        if (multiFooter) {
            multiFooter.style.display = multiMode ? '' : 'none';
            var countEl = qs('.mp3-multi-count', multiFooter);
            if (countEl) countEl.textContent = t('mediaplace_files_selected', { count: 0 });
        }
        if (batchFooter) batchFooter.style.display = 'none';

        // Reset filter UI
        qsa('.mp3-filter-btn', overlay).forEach(function (b) {
            b.classList.toggle('mp3-filter-active', b.getAttribute('data-filter') === 'all');
        });
        setTagFilterMenuOpen(false);
        updateTagFilterOptions();
        setFilterDropdownMenuOpen(false);
        updateFilterDropdownLabel();
        qsa('.mp3-view-btn', overlay).forEach(function (b) {
            b.classList.toggle('mp3-view-active', b.getAttribute('data-view') === viewMode);
        });
        var sortSel = qs('.mp3-sort-select', overlay);
        if (sortSel) sortSel.value = currentSort;
        var perPageSel = qs('.mp3-per-page-select', overlay);
        if (perPageSel) perPageSel.value = String(mediaPerPage);
        localStorage.setItem('mp3_per_page', String(mediaPerPage));
        var tileSize = normalizeTileSize(localStorage.getItem('mp3_tile_size'));
        overlay.style.setProperty('--mp3-tile-size', tileSize + 'px');
        var tileSizeSlider = qs('.mp3-tile-size-slider', overlay);
        if (tileSizeSlider) tileSizeSlider.value = String(tileSize);
        updateTileSizeVisibility();
        // Reset mobile states
        if (sidebar) sidebar.classList.remove('mp3-sidebar-open');
        var bd = qs('#mp3-sidebar-backdrop');
        if (bd) bd.classList.remove('mp3-backdrop-open');
        renderBreadcrumb();
        loadCategories();
        loadFiles(currentCat, true);
    }

    function close() {
        loadSessionId++;
        stopScrollPin();
        closeLightbox();
        setFullscreenMode(false);
        if (overlay) {
            overlay.classList.remove('mp3-open');
            overlay.classList.remove('mp3-multi-mode');
            overlay.classList.remove('mp3-media-link-pick-mode');
            overlay.classList.remove('mp3-metainfo-pick-mode');
        }
        multiMode = false;
        multiSelected = {};
        collectionDragSelected = {};
        mediaLinkPickFieldKey = null;
        metainfoPickTarget = null;
        onSelect = null;
        onMultiSelect = null;
    }

    // ---- Public API ----
    window.MP3 = {
        open: open,
        close: close,
        // Opens the overlay and immediately shows the detail panel for a given file.
        // Used to replicate the classic "Ansehen"/"View" button of the core widgets.
        openFile: function (filename, callback, opts) {
            open(callback, opts);
            if (filename) {
                showDetail(filename);
            }
        },
        // Teil des Widget-Typ-Erweiterungspunkts (siehe MetainfoWidget::getRegisteredTypes()
        // in PHP): ein anderes Addon registriert hier eine Funktion, die fuer seinen
        // eigenen widget_type den aktuellen Wert aus dem Detail-Panel-DOM ausliest,
        // falls das generische Muster (ein data-json-field-Element, skalar oder pro
        // Sprache) fuer diesen Feldtyp nicht passt. collector(key, panelEl) muss den
        // zu speichernden Wert zurueckgeben (oder null, um das Feld zu leeren).
        registerFieldCollector: function (widgetType, collector) {
            if (!widgetType || typeof collector !== 'function') return;
            fieldCollectors[widgetType] = collector;
        },
        // Aufgerufen von mediapool3_classic.js, wenn im Metainfo-Canvas ein
        // klassisches REX_MEDIA[n]/REX_MEDIALIST[n]-Widget geklickt wird --
        // Auswahl laeuft ueber das eigene Grid statt REDAXOs Popup, siehe
        // startMetainfoPick() oben.
        startMetainfoPick: function (wrapper, isList) {
            startMetainfoPick(wrapper, !!isList);
        }
    };

    // Hinweis: Der klassische "Medienpool"-Menuepunkt wird nicht mehr per JS-Klick-
    // Interception umgebogen, sondern serverseitig in boot.php ueber den Extension
    // Point PAGES_PREPARED (rex_be_page::setPopup), da DOM-Selektoren je nach
    // Backend-Theme (be_style Flyout-Menue etc.) nicht zuverlaessig treffen.

})();
