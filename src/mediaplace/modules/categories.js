/**
 * Kategorie-Baum/Breadcrumb/Navigation. Achte Extraktion aus core.js
 * (siehe DEV.md/Modularisierungs-Plan), nach dem gleichen Muster wie
 * modules/providers.js/modals.js/lightbox.js/focuspoint.js/cropper.js/
 * optimize.js/collections.js.
 *
 * currentCat/catCache/catPath/categorySearchTerm/canAccessRootCategory
 * bleiben BEWUSST in core.js (per ctx-Getter/Setter erreichbar) statt wie
 * activeCollectionId bei collections.js komplett hierher zu wandern:
 * currentCat insbesondere wird von sehr vielen, noch nicht extrahierten
 * Stellen in core.js direkt gelesen/geschrieben (Upload-Zielkategorie,
 * Datei-Verschieben-Select im Detail-Panel, ...) -- ein Umzug haette dort
 * ueberall ctx-Verdrahtung noetig gemacht, ausserhalb dessen, was diese
 * Phase eigentlich abdeckt.
 *
 * loadFiles() bleibt ebenfalls in core.js: gehoert eher zur "Data
 * Loading"/Grid-Domaene (Tags/Unbenutzt-Status/Pagination) als zum
 * Kategorie-Baum selbst, auch wenn es haeufig zusammen mit
 * navigateToCategory()/loadCategories() aufgerufen wird.
 */

import { renderCollectionsSection, setActiveCollection, getCollectionsForCurrentCategory, collectionTagToName, refreshCollectionsSection, setCollectionCounts } from './collections.js';
import { hasProviders, renderProvidersSection } from './providers.js';
import { showConfirmModal, showAlertModal, showPromptModal, showCategoryPickerModal } from './modals.js';
import { getCurrentTagCatalog } from './filters.js';

var ctx = null;

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var escAttr = MP3Core.helpers.escAttr;
var qs = MP3Core.helpers.qs;
var qsa = MP3Core.helpers.qsa;
var getCategoriesApiUrl = MP3Core.api.getCategoriesApiUrl;
var apiFetchAllCategoriesFlat = MP3Core.api.apiFetchAllCategoriesFlat;
var apiMoveCategory = MP3Core.api.apiMoveCategory;
var apiCreateCategory = MP3Core.api.apiCreateCategory;
var apiRenameCategory = MP3Core.api.apiRenameCategory;
var apiCategoryBulkAction = MP3Core.api.apiCategoryBulkAction;
var apiLoadSystemTagsForFiles = MP3Core.api.apiLoadSystemTagsForFiles;

/**
 * ctx-Vertrag:
 * - overlay, sidebar, breadcrumb: DOM-Refs
 * - features: Objekt-Referenz (liest ctx.features.collections)
 * - getCurrentCat()/setCurrentCat(): noch-legacy-State
 * - getCatCache()/setCatCache(): noch-legacy-State (Reset per Reassignment)
 * - getCatPath()/setCatPath(): noch-legacy-State (Reset per Reassignment)
 * - getCanAccessRootCategory(): noch-legacy-State (read-only)
 * - getCategorySearchTerm()/setCategorySearchTerm(): noch-legacy-State
 * - getOnMultiSelect(): noch-legacy-State (Picker-Modus-Flag)
 * - getLoadSessionId(): noch-legacy-State (Stale-Request-Check)
 * - getAltMissingActive(): noch-legacy-State (read-only, "Medien ohne
 *   ALT-Text"-Modus -- Umschalten selbst passiert im Sidebar-Klick-Handler
 *   in core.js, hier nur fuer den aktiv-Zustand der Sidebar-Zeile gelesen)
 * - getCanBulkOperations(): noch-legacy-State (read-only, steuert nur die
 *   Sichtbarkeit der Kategorie-Massenaktionen-Menuepunkte -- der eigentliche
 *   Schutz ist serverseitig in Api\CategoryBulk.php)
 * - loadFiles(): noch-legacy-Funktion (Data-Loading-Domaene)
 * - refreshTagFilterSection(): noch-legacy-Funktion (Tag-Katalog/-Filter-State
 *   lebt in core.js) -- fuellt den hier nur als leerer Platzhalter
 *   angelegten #mp3-tag-filter-section-Container mit Inhalt (liest
 *   ctx.features.tagging).
 */
export function initCategories(theCtx) {
    ctx = theCtx;
}

