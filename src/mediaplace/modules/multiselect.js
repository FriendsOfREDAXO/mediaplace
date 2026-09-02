/**
 * Multi-Select-Helfer: Widget-Mehrfachauswahl (multiSelected) UND die
 * normale Mehrfachauswahl per Checkbox-Umschalter/Ctrl+Klick
 * (collectionDragSelected, siehe batchSelectMode). Extraktion aus core.js
 * (siehe DEV.md/Modularisierungs-Plan), Phase 12.
 */

var MPCore = window.MPCore;
var t = MPCore.i18n.t;
var qs = MPCore.helpers.qs;
var qsa = MPCore.helpers.qsa;

var ctx = null;

/**
 * ctx-Vertrag:
 * - grid/overlay/batchFooter/multiFooter: DOM-Refs
 * - getCollectionDragSelected()/setCollectionDragSelected(v): noch-legacy-State
 * - getBatchSelectModeState()/setBatchSelectModeState(v): noch-legacy-State
 *   (Getter-Name bewusst nicht "getBatchSelectMode"/"setBatchSelectMode" --
 *   das ist der Name der hier exportierten Funktion, siehe unten)
 * - getMultiSelected()/setMultiSelected(v): noch-legacy-State
 * - refreshDisplay(): noch-legacy-Funktion
 * - getActiveCollectionId(): aus modules/collections.js, direkt durchgereicht
 *   (steuert, ob Verschieben/Loeschen oder "Aus Sammlung entfernen" gezeigt wird)
 */
export function initMultiselect(theCtx) {
    ctx = theCtx;
}

function getVisibleFilenames() {
    var grid = ctx.grid;
    var filenames = [];
    qsa('.mp-card, .mp-list-row, .mp-masonry-card', grid).forEach(function (el) {
        var fn = el.getAttribute('data-filename');
        if (fn) filenames.push(fn);
    });
    return filenames;
}

export function updateCollectionDragSelectionUI() {
    var grid = ctx.grid;
    var batchFooter = ctx.batchFooter;
    var collectionDragSelected = ctx.getCollectionDragSelected();
    var batchSelectMode = ctx.getBatchSelectModeState();

    qsa('.mp-card', grid).forEach(function (c) {
        var fn = c.getAttribute('data-filename');
        var isSel = !!collectionDragSelected[fn];
        c.classList.toggle('mp-card-multi-selected', isSel);
        if (batchSelectMode) {
            var chk = qs('.mp-card-check i', c);
            if (chk) chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
        }
    });

    qsa('.mp-list-row', grid).forEach(function (r) {
        var fn = r.getAttribute('data-filename');
        var isSel = !!collectionDragSelected[fn];
        r.classList.toggle('mp-list-row-multi-selected', isSel);
        if (batchSelectMode) {
            var chk = qs('.mp-list-cell-check i', r);
            if (chk) chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
        }
    });

    qsa('.mp-masonry-card', grid).forEach(function (m) {
        var fn = m.getAttribute('data-filename');
        var isSel = !!collectionDragSelected[fn];
        m.classList.toggle('mp-masonry-card-multi', isSel);
        if (batchSelectMode) {
            var chk = qs('.mp-masonry-check i', m);
            if (chk) chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
        }
    });

    if (batchFooter) {
        var count = Object.keys(collectionDragSelected).length;
        // Footer erscheint, sobald entweder der Auswahl-Modus aktiv ist
        // (Toolbar-Button, siehe setBatchSelectMode()) oder -- wie bisher --
        // per Ctrl/Cmd+Klick schon mindestens eine Datei markiert wurde.
        batchFooter.style.display = (batchSelectMode || count > 0) ? '' : 'none';
        var batchCountEl = qs('.mp-batch-count', batchFooter);
        if (batchCountEl) batchCountEl.textContent = t('mediaplace_files_selected_dynamic', { count: count, unit: (1 === count ? t('mediaplace_file_singular') : t('mediaplace_file_plural')) });

        var visible = getVisibleFilenames();
        var allSelected = visible.length > 0 && visible.every(function (fn) { return !!collectionDragSelected[fn]; });
        var batchSelAllBtn = qs('.mp-batch-select-all', batchFooter);
        if (batchSelAllBtn) {
            var batchSelAllLabel = allSelected ? t('mediaplace_deselect_all') : t('mediaplace_select_all');
            batchSelAllBtn.innerHTML = '<i class="fa-solid ' + (allSelected ? 'fa-square' : 'fa-square-check') + '"></i> ' + batchSelAllLabel;
            batchSelAllBtn.title = batchSelAllLabel;
        }

        // Innerhalb einer aktiven Sammlung sind Verschieben/Loeschen keine
        // sinnvollen Sammlungs-Aktionen (Loeschen loescht die Dateien
        // komplett aus dem Medienpool, nicht nur aus der Sammlung -- genau
        // dieser Verwechslung soll hier vorgebeugt werden) -- stattdessen
        // nur "Aus Sammlung entfernen" zeigen.
        var inCollection = !!ctx.getActiveCollectionId();
        var moveBtn = qs('.mp-batch-move-btn', batchFooter);
        var deleteBtn = qs('.mp-batch-delete-btn', batchFooter);
        var removeFromCollectionBtn = qs('.mp-batch-remove-from-collection-btn', batchFooter);
        if (moveBtn) moveBtn.style.display = inCollection ? 'none' : '';
        if (deleteBtn) deleteBtn.style.display = inCollection ? 'none' : '';
        if (removeFromCollectionBtn) removeFromCollectionBtn.style.display = inCollection ? '' : 'none';
    }
}

