/**
 * Upload: Drag&Drop (inkl. rekursivem Ordner-Upload), Datei-Auswahl-Dialog,
 * Clipboard-Paste, sequenzieller Upload mit Fortschrittsanzeige. Extraktion
 * aus core.js (siehe DEV.md/Modularisierungs-Plan), Phase 11.
 *
 * readClipboardAndUpload() ist bereits VOR der Extraktion toter Code (nutzt
 * die Clipboard-Read-API, aufgerufen wird aber nirgends -- der tatsaechlich
 * aktive Paste-Weg ist der 'paste'-Event-Listener in core.js's build(),
 * ueber e.clipboardData). Unveraendert mituebernommen (reine Extraktion,
 * keine Verhaltensaenderung), nicht Gegenstand dieser Phase.
 */

import { getActiveCollection, setFileCollectionMembership } from './collections.js';
import { showCategoryPickerModal } from './modals.js';
import { loadCategories } from './categories.js';

var ctx = null;

var MP3Core = window.MP3Core;
var t = MP3Core.i18n.t;
var escAttr = MP3Core.helpers.escAttr;
var qs = MP3Core.helpers.qs;
var isImage = MP3Core.helpers.isImage;
var fileIcon = MP3Core.helpers.fileIcon;
var formatBytes = MP3Core.helpers.formatBytes;
var isResizableImageType = MP3Core.helpers.isResizableImageType;
var resizeImageFile = MP3Core.helpers.resizeImageFile;
var apiUpload = MP3Core.api.apiUpload;
var resolveFolderCategories = MP3Core.api.resolveFolderCategories;

/**
 * ctx-Vertrag:
 * - grid/gridWrap: DOM-Refs
 * - getCurrentCat(): noch-legacy-State
 * - setCatCache(v)/setCatPath(v): noch-legacy-State (nur geschrieben, nach
 *   Ordner-Upload-Kategorieanlage wird der Kategoriebaum-Cache invalidiert)
 * - getFeatures(): noch-legacy-State (features.uploadResize)
 * - getUploadResizeWidth()/getUploadResizeHeight(): noch-legacy-State
 * - loadFiles(catId, reset): noch-legacy-Funktion
 */
export function initUpload(theCtx) {
    ctx = theCtx;
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
export function readDroppedItems(dataTransferItems) {
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
export function doUpload(fileList) {
    if (!fileList || !fileList.length) return;

    var files = Array.prototype.slice.call(fileList);
    var currentCat = ctx.getCurrentCat();

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
export function doFolderUpload(entries) {
    if (!entries || !entries.length) return;

    var currentCat = ctx.getCurrentCat();

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
            ctx.setCatCache({});
            ctx.setCatPath([]);
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
    var gridWrap = ctx.gridWrap;
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

// Gleiches Prinzip wie categoryErrorMessage(), fuer Datei- statt
// Kategorie-Operationen (Upload/Loeschen/Verschieben). Faengt insbesondere
// den Fall ab, dass die installierte FriendsOfRedaxo/api-Version
// permitted_only noch nicht kaskadierend auswertet (siehe apiUpload()/
// apiDelete()/apiUpdate() in mediaplace-api.js) -- ein 403 beim Arbeiten
// in einer Unterkategorie einer freigegebenen Kategorie ist dann kein
// unerwarteter Fehler, sondern genau dieser (bekannte, temporaere) Fall.
export function mediaErrorMessage(err, fallbackKey) {
    if (err && 403 === err.status) {
        return t('mediaplace_media_permission_denied');
    }
    return t(fallbackKey, { msg: err.message });
}

function showCollectionUploadCategoryPicker(files, collection) {
    var colName = collection ? collection.name : '';
    showCategoryPickerModal({
        icon: 'fa-solid fa-folder-open',
        title: t('mediaplace_pick_upload_category'),
        hint: t('mediaplace_upload_category_hint', { name: '<strong>' + escAttr(colName) + '</strong>' }),
        confirmLabel: t('mediaplace_upload'),
        onConfirm: function (catId) {
            startUpload(files, catId, collection ? collection.name : null);
        }
    });
}

// isResizableImageType()/resizeImageFile() leben in MP3Core.helpers (geteilt
// mit mediaplace_widget.js fuer dessen eigenen Direkt-Upload).
function maybeResizeUploadFile(file) {
    var features = ctx.getFeatures();
    if (!features.uploadResize || !isResizableImageType(file.type)) {
        return Promise.resolve(file);
    }
    return resizeImageFile(file, ctx.getUploadResizeWidth(), ctx.getUploadResizeHeight());
}

function startUpload(files, catId, assignToCollectionName) {
    var grid = ctx.grid;

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
                setTimeout(function () { ctx.loadFiles(ctx.getCurrentCat(), true); }, 1500);
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
    var gridWrap = ctx.gridWrap;
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