export function applyCategorySearchFilter() {
    if (!ctx.sidebar) return;

    var input = qs('.mp3-cat-search-input', ctx.sidebar);
    var term = String((input ? input.value : ctx.getCategorySearchTerm()) || '').trim().toLowerCase();
    ctx.setCategorySearchTerm(term);

    var headers = qsa('.mp3-cat-header', ctx.sidebar);
    var nodes = qsa('.mp3-cat-node', ctx.sidebar);
    var childrenBlocks = qsa('.mp3-cat-children', ctx.sidebar);
    var emptyHint = qs('.mp3-cat-search-empty', ctx.sidebar);

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
    // mediaplace.css), das reine Entfernen von "mp3-cat-hidden" wuerde den
    // Treffer also nicht sichtbar machen.
    nodes.forEach(function (node) {
        if (!node.classList.contains('mp3-cat-match')) return;
        var parent = node.parentElement;
        while (parent && parent !== ctx.sidebar) {
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
            // insertBefore() verlangt, dass das Referenz-Element ein DIREKTES
            // Kind des Knotens ist, auf dem es aufgerufen wird -- .mp3-cat-tree
            // steckt seit dem ein-/ausklappbaren Sidebar-Abschnitt (siehe
            // renderCategories()) in .mp3-cat-section-wrap > .mp3-sidebar-
            // section-body, ist also kein direktes Kind von ctx.sidebar mehr.
            var catTreeEl = qs('.mp3-cat-tree', ctx.sidebar);
            if (catTreeEl && catTreeEl.parentNode) {
                catTreeEl.parentNode.insertBefore(emptyHint, catTreeEl);
            } else {
                ctx.sidebar.insertBefore(emptyHint, ctx.sidebar.firstChild);
            }
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
function isSectionCollapsed(key) {
    try {
        return localStorage.getItem('mp3_sidebar_collapsed_' + key) === '1';
    } catch (e) {
        return false;
    }
}

export function renderCategories(treeHtml) {
    var currentCat = ctx.getCurrentCat();
    var canAccessRootCategory = ctx.getCanAccessRootCategory();
    var catCollapsed = isSectionCollapsed('categories');
    // Nur auf Mobile sichtbar (siehe CSS) -- auf schmalen Screens verdeckt
    // das Offcanvas-Sidebar sonst den Schliessen-/Zahnrad-Button im Header
    // vollstaendig, ohne dass ein eigener Rueckweg sichtbar bleibt (Nutzer-
    // Feedback). closeSidebar() wird ueber die bestehende, delegierte
    // Sidebar-Click-Listener in core.js aufgerufen (gleiches Muster wie der
    // .mp3-cat-Klick, der die Sidebar dort ebenfalls schon schliesst).
    var html = '<div class="mp3-sidebar-mobile-header">' +
        '<span class="mp3-sidebar-mobile-title">' + t('mediaplace_categories') + '</span>' +
        '<button type="button" class="mp3-sidebar-mobile-close" title="' + escAttr(t('mediaplace_close')) + '"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="mp3-sidebar-section mp3-cat-section-wrap' + (catCollapsed ? ' mp3-sidebar-section-collapsed' : '') + '" data-section="categories">' +
        '<div class="mp3-sidebar-section-head">' +
            '<span class="mp3-sidebar-section-title"><i class="rex-icon rex-icon-media"></i> ' + t('mediaplace_categories') + '</span>' +
            '<button type="button" class="mp3-sidebar-section-toggle" data-section="categories" title="' + escAttr(t('mediaplace_toggle_section')) + '"><i class="fa-solid fa-chevron-down"></i></button>' +
        '</div>' +
        '<div class="mp3-sidebar-section-body">' +
        '<div class="mp3-cat-search-wrap">' +
        '<i class="fa-solid fa-magnifying-glass"></i>' +
        '<input type="text" class="mp3-cat-search-input" placeholder="' + escAttr(t('mediaplace_search_category_placeholder')) + '" value="' + escAttr(ctx.getCategorySearchTerm()) + '">' +
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
        '</div>' +
        '</div>' +
        (ctx.features.altMissingFilter
            // Initial versteckt, AUSSER die Ansicht ist gerade aktiv (dann
            // waere Verstecken des eigenen aktuellen Navigationspunkts
            // verwirrend) -- ctx.refreshAltMissingNav() blendet unten per
            // echtem Server-Count ein, nur wenn tatsaechlich Dateien ohne
            // ALT-Text existieren.
            ? '<div class="mp3-alt-missing-nav-wrap"' + (ctx.getAltMissingActive() ? '' : ' style="display:none"') + '><a class="mp3-cat mp3-alt-missing-nav' + (ctx.getAltMissingActive() ? ' mp3-cat-active' : '') + '"><i class="fa-solid fa-triangle-exclamation"></i> ' + t('mediaplace_alt_missing_filter') + '</a></div>'
            : '') +
        (ctx.features.collections ? '<div id="mp3-collections-section">' + renderCollectionsSection() + '</div>' : '') +
        (ctx.features.tagging ? '<div class="mp3-sidebar-section mp3-tag-section-wrap' + (isSectionCollapsed('tags') ? ' mp3-sidebar-section-collapsed' : '') + '" data-section="tags" id="mp3-tag-filter-section"></div>' : '') +
        (hasProviders() && !ctx.getOnMultiSelect() ? '<div id="mp3-providers-section">' + renderProvidersSection() + '</div>' : '');
    ctx.sidebar.innerHTML = html;
    applyCategorySearchFilter();
    closeCatMenu();
    // #mp3-tag-filter-section ist hier nur ein leerer Platzhalter (Tag-Daten
    // leben in core.js, nicht in diesem Modul) -- Inhalt kommt vom
    // Aufrufer nach, siehe refreshTagFilterSection() im ctx-Vertrag.
    if (ctx.features.tagging && typeof ctx.refreshTagFilterSection === 'function') {
        ctx.refreshTagFilterSection();
    }
    if (ctx.features.altMissingFilter && typeof ctx.refreshAltMissingNav === 'function') {
        ctx.refreshAltMissingNav();
    }
}

/**
 * Nur die Cloud-Provider-Sektion neu rendern (gleiches Muster wie
 * refreshCollectionsSection() in collections.js) -- fuer den "Aus Cloud
 * ersetzen"-Hinweis (siehe providers.js renderProvidersSection()), der sich
 * unabhaengig vom restlichen Kategorie-Baum aendert (core.js
 * startReplaceFromCloud() und die lokalen Navigations-Handler, die einen
 * laufenden Ersetzen-Versuch abbrechen).
 */
export function refreshProvidersSection() {
    if (!hasProviders() || ctx.getOnMultiSelect()) return;
    var section = document.getElementById('mp3-providers-section');
    if (section) section.innerHTML = renderProvidersSection();
}

/**
 * Nur die aktive Kategorie im Baum markieren -- reine DOM-Klassen-
 * Aktualisierung, kein Nachladen. Fuer reine Navigation (Kategorie
 * anklicken, Breadcrumb, ...), bei der sich die Baumstruktur selbst
 * nicht aendert.
 */
export function updateSidebarActiveState() {
    var currentCat = ctx.getCurrentCat();
    qsa('.mp3-cat[data-cat]', ctx.sidebar).forEach(function (el) {
        var id = parseInt(el.getAttribute('data-cat'), 10);
        el.classList.toggle('mp3-cat-active', id === currentCat);
    });
    var altMissingNav = qs('.mp3-alt-missing-nav', ctx.sidebar);
    if (altMissingNav) {
        altMissingNav.classList.toggle('mp3-cat-active', !!ctx.getAltMissingActive());
    }
    closeCatMenu();
}

/**
 * Baut das Kategorie-Aktionsmenue (Umbenennen/Verschieben/Unterkategorie/
 * Loeschen) dynamisch in #mp3-cat-menu-portal und positioniert es an
 * anchorBtn. Portal statt Inline-Dropdown, weil overflow-y:auto der
 * Sidebar ein absolut positioniertes Kind sonst am Rand abschneidet.
 */
export function openCatMenu(id, name, anchorBtn) {
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
    // Massenaktionen fuer ALLE Dateien DIESER Kategorie (nicht die Kategorie
    // selbst) -- eigene Berechtigung (MediaPermission::hasBulkOperationsAccess(),
    // siehe getCanBulkOperations() im ctx-Vertrag), nicht an canManage
    // (Eltern-Zugriff fuer Umbenennen/Verschieben/Loeschen der Kategorie-
    // Struktur) gebunden -- Massenaktionen sind ein deutlich groesseres
    // Blast-Radius-Risiko als das reine Bearbeiten einzelner Dateien, das
    // schon ueber die normale Kategorie-Zugriffspruefung laeuft. Nur
    // Wurzelkategorie (id=0) ausgenommen: "alle Dateien ohne Kategorie
    // loeschen/verschieben" waere zu riskant als Ein-Klick-Aktion im Menue
    // einer Kategorie, die eigentlich fuer "kein Ordner" steht.
    if (id > 0 && ctx.getCanBulkOperations()) {
        html += '<div class="mp3-cat-menu-divider"></div>' +
            '<button class="mp3-cat-bulk-move-btn" data-bulk-cat="' + id + '" data-bulk-cat-name="' + escAttr(name) + '"><i class="fa-solid fa-arrow-right-arrow-left"></i> ' + t('mediaplace_bulk_move_files') + '</button>' +
            '<button class="mp3-cat-bulk-tag-btn" data-bulk-cat="' + id + '" data-bulk-cat-name="' + escAttr(name) + '"><i class="fa-solid fa-tag"></i> ' + t('mediaplace_bulk_add_tag') + '</button>' +
            '<button class="mp3-cat-bulk-collection-btn" data-bulk-cat="' + id + '" data-bulk-cat-name="' + escAttr(name) + '"><i class="fa-solid fa-bookmark"></i> ' + t('mediaplace_bulk_add_to_collection') + '</button>' +
            '<button class="mp3-cat-bulk-delete-btn" data-bulk-cat="' + id + '" data-bulk-cat-name="' + escAttr(name) + '"><i class="fa-solid fa-trash-can"></i> ' + t('mediaplace_bulk_delete_files') + '</button>';
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

export function closeCatMenu() {
    var portal = document.getElementById('mp3-cat-menu-portal');
    if (!portal) return;
    portal.classList.remove('mp3-cat-menu-portal-open');
    portal.removeAttribute('data-open-for');
    portal.innerHTML = '';
    qsa('.mp3-cat-menu-btn.mp3-cat-menu-btn-active', ctx.overlay).forEach(function (b) {
        b.classList.remove('mp3-cat-menu-btn-active');
    });
}

/**
 * Show an inline input field in the sidebar to create a new category.
 */
export function showCategoryInput(parentId) {
    var catCache = ctx.getCatCache();

    // Remove any existing input first
    var existing = qs('.mp3-cat-new-wrap', ctx.sidebar);
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
        var tree = qs('.mp3-cat-tree', ctx.sidebar);
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
        var parentNode = qs('.mp3-cat-node[data-cat-id="' + parentId + '"]', ctx.sidebar);
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
export function submitNewCategory(input) {
    var name = input.value.trim();
    if (!name) return;
    var parentId = parseInt(input.getAttribute('data-parent'), 10) || 0;
    input.disabled = true;
    var wrap = input.closest('.mp3-cat-new-wrap');
    var confirmBtn = wrap ? qs('.mp3-cat-new-confirm', wrap) : null;
    if (confirmBtn) confirmBtn.disabled = true;

    apiCreateCategory(name, parentId)
        .then(function () {
            ctx.setCatCache({});
            ctx.setCatPath([]);
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
export function expandCategoryPath(catId) {
    var catCache = ctx.getCatCache();
    var chain = [];
    var id = catId;
    while (id > 0 && catCache[id]) {
        chain.push(id);
        id = catCache[id].parent_id || 0;
    }
    chain.forEach(function (cid) {
        var node = qs('.mp3-cat-node[data-cat-id="' + cid + '"]', ctx.sidebar);
        if (node && !node.classList.contains('mp3-cat-node-open')) {
            toggleCategory(cid);
        }
    });
}

/**
 * Build the breadcrumb path from catCache by walking parent_id up.
 */
export function buildBreadcrumb(catId) {
    var catCache = ctx.getCatCache();
    var catPath = [];
    var id = catId;
    while (id > 0 && catCache[id]) {
        catPath.unshift({ id: id, name: catCache[id].name });
        id = catCache[id].parent_id || 0;
    }
    ctx.setCatPath(catPath);
    renderBreadcrumb();
}

export function renderBreadcrumb() {
    if (!ctx.breadcrumb) return;
    var catPath = ctx.getCatPath();
    var html = ctx.getCanAccessRootCategory()
        ? '<a class="mp3-bc-item" data-cat="0"><i class="fa-solid fa-house"></i></a>'
        : '<span class="mp3-bc-item mp3-bc-item-disabled" title="' + escAttr(t('mediaplace_root_media_no_access')) + '"><i class="fa-solid fa-house"></i></span>';
    for (var i = 0; i < catPath.length; i++) {
        html += ' <i class="fa-solid fa-chevron-right mp3-bc-sep"></i> ';
        html += '<a class="mp3-bc-item" data-cat="' + catPath[i].id + '">' + escAttr(catPath[i].name) + '</a>';
    }
    ctx.breadcrumb.innerHTML = html;
}

export function navigateToCategory(catId) {
    ctx.setCurrentCat(catId);
    localStorage.setItem('mp3_cat', String(catId));
    setActiveCollection(null);
    buildBreadcrumb(catId);
    updateSidebarActiveState();
    ctx.loadFiles(catId, true);
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
export function loadCategories() {
    // Aufklapp-Zustand vor dem Neuaufbau merken und danach wiederherstellen
    // -- der frisch vom Server gerenderte Baum ist immer komplett
    // eingeklappt (siehe renderTreeHtml()), sonst wuerde jeder Reload
    // (nach Umbenennen/Verschieben/Loeschen) den ganzen Baum zuklappen.
    var openIds = qsa('.mp3-cat-node.mp3-cat-node-open', ctx.sidebar).map(function (n) {
        return n.getAttribute('data-cat-id');
    });
    var mySession = ctx.getLoadSessionId();

    var baseUrl = getCategoriesApiUrl();
    var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'current_cat=' + ctx.getCurrentCat();
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
            if (mySession !== ctx.getLoadSessionId()) return;
            var list = Array.isArray(json.categories) ? json.categories : [];
            var catCache = {};
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                catCache[c.id] = { name: c.name, parent_id: c.parent_id || 0 };
            }
            ctx.setCatCache(catCache);
            renderCategories(typeof json.tree_html === 'string' ? json.tree_html : '');
            openIds.forEach(function (id) {
                var node = qs('.mp3-cat-node[data-cat-id="' + id + '"]', ctx.sidebar);
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
            if (mySession !== ctx.getLoadSessionId()) return;
            console.error('MP3 loadCategories error:', err);
            renderCategories('');
        });
}

/**
 * Kategorie im Baum auf-/zuklappen -- rein lokal (Klasse auf .mp3-cat-node
 * + Chevron-Icon umschalten), kein Request mehr: der ganze Baum ist seit
 * loadCategories() bereits im DOM, nur per CSS ausgeblendet
 * (.mp3-cat-children ohne .mp3-cat-node-open am Elternknoten, siehe
 * mediaplace.css).
 */
export function toggleCategory(catId) {
    var node = qs('.mp3-cat-node[data-cat-id="' + catId + '"]', ctx.sidebar);
    if (!node) return;
    var isOpen = node.classList.toggle('mp3-cat-node-open');
    var icon = qs('.mp3-cat-toggle[data-toggle-cat="' + catId + '"]', node);
    if (icon) {
        icon.classList.toggle('fa-chevron-right', !isOpen);
        icon.classList.toggle('fa-chevron-down', isOpen);
    }
}

export function categoryErrorMessage(err, fallbackKey) {
    if (err && 403 === err.status) {
        return t('mediaplace_cat_permission_denied');
    }
    return t(fallbackKey, { msg: err.message });
}

/**
 * Gleiches Modal-Muster wie showMoveCategoryModal() (Textfeld statt
 * Auswahlliste) -- kein prompt(), damit Umbenennen/Verschieben optisch
 * konsistent sind und keine System-Dialoge im Overlay auftauchen.
 */
export function showRenameCategoryModal(catId, catName) {
    var modalOverlay = document.createElement('div');
    modalOverlay.className = 'mp3-cat-move-modal-overlay';
    modalOverlay.innerHTML =
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
    document.body.appendChild(modalOverlay);

    var input = modalOverlay.querySelector('.mp3-cat-move-modal-input');
    var errorEl = modalOverlay.querySelector('.mp3-cat-move-modal-error');
    var okBtn = modalOverlay.querySelector('.mp3-cat-move-modal-ok');
    setTimeout(function () { input.focus(); input.select(); }, 0);

    function close() {
        if (modalOverlay.parentNode) modalOverlay.parentNode.removeChild(modalOverlay);
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
                var catCache = ctx.getCatCache();
                if (catCache[catId]) catCache[catId].name = nextName;
                buildBreadcrumb(ctx.getCurrentCat());
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

    modalOverlay.querySelector('.mp3-cat-move-modal-cancel').addEventListener('click', close);
    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) close();
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

export function showMoveCategoryModal(catId, catName) {
    // Build a modal that lets the user pick a new parent for this category
    var modalOverlay = document.createElement('div');
    modalOverlay.className = 'mp3-cat-move-modal-overlay';
    modalOverlay.innerHTML =
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
    document.body.appendChild(modalOverlay);

    var select = modalOverlay.querySelector('.mp3-cat-move-modal-select');
    var errorEl = modalOverlay.querySelector('.mp3-cat-move-modal-error');

    // "(Hauptverzeichnis)" nur anbieten, wenn der User ueberhaupt dorthin
    // verschieben darf (hasParentCategoryAccess(0), siehe canAccessRootCategory) --
    // sonst waere das Ziel im Picker waehlbar, das Verschieben serverseitig
    // aber immer mit 403 abgelehnt.
    var rootOption = ctx.getCanAccessRootCategory() ? ('<option value="0">' + t('mediaplace_root_category') + '</option>') : '';

    // Collect all sub-ids of catId to exclude them from picker. catCache
    // ist seit dem serverseitig gerenderten Baum nur noch eine flache
    // id -> {name, parent_id}-Map (siehe loadCategories()), daher hier
    // ueber alle Eintraege nach parent_id suchen statt eine verschachtelte
    // children-Liste zu durchlaufen.
    function collectSubIds(id) {
        var catCache = ctx.getCatCache();
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
            for (var d = 0; d < cat.depth; d++) indent += '  ';
            opts += '<option value="' + escAttr(String(cat.id)) + '">' + indent + escAttr(cat.name) + '</option>';
        }
        select.innerHTML = opts;
    }).catch(function () {
        select.innerHTML = rootOption;
    });

    function close() {
        if (modalOverlay.parentNode) modalOverlay.parentNode.removeChild(modalOverlay);
    }

    modalOverlay.querySelector('.mp3-cat-move-modal-cancel').addEventListener('click', close);
    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) close();
    });
    modalOverlay.querySelector('.mp3-cat-move-modal-ok').addEventListener('click', function () {
        var newParentId = parseInt(select.value || '0', 10);
        var okBtn = modalOverlay.querySelector('.mp3-cat-move-modal-ok');
        okBtn.disabled = true;
        okBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        errorEl.style.display = 'none';
        apiMoveCategory(catId, newParentId)
            .then(function () {
                ctx.setCatCache({});
                ctx.setCatPath([]);
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

/**
 * Massenaktionen fuer ALLE Dateien einer Kategorie (Verschieben/Loeschen/
 * Sammlung), siehe Api\CategoryBulk.php -- Gegenstueck zur Checkbox-
 * Mehrfachauswahl fuer Faelle, in denen die Dateiliste selbst (X-tausend
 * Dateien) nie vollstaendig geladen/dargestellt werden soll. Ausgeloest ueber
 * das Kategorie-Kontextmenue (openCatMenu()), nicht ueber eine Datei-Auswahl.
 */

/**
 * Eigenes, schlankes Fortschritts-Modal statt showConfirmModal(): der
 * Bestaetigen/Abbrechen-Vertrag von showConfirmModal() passt nicht, sobald
 * die Aktion einmal laeuft (kein "Abbrechen" mehr im ueblichen Sinn, sondern
 * ein fortlaufender Fortschrittsbalken + ein Button, der waehrend des Laufs
 * hart abbricht und danach zu "Schliessen" wird). Gleiches Grund-Markup
 * (.mp3-cat-move-modal-*) fuer optische Konsistenz.
 *
 * "In Benutzung"-Fehler kommen als fertiges, von REDAXO selbst erzeugtes
 * HTML (inkl. Links zu den referenzierenden Objekten, siehe
 * rex_mediapool::mediaIsInUse()) -- addErrors() rendert diese bewusst als
 * HTML (innerHTML), nicht als Text, sonst waeren die Links/Zeilenumbrueche
 * nur als sichtbarer Roh-HTML-Quelltext zu sehen. Der Dateiname selbst wird
 * separat und escaped als Ueberschrift gerendert, kein Roh-HTML von dort.
 * Kein max-height/overflow auf dem Fehler-Container: das Modal soll in der
 * Hoehe mitwachsen, ein Scroll-Feld waere hier keine Verbesserung.
 */
function showBulkProgressModal(title) {
    var overlay = document.createElement('div');
    overlay.className = 'mp3-cat-move-modal-overlay';
    overlay.innerHTML =
        '<div class="mp3-cat-move-modal mp3-bulk-progress-modal">' +
        '<h5 class="mp3-cat-move-modal-title"><i class="fa-solid fa-spinner fa-spin"></i> ' + escAttr(title) + '</h5>' +
        '<p class="mp3-cat-move-modal-info mp3-bulk-progress-text"></p>' +
        '<div class="mp3-bulk-progress-track"><div class="mp3-bulk-progress-fill" style="width:0%"></div></div>' +
        '<div class="mp3-bulk-progress-errors" style="display:none"></div>' +
        '<div class="mp3-cat-move-modal-actions">' +
        '<button type="button" class="mp3-cat-move-modal-cancel mp3-bulk-progress-close">' + escAttr(t('mediaplace_cancel')) + '</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var textEl = qs('.mp3-bulk-progress-text', overlay);
    var fillEl = qs('.mp3-bulk-progress-fill', overlay);
    var errorsEl = qs('.mp3-bulk-progress-errors', overlay);
    var titleIcon = qs('.mp3-cat-move-modal-title i', overlay);
    var closeBtn = qs('.mp3-bulk-progress-close', overlay);

    var cancelled = false;
    var finished = false;
    // AbortController fuer den GERADE LAUFENDEN Request -- "hart abbrechen"
    // heisst nicht nur "keinen naechsten Batch mehr starten" (das allein
    // liesse den bereits laufenden Request zu Ende laufen), sondern auch das
    // laufende fetch() selbst abbrechen.
    var currentAbort = null;

    function close() {
        if (currentAbort) currentAbort.abort();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    closeBtn.addEventListener('click', function () {
        if (finished) {
            close();
            return;
        }
        cancelled = true;
        if (currentAbort) currentAbort.abort();
        closeBtn.disabled = true;
    });

    return {
        isCancelled: function () {
            return cancelled;
        },
        // Vom Runner vor jedem Batch aufgerufen: liefert das AbortSignal fuer
        // genau DIESEN einen Request, damit ein Klick auf "Abbrechen"
        // waehrend ein Batch noch laeuft, den auch tatsaechlich sofort kappt.
        beginRequest: function () {
            currentAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            return currentAbort ? currentAbort.signal : null;
        },
        setProgress: function (processed, total) {
            textEl.textContent = t('mediaplace_bulk_progress', { processed: processed, total: total });
            var pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
            fillEl.style.width = pct + '%';
        },
        addErrors: function (errList) {
            if (!errList || !errList.length) return;
            errorsEl.style.display = '';
            errList.forEach(function (err) {
                var block = document.createElement('div');
                block.className = 'mp3-bulk-progress-error-item';
                // Kein eigener Dateiname-Vorspann mehr: die Meldung (egal ob
                // von REDAXO selbst wie bei "in Benutzung" oder von uns wie
                // bei "nicht gefunden", siehe Api\CategoryBulk.php) nennt den
                // Dateinamen bereits selbst -- ein zusaetzlicher fetter
                // Vorspann duplizierte ihn nur sichtbar.
                var messageHtml = (err && err.message) ? err.message : String(err);
                block.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><div class="mp3-bulk-progress-error-text">' + messageHtml + '</div>';
                errorsEl.appendChild(block);
            });
        },
        finish: function (finalText) {
            finished = true;
            titleIcon.className = 'fa-solid fa-circle-check';
            textEl.textContent = finalText;
            fillEl.style.width = '100%';
            closeBtn.disabled = false;
            closeBtn.textContent = t('mediaplace_close');
        }
    };
}

/**
 * Fuehrt eine Chunk-Aktion (move_batch/delete_batch) wiederholt aus, bis
 * entweder alle Dateien verarbeitet sind ODER ein Batch KEINEN einzigen
 * Erfolg hatte (succeeded=0) -- NICHT bis remaining=0, das koennte bei
 * dauerhaft gesperrten Dateien (z.B. "in Benutzung") nie eintreten. Frueher
 * wurde die Batch-GROESSE statt der tatsaechlichen Erfolge gezaehlt, wodurch
 * so ein Fall zu einer Endlosschleife fuehrte (live aufgetreten: derselbe
 * gesperrte Rest wurde jeden Batch erneut "verarbeitet", ohne je kleiner zu
 * werden). Chunking (Standard-Limit siehe Api\CategoryBulk::
 * BATCH_LIMIT_DEFAULT) schuetzt gegen PHP max_execution_time bei sehr
 * grossen Kategorien.
 */
function runChunkedBulkAction(actionName, categoryId, extraPayload, progress, doneLabelKey) {
    var succeededTotal = 0;

    function step() {
        if (progress.isCancelled()) {
            progress.finish(t('mediaplace_bulk_cancelled', { count: succeededTotal }));
            loadCategories();
            ctx.loadFiles(ctx.getCurrentCat(), true);
            return;
        }

        var payload = { category_id: categoryId, limit: 100 };
        for (var key in extraPayload) {
            if (Object.prototype.hasOwnProperty.call(extraPayload, key)) payload[key] = extraPayload[key];
        }
        var signal = progress.beginRequest();
        apiCategoryBulkAction(actionName, payload, signal)
            .then(function (result) {
                progress.addErrors(result.errors);
                var remaining = parseInt(result.remaining, 10) || 0;
                var succeededThisBatch = parseInt(result.succeeded, 10) || 0;
                succeededTotal += succeededThisBatch;
                progress.setProgress(succeededTotal, succeededTotal + remaining);
                if (remaining > 0 && succeededThisBatch > 0) {
                    step();
                } else {
                    progress.finish(t(doneLabelKey, { count: succeededTotal }));
                    if (remaining > 0) {
                        progress.addErrors([{ message: t('mediaplace_bulk_stopped_early', { count: remaining }) }]);
                    }
                    loadCategories();
                    ctx.loadFiles(ctx.getCurrentCat(), true);
                }
            })
            .catch(function (err) {
                if (err && 'AbortError' === err.name) {
                    // Bewusster Abbruch (Cancel-Klick) -- der GERADE laufende
                    // Request wurde hart gekappt, es kommt kein weiterer
                    // step()-Aufruf mehr (isCancelled() wird nirgends sonst
                    // mehr geprueft). finish() deshalb hier direkt aufrufen,
                    // sonst bliebe das Modal mit deaktiviertem Button und
                    // Dauer-Spinner haengen.
                    progress.finish(t('mediaplace_bulk_cancelled', { count: succeededTotal }));
                    loadCategories();
                    ctx.loadFiles(ctx.getCurrentCat(), true);
                    return;
                }
                progress.addErrors([{ message: escAttr(err.message) }]);
                progress.finish(t(doneLabelKey, { count: succeededTotal }));
            });
    }
    step();
}

export function startBulkMoveFiles(categoryId, categoryName) {
    showCategoryPickerModal({
        icon: 'fa-solid fa-arrow-right-arrow-left',
        title: escAttr(t('mediaplace_bulk_move_files')),
        hint: t('mediaplace_bulk_move_hint', { name: '<strong>' + escAttr(categoryName) + '</strong>' }),
        confirmLabel: escAttr(t('mediaplace_move')),
        onConfirm: function (targetCatId) {
            if (targetCatId === categoryId) return;
            var progress = showBulkProgressModal(t('mediaplace_bulk_move_files'));
            progress.setProgress(0, 0);
            runChunkedBulkAction('move_batch', categoryId, { target_category_id: targetCatId }, progress, 'mediaplace_bulk_move_done');
        }
    });
}

export function startBulkAddToCollection(categoryId, categoryName) {
    var existingNames = getCollectionsForCurrentCategory().map(function (c) { return c.name; });
    showPromptModal({
        icon: 'fa-bookmark',
        title: t('mediaplace_bulk_add_to_collection'),
        label: t('mediaplace_bulk_collection_hint', { name: '<strong>' + escAttr(categoryName) + '</strong>' }) +
            // Zusaetzlich zum <datalist>-Autocomplete unten (opts.datalist) noch
            // als Text sichtbar -- der kleine Dropdown-Pfeil eines <datalist>-
            // Inputs faellt nicht jedem sofort auf.
            (existingNames.length ? '<br><small>' + escAttr(t('mediaplace_bulk_collection_existing', { names: existingNames.join(', ') })) + '</small>' : ''),
        confirmLabel: t('mediaplace_save'),
        datalist: existingNames,
    }).then(function (name) {
        if (!name) return;
        apiCategoryBulkAction('add_to_collection', { category_id: categoryId, collection_name: name })
            .then(function (result) {
                // collectionCounts (siehe collections.js) wird sonst nur beim
                // normalen Datei-Laden (apiLoadSystemTagsForFiles() je geladener
                // Seite) sowie optimistisch +/-1 pro Einzeldatei-Toggle
                // aktualisiert (setFileCollectionMembership()) -- diese
                // Massenaktion aendert potenziell viele Dateien serverseitig auf
                // einen Schlag, ohne dass der Client die genaue Anzahl kennt.
                // Ohne diesen Refetch bliebe die Sidebar-Zahl auf dem alten
                // Stand haengen, bis irgendwann zufaellig eine Dateiliste neu
                // geladen wird (Bugreport: Sammlung hatte 8 Dateien, Sidebar
                // zeigte weiterhin 2). Leerer filenames-Aufruf reicht, die
                // Zaehler sind serverseitig ohnehin global (siehe
                // Api\Tags.php::collection_counts).
                apiLoadSystemTagsForFiles([]).then(function (payload) {
                    setCollectionCounts(payload.collection_counts);
                    refreshCollectionsSection();
                }).catch(function () {
                    refreshCollectionsSection();
                });
                showAlertModal({
                    icon: 'fa-circle-check',
                    title: t('mediaplace_bulk_add_to_collection'),
                    message: escAttr(t('mediaplace_bulk_collection_done', { count: result.affected }))
                });
            })
            .catch(function (err) {
                showAlertModal({ icon: 'fa-triangle-exclamation', title: t('mediaplace_error'), message: escAttr(err.message), dangerous: true });
            });
    });
}

/**
 * Bietet NUR bestehende Tags zur Auswahl an (kein Freitext/Neuanlegen) --
 * anders als startBulkAddToCollection(), das per showPromptModal() auch
 * neue Sammlungsnamen zulaesst. Tag-Katalog kommt aus dem bereits
 * client-seitig gecachten currentTagCatalog (siehe filters.js,
 * ueblicherweise durch vorherige Datei-/Detail-Ladevorgaenge befuellt),
 * kein eigener Fetch -- collectionTagToName() filtert Sammlungs- von
 * echten Tag-Eintraegen (beide teilen denselben Katalog, siehe
 * SystemTagManager::getCatalog()). Gleiches ".mp3-catpick-*"-Markup wie
 * showCategoryPickerModal() (modals.js), hier direkt gebaut statt dort
 * generalisiert, da die Optionsliste lokal/synchron vorliegt statt per
 * Server-Fetch.
 */
export function startBulkTagFiles(categoryId, categoryName) {
    var existingTags = getCurrentTagCatalog().filter(function (tag) {
        return !collectionTagToName(tag.name);
    });
    if (!existingTags.length) {
        showAlertModal({
            icon: 'fa-tag',
            title: t('mediaplace_bulk_add_tag'),
            message: escAttr(t('mediaplace_bulk_tag_none_available'))
        });
        return;
    }

    var modal = document.createElement('div');
    modal.className = 'mp3-catpick-modal';
    var optionsHtml = existingTags.map(function (tag) {
        return '<option value="' + escAttr(tag.name) + '">' + escAttr(tag.name) + '</option>';
    }).join('');
    modal.innerHTML =
        '<div class="mp3-catpick-box">' +
        '<div class="mp3-catpick-title"><i class="fa-solid fa-tag"></i> ' + escAttr(t('mediaplace_bulk_add_tag')) + '</div>' +
        '<p class="mp3-catpick-info">' + t('mediaplace_bulk_tag_hint', { name: '<strong>' + escAttr(categoryName) + '</strong>' }) + '</p>' +
        '<select class="mp3-catpick-select">' + optionsHtml + '</select>' +
        '<div class="mp3-catpick-actions">' +
        '<button type="button" class="mp3-catpick-cancel">' + escAttr(t('mediaplace_cancel')) + '</button>' +
        '<button type="button" class="mp3-catpick-confirm">' + escAttr(t('mediaplace_save')) + '</button>' +
        '</div>' +
        '</div>';
    ctx.overlay.appendChild(modal);

    var select = qs('.mp3-catpick-select', modal);

    modal.querySelector('.mp3-catpick-cancel').addEventListener('click', function () {
        modal.remove();
    });

    modal.querySelector('.mp3-catpick-confirm').addEventListener('click', function () {
        var tagName = select.value;
        modal.remove();
        if (!tagName) return;
        apiCategoryBulkAction('add_tag', { category_id: categoryId, tag_name: tagName })
            .then(function (result) {
                if (ctx.refreshTagFilterSection) ctx.refreshTagFilterSection();
                showAlertModal({
                    icon: 'fa-circle-check',
                    title: t('mediaplace_bulk_add_tag'),
                    message: escAttr(t('mediaplace_bulk_tag_done', { count: result.affected }))
                });
            })
            .catch(function (err) {
                showAlertModal({ icon: 'fa-triangle-exclamation', title: t('mediaplace_error'), message: escAttr(err.message), dangerous: true });
            });
    });
}

export function startBulkDeleteFiles(categoryId, categoryName) {
    apiCategoryBulkAction('count', { category_id: categoryId })
        .then(function (countResult) {
            var total = parseInt(countResult.total, 10) || 0;
            if (total === 0) {
                return showAlertModal({
                    icon: 'fa-circle-info',
                    title: t('mediaplace_bulk_delete_files'),
                    message: escAttr(t('mediaplace_bulk_delete_empty'))
                });
            }
            // Bewusst KEINE Eingabe des Kategorienamens zur Bestaetigung mehr
            // (fruehere Version) -- stattdessen eine deutliche, unmissverstaendliche
            // Warnung mit der echten Dateianzahl ueber showConfirmModal(), das
            // dieselbe "dangerous" (rot eingefaerbte) Optik nutzt wie das
            // Loeschen einer einzelnen Datei/Kategorie.
            return showConfirmModal({
                icon: 'fa-triangle-exclamation',
                title: t('mediaplace_bulk_delete_files'),
                message: t('mediaplace_bulk_delete_confirm_hint', { count: total, name: '<strong>' + escAttr(categoryName) + '</strong>' }),
                confirmLabel: t('mediaplace_delete'),
                dangerous: true,
                onConfirm: function (confirmCtx) {
                    confirmCtx.close();
                    var progress = showBulkProgressModal(t('mediaplace_bulk_delete_files'));
                    progress.setProgress(0, total);
                    runChunkedBulkAction('delete_batch', categoryId, {}, progress, 'mediaplace_bulk_delete_done');
                }
            });
        })
        .catch(function (err) {
            showAlertModal({ icon: 'fa-triangle-exclamation', title: t('mediaplace_error'), message: escAttr(err.message), dangerous: true });
        });
}