// Touch-taugliche/entdeckbare Alternative zur Ctrl/Cmd+Klick-Geste (siehe
// Toolbar-Button .mp-select-mode-toggle): schaltet die Checkbox-Overlays
// auf allen Kacheln/Zeilen sichtbar, normaler Klick waehlt dann direkt aus.
export function setBatchSelectMode(enabled) {
    var overlay = ctx.overlay;
    var isEnabled = !!enabled;
    ctx.setBatchSelectModeState(isEnabled);
    if (!isEnabled) {
        ctx.setCollectionDragSelected({});
    }
    var btn = qs('.mp-select-mode-toggle', overlay);
    if (btn) btn.classList.toggle('mp-select-mode-active', isEnabled);
    ctx.refreshDisplay();
}

export function toggleCollectionDragSelection(filename) {
    if (!filename) return;
    var collectionDragSelected = ctx.getCollectionDragSelected();
    if (collectionDragSelected[filename]) {
        delete collectionDragSelected[filename];
    } else {
        collectionDragSelected[filename] = true;
    }
    updateCollectionDragSelectionUI();
}

export function clearCollectionDragSelection() {
    ctx.setCollectionDragSelected({});
    updateCollectionDragSelectionUI();
}

export function toggleCollectionDragSelectAll() {
    var collectionDragSelected = ctx.getCollectionDragSelected();
    var visible = getVisibleFilenames();
    var allSelected = visible.length > 0 && visible.every(function (fn) { return !!collectionDragSelected[fn]; });
    if (allSelected) {
        visible.forEach(function (fn) { delete collectionDragSelected[fn]; });
    } else {
        visible.forEach(function (fn) { collectionDragSelected[fn] = true; });
    }
    updateCollectionDragSelectionUI();
}

export function toggleSelectAll() {
    var multiSelected = ctx.getMultiSelected();
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

export function updateMultiUI() {
    var grid = ctx.grid;
    var multiFooter = ctx.multiFooter;
    var multiSelected = ctx.getMultiSelected();
    var keys = Object.keys(multiSelected);
    var count = keys.length;
    var visible = getVisibleFilenames();
    var allSelected = visible.length > 0 && visible.every(function (fn) { return !!multiSelected[fn]; });

    // Update select-all button text -- erscheint erst, wenn bereits
    // mindestens eine Datei manuell ausgewaehlt wurde, kein dauerhaft
    // sichtbarer Einstiegspunkt direkt bei leerer Auswahl.
    var selAllBtn = qs('.mp-multi-select-all', multiFooter);
    if (selAllBtn) {
        selAllBtn.style.display = count > 0 ? '' : 'none';
        var multiSelAllLabel = allSelected ? t('mediaplace_deselect_all') : t('mediaplace_select_all');
        selAllBtn.innerHTML = '<i class="fa-solid ' + (allSelected ? 'fa-square' : 'fa-square-check') + '"></i> ' + multiSelAllLabel;
        selAllBtn.title = multiSelAllLabel;
    }

    // Update footer
    if (multiFooter) {
        var countEl = qs('.mp-multi-count', multiFooter);
        if (countEl) {
            countEl.textContent = t('mediaplace_files_selected_dynamic', { count: count, unit: (1 === count ? t('mediaplace_file_singular') : t('mediaplace_file_plural')) });
        }
    }

    // Update card checkboxes
    qsa('.mp-card', grid).forEach(function (c) {
        var fn = c.getAttribute('data-filename');
        var isSel = !!multiSelected[fn];
        c.classList.toggle('mp-card-multi-selected', isSel);
        var chk = qs('.mp-card-check i', c);
        if (chk) {
            chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
        }
    });

    // Update list row checkboxes
    qsa('.mp-list-row', grid).forEach(function (r) {
        var fn = r.getAttribute('data-filename');
        var isSel = !!multiSelected[fn];
        r.classList.toggle('mp-list-row-multi-selected', isSel);
        var chk = qs('.mp-list-cell-check i', r);
        if (chk) {
            chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
        }
    });

    // Update masonry checks
    qsa('.mp-masonry-card', grid).forEach(function (r) {
        var fn = r.getAttribute('data-filename');
        var isSel = !!multiSelected[fn];
        r.classList.toggle('mp-masonry-card-multi', isSel);
        var chk = qs('.mp-masonry-check i', r);
        if (chk) {
            chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
        }
    });
}
