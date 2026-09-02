/**
 * Sammlungen (Collections) -- Tags mit dem Praefix "collection:" (siehe
 * COLLECTION_TAG_PREFIX), keine eigene Tabelle. Siebte Extraktion aus
 * core.js (siehe DEV.md/Modularisierungs-Plan), nach dem gleichen Muster
 * wie modules/providers.js/modals.js/lightbox.js/focuspoint.js/cropper.js/
 * optimize.js.
 *
 * Groesste bisherige Extraktion: die generischen System-Tag-Helfer
 * (normalizeSystemTags/isCollectionTagName/splitSystemTags/
 * mergeUniqueSystemTags) werden zwar HIER definiert (Sammlungen sind der
 * Grund, warum Tags ueberhaupt in "normal" vs. "Sammlung" unterschieden
 * werden muessen), aber auch vom noch nicht extrahierten Detail-Panel/JSON-
 * Widget-System in core.js gebraucht -- werden also zurueck nach
 * core.js importiert (kein Zirkelbezug: die Abhaengigkeit geht nur in
 * eine Richtung, collections.js importiert nichts aus core.js).
 *
 * renameCollectionOnLoadedFiles()/deleteCollectionOnLoadedFiles() sind
 * unveraendert mit heruebergezogen, obwohl im aktuellen Code nirgends
 * aufgerufen (bereits im Original toter Code) -- reine Verschiebung, keine
 * Bereinigung in diesem Schritt.
 */

var ctx = null;
var activeCollectionId = null;
// Sammlungsname (ohne Praefix) -> Dateianzahl UEBER DEN GESAMTEN Medienpool
// (permissions-gefiltert serverseitig, siehe SystemTagManager::
// getCollectionCounts()) -- ersetzt seit dem Bugfix unten die vorherige,
// auf lastLoadedFiles (aktuelle Kategorie/Ansicht) beschraenkte Zaehlung in
// getCollectionsForCurrentCategory(), die je nach Kategorie faelschlich 0
// zeigte, obwohl die Sammlung anderswo Mitglieder hatte.
var collectionCounts = {};

var COLLECTION_TAG_PREFIX = 'collection:';

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var escAttr = MPCore.helpers.escAttr;
var qsa = MPCore.helpers.qsa;
var deepClone = MPCore.helpers.deepClone;
var apiSaveJsonMetainfo = MPCore.api.apiSaveJsonMetainfo;
var apiLoadJsonMetainfo = MPCore.api.apiLoadJsonMetainfo;
var apiCollectionCatalogAction = MPCore.api.apiCollectionCatalogAction;

/**
 * ctx-Vertrag:
 * - features: Objekt-Referenz (liest ctx.features.collections)
 * - getCurrentTagCatalog()/setCurrentTagCatalog(): Zugriff auf noch-legacy-State
 * - getLastLoadedFiles(): liefert die LIVE-Referenz (Elemente werden
 *   in-place mutiert, z.B. lastLoadedFiles[i].system_tags = ...)
 * - getSelectedFile(): noch-legacy-State
 * - setDetailOriginalSystemTags(): noch-legacy-State (Detail-Panel)
 * - closeCatMenu(): noch-legacy-Funktion (Kategorie-Domaene), nur fuer
 *   refreshCollectionsSection()
 * - refreshDisplay()/showDetail(): noch-legacy-Funktionen, nur fuer
 *   showManageCollectionsModal() (Grid + Detail-Panel nach Aenderung
 *   neu rendern)
 */
export function initCollections(theCtx) {
    ctx = theCtx;
    // activeCollectionId wird NICHT hier aus localStorage vorbelegt: das
    // muss bei JEDEM open() erneut passieren (siehe dortiger
    // setActiveCollection(...)-Aufruf), nicht nur einmalig bei build().
}

/**
 * Von core.js' loadFiles() nach jedem erfolgreichen Tags-Request
 * aufgerufen (siehe dortiges tagsPayload.collection_counts) -- haelt die
 * globalen Mitgliederzahlen synchron mit dem Katalog.
 */
