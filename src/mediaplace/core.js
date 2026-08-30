/**
 * MediaPlace – Overlay Media Picker
 * Uses FriendsOfREDAXO/api REST addon for data.
 * Image thumbnails via REDAXO Media Manager (same pattern as MediaNeo).
 *
 * "core.js": der Hub der Modularisierung (siehe DEV.md) -- importiert alle
 * src/mediaplace/modules/*.js und verdrahtet sie ueber ctx-Objekte (DOM-Refs
 * + Getter/Setter fuer noch hier lebenden State). Enthaelt daneben, was noch
 * nicht extrahiert wurde: Data-Loading (loadFiles()/buildMediaEndpoint()),
 * build()/open()/close() und die zentrale Event-Delegation.
 */
import {
    initProviders,
    isProviderMode,
    closeProviderMode,
    openProvider,
    openProviderFolder,
    jumpToProviderBreadcrumb,
    hasSearch as providerHasSearch,
    loadProviderEntries,
    renderCurrentProviderEntries,
    showProviderDetail,
    promptProviderImport,
} from './modules/providers.js';
import {
    initModals,
    showConfirmModal,
    showPromptModal,
    showCategoryPickerModal,
    showAlertModal,
} from './modules/modals.js';
import {
    initLightbox,
    isFullscreenMode,
    isLightboxOpen,
    setFullscreenMode,
    openLightbox,
    closeLightbox,
} from './modules/lightbox.js';
import {
    initFocuspoint,
    isFocuspointCanvasOpen,
    openFocuspointCanvas,
    closeFocuspointCanvas,
    commitFocuspointCanvas,
} from './modules/focuspoint.js';
import {
    initCropper,
    isCropCanvasOpen,
    openCropCanvas,
    closeCropCanvas,
} from './modules/cropper.js';
import {
    initOptimize,
    startOptimizeVideo,
    startOptimizeImage,
    toggleVideoDetails,
    pollOptimizeVideo,
} from './modules/optimize.js';
import {
    initCollections,
    setCollectionCounts,
    sanitizeCollectionName,
    collectionTagToName,
    isCollectionTagName,
    splitSystemTags,
    mergeUniqueSystemTags,
    setFileCollectionMembership,
    getActiveCollectionId,
    getActiveCollection,
    setActiveCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    applyCollectionFilter,
    refreshCollectionsSection,
    getCollectionsForCurrentCategory,
    showManageCollectionsModal,
} from './modules/collections.js';
import {
    initCategories,
    applyCategorySearchFilter,
    updateSidebarActiveState,
    openCatMenu,
    closeCatMenu,
    showCategoryInput,
    submitNewCategory,
    buildBreadcrumb,
    renderBreadcrumb,
    navigateToCategory,
    loadCategories,
    toggleCategory,
    categoryErrorMessage,
    showRenameCategoryModal,
    showMoveCategoryModal,
    startBulkMoveFiles,
    startBulkAddToCollection,
    startBulkTagFiles,
    startBulkDeleteFiles,
} from './modules/categories.js';
import {
    initFilters,
    applyFilterSort,
    updateFilterCounts,
    updateTagFilterOptions,
    updateFilterDropdownLabel,
    setFilterDropdownMenuOpen,
    applyTypeFilter,
    toggleUnusedOnlyFilter,
    toggleTagFilter,
    clearTagFilters,
    resetFilterState,
    getCurrentFilter,
    getCurrentSort,
    setCurrentSort,
    getCurrentTagCatalog,
    setCurrentTagCatalog,
    getUnusedOnlyFilter,
    getUnusedStatusCache,
} from './modules/filters.js';
import {
    initGrid,
    GRID_TILE_RATIO,
    renderFiles,
} from './modules/grid.js';
import {
    initDetail,
    setDetailOriginalSystemTags,
    toggleInlineEdit,
    updateInlineDisplay,
    openMetainfoCanvas,
    commitMetainfoCanvas,
    closeMetainfoCanvas,
    startMetainfoPick,
    endMetainfoPick,
    finishMetainfoMediaPick,
    finishMetainfoMedialistPick,
    updateAltHint,
    repaintTagsWidget,
    updateTagsComboList,
    openTagsComboList,
    closeTagsComboList,
    addTagFromWidget,
    applyTagColorChange,
    setMediaLinkPickMode,
    repaintMediaLinkWidget,
    updateDetailSaveState,
    saveDetail,
    showDetail,
    hideDetail,
} from './modules/detail.js';
import {
    initUpload,
    readDroppedItems,
    doUpload,
    doFolderUpload,
    mediaErrorMessage,
} from './modules/upload.js';
import {
    initMultiselect,
    updateCollectionDragSelectionUI,
    setBatchSelectMode,
    toggleCollectionDragSelection,
    clearCollectionDragSelection,
    toggleCollectionDragSelectAll,
    toggleSelectAll,
    updateMultiUI,
} from './modules/multiselect.js';

