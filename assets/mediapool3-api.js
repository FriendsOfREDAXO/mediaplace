/**
 * MediaPlace -- API-Schicht (reine Funktionen, kein Modul-State).
 * Ausgelagert aus mediapool3.js (Stufe C, Teil 1): alle Funktionen hier
 * nehmen ihre Daten ueber Parameter/Rueckgabewerte entgegen, ohne auf die
 * geteilten Overlay-Statusvariablen (currentCat, selectedFile, ...)
 * zuzugreifen -- deshalb per einfachem Alias in mediapool3.js einbindbar
 * (var apiFetch = MP3Core.api.apiFetch; usw.), ohne dass mediapool3.js
 * selbst umgebaut werden musste.
 */
(function (Core) {
    'use strict';

    Core.api = Core.api || {};

    var API_BASE = '/api/backend/';

    // Ab dieser Groesse wird chunked hochgeladen statt in einem Request. Der
    // einfache Weg (POST media, multipart) haengt an upload_max_filesize/
    // post_max_size, die das JS nicht kennt (kein Extra-Request zur Erkennung) --
    // 20 MiB liegt sicher ueber typischen Kleininstallations-Defaults, chunked
    // Upload funktioniert unabhaengig davon, solange jeder Chunk drunter bleibt.
    var CHUNK_UPLOAD_THRESHOLD = 20 * 1024 * 1024;
    var CHUNK_UPLOAD_SIZE = 4 * 1024 * 1024;

    function getCategoriesApiUrl() {
        var root = document.getElementById('mp3-root');
        var baseUrl = root ? root.dataset.categoriesUrl : null;
        if (!baseUrl) {
            baseUrl = 'index.php?rex-api-call=mediaplace_categories';
        }
        return baseUrl;
    }

    function apiFetchAllCategoriesFlat() {
        return fetch(getCategoriesApiUrl(), {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (json) {
            return Array.isArray(json.categories) ? json.categories : [];
        });
    }

    function getUnusedApiUrl() {
        var root = document.getElementById('mp3-root');
        var baseUrl = root ? root.dataset.unusedUrl : null;
        if (!baseUrl) {
            baseUrl = 'index.php?rex-api-call=mediaplace_unused';
        }
        return baseUrl;
    }

    // Prueft eine Liste von Dateinamen (typischerweise eine bereits geladene
    // Ergebnisseite) darauf, welche davon unbenutzt sind -- siehe
    // rex_api_mediaplace_unused.php. Absichtlich pro Seite statt fuer
    // den ganzen Bestand auf einmal (siehe dortiger Kommentar zu den Kosten
    // von rex_mediapool::mediaIsInUse()).
    function apiCheckUnusedMedia(filenames) {
        if (!filenames || !filenames.length) return Promise.resolve([]);
        var url = getUnusedApiUrl() + (getUnusedApiUrl().indexOf('?') === -1 ? '?' : '&') + 'filenames=' + encodeURIComponent(filenames.join(','));
        return fetch(url, {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (json) {
            return Array.isArray(json.unused) ? json.unused : [];
        });
    }

    function apiMoveCategory(catId, newParentId) {
        return fetch(getCategoriesApiUrl(), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ id: catId, parent_id: newParentId })
        })
        .then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.error || 'HTTP ' + r.status);
                return body;
            });
        });
    }

    function getTagsApiUrl(params) {
        var root = document.getElementById('mp3-root');
        var baseUrl = root ? root.dataset.tagsUrl : null;
        if (!baseUrl) {
            baseUrl = 'index.php?rex-api-call=mediaplace_tags';
        }
        var query = [];
        var keys = Object.keys(params || {});
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (params[key] === null || params[key] === undefined || params[key] === '') continue;
            query.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key])));
        }
        if (query.length) {
            baseUrl += (baseUrl.indexOf('?') === -1 ? '?' : '&') + query.join('&');
        }
        return baseUrl;
    }

    function apiCollectionCatalogAction(action, payload) {
        var body = payload && typeof payload === 'object' ? payload : {};
        body.action = action;

        return fetch(getTagsApiUrl({}), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        })
        .then(function (r) {
            if (!r.ok) {
                return r.json().then(function (json) {
                    throw new Error((json && json.error) ? json.error : ('HTTP ' + r.status));
                });
            }
            return r.json();
        });
    }

    function apiLoadSystemTagsForFiles(filenames) {
        var params = {};
        if (filenames && filenames.length) {
            params.filenames = filenames.join(',');
        }

        return fetch(getTagsApiUrl(params), {
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (json) {
            return {
                file_tags: (json && typeof json.file_tags === 'object' && json.file_tags) ? json.file_tags : {},
                catalog: Array.isArray(json.catalog) ? json.catalog : []
            };
        });
    }

    function apiFetch(endpoint) {
        return fetch(API_BASE + endpoint, {
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (json) {
            return json.data || json;
        });
    }

    function apiFetchRaw(endpoint) {
        return fetch(API_BASE + endpoint, {
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiUpload(file, catId, onProgress) {
        if (file.size > CHUNK_UPLOAD_THRESHOLD) {
            return apiUploadChunked(file, catId, onProgress);
        }
        var fd = new FormData();
        fd.append('file', file);
        // catId -1 means collection mode (no real category) → upload to root (0)
        fd.append('category_id', (catId && catId > 0) ? catId : 0);
        return fetch(API_BASE + 'media', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiUploadJsonOrError(r) {
        if (r.ok) return r.json();
        return r.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.error || ('HTTP ' + r.status));
        });
    }

    function apiUploadInit(file, catId) {
        return fetch(API_BASE + 'media/upload', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                filename: file.name,
                size: file.size,
                category_id: (catId && catId > 0) ? catId : 0
            })
        }).then(apiUploadJsonOrError);
    }

    function apiUploadChunk(uploadId, index, blob) {
        return fetch(API_BASE + 'media/upload/' + encodeURIComponent(uploadId) + '/chunk/' + index, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/octet-stream'
            },
            body: blob
        }).then(apiUploadJsonOrError);
    }

    function apiUploadFinalize(uploadId) {
        return fetch(API_BASE + 'media/upload/' + encodeURIComponent(uploadId) + '/finalize', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
        }).then(apiUploadJsonOrError);
    }

    function apiUploadAbort(uploadId) {
        return fetch(API_BASE + 'media/upload/' + encodeURIComponent(uploadId), {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
    }

    function apiUploadChunked(file, catId, onProgress) {
        return apiUploadInit(file, catId).then(function (initResp) {
            var uploadId = initResp.upload_id;
            var chunkSize = Math.min(CHUNK_UPLOAD_SIZE, initResp.chunk_size_max || CHUNK_UPLOAD_SIZE);
            var totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));

            function sendChunk(index) {
                if (index >= totalChunks) {
                    return apiUploadFinalize(uploadId);
                }
                var start = index * chunkSize;
                var end = Math.min(start + chunkSize, file.size);
                var blob = file.slice(start, end);
                return apiUploadChunk(uploadId, index, blob).then(function (resp) {
                    var sent = (resp && typeof resp.bytes_received === 'number') ? resp.bytes_received : end;
                    if (typeof onProgress === 'function') {
                        onProgress(sent, file.size);
                    }
                    return sendChunk(index + 1);
                });
            }

            return sendChunk(0).catch(function (err) {
                apiUploadAbort(uploadId).catch(function () {});
                throw err;
            });
        });
    }

    function apiUpdate(filename, data) {
        return fetch(API_BASE + 'media/' + encodeURIComponent(filename) + '/update', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiDelete(filename) {
        return fetch(API_BASE + 'media/' + encodeURIComponent(filename) + '/delete', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        }).then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error(body.error || 'HTTP ' + r.status);
                });
            }
            return r.json();
        });
    }

    function getJsonApiUrl(filename) {
        var root = document.getElementById('mp3-root');
        var baseUrl = root ? root.dataset.jsonUrl : null;
        if (!baseUrl) {
            baseUrl = 'index.php?rex-api-call=mediaplace_json_metainfo';
        }
        if (filename) {
            baseUrl += (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'filename=' + encodeURIComponent(filename);
        }
        return baseUrl;
    }

    // wantDetail=true laesst den Endpoint zusaetzlich detail_html rendern
    // (siehe rex_api_mediaplace_json_metainfo::handleGet() -- vorher per
    // client-seitig mitgeschicktem "info"-Objekt vom api-Addon signalisiert,
    // jetzt per einfachem Flag, weil der Endpoint die Info-Felder selbst
    // berechnet statt sie vom Client zu uebernehmen).
    function apiLoadJsonMetainfo(filename, wantDetail) {
        var url = getJsonApiUrl(filename);
        if (wantDetail) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + 'render_detail=1';
        }
        return fetch(url, {
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (json) {
            return {
                data: (json && typeof json.data === 'object' && json.data) ? json.data : {},
                fields: Array.isArray(json.fields) ? json.fields : [],
                clangs: Array.isArray(json.clangs) ? json.clangs : [],
                system_tags: Array.isArray(json.system_tags) ? json.system_tags : [],
                system_tag_catalog: Array.isArray(json.system_tag_catalog) ? json.system_tag_catalog : [],
                detail_html: typeof json.detail_html === 'string' ? json.detail_html : '',
                title: typeof json.title === 'string' ? json.title : ''
            };
        });
    }

    function apiSaveJsonMetainfo(filename, data) {
        return fetch(getJsonApiUrl(filename), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data || {})
        })
        .then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error(body.error || 'HTTP ' + r.status);
                });
            }
            return r.json();
        });
    }

    function apiCreateCategory(name, parentId) {
        return fetch(API_BASE + 'media/category', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: name, parent_id: parentId || 0 })
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function resolveFolderCategories(baseCatId, folderPaths) {
        return apiFetchAllCategoriesFlat().then(function (allCats) {
            var childrenByParent = {};
            allCats.forEach(function (c) {
                if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = {};
                childrenByParent[c.parent_id][String(c.name).toLowerCase()] = c.id;
            });

            var resolved = {}; // folderPath -> Promise<catId>

            function resolveSegments(parts) {
                var fullPath = parts.join('/');
                if (resolved[fullPath]) return resolved[fullPath];

                var parentPromise = parts.length > 1
                    ? resolveSegments(parts.slice(0, -1))
                    : Promise.resolve(baseCatId);

                var segment = parts[parts.length - 1];
                var promise = parentPromise.then(function (parentId) {
                    var byName = childrenByParent[parentId];
                    var existingId = byName ? byName[segment.toLowerCase()] : null;
                    if (existingId != null) return existingId;

                    return apiCreateCategory(segment, parentId).then(function (resp) {
                        var newId = resp && resp.id;
                        if (!childrenByParent[parentId]) childrenByParent[parentId] = {};
                        childrenByParent[parentId][segment.toLowerCase()] = newId;
                        return newId;
                    });
                });

                resolved[fullPath] = promise;
                return promise;
            }

            var sortedPaths = folderPaths.slice().sort(function (a, b) {
                return a.split('/').length - b.split('/').length;
            });

            var result = {};
            var chain = Promise.resolve();
            sortedPaths.forEach(function (path) {
                chain = chain.then(function () {
                    return resolveSegments(path.split('/')).then(function (id) {
                        result[path] = id;
                    });
                });
            });

            return chain.then(function () { return result; });
        });
    }

    function apiRenameCategory(catId, name) {
        return fetch(API_BASE + 'media/category/' + encodeURIComponent(catId), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: name })
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiDeleteCategory(catId) {
        return fetch(API_BASE + 'media/category/' + encodeURIComponent(catId), {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        })
        .then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error((body && body.error) || ('HTTP ' + r.status));
                });
            }
            return r.json();
        });
    }

    function apiReplaceFile(filename, file) {
        var fd = new FormData();
        fd.append('file', file);

        return fetch(API_BASE + 'media/' + encodeURIComponent(filename) + '/update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            },
            body: fd
        }).then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error((body && body.error) || ('HTTP ' + r.status));
                });
            }
            return r.json();
        });
    }


    function getFocuspointApiUrl() {
        var root = document.getElementById('mp3-root');
        var baseUrl = root ? root.dataset.focuspointUrl : null;
        if (!baseUrl) {
            baseUrl = 'index.php?rex-api-call=mediaplace_focuspoint';
        }
        return baseUrl;
    }

    // Liefert die fokuspunkt-relevanten Media-Manager-Typen, alle Fokuspunkt-
    // Metainfo-Felder und deren aktuell gespeicherte Werte fuer eine Datei --
    // siehe rex_api_mediaplace_focuspoint::handleInfo().
    function apiLoadFocuspointInfo(filename) {
        var url = getFocuspointApiUrl() + (getFocuspointApiUrl().indexOf('?') === -1 ? '?' : '&') + 'action=info&file=' + encodeURIComponent(filename);
        return fetch(url, {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
        })
        .then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error((body && body.error) || ('HTTP ' + r.status));
                });
            }
            return r.json();
        })
        .then(function (json) {
            return {
                types: (json && typeof json.types === 'object' && json.types) ? json.types : {},
                fields: Array.isArray(json.fields) ? json.fields : [],
                current: (json && typeof json.current === 'object' && json.current) ? json.current : {}
            };
        });
    }

    // Speichert einen neuen Fokuspunkt-Wert -- siehe
    // rex_api_mediaplace_focuspoint::handleSave(). $xy im Format
    // "x.x,y.y" (siehe rex_effect_abstract_focuspoint::str2fp() im
    // focuspoint-Addon).
    function apiSaveFocuspoint(filename, metafield, xy) {
        var url = getFocuspointApiUrl() + (getFocuspointApiUrl().indexOf('?') === -1 ? '?' : '&') + 'action=save';
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: 'file=' + encodeURIComponent(filename) + '&meta=' + encodeURIComponent(metafield) + '&xy=' + encodeURIComponent(xy)
        })
        .then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error((body && body.error) || ('HTTP ' + r.status));
                return body;
            });
        });
    }

    Core.api.getCategoriesApiUrl = getCategoriesApiUrl;
    Core.api.apiCheckUnusedMedia = apiCheckUnusedMedia;
    Core.api.apiFetchAllCategoriesFlat = apiFetchAllCategoriesFlat;
    Core.api.apiMoveCategory = apiMoveCategory;
    Core.api.getTagsApiUrl = getTagsApiUrl;
    Core.api.apiCollectionCatalogAction = apiCollectionCatalogAction;
    Core.api.apiLoadSystemTagsForFiles = apiLoadSystemTagsForFiles;
    Core.api.apiFetch = apiFetch;
    Core.api.apiFetchRaw = apiFetchRaw;
    Core.api.apiUpload = apiUpload;
    Core.api.apiUploadJsonOrError = apiUploadJsonOrError;
    Core.api.apiUploadInit = apiUploadInit;
    Core.api.apiUploadChunk = apiUploadChunk;
    Core.api.apiUploadFinalize = apiUploadFinalize;
    Core.api.apiUploadAbort = apiUploadAbort;
    Core.api.apiUploadChunked = apiUploadChunked;
    Core.api.apiUpdate = apiUpdate;
    Core.api.apiDelete = apiDelete;
    Core.api.getJsonApiUrl = getJsonApiUrl;
    Core.api.apiLoadJsonMetainfo = apiLoadJsonMetainfo;
    Core.api.apiSaveJsonMetainfo = apiSaveJsonMetainfo;
    Core.api.apiCreateCategory = apiCreateCategory;
    Core.api.resolveFolderCategories = resolveFolderCategories;
    Core.api.apiRenameCategory = apiRenameCategory;
    Core.api.apiDeleteCategory = apiDeleteCategory;
    Core.api.apiReplaceFile = apiReplaceFile;
    Core.api.apiLoadFocuspointInfo = apiLoadFocuspointInfo;
    Core.api.apiSaveFocuspoint = apiSaveFocuspoint;
})(window.MP3Core = window.MP3Core || {});