export function setCollectionCounts(counts) {
    collectionCounts = (counts && typeof counts === 'object') ? counts : {};
}

export function sanitizeCollectionName(name) {
    var next = String(name || '').trim();
    if (!next) return '';
    next = next.replace(/^collection\s*:\s*/i, '');
    return next.slice(0, 60);
}

export function collectionNameToTag(name) {
    var clean = sanitizeCollectionName(name);
    if (!clean) return '';
    return COLLECTION_TAG_PREFIX + clean;
}

export function collectionTagToName(tagName) {
    var raw = String(tagName || '');
    if (raw.toLowerCase().indexOf(COLLECTION_TAG_PREFIX) !== 0) {
        return '';
    }
    return sanitizeCollectionName(raw.substring(COLLECTION_TAG_PREFIX.length));
}

export function normalizeSystemTags(tags) {
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

export function isCollectionTagName(tagName) {
    return String(tagName || '').toLowerCase().indexOf(COLLECTION_TAG_PREFIX) === 0;
}

export function splitSystemTags(tags) {
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

export function mergeUniqueSystemTags(tagsA, tagsB) {
    return normalizeSystemTags((Array.isArray(tagsA) ? tagsA : []).concat(Array.isArray(tagsB) ? tagsB : []));
}

function getCollectionTagColor(name) {
    var targetTag = collectionNameToTag(name);
    if (!targetTag) return '#4a90d9';
    var currentTagCatalog = ctx.getCurrentTagCatalog();
    for (var i = 0; i < currentTagCatalog.length; i++) {
        var item = currentTagCatalog[i] || {};
        if (String(item.name || '') === targetTag && /^#[0-9a-fA-F]{6}$/.test(String(item.color || ''))) {
            return String(item.color).toLowerCase();
        }
    }
    return '#4a90d9';
}

/**
 * Trotz des Namens (historisch, siehe unten) liefert diese Funktion die
 * Sammlungsliste UND ihre Mitgliederzahlen bereits seit jeher global (alle
 * bekannten Sammlungen aus currentTagCatalog, nicht auf die aktuelle
 * Kategorie beschraenkt) -- filesCount kam bis zu diesem Bugfix aber
 * faelschlich nur aus lastLoadedFiles (aktuelle Kategorie/Ansicht) statt aus
 * collectionCounts (global, permissions-gefiltert, siehe
 * setCollectionCounts()/SystemTagManager::getCollectionCounts()): eine
 * Sammlung ohne Mitglieder in der gerade betrachteten Kategorie zeigte dann
 * 0, obwohl sie anderswo Dateien enthielt.
 */
export function getCollectionsForCurrentCategory() {
    var map = {};
    var currentTagCatalog = ctx.getCurrentTagCatalog();

    for (var i = 0; i < currentTagCatalog.length; i++) {
        var tagItem = currentTagCatalog[i] || {};
        var name = collectionTagToName(tagItem.name || '');
        if (!name) continue;
        if (!map[name]) {
            map[name] = {
                id: name,
                name: name,
                color: /^#[0-9a-fA-F]{6}$/.test(String(tagItem.color || '')) ? String(tagItem.color).toLowerCase() : '#4a90d9',
                filesCount: parseInt(collectionCounts[name], 10) || 0
            };
        }
    }

    if (activeCollectionId && !map[activeCollectionId]) {
        map[activeCollectionId] = {
            id: activeCollectionId,
            name: activeCollectionId,
            color: '#4a90d9',
            filesCount: parseInt(collectionCounts[activeCollectionId], 10) || 0
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
    return ctx.getLastLoadedFiles().filter(function (f) {
        var tags = normalizeSystemTags(f.system_tags || []);
        for (var i = 0; i < tags.length; i++) {
            if (tags[i].name === tag) return true;
        }
        return false;
    });
}

function updateCachedFileSystemTags(filename, tags) {
    var normalized = normalizeSystemTags(tags);
    var lastLoadedFiles = ctx.getLastLoadedFiles();
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

// Unveraendert mituebernommen, obwohl aktuell nirgends aufgerufen (bereits
// im Original toter Code) -- siehe Docblock oben.
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

export function setFileCollectionMembership(filename, collectionName, enable) {
    if (!filename || !collectionName) {
        return Promise.resolve(false);
    }

    return apiLoadJsonMetainfo(filename)
        .then(function (meta) {
            var targetTag = collectionNameToTag(collectionName);
            var priorTags = normalizeSystemTags(meta.system_tags || []);
            var wasMember = priorTags.some(function (tg) { return tg.name === targetTag; });
            var tags = withCollectionMembership(priorTags, collectionName, enable);
            return apiSaveJsonMetainfo(filename, { __system_tags: tags })
                .then(function () {
                    updateCachedFileSystemTags(filename, tags);
                    if (ctx.getSelectedFile() === filename) {
                        ctx.setDetailOriginalSystemTags(deepClone(tags));
                    }
                    // Optimistisches Update von collectionCounts (global,
                    // siehe setCollectionCounts()) -- nur wenn sich die
                    // Mitgliedschaft tatsaechlich geaendert hat, sonst wuerde
                    // ein wiederholter Aufruf mit demselben enable-Wert den
                    // Zaehler faelschlich weiter hoch-/runterzaehlen.
                    if (wasMember !== !!enable) {
                        collectionCounts[collectionName] = Math.max(0, (parseInt(collectionCounts[collectionName], 10) || 0) + (enable ? 1 : -1));
                    }
                    return true;
                });
        });
}

export function getActiveCollectionId() {
    return activeCollectionId;
}

export function getActiveCollection() {
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

export function setActiveCollection(id) {
    activeCollectionId = id ? String(id) : null;
    if (activeCollectionId) {
        localStorage.setItem('mp_active_collection', activeCollectionId);
    } else {
        localStorage.removeItem('mp_active_collection');
    }
}

export function createCollection(catId, name) {
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
        ctx.setCurrentTagCatalog(Array.isArray(json.catalog) ? json.catalog : ctx.getCurrentTagCatalog());
        return { id: clean, name: clean, filesCount: 0, color: '#4a90d9' };
    });
}

export function renameCollection(catId, colId, name) {
    var oldName = sanitizeCollectionName(colId);
    var clean = sanitizeCollectionName(name);
    if (!oldName || !clean) return Promise.resolve(0);
    if (oldName.toLowerCase() === clean.toLowerCase()) return Promise.resolve(0);

    return apiCollectionCatalogAction('collection_rename', {
        old_name: collectionNameToTag(oldName),
        new_name: collectionNameToTag(clean)
    }).then(function (json) {
        ctx.setCurrentTagCatalog(Array.isArray(json.catalog) ? json.catalog : ctx.getCurrentTagCatalog());
        var updated = parseInt(json.affected_files, 10) || 0;

        var lastLoadedFiles = ctx.getLastLoadedFiles();
        for (var i = 0; i < lastLoadedFiles.length; i++) {
            var tags = withCollectionMembership(lastLoadedFiles[i].system_tags || [], oldName, false);
            tags = withCollectionMembership(tags, clean, true);
            lastLoadedFiles[i].system_tags = tags;
        }

        if (String(activeCollectionId).toLowerCase() === oldName.toLowerCase()) {
            setActiveCollection(clean);
        }

        // Zaehler unter dem neuen Namen weiterfuehren statt auf 0
        // zurueckzufallen, bis der naechste loadFiles()-Tags-Request
        // frische collection_counts liefert.
        if (Object.prototype.hasOwnProperty.call(collectionCounts, oldName)) {
            collectionCounts[clean] = collectionCounts[oldName];
            delete collectionCounts[oldName];
        }

        return updated;
    });
}

export function deleteCollection(catId, colId) {
    var name = sanitizeCollectionName(colId);
    if (!name) return Promise.resolve(0);

    return apiCollectionCatalogAction('collection_delete', {
        name: collectionNameToTag(name)
    }).then(function (json) {
        ctx.setCurrentTagCatalog(Array.isArray(json.catalog) ? json.catalog : ctx.getCurrentTagCatalog());
        var updated = parseInt(json.affected_files, 10) || 0;

        var lastLoadedFiles = ctx.getLastLoadedFiles();
        for (var i = 0; i < lastLoadedFiles.length; i++) {
            lastLoadedFiles[i].system_tags = withCollectionMembership(lastLoadedFiles[i].system_tags || [], name, false);
        }

        if (String(activeCollectionId).toLowerCase() === name.toLowerCase()) {
            setActiveCollection(null);
        }

        delete collectionCounts[name];

        return updated;
    });
}

function isSectionCollapsed(key) {
    try {
        return localStorage.getItem('mp_sidebar_collapsed_' + key) === '1';
    } catch (e) {
        return false;
    }
}

export function renderCollectionsSection() {
    var list = getCollectionsForCurrentCategory();
    var collapsed = isSectionCollapsed('collections');
    var html = '<div class="mp-sidebar-section mp-collections-wrap' + (collapsed ? ' mp-sidebar-section-collapsed' : '') + '" data-section="collections">';
    html += '<div class="mp-collections-head mp-sidebar-section-head">';
    html += '<span class="mp-collections-title mp-sidebar-section-title"><i class="fa-solid fa-photo-film"></i> ' + t('mediaplace_collections') + '</span>';
    html += '<button type="button" class="mp-collection-add-btn" title="' + escAttr(t('mediaplace_create_collection')) + '"><i class="fa-solid fa-plus"></i></button>';
    html += '<button type="button" class="mp-sidebar-section-toggle" data-section="collections" title="' + escAttr(t('mediaplace_toggle_section')) + '"><i class="fa-solid fa-chevron-down"></i></button>';
    html += '</div>';
    html += '<div class="mp-sidebar-section-body">';

    if (!list.length) {
        html += '<div class="mp-collection-empty">' + t('mediaplace_no_collections_yet') + '</div>';
    } else {
        html += '<div class="mp-collections-list">';
        for (var i = 0; i < list.length; i++) {
            var col = list[i];
            html += '<div class="mp-collection-row">';
            html += '<a class="mp-collection' + (String(activeCollectionId || '').toLowerCase() === String(col.id || '').toLowerCase() ? ' mp-collection-active' : '') + '" data-collection-id="' + escAttr(col.id) + '">';
            html += '<i class="fa-solid fa-compact-disc"></i> ' + escAttr(col.name) + ' <span class="mp-collection-count">' + (parseInt(col.filesCount, 10) || 0) + '</span>';
            html += '</a>';
            html += '<button type="button" class="mp-collection-rename-btn" data-collection-id="' + escAttr(col.id) + '" title="' + escAttr(t('mediaplace_rename_collection')) + '"><i class="fa-solid fa-pen"></i></button>';
            html += '<button type="button" class="mp-collection-delete-btn" data-collection-id="' + escAttr(col.id) + '" title="' + escAttr(t('mediaplace_delete_collection')) + '"><i class="fa-solid fa-trash-can"></i></button>';
            html += '</div>';
        }
        html += '</div>';
    }

    html += '</div>'; // .mp-sidebar-section-body
    html += '</div>'; // .mp-collections-wrap
    return html;
}

export function applyCollectionFilter(files) {
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

/**
 * Nur den Sammlungen-Abschnitt neu rendern (Mitgliederzahl, aktive
 * Sammlung, ...) -- der Kategorie-Baum kommt vom Server und aendert sich
 * dabei nicht, ein voller loadCategories()-Request waere unnoetig.
 */
export function refreshCollectionsSection() {
    if (!ctx.features.collections) return;
    var section = document.getElementById('mp-collections-section');
    if (section) section.innerHTML = renderCollectionsSection();
    ctx.closeCatMenu();
}

/**
 * Sammlungs-Mitgliedschaft fuer GENAU EINE Datei per Mehrfachauswahl
 * verwalten -- Ersatz fuer das fruehere Lesezeichen-Icon-System (siehe
 * CHANGELOG): das funktionierte nur, waehrend eine Sammlung "aktiv" war,
 * und Kategorie-Browsen deaktiviert eine aktive Sammlung XOR-bedingt immer
 * (siehe navigateToCategory()) -- ein Medium waehrend des normalen
 * Kategorie-Browsens zu einer Sammlung hinzuzufuegen war so nie moeglich.
 * Dieser Dialog (Button im Detail-Panel, siehe detail_actions.php) ist
 * unabhaengig vom aktiven Kategorie-/Sammlungs-Modus immer erreichbar.
 */
export function showManageCollectionsModal(filename) {
    if (!filename) return;

    var allCollections = getCollectionsForCurrentCategory();

    var modal = document.createElement('div');
    modal.className = 'mp-cat-move-modal-overlay';
    modal.innerHTML =
        '<div class="mp-cat-move-modal">' +
        '<h5 class="mp-cat-move-modal-title"><i class="fa-solid fa-bookmark"></i> ' + t('mediaplace_manage_collections') + '</h5>' +
        '<p class="mp-cat-move-modal-info">' + t('mediaplace_manage_collections_for', { name: '<strong>' + escAttr(filename) + '</strong>' }) + '</p>' +
        '<div class="mp-collection-picker-list">' +
        (allCollections.length ? '' : '<div class="mp-collection-empty">' + escAttr(t('mediaplace_no_collections_yet')) + '</div>') +
        '</div>' +
        '<p class="mp-cat-move-modal-error" style="display:none"></p>' +
        '<div class="mp-cat-move-modal-actions">' +
        '<button class="mp-cat-move-modal-ok btn btn-primary btn-sm" disabled>' + escAttr(t('mediaplace_save')) + '</button>' +
        '<button class="mp-cat-move-modal-cancel btn btn-default btn-sm">' + t('mediaplace_cancel') + '</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);

    var listEl = modal.querySelector('.mp-collection-picker-list');
    var errorEl = modal.querySelector('.mp-cat-move-modal-error');
    var okBtn = modal.querySelector('.mp-cat-move-modal-ok');
    var okLabel = escAttr(t('mediaplace_save'));

    function close() {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
    }
    modal.querySelector('.mp-cat-move-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
    });

    if (!allCollections.length) return;

    apiLoadJsonMetainfo(filename).then(function (meta) {
        var split = splitSystemTags(meta.system_tags || []);
        var currentNames = {};
        split.collections.forEach(function (tag) {
            var name = collectionTagToName(tag.name);
            if (name) currentNames[name.toLowerCase()] = true;
        });

        var html = '';
        for (var i = 0; i < allCollections.length; i++) {
            var col = allCollections[i];
            var checked = !!currentNames[String(col.name).toLowerCase()];
            html += '<label class="mp-collection-picker-item">' +
                '<input type="checkbox" class="mp-collection-picker-checkbox" value="' + escAttr(col.name) + '"' + (checked ? ' checked' : '') + '>' +
                '<span class="mp-collection-picker-name">' + escAttr(col.name) + '</span>' +
                '</label>';
        }
        listEl.innerHTML = html;
        okBtn.disabled = false;

        okBtn.addEventListener('click', function () {
            var checkboxes = qsa('.mp-collection-picker-checkbox', listEl);
            var jobs = [];
            checkboxes.forEach(function (cb) {
                var name = cb.value;
                var wasMember = !!currentNames[name.toLowerCase()];
                if (wasMember !== cb.checked) {
                    jobs.push(setFileCollectionMembership(filename, name, cb.checked));
                }
            });
            if (!jobs.length) {
                close();
                return;
            }
            okBtn.disabled = true;
            okBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            errorEl.style.display = 'none';
            Promise.all(jobs)
                .then(function () {
                    close();
                    refreshCollectionsSection();
                    ctx.refreshDisplay();
                    ctx.showDetail(filename);
                })
                .catch(function (err) {
                    errorEl.textContent = t('mediaplace_error_updating_collection', { msg: err.message });
                    errorEl.style.display = '';
                    okBtn.disabled = false;
                    okBtn.innerHTML = okLabel;
                });
        });
    }).catch(function (err) {
        listEl.innerHTML = '<div class="mp-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
    });
}