(function () {
    'use strict';

    var DEFAULT_MEDIA_PER_PAGE = 30;
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
    var closeHrefTarget = null; // options.closeHref (open()) -- Navigationsziel fuer close(),
                                 // nur gesetzt wenn MP3 als echte Seite (nicht als Popup-Ersatz
                                 // auf einer bereits geladenen Seite) geoeffnet wurde.
    var onCloseCallback = null; // options.onClose (open()) -- z.B. window.close() fuer den Fall,
                                 // dass MP3 in einem echten Popup-Fenster laeuft (klassischer
                                 // REDAXO-Medienpool-Popup-Vertrag, siehe mediapool_takeover.php).
                                 // Hat Vorrang vor closeHrefTarget, falls beide gesetzt sind.
    var multiMode = false;     // true when opened with multiple: true
    var multiSelected = {};    // filename → true (selected files in multi mode)
    var collectionDragSelected = {}; // filename -> true (normal mode batch selection for drag to collection)
    var batchSelectMode = false; // true: normaler Klick auf eine Kachel/Zeile toggelt
                                  // collectionDragSelected direkt (statt Ctrl/Cmd+Klick
                                  // -- als reine Tastatur-Geste nicht touch-tauglich und
                                  // nirgends in der UI entdeckbar), zeigt dieselben
                                  // Checkbox-Overlays wie multiMode.
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
    // Harte Endungs-Beschraenkung ueber MP3.open(cb, {allowedExtensions:[...]})
    // -- anders als der Typ-Filter (modules/filters.js, nur Start-Tab, jederzeit
    // umschaltbar) blendet dies passende Dateien komplett aus dem Grid aus UND
    // blockiert die Auswahl, siehe applyFilterSort()/isFileSelectable(). null =
    // keine Einschraenkung.
    var allowedExtensions = null;
    // "Nur unbenutzte Medien"-Filter (eigenes Recht, siehe MediaPermission::
    // hasUnusedFilterAccess() + data-can-filter-unused am #mp3-root). Zustand
    // selbst lebt in modules/filters.js (unusedOnlyFilter/unusedStatusCache),
    // dieses Flag nur, weil das Recht schon beim Seitenaufbau feststeht.
    var canFilterUnused = false;
    // Eigene, engere Berechtigung fuer die Kategorie-Massenaktionen (Alle
    // Dateien verschieben/loeschen/taggen) -- steuert nur die Sichtbarkeit
    // der Menuepunkte in openCatMenu(), der eigentliche Schutz ist serverseitig
    // in Api\CategoryBulk.php (MediaPermission::hasBulkOperationsAccess()).
    var canBulkOperations = false;
    // Upload-Provider (siehe UploadProviderRegistry/MP3.registerUploadProvider()):
    // uploadProviders bleibt UEBER open()/close()-Zyklen hinweg bestehen (ein
    // Drittanbieter-Addon registriert sich einmalig beim Laden seines eigenen
    // Scripts, nicht bei jedem Overlay-Oeffnen neu) -- nur activeUploadProviderId
    // wird pro build() aus #mp3-root neu gelesen (Einstellungsseite).
    var uploadProviders = {};
    var activeUploadProviderId = '';
    // Zahnrad-Menue-Erweiterungspunkt (siehe MP3.registerAdminMenuItem()):
    // gleiches Bestehen-ueber-open()/close()-Zyklen-Prinzip wie uploadProviders.
    // id -> { label, icon, onClick }.
    var adminMenuItems = {};
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
    var mediaPage = 1;
    var mediaPerPage = DEFAULT_MEDIA_PER_PAGE;
    var mediaTotal = 0;
    var mediaHasMore = false;
    var mediaLoading = false;
    var mediaQuery = '';
    var mediaForceCacheTokens = {}; // filename -> token for forced cache bust after replace
    var selectedFile = null; // currently selected filename for detail view
    var viewMode = 'grid'; // grid | list | mediawall
    // Feature-Toggles (Einstellungsseite), gelesen von #mp3-root in build() --
    // gate Tagging-UI (System-Tags-Feld, Sidebar-Tag-Filter) bzw. Sammlungen-UI
    // (Sidebar-Sektion, Merken-Button, Drag&Drop) unabhaengig voneinander.
    var features = { tagging: true, collections: true, metainfoEditing: false, uploadResize: false, altMissingFilter: false };
    var uploadResizeWidth = 2000;
    var uploadResizeHeight = 2000;
    // "Medien ohne ALT-Text"-Sidebar-Ansicht: analog zu activeCollectionId
    // (collections.js) ein eigener, zu Kategorie/Sammlung exklusiver Modus
    // (siehe buildBaseFilterParams()/Sidebar-Klick-Handler) -- bewusst NICHT
    // in ein eigenes Modul ausgelagert (zu klein), aber ueber ctx an
    // categories.js gereicht, das die Sidebar-Zeile dafuer rendert.
    var altMissingActive = false;
    // COLLECTION_TAG_PREFIX/activeCollectionId leben jetzt in
    // modules/collections.js -- siehe initCollections()-Aufruf in build().
    // Cloud-Provider-State (providers/gridMode/activeProvider/...) lebt jetzt
    // in modules/providers.js -- siehe initProviders()-Aufruf in build().
    var darkModeEnabled = false; // true = dark mode, false = light mode
    var mediaLinkPickFieldKey = null; // active media_link field key while picking from file grid
    // fullscreenMode/lightboxOpen leben jetzt in modules/lightbox.js -- siehe
    // initLightbox()-Aufruf in build().
    var metainfoCanvasOpen = false;
    var metainfoCanvasFilename = null;
    var metainfoPickTarget = null; // { type: 'media', input } | { type: 'medialist', select, listId } while picking from the grid for a classic widget inside the metainfo canvas
    // Fokuspunkt-Canvas-State lebt jetzt in modules/focuspoint.js -- siehe
    // initFocuspoint()-Aufruf in build().
    // Zuschneiden-Canvas-State (bis auf canCropper) lebt jetzt in
    // modules/cropper.js -- siehe initCropper()-Aufruf in build(). canCropper
    // bleibt hier: einmalig aus #mp3-root data-cropper-available gelesen,
    // dann per ctx an das Modul durchgereicht.
    var canCropper = false;
    // ffmpeg-Integration (siehe FfmpegIntegration.php): videoThumbType ist der
    // zu verwendende Media-Manager-Typ-Name fuer die Video-Vorschau im Grid
    // (haengt vom Einstellungen-Modus ab: aus/Standbild/animiert), leerer
    // String bedeutet "aus" -- Videos bekommen dann konsequent nur das
    // Datei-Icon. videoThumbStatic unterscheidet Standbild von animiert (fuer
    // das Video-Icon-Overlay, siehe previewHtml()). canOptimizeVideo steuert
    // den "Video optimieren"-Button im Detail-Panel (eigenes Recht
    // mediaplace[optimize_video]). optimizeVideoJobId/optimizeVideoPoll leben
    // jetzt in modules/optimize.js.
    var videoThumbType = '';
    var videoThumbStatic = false;
    var canOptimizeVideo = false;
    var pageScrollTopBeforeOpen = 0;
    var pageMainScrollTopBeforeOpen = 0;
    var scrollPinRAF = null;
    var scrollPinDeadline = 0;
    var categorySearchTerm = '';

    // ---- Aus mediaplace-api.js / mediaplace-helpers.js eingebundene Funktionen ----
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
    var apiFetchCollectionMediaList = MP3Core.api.apiFetchCollectionMediaList;
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
    var apiLoadCropPanel = MP3Core.api.apiLoadCropPanel;
    var apiSaveCrop = MP3Core.api.apiSaveCrop;
    var apiStartOptimizeVideo = MP3Core.api.apiStartOptimizeVideo;
    var apiPollOptimizeVideo = MP3Core.api.apiPollOptimizeVideo;
    var apiLoadVideoDetails = MP3Core.api.apiLoadVideoDetails;
    var apiOptimizeImage = MP3Core.api.apiOptimizeImage;
    var apiFetchProviderEntries = MP3Core.api.apiFetchProviderEntries;
    var getProviderThumbnailUrl = MP3Core.api.getProviderThumbnailUrl;
    var apiImportProviderFile = MP3Core.api.apiImportProviderFile;
    var apiCreateCategory = MP3Core.api.apiCreateCategory;
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
    var isVideo = MP3Core.helpers.isVideo;
    var fileIcon = MP3Core.helpers.fileIcon;
    var escAttr = MP3Core.helpers.escAttr;
    var buildCategoryOptionsHtml = MP3Core.helpers.buildCategoryOptionsHtml;
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
        var darkToggleBtn = overlay ? qs('.mp3-admin-menu-darkmode-toggle', overlay) : null;
        if (darkToggleBtn) {
            darkToggleBtn.classList.toggle('mp3-dark-mode-active', darkModeEnabled);
            var icon = qs('i', darkToggleBtn);
            if (icon) icon.className = darkModeEnabled ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            var label = qs('.mp3-admin-menu-darkmode-label', darkToggleBtn);
            if (label) label.textContent = t(darkModeEnabled ? 'mediaplace_light_mode' : 'mediaplace_dark_mode');
        }
    }




    /**
     * Kachelgroessen-Slider steuert --mp3-tile-size, genutzt sowohl von
     * .mp3-view-mediawall (columns:) als auch von der Kachel-Grundansicht
     * (grid-template-columns: minmax(), siehe mediaplace.css) -- in beiden
     * Faellen bestimmt er die Mindest-/Zielbreite einer Kachel. In der
     * Listenansicht hat er keine Wirkung (eigenes, festes Tabellen-Layout)
     * und wird dort ausgeblendet.
     */
    function updateTileSizeVisibility() {
        var control = qs('#mp3-tile-size-control', overlay);
        if (control) control.style.display = (viewMode !== 'list') ? '' : 'none';
    }

    // Trigger-Icon des Ansicht-Umschalters (.mp3-view-toggle-btn) auf die
    // aktuell aktive Ansicht synchron halten -- Modul-Scope, weil sowohl vom
    // Dropdown-Klick-Handler als auch von der State-Wiederherstellung in
    // open() aufgerufen (siehe dort).
    var VIEW_MODE_ICONS = { grid: 'fa-table-cells', list: 'fa-list', mediawall: 'fa-table-cells-large' };
    function updateViewToggleTrigger() {
        var triggerIcon = qs('.mp3-view-toggle-btn i', overlay);
        if (triggerIcon) triggerIcon.className = 'fa-solid ' + (VIEW_MODE_ICONS[viewMode] || VIEW_MODE_ICONS.grid);
    }

    // Gleiches Prinzip fuer den Sortierungs-Popover (.mp3-sort-toggle-btn):
    // Label-Text im Trigger auf die aktuell aktive Sortierung synchron halten.
    var SORT_LABEL_KEYS = {
        date_desc: 'mediaplace_sort_newest',
        date_asc: 'mediaplace_sort_oldest',
        filename_asc: 'mediaplace_sort_filename_az',
        filename_desc: 'mediaplace_sort_filename_za',
        title_asc: 'mediaplace_sort_title_az',
        title_desc: 'mediaplace_sort_title_za',
        size_desc: 'mediaplace_sort_size_desc',
        size_asc: 'mediaplace_sort_size_asc'
    };
    function updateSortToggleTrigger() {
        var label = qs('.mp3-sort-toggle-label', overlay);
        if (label) label.textContent = t(SORT_LABEL_KEYS[getCurrentSort()] || SORT_LABEL_KEYS.date_desc);
        qsa('.mp3-sort-option', overlay).forEach(function (b) {
            b.classList.toggle('mp3-sort-option-active', b.getAttribute('data-sort') === getCurrentSort());
        });
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

    // Mobile/schmal verkleinertes Modal (.mp3-compact, siehe initDragResize()):
    // Detail-Panel UND Metainfo-/Fokuspunkt-Canvas sind dort beide als
    // Bottom-Sheet ueber demselben Bereich implementiert (siehe CSS) -- ohne
    // das Ausblenden des Detail-Panels wuerde der Canvas dahinter verdeckt
    // bleiben. Auf Desktop-Breite liegen sie nebeneinander, dort bleibt das
    // Detail-Panel bewusst sichtbar.
    function isCompactLayout() {
        return (overlay && overlay.classList.contains('mp3-compact')) || window.innerWidth <= 768;
    }

    // qs/qsa/formatBytes/mediaThumbSrc/apiFetch/... jetzt in mediaplace-helpers.js
    // bzw. mediaplace-api.js (siehe Alias-Block oben) -- Kommentare dazu leben dort.
    // setFullscreenMode()/openLightbox()/closeLightbox() jetzt in
    // modules/lightbox.js. Sammlungs-Funktionen (sanitizeCollectionName bis
    // applyCollectionFilter) jetzt in modules/collections.js.

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

    /**
     * Re-render files from the cached lastLoadedFiles with current filter/sort.
     */
    function refreshDisplay() {
        // Provider-Modus (siehe openProvider()): eigene Daten, eigener
        // Render-Pfad -- sonst wuerde z.B. der Kacheln/Liste-Umschalter den
        // Cloud-Baum unvermittelt verlassen und auf lastLoadedFiles (lokal)
        // zurueckfallen.
        if (isProviderMode()) {
            renderCurrentProviderEntries();
            return;
        }
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

    // TODO: Nutzt unseren eigenen Endpunkt (Api\Categories), weil
    // das FriendsOfRedaxo/api-Addon (media/category/update) bewusst nur den Namen
    // aendern laesst, kein parent_id. Sobald das api-Addon eine echte Move-Route
    // anbietet: hier auf API_BASE + 'media/category/' + catId umstellen und den
    // Move-Teil in lib/Api/Categories.php entfernen.


    // ---- API ----
    // (siehe mediaplace-api.js -- Kommentare zu den einzelnen Funktionen leben dort)

    // ---- Detail Panel (JSON Widget System) ----
    // detailOriginalTitle/detailOriginalJson/detailOriginalSystemTags/
    // detailOriginalCollectionSystemTags/detailFieldDefs/detailClangs/
    // detailSystemTagCatalog jetzt in modules/detail.js.
    // widget_type -> function(key, panelEl) fuer Feldtypen, die ein anderes Addon
    // per MP3.registerFieldCollector() angemeldet hat (siehe collectJsonValuesFromDetail()
    // und MetainfoWidget::getRegisteredTypes() in PHP).
    var fieldCollectors = {};

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
        // Sammlungs-Modus (currentCat ist dabei immer -1, siehe Sammlungs-Klick-
        // Handler): filter[collection] wird NUR vom eigenen Fallback-Endpunkt
        // verstanden (siehe apiFetchCollectionMediaList()), das api-Addon kennt
        // Sammlungen nicht. Ohne diesen Filter laedt der Sammlungs-Modus einfach
        // Seite 1 der unsortierten Gesamtliste und filtert sie clientseitig --
        // zeigt "0 Treffer", wenn die Mitglieder nicht zufaellig dort liegen.
        var activeCollectionId = getActiveCollectionId();
        if (activeCollectionId) {
            params += '&filter[collection]=' + encodeURIComponent(activeCollectionId);
        }
        // "Medien ohne ALT-Text"-Modus (currentCat ist dabei immer -1, siehe
        // Sidebar-Klick-Handler): gleiche Fallback-Endpunkt-Logik wie
        // filter[collection] oben -- MediaPlace-eigenes Konzept, das das
        // api-Addon nicht kennt.
        if (altMissingActive) {
            params += '&filter[alt_missing]=1';
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
        if (TYPE_EXTENSIONS[getCurrentFilter()]) {
            endpoint += '&filter[types]=' + encodeURIComponent(TYPE_EXTENSIONS[getCurrentFilter()].join(','));
        }
        if (SORT_API_MAP[getCurrentSort()]) {
            endpoint += '&sort=' + encodeURIComponent(SORT_API_MAP[getCurrentSort()]);
        }
        return endpoint;
    }

    // Waehlt zwischen der normalen Medienliste (ggf. via Uebergangs-Fallback,
    // siehe apiFetchMediaList()) und dem IMMER eigenen Sammlungs-Endpunkt
    // (filter[collection], siehe buildBaseFilterParams()) -- an jeder Stelle
    // genutzt, die eine Medienliste laedt (loadFiles(), fetchTypeCounts()),
    // damit beide im Sammlungs-Modus konsistent den richtigen, gefilterten
    // Bestand sehen statt der ungefilterten Gesamtliste.
    function mediaListFetcher() {
        return (getActiveCollectionId() || altMissingActive) ? apiFetchCollectionMediaList : apiFetchMediaList;
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
        // getActiveCollectionId() mit rein: currentCat ist fuer JEDE Sammlung
        // gleich -1, ohne die Sammlungs-ID im Schluessel wuerden Zaehler beim
        // Wechsel zwischen zwei Sammlungen faelschlich aus dem Cache der
        // vorherigen Sammlung bedient.
        return currentCat + '|' + mediaQuery + '|' + (getActiveCollectionId() || '') + '|' + (altMissingActive ? '1' : '0');
    }

    function fetchTypeCounts() {
        var key = currentTypeCountsKey();
        typeCountsKey = key;
        var requestId = ++typeCountsRequestId;
        var base = buildBaseFilterParams();
        var fetchMediaList = mediaListFetcher();

        function fetchCount(typeKey) {
            var endpoint = 'media?per_page=1&page=1' + base;
            if (TYPE_EXTENSIONS[typeKey]) {
                endpoint += '&filter[types]=' + encodeURIComponent(TYPE_EXTENSIONS[typeKey].join(','));
            }
            return fetchMediaList(endpoint)
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

    // ---- Data Loading ----
    function loadFiles(catId, reset) {
        currentCat = catId;

        if (reset) {
            mediaPage = 1;
            mediaHasMore = true;
            mediaTotal = 0;
            lastLoadedFiles = [];
            setCurrentTagCatalog([]);
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

        mediaListFetcher()(endpoint)
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
                var unusedPromise = (canFilterUnused && getUnusedOnlyFilter() && filenames.length)
                    ? apiCheckUnusedMedia(filenames).catch(function () { return null; })
                    : Promise.resolve(null);

                return Promise.all([apiLoadSystemTagsForFiles(filenames), unusedPromise])
                    .then(function (results) {
                        var tagsPayload = results[0];
                        var unusedList = results[1];
                        var fileTags = tagsPayload.file_tags || {};
                        setCurrentTagCatalog(Array.isArray(tagsPayload.catalog) ? tagsPayload.catalog : getCurrentTagCatalog());
                        setCollectionCounts(tagsPayload.collection_counts);

                        for (var i = 0; i < taggedFiles.length; i++) {
                            var fn = String(taggedFiles[i].filename || '');
                            taggedFiles[i].system_tags = Array.isArray(fileTags[fn]) ? fileTags[fn] : [];
                        }

                        if (Array.isArray(unusedList)) {
                            var unusedSet = {};
                            var unusedStatusCache = getUnusedStatusCache();
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
                    setCurrentTagCatalog([]);
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
        features.altMissingFilter = root.dataset.altMissingFilterAvailable === '1';
        uploadResizeWidth = parseInt(root.dataset.uploadResizeWidth, 10) || 2000;
        uploadResizeHeight = parseInt(root.dataset.uploadResizeHeight, 10) || 2000;
        canFilterUnused = root.dataset.canFilterUnused === '1';
        canBulkOperations = root.dataset.canBulkOperations === '1';
        activeUploadProviderId = root.dataset.uploadProvider || '';
        canCropper = root.dataset.cropperAvailable === '1';
        videoThumbType = root.dataset.videoThumbType || '';
        videoThumbStatic = root.dataset.videoThumbStatic === '1';
        canOptimizeVideo = root.dataset.optimizeVideoAvailable === '1';
        canAccessRootCategory = !root.dataset.canAccessRootCategory || root.dataset.canAccessRootCategory === '1';
        mediaBaseUrl = root.dataset.mediaBaseUrl || '';
        var parsedProviders;
        try {
            parsedProviders = root.dataset.providers ? JSON.parse(root.dataset.providers) : [];
        } catch (e) {
            parsedProviders = [];
        }

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
                            '<div class="mp3-sort-toggle-wrap">' +
                                '<button type="button" class="mp3-sort-toggle-btn" title="' + escAttr(t('mediaplace_sorting')) + '">' +
                                    '<i class="fa-solid fa-arrow-down-wide-short"></i> <span class="mp3-sort-toggle-label"></span>' +
                                '</button>' +
                                '<div class="mp3-sort-toggle-menu">' +
                                    '<button class="mp3-sort-option" data-sort="date_desc">' + escAttr(t('mediaplace_sort_newest')) + '</button>' +
                                    '<button class="mp3-sort-option" data-sort="date_asc">' + escAttr(t('mediaplace_sort_oldest')) + '</button>' +
                                    '<button class="mp3-sort-option" data-sort="filename_asc">' + escAttr(t('mediaplace_sort_filename_az')) + '</button>' +
                                    '<button class="mp3-sort-option" data-sort="filename_desc">' + escAttr(t('mediaplace_sort_filename_za')) + '</button>' +
                                    '<button class="mp3-sort-option" data-sort="title_asc">' + escAttr(t('mediaplace_sort_title_az')) + '</button>' +
                                    '<button class="mp3-sort-option" data-sort="title_desc">' + escAttr(t('mediaplace_sort_title_za')) + '</button>' +
                                    '<button class="mp3-sort-option" data-sort="size_desc">' + escAttr(t('mediaplace_sort_size_desc')) + '</button>' +
                                    '<button class="mp3-sort-option" data-sort="size_asc">' + escAttr(t('mediaplace_sort_size_asc')) + '</button>' +
                                '</div>' +
                            '</div>' +
                            '<div class="mp3-view-toggle-wrap">' +
                                '<button type="button" class="mp3-view-toggle-btn" title="' + escAttr(t('mediaplace_view_mode')) + '"><i class="fa-solid fa-table-cells"></i></button>' +
                                '<div class="mp3-view-toggle-menu" id="mp3-view-toggle-menu">' +
                                    '<button class="mp3-view-btn mp3-view-active" data-view="grid"><i class="fa-solid fa-table-cells"></i> ' + escAttr(t('mediaplace_tiles')) + '</button>' +
                                    '<button class="mp3-view-btn" data-view="list"><i class="fa-solid fa-list"></i> ' + escAttr(t('mediaplace_list')) + '</button>' +
                                    '<button class="mp3-view-btn" data-view="mediawall"><i class="fa-solid fa-table-cells-large"></i> ' + escAttr(t('mediaplace_media_wall')) + '</button>' +
                                '</div>' +
                            '</div>' +
                            '<label class="mp3-upload-btn" title="' + escAttr(t('mediaplace_upload_files')) + '">' +
                                '<i class="fa-solid fa-cloud-arrow-up"></i>' +
                                '<span class="mp3-upload-label">' + t('mediaplace_upload') + '</span>' +
                                '<input type="file" multiple style="display:none">' +
                            '</label>' +
                        '</div>' +
                        '<div class="mp3-admin-menu-wrap">' +
                            '<button type="button" class="mp3-admin-menu-btn" title="' + escAttr(t('mediaplace_admin_menu_title')) + '"><i class="fa-solid fa-gear"></i></button>' +
                            '<div class="mp3-admin-menu" id="mp3-admin-menu">' +
                                '<button type="button" class="mp3-admin-menu-darkmode-toggle"><i class="fa-solid fa-moon"></i> <span class="mp3-admin-menu-darkmode-label">' + escAttr(t('mediaplace_dark_mode')) + '</span></button>' +
                                '<div class="mp3-admin-menu-sort-slot" id="mp3-admin-menu-sort-slot"></div>' +
                                '<div class="mp3-admin-menu-extensions" id="mp3-admin-menu-extensions"></div>' +
                                '<div class="mp3-admin-menu-links" id="mp3-admin-menu-links"></div>' +
                            '</div>' +
                        '</div>' +
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
                            '</div>' +
                            '<div class="mp3-metainfo-pick-banner" id="mp3-metainfo-pick-banner" style="display:none">' +
                                '<span class="mp3-metainfo-pick-banner-text"></span>' +
                                '<button type="button" class="mp3-metainfo-pick-cancel"><i class="fa-solid fa-arrow-left"></i> ' + t('mediaplace_back') + '</button>' +
                            '</div>' +
                            '<div class="mp3-breadcrumb" id="mp3-breadcrumb"></div>' +
                            '<div class="mp3-status" id="mp3-status">' +
                                '<button type="button" class="mp3-select-mode-toggle" title="' + escAttr(t('mediaplace_select_mode_toggle')) + '"><i class="fa-solid fa-square-check"></i></button>' +
                                '<span class="mp3-status-text" id="mp3-status-text"></span>' +
                            '</div>' +
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
                                        '<option value="1000">' + escAttr(t('mediaplace_per_page_all')) + '</option>' +
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
                            '<div class="mp3-editor-canvas" id="mp3-crop-canvas" style="display:none">' +
                                '<div class="mp3-editor-canvas-header">' +
                                    '<button type="button" class="mp3-crop-canvas-back" title="' + escAttr(t('mediaplace_back_to_overview')) + '">' +
                                        '<i class="fa-solid fa-arrow-left"></i> ' + t('mediaplace_back') +
                                    '</button>' +
                                    '<div class="mp3-crop-canvas-title"></div>' +
                                    // id="cropper_sidebar_toggle" ist bewusst cropper's eigene ID --
                                    // rex_cropper.js sucht danach im ganzen Dokument (nicht nur im
                                    // gefetchten Panel) und steuert Ein-/Ausblenden + Merken der
                                    // Info-Sidebar (Vorschau/Zuschnittdaten) komplett selbst, siehe
                                    // initSidebarToggle() dort -- kein eigener Handler noetig.
                                    '<button type="button" id="cropper_sidebar_toggle" class="mp3-crop-sidebar-toggle" aria-expanded="true" aria-controls="cropper-sidebar" data-expanded-label="' + escAttr(t('mediaplace_crop_sidebar_collapse')) + '" data-collapsed-label="' + escAttr(t('mediaplace_crop_sidebar_expand')) + '" title="' + escAttr(t('mediaplace_crop_sidebar_collapse')) + '">' +
                                        '<i class="fa fa-info-circle"></i>' +
                                    '</button>' +
                                '</div>' +
                                '<div class="mp3-editor-canvas-body" id="mp3-crop-canvas-body"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="mp3-detail-resize-handle" id="mp3-detail-resize-handle" title="' + escAttr(t('mediaplace_resize_handle_title')) + '" style="display:none"></div>' +
                        '<div class="mp3-detail" id="mp3-detail"></div>' +
                    '</div>' +
                    '<div class="mp3-cat-menu-portal" id="mp3-cat-menu-portal"></div>' +
                    '<div class="mp3-filter-dropdown-menu-portal" id="mp3-filter-dropdown-menu-portal"></div>' +
                    '<div class="mp3-resize-handle" id="mp3-resize-handle"></div>' +
                    '<div class="mp3-multi-footer" id="mp3-multi-footer" style="display:none">' +
                        '<div class="mp3-multi-left">' +
                            '<button class="mp3-multi-select-all" title="' + escAttr(t('mediaplace_select_all')) + '"><i class="fa-solid fa-square-check"></i> ' + t('mediaplace_select_all') + '</button>' +
                            '<span class="mp3-multi-count">' + t('mediaplace_files_selected', { count: 0 }) + '</span>' +
                        '</div>' +
                        '<button class="mp3-multi-confirm" title="' + escAttr(t('mediaplace_apply_selection')) + '"><i class="fa-solid fa-check"></i> ' + t('mediaplace_apply_selection') + '</button>' +
                    '</div>' +
                    '<div class="mp3-batch-footer" id="mp3-batch-footer" style="display:none">' +
                        '<div class="mp3-batch-left">' +
                            '<button type="button" class="mp3-batch-select-all" title="' + escAttr(t('mediaplace_select_all')) + '"><i class="fa-solid fa-square-check"></i> ' + t('mediaplace_select_all') + '</button>' +
                            '<span class="mp3-batch-count">' + t('mediaplace_files_selected', { count: 0 }) + '</span>' +
                        '</div>' +
                        '<div class="mp3-batch-actions">' +
                            '<button type="button" class="mp3-batch-move-btn" title="' + escAttr(t('mediaplace_move_selection')) + '"><i class="fa-solid fa-folder-open"></i> ' + t('mediaplace_move_selection') + '</button>' +
                            '<button type="button" class="mp3-batch-delete-btn" title="' + escAttr(t('mediaplace_delete_selection')) + '"><i class="fa-solid fa-trash-can"></i> ' + t('mediaplace_delete_selection') + '</button>' +
                            '<button type="button" class="mp3-batch-clear-btn" title="' + escAttr(t('mediaplace_deselect_all_action')) + '"><i class="fa-solid fa-xmark"></i> ' + t('mediaplace_deselect_all_action') + '</button>' +
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
        statusBar = qs('#mp3-status-text');
        breadcrumb = qs('#mp3-breadcrumb');
        detailPanel = qs('#mp3-detail');
        multiFooter = qs('#mp3-multi-footer');
        batchFooter = qs('#mp3-batch-footer');
        lightboxLayer = qs('#mp3-lightbox');
        lightboxImage = qs('.mp3-lightbox-image', overlay);
        lightboxCaption = qs('.mp3-lightbox-caption', overlay);

        initModals({ overlay: overlay });

        initLightbox({
            overlay: overlay,
            lightboxLayer: lightboxLayer,
            lightboxImage: lightboxImage,
            lightboxCaption: lightboxCaption,
        });

        initFocuspoint({
            overlay: overlay,
            detailPanel: detailPanel,
            mediaForceCacheTokens: mediaForceCacheTokens,
            getSelectedFile: function () { return selectedFile; },
            getLastLoadedFiles: function () { return lastLoadedFiles; },
            getMediaBaseUrl: function () { return mediaBaseUrl; },
            isMetainfoCanvasOpen: function () { return metainfoCanvasOpen; },
            closeMetainfoCanvas: closeMetainfoCanvas,
            isCompactLayout: isCompactLayout,
        });

        initCropper({
            overlay: overlay,
            canCropper: canCropper,
            mediaForceCacheTokens: mediaForceCacheTokens,
            getCurrentCat: function () { return currentCat; },
            setCurrentCat: function (v) { currentCat = v; },
            isMetainfoCanvasOpen: function () { return metainfoCanvasOpen; },
            closeMetainfoCanvas: closeMetainfoCanvas,
            loadFiles: loadFiles,
            showDetail: showDetail,
        });

        initOptimize({
            mediaForceCacheTokens: mediaForceCacheTokens,
            getCurrentCat: function () { return currentCat; },
            getSelectedFile: function () { return selectedFile; },
            loadFiles: loadFiles,
            showDetail: showDetail,
        });

        initGrid({
            grid: grid,
            getMultiMode: function () { return multiMode; },
            getMultiSelected: function () { return multiSelected; },
            getBatchSelectMode: function () { return batchSelectMode; },
            getCollectionDragSelected: function () { return collectionDragSelected; },
            getSelectedFile: function () { return selectedFile; },
            getViewMode: function () { return viewMode; },
            getFeatures: function () { return features; },
            getMediaForceCacheTokens: function () { return mediaForceCacheTokens; },
            getLastLoadedFiles: function () { return lastLoadedFiles; },
            getMediaBaseUrl: function () { return mediaBaseUrl; },
            getVideoThumbType: function () { return videoThumbType; },
            getVideoThumbStatic: function () { return videoThumbStatic; },
            updateStatus: updateStatus,
        });

        initDetail({
            overlay: overlay,
            detailPanel: detailPanel,
            grid: grid,
            multiFooter: multiFooter,
            mediaForceCacheTokens: mediaForceCacheTokens,
            fieldCollectors: fieldCollectors,
            getSelectedFile: function () { return selectedFile; },
            setSelectedFile: function (v) { selectedFile = v; },
            setMultiMode: function (v) { multiMode = v; },
            setMultiSelected: function (v) { multiSelected = v; },
            getOnSelect: function () { return onSelect; },
            getOnMultiSelect: function () { return onMultiSelect; },
            getMediaBaseUrl: function () { return mediaBaseUrl; },
            getLastLoadedFiles: function () { return lastLoadedFiles; },
            getMetainfoCanvasOpen: function () { return metainfoCanvasOpen; },
            setMetainfoCanvasOpen: function (v) { metainfoCanvasOpen = v; },
            getMetainfoCanvasFilename: function () { return metainfoCanvasFilename; },
            setMetainfoCanvasFilename: function (v) { metainfoCanvasFilename = v; },
            getMetainfoPickTarget: function () { return metainfoPickTarget; },
            setMetainfoPickTarget: function (v) { metainfoPickTarget = v; },
            getMediaLinkPickFieldKey: function () { return mediaLinkPickFieldKey; },
            setMediaLinkPickFieldKey: function (v) { mediaLinkPickFieldKey = v; },
            isCompactLayout: isCompactLayout,
            applyDetailWidth: applyDetailWidth,
            updateMultiUI: updateMultiUI,
            updateTagFilterOptions: updateTagFilterOptions,
            setCurrentTagCatalog: setCurrentTagCatalog,
        });

        initUpload({
            grid: grid,
            gridWrap: gridWrap,
            getCurrentCat: function () { return currentCat; },
            setCatCache: function (v) { catCache = v; },
            setCatPath: function (v) { catPath = v; },
            getFeatures: function () { return features; },
            getUploadResizeWidth: function () { return uploadResizeWidth; },
            getUploadResizeHeight: function () { return uploadResizeHeight; },
            loadFiles: loadFiles,
        });

        initMultiselect({
            grid: grid,
            overlay: overlay,
            batchFooter: batchFooter,
            multiFooter: multiFooter,
            getCollectionDragSelected: function () { return collectionDragSelected; },
            setCollectionDragSelected: function (v) { collectionDragSelected = v; },
            getBatchSelectModeState: function () { return batchSelectMode; },
            setBatchSelectModeState: function (v) { batchSelectMode = v; },
            getMultiSelected: function () { return multiSelected; },
            refreshDisplay: refreshDisplay,
        });

        initFilters({
            overlay: overlay,
            getCanFilterUnused: function () { return canFilterUnused; },
            getAllowedExtensions: function () { return allowedExtensions; },
            isFileSelectable: isFileSelectable,
            getLastLoadedFiles: function () { return lastLoadedFiles; },
            getCurrentCat: function () { return currentCat; },
            loadFiles: loadFiles,
            refreshDisplay: refreshDisplay,
            getTypeCounts: function () { return typeCounts; },
            getTypeCountsKey: function () { return typeCountsKey; },
            getCurrentTypeCountsKey: currentTypeCountsKey,
        });

        initCollections({
            features: features,
            getCurrentTagCatalog: getCurrentTagCatalog,
            setCurrentTagCatalog: setCurrentTagCatalog,
            getLastLoadedFiles: function () { return lastLoadedFiles; },
            getSelectedFile: function () { return selectedFile; },
            setDetailOriginalSystemTags: setDetailOriginalSystemTags,
            closeCatMenu: closeCatMenu,
            refreshDisplay: refreshDisplay,
            showDetail: showDetail,
        });

        initCategories({
            overlay: overlay,
            sidebar: sidebar,
            breadcrumb: breadcrumb,
            features: features,
            getCurrentCat: function () { return currentCat; },
            setCurrentCat: function (v) { currentCat = v; },
            getCatCache: function () { return catCache; },
            setCatCache: function (v) { catCache = v; },
            getCatPath: function () { return catPath; },
            setCatPath: function (v) { catPath = v; },
            getCanAccessRootCategory: function () { return canAccessRootCategory; },
            getCategorySearchTerm: function () { return categorySearchTerm; },
            setCategorySearchTerm: function (v) { categorySearchTerm = v; },
            getOnMultiSelect: function () { return onMultiSelect; },
            getLoadSessionId: function () { return loadSessionId; },
            getAltMissingActive: function () { return altMissingActive; },
            getCanBulkOperations: function () { return canBulkOperations; },
            loadFiles: loadFiles,
            refreshTagFilterSection: updateTagFilterOptions,
        });

        initProviders({
            overlay: overlay,
            grid: grid,
            sidebar: sidebar,
            breadcrumb: breadcrumb,
            detailPanel: detailPanel,
            gridTileRatio: GRID_TILE_RATIO,
            mediaForceCacheTokens: mediaForceCacheTokens,
            getOnMultiSelect: function () { return onMultiSelect; },
            getCurrentCat: function () { return currentCat; },
            setCurrentCat: function (v) { currentCat = v; },
            getViewMode: function () { return viewMode; },
            getOnSelect: function () { return onSelect; },
            clearOnSelect: function () { onSelect = null; },
            hideDetail: hideDetail,
            setActiveCollection: setActiveCollection,
            updateSidebarActiveState: updateSidebarActiveState,
            updateStatus: updateStatus,
            close: close,
        }, parsedProviders);

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

            // Sortierung wandert im Compact-Modus aus der Werkzeugleiste ins
            // Zahnrad-Menue (ein Icon-Ziel weniger in der ohnehin schon vollen
            // mobilen Kopfzeile) -- derselbe Popover-Wrap wird per appendChild()
            // umgehaengt statt dupliziert, damit sein bestehender Klick-Handler
            // (siehe initFiltersAndSort()) unveraendert weiterfunktioniert.
            var sortToggleWrapEl = qs('.mp3-sort-toggle-wrap', overlay);
            var sortSelectSlot = qs('#mp3-admin-menu-sort-slot', overlay);
            function relocateSortSelect(isCompact) {
                if (!sortToggleWrapEl || !sortSelectSlot) return;
                if (isCompact) {
                    sortSelectSlot.appendChild(sortToggleWrapEl);
                } else {
                    var viewToggle = qs('.mp3-view-toggle-wrap', overlay);
                    if (viewToggle && viewToggle.parentNode) {
                        viewToggle.parentNode.insertBefore(sortToggleWrapEl, viewToggle);
                    }
                }
            }

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
                            relocateSortSelect(isCompact);
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

        // ---- Verwaltungs-Menue: Dark/Light-Umschalter (immer vorhanden) + klassische
        // Medienpool-Unterseiten (Synchronisation, ggf. von Drittaddons wie
        // mediatools/ffmpeg eingeklinkte Seiten) + eigene Einstellungsseite ----
        (function initAdminMenu() {
            var wrap = qs('.mp3-admin-menu-wrap', overlay);
            var btn = qs('.mp3-admin-menu-btn', overlay);
            var menu = qs('#mp3-admin-menu', overlay);
            var linksEl = qs('#mp3-admin-menu-links', overlay);
            var darkToggleBtn = qs('.mp3-admin-menu-darkmode-toggle', overlay);
            if (!wrap || !btn || !menu) return;

            if (darkToggleBtn) {
                darkToggleBtn.addEventListener('click', function () {
                    setDarkMode(!darkModeEnabled);
                });
            }

            var root = document.getElementById('mp3-root');
            var subpages = [];
            try {
                subpages = root && root.dataset.subpages ? JSON.parse(root.dataset.subpages) : [];
            } catch (e) {
                subpages = [];
            }

            if (linksEl) {
                linksEl.innerHTML = subpages.map(function (p) {
                    return '<a href="' + escAttr(p.href) + '" data-popup="' + (p.popup === false ? '0' : '1') + '"><i class="' + escAttr(p.icon) + '"></i> ' + escAttr(p.title) + '</a>';
                }).join('');
            }

            // Bereits VOR diesem build() registrierte Eintraege (siehe
            // MP3.registerAdminMenuItem()) nachtragen -- deren eigener
            // renderAdminMenuExtensions()-Aufruf zur Registrierungszeit lief
            // ins Leere, da #mp3-admin-menu-extensions damals noch nicht existierte.
            renderAdminMenuExtensions();

            // Klassische Seiten in einem Popup-Fenster oeffnen (wie der alte Medienpool
            // es tut), statt den Hintergrund/Overlay durch echte Navigation zu verlassen.
            // Der Einstellungen-Eintrag (data-popup="0", echte MediaPlace-Seite statt
            // klassisches Popup-Formular) navigiert stattdessen ganz normal.
            menu.addEventListener('click', function (e) {
                var extBtn = e.target.closest('.mp3-admin-menu-ext-btn');
                if (extBtn) {
                    var id = extBtn.getAttribute('data-admin-menu-ext');
                    var item = adminMenuItems[id];
                    wrap.classList.remove('mp3-admin-menu-open');
                    if (item && typeof item.onClick === 'function') item.onClick();
                    return;
                }

                var link = e.target.closest('a');
                if (!link) return;
                e.preventDefault();
                if (link.getAttribute('data-popup') === '0') {
                    window.location.href = link.getAttribute('href');
                } else if (typeof window.newPoolWindow === 'function') {
                    window.newPoolWindow(link.getAttribute('href'));
                } else {
                    window.open(link.getAttribute('href'), '_blank');
                }
                wrap.classList.remove('mp3-admin-menu-open');
            });

            // position:fixed + am Viewport geklemmte left/top statt reinem CSS
            // "position:absolute; right:0" (gleiches Prinzip wie openCatMenu()):
            // der Button steht im Header oft nah am rechten Rand, ein 220px
            // breites Menue rein relativ zum Button positioniert kann dadurch
            // ueber den Viewport-Rand hinausragen, v.a. auf schmalen Bildschirmen.
            function positionAdminMenu() {
                var rect = btn.getBoundingClientRect();
                var menuW = Math.max(menu.offsetWidth, 220);
                var left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
                var top = rect.bottom + 1;
                menu.style.left = left + 'px';
                menu.style.top = top + 'px';
            }

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var willOpen = !wrap.classList.contains('mp3-admin-menu-open');
                wrap.classList.toggle('mp3-admin-menu-open', willOpen);
                if (willOpen) positionAdminMenu();
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

        // "In Benutzung"-Hinweise (Loeschen-Versuch, Detail-Panel wie auch
        // Kategorie-Massenaktionen) enthalten von REDAXO selbst erzeugte
        // Links im Format href="javascript:openPage('URL')" (siehe
        // rex_mediapool::mediaIsInUse(), openPage() in mediapool.js). Deren
        // eigene Implementierung ist auf ein POPUP-Fenster ausgelegt
        // (window.opener.location.href = ...; self.close();) -- in unserem
        // Fall laeuft MediaPlace aber als Vollbild-Overlay im SELBEN Fenster,
        // window.opener ist hier nicht das, was der User erwartet (meist
        // null/undefined, self.close() wuerde entweder nichts tun oder vom
        // Browser blockiert). Stattdessen die Ziel-URL selbst aus dem href
        // extrahieren, MediaPlace schliessen und im aktuellen Fenster dorthin
        // navigieren -- gescoped auf .mp3-cat-move-modal-overlay (gemeinsame
        // Basisklasse von showAlertModal()/showConfirmModal()/
        // showBulkProgressModal()), nicht global, um kein unabhaengiges
        // openPage()-Vorkommen anderswo auf der Seite zu beeinflussen.
        document.addEventListener('click', function (e) {
            var link = e.target.closest('.mp3-cat-move-modal-overlay a[href^="javascript:openPage("]');
            if (!link) return;
            var match = /^javascript:openPage\('([^']*)'\)$/.exec(link.getAttribute('href') || '');
            if (!match) return;
            e.preventDefault();
            var targetUrl = match[1];
            close();
            window.location.href = targetUrl;
        });

        // Click backdrop to close (but not after drag/resize)
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && !interacting) close();
        });

        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('mp3-open')) {
                if (isLightboxOpen()) {
                    closeLightbox();
                    return;
                }
                // Canvas-Modi (Metainfo/Fokuspunkt/Zuschneiden) uebernehmen den
                // Hauptbereich des Overlays und haben ihren eigenen "Zurueck"-
                // Button -- Escape soll dort wie dieser Button nur eine Ebene
                // zurueckgehen, nicht das ganze Overlay schliessen (Bug: fehlte
                // hier bislang, siehe CHANGELOG).
                if (metainfoCanvasOpen) {
                    closeMetainfoCanvas();
                    return;
                }
                if (isFocuspointCanvasOpen()) {
                    closeFocuspointCanvas();
                    return;
                }
                if (isCropCanvasOpen()) {
                    closeCropCanvas();
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
                setFullscreenMode(!isFullscreenMode());
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

            // Ein-/Ausklappen von Sidebar-Abschnitten (Medienpool-Baum, Sammlungen,
            // Tags) -- Zustand pro Abschnitt in localStorage, ueberlebt also auch
            // ein Schliessen/Neu-Oeffnen des Overlays. Jeder Abschnitt liest seinen
            // eigenen Collapsed-Zustand direkt beim Rendern (renderCategories()/
            // renderCollectionsSection()/updateTagFilterOptions()), hier wird nur
            // der Klick behandelt.
            var sectionToggle = e.target.closest('.mp3-sidebar-section-toggle');
            if (sectionToggle) {
                e.preventDefault();
                e.stopPropagation();
                var sectionKey = sectionToggle.getAttribute('data-section') || '';
                var sectionEl = sectionToggle.closest('.mp3-sidebar-section');
                if (!sectionKey || !sectionEl) return;
                var nowCollapsed = !sectionEl.classList.contains('mp3-sidebar-section-collapsed');
                sectionEl.classList.toggle('mp3-sidebar-section-collapsed', nowCollapsed);
                try {
                    localStorage.setItem('mp3_sidebar_collapsed_' + sectionKey, nowCollapsed ? '1' : '0');
                } catch (e2) { /* localStorage kann in Private-Mode/Storage-Limits werfen -- Zustand bleibt dann nur fuer diese Session erhalten */ }
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
                                showAlertModal({
                                    icon: 'fa-triangle-exclamation',
                                    title: t('mediaplace_error'),
                                    message: escAttr(t('mediaplace_collection_create_failed')),
                                    dangerous: true,
                                });
                                return;
                            }
                            setActiveCollection(created.id);
                            refreshCollectionsSection();
                            refreshDisplay();
                            showAlertModal({
                                icon: 'fa-circle-check',
                                title: t('mediaplace_notice'),
                                message: escAttr(t('mediaplace_collection_activated_hint')),
                            });
                        })
                        .catch(function (err) {
                            showAlertModal({
                                icon: 'fa-triangle-exclamation',
                                title: t('mediaplace_error'),
                                message: escAttr(t('mediaplace_error_creating_collection', { msg: err.message })),
                                dangerous: true,
                            });
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
                            // Sidebar/Grid IMMER aktualisieren -- der Katalog- bzw.
                            // Tag-Rename ist server-seitig in jedem Fall bereits
                            // passiert (siehe renameCollection()), auch wenn gerade
                            // 0 Dateien betroffen waren (z.B. leere Sammlung). Der
                            // fruehere Code liess die Sidebar in dem Fall faelschlich
                            // beim alten Namen stehen (Bug: "Umbenennen hat noch
                            // einen UI-Refresh-Bug").
                            refreshCollectionsSection();
                            refreshDisplay();
                            if (selectedFile) showDetail(selectedFile);
                            if (updatedCount <= 0) {
                                showAlertModal({
                                    icon: 'fa-circle-info',
                                    title: t('mediaplace_notice'),
                                    message: escAttr(t('mediaplace_collection_renamed_empty')),
                                });
                            }
                        })
                        .catch(function (err) {
                            showAlertModal({
                                icon: 'fa-triangle-exclamation',
                                title: t('mediaplace_error'),
                                message: escAttr(t('mediaplace_error_renaming_collection', { msg: err.message })),
                                dangerous: true,
                            });
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
                                    showAlertModal({
                                        icon: 'fa-circle-info',
                                        title: t('mediaplace_notice'),
                                        message: escAttr(t('mediaplace_collection_deleted_empty')),
                                    });
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

            var bulkMoveBtn = e.target.closest('.mp3-cat-bulk-move-btn');
            if (bulkMoveBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeCatMenu();
                var bulkMoveCatId = parseInt(bulkMoveBtn.getAttribute('data-bulk-cat'), 10) || 0;
                if (bulkMoveCatId <= 0) return;
                startBulkMoveFiles(bulkMoveCatId, bulkMoveBtn.getAttribute('data-bulk-cat-name') || String(bulkMoveCatId));
                return;
            }

            var bulkCollectionBtn = e.target.closest('.mp3-cat-bulk-collection-btn');
            if (bulkCollectionBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeCatMenu();
                var bulkCollectionCatId = parseInt(bulkCollectionBtn.getAttribute('data-bulk-cat'), 10) || 0;
                if (bulkCollectionCatId <= 0) return;
                startBulkAddToCollection(bulkCollectionCatId, bulkCollectionBtn.getAttribute('data-bulk-cat-name') || String(bulkCollectionCatId));
                return;
            }

            var bulkTagBtn = e.target.closest('.mp3-cat-bulk-tag-btn');
            if (bulkTagBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeCatMenu();
                var bulkTagCatId = parseInt(bulkTagBtn.getAttribute('data-bulk-cat'), 10) || 0;
                if (bulkTagCatId <= 0) return;
                startBulkTagFiles(bulkTagCatId, bulkTagBtn.getAttribute('data-bulk-cat-name') || String(bulkTagCatId));
                return;
            }

            var bulkDeleteBtn = e.target.closest('.mp3-cat-bulk-delete-btn');
            if (bulkDeleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeCatMenu();
                var bulkDeleteCatId = parseInt(bulkDeleteBtn.getAttribute('data-bulk-cat'), 10) || 0;
                if (bulkDeleteCatId <= 0) return;
                startBulkDeleteFiles(bulkDeleteCatId, bulkDeleteBtn.getAttribute('data-bulk-cat-name') || String(bulkDeleteCatId));
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

            var providerRoot = e.target.closest('.mp3-provider-root');
            if (providerRoot) {
                e.stopPropagation();
                var clickedProviderId = providerRoot.getAttribute('data-provider-id') || '';
                if (!clickedProviderId) return;
                // "schon aktiv"-Guard lebt jetzt in openProvider() selbst.
                openProvider(clickedProviderId, providerRoot.getAttribute('data-provider-label') || clickedProviderId);
                return;
            }

            var altMissingNav = e.target.closest('.mp3-alt-missing-nav');
            if (altMissingNav) {
                e.stopPropagation();
                closeProviderMode();
                // Toggle: "Medien ohne ALT-Text" XOR Kategorie/Sammlung --
                // gleiches Ausschluss-Muster wie beim Sammlungs-Klick unten.
                altMissingActive = !altMissingActive;
                if (altMissingActive) {
                    setActiveCollection(null);
                }
                currentCat = altMissingActive ? -1 : 0;
                localStorage.setItem('mp3_cat', String(currentCat));
                localStorage.setItem('mp3_alt_missing_active', altMissingActive ? '1' : '0');
                buildBreadcrumb(currentCat);
                refreshCollectionsSection();
                updateSidebarActiveState();
                loadFiles(currentCat, true);
                return;
            }

            var collection = e.target.closest('.mp3-collection');
            if (collection) {
                e.stopPropagation();
                closeProviderMode();
                var collectionId = String(collection.getAttribute('data-collection-id') || '');
                if (!collectionId) return;
                // Toggle: Sammlung XOR Kategorie. Wenn Sammlung aktiv, verlasse Kategorie-Modus
                if (String(getActiveCollectionId()) === collectionId) {
                    setActiveCollection(null);
                } else {
                    setActiveCollection(collectionId);
                    altMissingActive = false;
                    localStorage.setItem('mp3_alt_missing_active', '0');
                }
                // Reset category to -1 (show all) when entering collection mode
                currentCat = getActiveCollectionId() ? -1 : 0;
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
            closeProviderMode();
            var catId = parseInt(cat.getAttribute('data-cat'), 10);
            currentCat = catId;
            localStorage.setItem('mp3_cat', catId);
            // Exit collection/alt-missing mode when clicking a category
            setActiveCollection(null);
            altMissingActive = false;
            localStorage.setItem('mp3_alt_missing_active', '0');

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
                        showAlertModal({
                            icon: 'fa-triangle-exclamation',
                            title: t('mediaplace_error'),
                            message: escAttr(t('mediaplace_error_assigning_collection', { msg: err.message })),
                            dangerous: true,
                        });
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
            if (!item) return;

            if (item.hasAttribute('data-provider-crumb')) {
                e.preventDefault();
                jumpToProviderBreadcrumb(parseInt(item.getAttribute('data-provider-crumb'), 10));
                return;
            }

            // mp3-bc-item-disabled (Medienpool-Wurzel ohne hasCategoryPerm(0))
            // ist ein <span> ohne data-cat -- siehe Kategorie-Klick-Handler oben.
            if (item.classList.contains('mp3-bc-item-disabled') || !item.hasAttribute('data-cat')) return;
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
            // Cloud-Provider-Grid (siehe openProvider()): komplett eigener,
            // fruehzeitiger Zweig -- alles danach (Sammlungen, Mehrfachauswahl,
            // Metainfo-Medien-Picker, ...) geht von lokalen rex_media-Dateien
            // aus und darf fuer Provider-Kacheln nicht greifen.
            if (isProviderMode()) {
                var providerCard = e.target.closest('.mp3-provider-card');
                if (!providerCard) return;
                var entryPath = providerCard.getAttribute('data-provider-path') || '';
                var entryType = providerCard.getAttribute('data-provider-type') || 'file';
                if ('folder' === entryType) {
                    openProviderFolder(entryPath, providerCard.getAttribute('data-provider-name') || '');
                } else {
                    showProviderDetail(entryPath, providerCard.getAttribute('data-provider-name') || '');
                }
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

            // Normal mode, Auswahl-Modus aktiv (Toolbar-Button, siehe
            // setBatchSelectMode()): normaler Klick toggelt die Auswahl direkt --
            // touch-tauglicher Ersatz fuer die Cmd/Ctrl+Klick-Geste darunter.
            if (batchSelectMode) {
                toggleCollectionDragSelection(filename);
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
                setFullscreenMode(!isFullscreenMode());
                return;
            }

            var selModeBtn = e.target.closest('.mp3-select-mode-toggle');
            if (selModeBtn) {
                setBatchSelectMode(!batchSelectMode);
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

            var openCropBtn = e.target.closest('.mp3-cropper-edit-btn');
            if (openCropBtn) {
                openCropCanvas(openCropBtn.getAttribute('data-cropper-file') || '');
                return;
            }

            var optimizeVideoBtn = e.target.closest('.mp3-video-optimize-btn');
            if (optimizeVideoBtn) {
                var optimizeFile = optimizeVideoBtn.getAttribute('data-optimize-video-file') || '';
                if (optimizeFile) startOptimizeVideo(optimizeFile, optimizeVideoBtn);
                return;
            }

            // Vor dem allgemeineren .mp3-image-optimize-btn-Check (geteilte
            // Button-Optik, siehe showProviderDetail()) -- eigene, spezifischere
            // Klasse zuerst pruefen, sonst wuerde der Klick vom falschen
            // Handler abgefangen (kein data-optimize-image-file vorhanden).
            var providerImportBtn = e.target.closest('.mp3-provider-import-btn');
            if (providerImportBtn) {
                var importPath = providerImportBtn.getAttribute('data-provider-import-path') || '';
                var importName = providerImportBtn.getAttribute('data-provider-import-name') || '';
                if (importPath) promptProviderImport(importPath, importName, providerImportBtn);
                return;
            }

            var optimizeImageBtn = e.target.closest('.mp3-image-optimize-btn');
            if (optimizeImageBtn) {
                var optimizeImageFile = optimizeImageBtn.getAttribute('data-optimize-image-file') || '';
                if (optimizeImageFile) startOptimizeImage(optimizeImageFile, optimizeImageBtn);
                return;
            }

            var videoDetailsToggle = e.target.closest('.mp3-video-details-toggle');
            if (videoDetailsToggle) {
                toggleVideoDetails(videoDetailsToggle);
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

            var batchMoveBtn = e.target.closest('.mp3-batch-move-btn');
            if (batchMoveBtn) {
                var moveFilenames = Object.keys(collectionDragSelected);
                if (!moveFilenames.length) return;
                showCategoryPickerModal({
                    icon: 'fa-solid fa-folder-open',
                    title: t('mediaplace_pick_move_category'),
                    hint: t('mediaplace_move_files_hint', { count: moveFilenames.length }),
                    confirmLabel: t('mediaplace_move_selection'),
                    onConfirm: function (catId) {
                        var moved = [];
                        var failed = [];

                        function moveNext(i) {
                            if (i >= moveFilenames.length) {
                                // Verschobene Dateien verlassen die aktuelle Ansicht,
                                // sobald sie nicht mehr in die gerade betrachtete
                                // Kategorie gehoeren -- gleiches Prinzip wie beim
                                // Einzel-Verschieben ueber .mp3-move-file-select.
                                if (currentCat >= 0 && catId !== currentCat) {
                                    lastLoadedFiles = lastLoadedFiles.filter(function (f) { return moved.indexOf(f.filename) === -1; });
                                } else {
                                    moved.forEach(function (fn) {
                                        for (var j = 0; j < lastLoadedFiles.length; j++) {
                                            if (lastLoadedFiles[j].filename === fn) {
                                                lastLoadedFiles[j].category_id = catId;
                                                break;
                                            }
                                        }
                                    });
                                }
                                moved.forEach(function (fn) { delete collectionDragSelected[fn]; });
                                if (selectedFile && moved.indexOf(selectedFile) !== -1) hideDetail();
                                updateCollectionDragSelectionUI();
                                refreshDisplay();
                                if (failed.length) {
                                    showAlertModal({
                                        icon: 'fa-triangle-exclamation',
                                        title: t('mediaplace_error'),
                                        message: escAttr(t('mediaplace_failed_list', { list: failed.join(', ') })),
                                        dangerous: true,
                                    });
                                }
                                return;
                            }

                            var moveFilename = moveFilenames[i];
                            apiUpdate(moveFilename, { category_id: catId })
                                .then(function () {
                                    moved.push(moveFilename);
                                })
                                .catch(function () {
                                    failed.push(moveFilename);
                                })
                                .then(function () {
                                    moveNext(i + 1);
                                });
                        }

                        moveNext(0);
                    }
                });
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
                    // data-in-use-detail: dasselbe von REDAXO selbst erzeugte
                    // HTML (inkl. Links zu den referenzierenden Objekten) wie
                    // im klassischen Medienpool, siehe rex_mediapool::
                    // mediaIsInUse()/buildFastInfoFields(). showAlertModal()
                    // rendert message bewusst als HTML, kein escAttr() hier.
                    var inUseDetail = deleteBtn.getAttribute('data-in-use-detail') || '';
                    showAlertModal({
                        icon: 'fa-triangle-exclamation',
                        title: t('mediaplace_delete_file'),
                        message: escAttr(t('mediaplace_file_in_use_cannot_delete')) + inUseDetail,
                        dangerous: true
                    });
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
                if (!collectionFilename) return;
                showManageCollectionsModal(collectionFilename);
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
                if (tagsInput) addTagFromWidget(wrap, tagsInput.value);
                return;
            }

            var comboOption = e.target.closest('.mp3-tags-combo-option, .mp3-tags-combo-create');
            if (comboOption) {
                e.preventDefault();
                addTagFromWidget(comboOption.closest('.mp3-tags-widget'), comboOption.getAttribute('data-tag-name'));
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
                    updateTagsComboList(removeWrap);
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
                    var restCount = qsa('.mp3-lang-row', extra).length;
                    langToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i> ' + t(restCount > 1 ? 'mediaplace_lang_more_many' : 'mediaplace_lang_more_one', { 0: restCount });
                } else {
                    extra.style.display = '';
                    langToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> ' + t('mediaplace_lang_hide_extra');
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

            if (e.key === 'Escape' && e.target.closest('.mp3-tags-input')) {
                // Nur die Combobox schliessen, nicht das ganze Detail-Panel/
                // Overlay -- stopPropagation() verhindert, dass ein
                // aeusserer Escape-Handler dasselbe Tastendruck-Event
                // zusaetzlich als "Overlay schliessen" interpretiert.
                e.stopPropagation();
                closeTagsComboList(e.target.closest('.mp3-tags-widget'));
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

            var tagsComboInput = e.target.closest('.mp3-tags-input');
            if (tagsComboInput) {
                openTagsComboList(tagsComboInput.closest('.mp3-tags-widget'));
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

        // Tag-Combobox oeffnen/schliessen -- 'focus'/'blur' bubblen nicht,
        // deshalb 'focusin'/'focusout' fuer Event-Delegation auf overlay
        // (gleiches Prinzip wie der bestehende 'focusout'-Listener auf
        // sidebar fuer .mp3-cat-new-input). Kurze Verzoegerung beim Schliessen,
        // damit ein Klick auf eine Vorschlagszeile zuerst verarbeitet wird,
        // bevor die Liste verschwindet.
        overlay.addEventListener('focusin', function (e) {
            var tagsInput = e.target.closest('.mp3-tags-input');
            if (!tagsInput) return;
            openTagsComboList(tagsInput.closest('.mp3-tags-widget'));
        });

        overlay.addEventListener('focusout', function (e) {
            var tagsInput = e.target.closest('.mp3-tags-input');
            if (!tagsInput) return;
            var tagsWrap = tagsInput.closest('.mp3-tags-widget');
            setTimeout(function () {
                if (document.activeElement !== tagsInput) {
                    closeTagsComboList(tagsWrap);
                }
            }, 150);
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
                var query = searchInput.value.trim();
                if (isProviderMode()) {
                    // Nur weiterreichen, wenn der aktive Provider laut letzter
                    // entries-Antwort ueberhaupt Suche unterstuetzt (hasSearch()) --
                    // sonst waere die Eingabe wirkungslos, ohne dass der Nutzer
                    // einen Hinweis darauf haette.
                    if (providerHasSearch() || '' === query) loadProviderEntries(query);
                    return;
                }
                mediaQuery = query;
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

        // Sort-Popover -- gleiches Muster wie der Ansicht-Umschalter unten
        // (Trigger-Button + Dropdown statt eines nativen <select>, dessen
        // Options-Liste sich nicht durchgaengig stylen laesst).
        var sortToggleWrap = qs('.mp3-sort-toggle-wrap', overlay);
        var sortToggleBtn = qs('.mp3-sort-toggle-btn', overlay);
        var sortToggleMenu = qs('.mp3-sort-toggle-menu', overlay);
        if (sortToggleWrap && sortToggleBtn && sortToggleMenu) {
            function positionSortToggleMenu() {
                var rect = sortToggleBtn.getBoundingClientRect();
                var menuW = Math.max(sortToggleMenu.offsetWidth, 180);
                var left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
                var top = rect.bottom + 1;
                sortToggleMenu.style.left = left + 'px';
                sortToggleMenu.style.top = top + 'px';
            }
            sortToggleBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var willOpen = !sortToggleWrap.classList.contains('mp3-sort-toggle-open');
                sortToggleWrap.classList.toggle('mp3-sort-toggle-open', willOpen);
                if (willOpen) positionSortToggleMenu();
            });
            document.addEventListener('click', function (e) {
                if (!sortToggleWrap.classList.contains('mp3-sort-toggle-open')) return;
                if (e.target.closest('.mp3-sort-toggle-wrap')) return;
                sortToggleWrap.classList.remove('mp3-sort-toggle-open');
            });
            sortToggleMenu.addEventListener('click', function (e) {
                var btn = e.target.closest('.mp3-sort-option');
                if (!btn) return;
                var sort = btn.getAttribute('data-sort');
                sortToggleWrap.classList.remove('mp3-sort-toggle-open');
                if (sort === getCurrentSort()) return;
                setCurrentSort(sort);
                updateSortToggleTrigger();
                refreshDisplay();
            });
        }

        // View toggle (grid / list / media wall) -- ein einzelner Trigger-Button
        // statt frueher 3 einzelner Icon-Buttons (auch auf Desktop, nicht nur
        // mobil, siehe Bugreport): oeffnet ein kleines Dropdown-Menue
        // (gleiches Muster wie initAdminMenu() unten), der Trigger zeigt dabei
        // immer das Icon der aktuell aktiven Ansicht.
        var viewToggleWrap = qs('.mp3-view-toggle-wrap', overlay);
        var viewToggleBtn = qs('.mp3-view-toggle-btn', overlay);
        var viewToggleMenu = qs('.mp3-view-toggle-menu', overlay);
        if (viewToggleWrap && viewToggleBtn && viewToggleMenu) {
            function positionViewToggleMenu() {
                var rect = viewToggleBtn.getBoundingClientRect();
                var menuW = Math.max(viewToggleMenu.offsetWidth, 160);
                var left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
                var top = rect.bottom + 1;
                viewToggleMenu.style.left = left + 'px';
                viewToggleMenu.style.top = top + 'px';
            }
            viewToggleBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var willOpen = !viewToggleWrap.classList.contains('mp3-view-toggle-open');
                viewToggleWrap.classList.toggle('mp3-view-toggle-open', willOpen);
                if (willOpen) positionViewToggleMenu();
            });
            document.addEventListener('click', function (e) {
                if (!viewToggleWrap.classList.contains('mp3-view-toggle-open')) return;
                if (e.target.closest('.mp3-view-toggle-wrap')) return;
                viewToggleWrap.classList.remove('mp3-view-toggle-open');
            });
            viewToggleMenu.addEventListener('click', function (e) {
                var btn = e.target.closest('.mp3-view-btn');
                if (!btn) return;
                var mode = btn.getAttribute('data-view');
                viewToggleWrap.classList.remove('mp3-view-toggle-open');
                if (mode === viewMode) return;
                viewMode = mode;
                localStorage.setItem('mp3_view', viewMode);
                qsa('.mp3-view-btn', viewToggleMenu).forEach(function (b) {
                    b.classList.toggle('mp3-view-active', b.getAttribute('data-view') === mode);
                });
                updateViewToggleTrigger();
                updateTileSizeVisibility();
                refreshDisplay();
            });
        }

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

        // Tag-Liste lebt jetzt fest in der Sidebar (#mp3-tag-filter-section,
        // siehe updateTagFilterOptions()), kein eigenes Portal/Toggle mehr
        // noetig. Das mobile Filter-Dropdown (#mp3-filter-dropdown-menu-portal)
        // fuer Typ-Filter/"Nur unbenutzte" bleibt unveraendert ein eigenes
        // Portal -- die Auswahl-Logik selbst laeuft ueber dieselben
        // applyTypeFilter()/toggleUnusedOnlyFilter()-Funktionen wie die
        // Desktop-Pills, damit beide UIs immer synchron bleiben.
        overlay.addEventListener('click', function (e) {
            var option = e.target.closest('.mp3-tag-filter-option');
            if (option) {
                e.stopPropagation();
                var name = String(option.getAttribute('data-tag-name') || '').trim();
                if (!name) return;
                toggleTagFilter(name);
                updateTagFilterOptions();
                refreshDisplay();
                return;
            }

            var tagClearBtn = e.target.closest('.mp3-tag-filter-clear-btn');
            if (tagClearBtn) {
                e.stopPropagation();
                clearTagFilters();
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

            if (!e.target.closest('.mp3-filter-dropdown-wrap') && !e.target.closest('#mp3-filter-dropdown-menu-portal')) {
                setFilterDropdownMenuOpen(false);
            }
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                setFilterDropdownMenuOpen(false);
                // Canvas-Modi hier UND im document-Escape-Handler pruefen ist
                // bewusst doppelt gemocht: dieser Listener (auf overlay)
                // feuert vor dem document-Listener (Bubble-Reihenfolge), wuerde
                // also den Canvas schon schliessen, BEVOR der document-Handler
                // pruefen kann, ob noch einer offen ist -- ohne
                // stopPropagation() saehe er ihn faelschlich als "schon zu" und
                // wuerde zusaetzlich das ganze Overlay schliessen. Deshalb hier
                // die Quelle der Wahrheit UND per stopPropagation() verhindern,
                // dass der document-Handler fuer dieselbe Taste ueberhaupt noch
                // laeuft.
                if (metainfoCanvasOpen) {
                    closeMetainfoCanvas();
                    e.stopPropagation();
                } else if (isFocuspointCanvasOpen()) {
                    closeFocuspointCanvas();
                    e.stopPropagation();
                } else if (isCropCanvasOpen()) {
                    closeCropCanvas();
                    e.stopPropagation();
                }
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && isFocuspointCanvasOpen()) {
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

        // Fokuspunkt-Canvas-Events: siehe initFocuspoint() (modules/focuspoint.js).
        // Zuschneiden-Canvas-Events: siehe initCropper() (modules/cropper.js).

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
                if (!delegateToUploadProvider(e.target.files)) {
                    doUpload(e.target.files);
                }
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

            // Aktiver Upload-Provider bekommt die rohe, flache Dateiliste --
            // OHNE Ordner-Auswertung (readDroppedItems() ist eine
            // mediaplace-eigene Zusatzfunktion, siehe delegateToUploadProvider()).
            if (delegateToUploadProvider(fallbackFiles)) {
                return;
            }

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
            if (!delegateToUploadProvider(files)) {
                doUpload(files);
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
        // und MP3.open(null, { closeHref: ... }) (z.B. ueber openFile(filename,
        // null, opts) fuer reines Durchsuchen/Deep-Link ohne Auswahl-Callback --
        // opts muss auch dann ausgewertet werden, nicht nur bei echtem callback).
        var callback, options;
        if (typeof callbackOrOpts === 'function') {
            callback = callbackOrOpts;
            options = opts || {};
        } else if (typeof callbackOrOpts === 'object' && callbackOrOpts) {
            options = callbackOrOpts;
            callback = options.onSelect || null;
        } else {
            callback = null;
            options = opts || {};
        }

        multiMode = !!options.multiple;
        multiSelected = {};
        collectionDragSelected = {};
        batchSelectMode = false;
        mediaLinkPickFieldKey = null;
        closeLightbox();
        // options.fullscreen: startet direkt im Vollbild-Modus statt im normalen
        // verschiebbaren/skalierbaren Fenster-Modal -- fuer Aufrufe, die MP3 als
        // vollwertigen Seitenersatz oeffnen (z.B. mediapool_takeover.php), nicht
        // als kleineren Auswahl-Dialog innerhalb einer anderen Seite.
        setFullscreenMode(!!options.fullscreen);
        onSelect = (!multiMode && typeof callback === 'function') ? callback : null;
        onMultiSelect = (multiMode && typeof callback === 'function') ? callback : null;
        closeHrefTarget = (typeof options.closeHref === 'string' && options.closeHref) ? options.closeHref : null;
        onCloseCallback = (typeof options.onClose === 'function') ? options.onClose : null;

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
        // KEIN overflow:hidden auf html/body (frueher versucht, siehe Git-Historie):
        // beide haben im REDAXO-Backend eine feste height:100% (html {
        // overflow-y: scroll; height: 100% }, body/.rex-page ebenso, siehe
        // be_style/_scaffolding.scss -- gilt auch mobil). overflow:hidden auf
        // einem Element mit fixer Hoehe klappt dessen Inhalt unterhalb der
        // Viewport-Hoehe komplett weg, wodurch scrollTop auf 0 einrastet,
        // unabhaengig davon, was man danach zurueckschreibt.
        //
        // Stattdessen die uebliche "position:fixed mit negativem top"-Technik:
        // <html> selbst bleibt unangetastet (overflow-y:scroll/scrollTop
        // funktionieren die ganze Zeit normal weiter), nur <body> wird visuell
        // an der aktuellen Scroll-Position "eingefroren" -- body traegt als
        // position:fixed-Element nichts mehr zu html's scrollHeight bei, die
        // aeussere Dokument-Scrollbar wird dadurch inert (kein zweiter,
        // tatsaechlich scrollbarer Balken mehr neben dem internen Grid-Scroll).
        // Kein Effekt auf scrollTop bei Restore, siehe close().
        document.body.classList.add('mp3-scroll-lock');
        document.body.style.top = (-pageScrollTopBeforeOpen) + 'px';
        // Overlay liegt ohnehin als position:fixed vollflaechig ueber allem und
        // faengt alle Klick-/Wheel-Events ab. Scrollposition trotzdem fuer
        // ~500ms aktiv festhalten, falls z.B. der Fokus-Aufruf unten
        // (preventScroll) in manchen Browsern doch scrollt.
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
        // anderen Tab wechseln, keine harte Beschraenkung der Auswahl. Setzt
        // Typ-/Tag-/"Nur unbenutzte"-Filter + Sortierung zurueck (modules/filters.js).
        resetFilterState(options);
        // options.allowedExtensions: im Gegensatz zu options.filter eine harte
        // Einschraenkung -- nicht passende Dateien werden aus dem Grid entfernt
        // und koennen nicht ausgewaehlt werden (siehe isFileSelectable()).
        allowedExtensions = Array.isArray(options.allowedExtensions)
            ? options.allowedExtensions
                .map(function (ext) { return String(ext || '').trim().toLowerCase().replace(/^\./, ''); })
                .filter(Boolean)
            : null;
        if (allowedExtensions && !allowedExtensions.length) allowedExtensions = null;
        viewMode = localStorage.getItem('mp3_view') || 'grid';
        // Backward-compat: old value "masonry" now maps to "mediawall"
        if (viewMode === 'masonry') {
            viewMode = 'mediawall';
        }
        if (viewMode !== 'grid' && viewMode !== 'list' && viewMode !== 'mediawall') {
            viewMode = 'grid';
        }
        setActiveCollection(features.collections ? (localStorage.getItem('mp3_active_collection') || null) : null);
        altMissingActive = features.altMissingFilter && localStorage.getItem('mp3_alt_missing_active') === '1';
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
        updateTagFilterOptions();
        setFilterDropdownMenuOpen(false);
        updateFilterDropdownLabel();
        qsa('.mp3-view-btn', overlay).forEach(function (b) {
            b.classList.toggle('mp3-view-active', b.getAttribute('data-view') === viewMode);
        });
        updateViewToggleTrigger();
        updateSortToggleTrigger();
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
        closeProviderMode();
        // Gegenstueck zum position:fixed-Scroll-Lock in open(): body zuerst
        // wieder in den normalen Fluss zuruecknehmen, DANACH scrollTop restaurieren
        // (waehrend body noch fixed ist, hat ein Scroll-Aufruf auf html keine
        // sichtbare Wirkung, html wurde aber ohnehin nie tatsaechlich verstellt --
        // das Zuruecksetzen hier ist nur ein zusaetzliches Sicherheitsnetz).
        document.body.classList.remove('mp3-scroll-lock');
        document.body.style.top = '';
        var scrollDocOnClose = document.scrollingElement || document.documentElement;
        if (scrollDocOnClose) scrollDocOnClose.scrollTop = pageScrollTopBeforeOpen;
        if (overlay) {
            overlay.classList.remove('mp3-open');
            overlay.classList.remove('mp3-multi-mode');
            overlay.classList.remove('mp3-media-link-pick-mode');
            overlay.classList.remove('mp3-metainfo-pick-mode');
        }
        multiMode = false;
        multiSelected = {};
        collectionDragSelected = {};
        batchSelectMode = false;
        mediaLinkPickFieldKey = null;
        metainfoPickTarget = null;
        onSelect = null;
        onMultiSelect = null;
        if (onCloseCallback) {
            var cb = onCloseCallback;
            onCloseCallback = null;
            closeHrefTarget = null;
            cb();
        } else if (closeHrefTarget) {
            var target = closeHrefTarget;
            closeHrefTarget = null;
            window.location.href = target;
        }
    }

    /**
     * Uebergibt Dateien an den aktiven, registrierten Upload-Provider (siehe
     * MP3.registerUploadProvider() unten) statt an mediaplace's eigenen
     * Upload-Flow -- gilt fuer Button-Auswahl, Drag&Drop und Paste
     * gleichermassen (siehe die drei Aufrufstellen weiter unten in build()).
     * Bewusst OHNE Ordner-Kategorie-Zuordnung (siehe doFolderUpload()) --
     * das ist eine mediaplace-eigene Zusatzfunktion, kein Teil des
     * Erweiterungspunkt-Vertrags; ein Provider bekommt immer die flache
     * Dateiliste. catId kann -1 sein (Sammlungs-/"Alle Medien"-Modus ohne
     * konkrete Zielkategorie, siehe getCurrentCat()) -- der Provider
     * entscheidet selbst, wie er damit umgeht (z.B. eigene Kategoriewahl).
     *
     * Gibt true zurueck, wenn delegiert wurde (Aufrufer darf dann NICHT
     * zusaetzlich doUpload()/doFolderUpload() rufen), false, wenn kein
     * Provider aktiv/registriert ist (nativer Upload greift wie bisher).
     */
    function delegateToUploadProvider(fileList) {
        if (!activeUploadProviderId || !fileList || !fileList.length) return false;
        var handler = uploadProviders[activeUploadProviderId];
        if (typeof handler !== 'function') return false;
        try {
            handler({
                files: fileList,
                catId: currentCat,
                onDone: function () { loadFiles(currentCat, true); }
            });
        } catch (err) {
            console.error('MP3 upload provider "' + activeUploadProviderId + '" failed:', err);
            return false;
        }
        return true;
    }

    /**
     * Rendert die per MP3.registerAdminMenuItem() registrierten Eintraege in
     * #mp3-admin-menu-extensions (Zahnrad-Menue) -- no-op, falls das Overlay
     * noch nicht gebaut wurde (registerAdminMenuItem() wird typischerweise
     * beim Laden des registrierenden Scripts aufgerufen, lange bevor der User
     * das Overlay ueberhaupt oeffnet; initAdminMenu() ruft diese Funktion
     * beim naechsten build() dann selbst noch einmal auf).
     */
    function renderAdminMenuExtensions() {
        if (!overlay) return;
        var container = qs('#mp3-admin-menu-extensions', overlay);
        if (!container) return;
        var ids = Object.keys(adminMenuItems);
        container.innerHTML = ids.map(function (id) {
            var item = adminMenuItems[id];
            var icon = item.icon || 'fa-solid fa-wand-magic-sparkles';
            return '<button type="button" class="mp3-admin-menu-ext-btn" data-admin-menu-ext="' + escAttr(id) + '"><i class="' + escAttr(icon) + '"></i> ' + escAttr(item.label || id) + '</button>';
        }).join('');
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
        // Fuer "Ansehen" auf einem klassischen REX_MEDIA[n]/REX_MEDIALIST[n]-Widget
        // INNERHALB des bereits offenen Metainfo-Canvas (siehe mediaplace_classic.js):
        // anders als openFile() KEIN erneutes open() -- der Overlay laeuft ja schon,
        // nur das eigene Detail-Panel (rechte Sidebar) soll auf diese Datei
        // umschalten, ohne den gerade offenen Canvas zu stoeren.
        showFileDetail: function (filename) {
            if (filename) showDetail(filename);
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
        // Erweiterungspunkt fuer Dritt-Uploader (z.B. filepond_uploader), die
        // MediaPlace's eingebauten Upload-Button/Drag&Drop durch ihren
        // eigenen Dialog ersetzen wollen (siehe UploadProviderRegistry/
        // MEDIAPLACE_UPLOAD_PROVIDERS in PHP fuer die Server-Registrierung +
        // Einstellungsseite "Upload-Anbieter" fuer die Aktivierung). handler
        // bekommt { files: FileList|File[], catId: number, onDone: function }
        // -- ruft onDone() auf, wenn MediaPlace die Dateiliste neu laden soll.
        // Registrierung ist reine Bereitschaftserklaerung: greift nur, wenn
        // dieselbe Provider-ID auch als aktiver Anbieter eingestellt ist.
        registerUploadProvider: function (id, handler) {
            if (!id || typeof handler !== 'function') return;
            uploadProviders[id] = handler;
        },
        // Erweiterungspunkt fuer einen eigenen Eintrag im Zahnrad-Menue (z.B.
        // "AI Bulk Management" von mediaplace_a11y) -- es gibt sonst keine
        // Moeglichkeit, eine Aktion auszufuehren, die JS INNERHALB des
        // laufenden Overlays braucht (die klassische mediapool-Unterseiten-
        // Liste im selben Menue oeffnet immer eine echte Seite/ein Popup).
        // opts: { label, icon (fa-solid-Klasse, optional), onClick() }.
        // onClick bekommt keine Argumente -- der Aufrufer kennt seinen
        // eigenen Zustand selbst (z.B. ueber sein eigenes #mp3-root-Pendant).
        registerAdminMenuItem: function (id, opts) {
            if (!id || !opts || typeof opts.onClick !== 'function') return;
            adminMenuItems[id] = opts;
            renderAdminMenuExtensions();
        },
        // Aufgerufen von mediaplace_classic.js, wenn im Metainfo-Canvas ein
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
