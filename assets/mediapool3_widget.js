/**
 * MediaPlace – Widget
 *
 * Ersetzt <input class="mp3-widget"> automatisch durch eine
 * visuelle Medienauswahl mit Vorschau, die den MP3-Overlay nutzt.
 *
 * Attribute:
 *   data-mp3-multiple="true"    → Mehrfachauswahl (kommaseparierte Dateinamen)
 *   data-mp3-types="image/*"    → Erlaubte MIME-Types (TODO: Filterung im Picker)
 *   data-mp3-preview="true"     → Vorschau anzeigen (Standard: true)
 *
 * Wert im Input: Dateiname(n), kommasepariert bei Multi.
 *
 * Beispiel:
 *   <input class="mp3-widget" name="image" value="foto.jpg">
 *   <input class="mp3-widget" name="gallery" data-mp3-multiple="true" value="a.jpg,b.png">
 */
(function () {
    'use strict';

    var t = (window.MP3Core && window.MP3Core.i18n && window.MP3Core.i18n.t) || function (key) { return key; };

    // ---- Helpers ----
    function qs(sel, ctx) {
        return (ctx || document).querySelector(sel);
    }
    function qsa(sel, ctx) {
        return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
    }
    function escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
    function isImage(filename) {
        return /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico)$/i.test(filename || '');
    }
    function fileIcon(filename) {
        var ext = (filename || '').split('.').pop().toLowerCase();
        var icons = {
            pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
            xls: 'fa-file-excel', xlsx: 'fa-file-excel',
            mp3: 'fa-file-audio', wav: 'fa-file-audio', ogg: 'fa-file-audio',
            mp4: 'fa-file-video', avi: 'fa-file-video', mov: 'fa-file-video', webm: 'fa-file-video',
            zip: 'fa-file-zipper', rar: 'fa-file-zipper',
            txt: 'fa-file-lines', csv: 'fa-file-csv',
            html: 'fa-file-code', css: 'fa-file-code', js: 'fa-file-code'
        };
        return 'fa-solid ' + (icons[ext] || 'fa-file');
    }
    function thumbUrl(filename) {
        // SVGs werden vom Media Manager nicht zuverlaessig gerendert -> Original referenzieren.
        if (/\.svg$/i.test(filename || '')) {
            return '/media/' + encodeURIComponent(filename);
        }
        return 'index.php?rex_media_type=rex_media_small&rex_media_file=' + encodeURIComponent(filename);
    }

    // ---- Widget Class ----
    function MP3Widget(input) {
        this.input = input;
        this.multiple = input.getAttribute('data-mp3-multiple') === 'true';
        this.container = null;
        this.previewWrap = null;
        this._build();
        this._render();
    }

    MP3Widget.prototype._getFiles = function () {
        var val = this.input.value.trim();
        if (!val) return [];
        return val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    };

    MP3Widget.prototype._setFiles = function (files) {
        this.input.value = files.join(',');
        // Trigger change event for REDAXO and other listeners
        var evt;
        try { evt = new Event('change', { bubbles: true }); }
        catch (e) { evt = document.createEvent('Event'); evt.initEvent('change', true, true); }
        this.input.dispatchEvent(evt);
        this._render();
    };

    MP3Widget.prototype._build = function () {
        // Hide original input
        this.input.style.display = 'none';
        this.input.setAttribute('data-mp3-initialized', 'true');

        // Create container
        this.container = document.createElement('div');
        this.container.className = 'mp3w-container';

        // Preview area
        this.previewWrap = document.createElement('div');
        this.previewWrap.className = 'mp3w-previews';
        this.container.appendChild(this.previewWrap);

        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'mp3w-toolbar';

        var self = this;

        // Add button
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-xs btn-default mp3w-btn mp3w-btn-add';
        addBtn.title = this.multiple ? t('mediaplace_widget_add_multiple') : t('mediaplace_widget_add_single');
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        addBtn.addEventListener('click', function () {
            self._openPicker();
        });
        toolbar.appendChild(addBtn);

        // Clear button
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn btn-xs btn-default mp3w-btn mp3w-btn-clear';
        clearBtn.title = t('mediaplace_widget_clear_all');
        clearBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        clearBtn.addEventListener('click', function () {
            self._setFiles([]);
        });
        toolbar.appendChild(clearBtn);

        this.container.appendChild(toolbar);

        // Insert after input
        this.input.parentNode.insertBefore(this.container, this.input.nextSibling);

        // Drag & Drop reorder for multi
        if (this.multiple) {
            this._initDragSort();
        }
    };

    MP3Widget.prototype._openPicker = function () {
        var self = this;
        if (self.multiple) {
            // Multi: open in multi-select mode, receive array of filenames
            MP3.open(function (filenames) {
                var current = self._getFiles();
                for (var i = 0; i < filenames.length; i++) {
                    if (current.indexOf(filenames[i]) === -1) {
                        current.push(filenames[i]);
                    }
                }
                self._setFiles(current);
            }, { multiple: true });
        } else {
            // Single: open in single-select mode
            MP3.open(function (filename) {
                self._setFiles([filename]);
            });
        }
    };

    MP3Widget.prototype._render = function () {
        var files = this._getFiles();
        var self = this;
        var html = '';

        if (files.length === 0) {
            html = '<div class="mp3w-empty">' +
                '<i class="fa-solid fa-image"></i> ' +
                (this.multiple ? t('mediaplace_widget_empty_multiple') : t('mediaplace_widget_empty_single')) +
                '</div>';
        } else {
            for (var i = 0; i < files.length; i++) {
                html += this._renderItem(files[i], i);
            }
        }

        this.previewWrap.innerHTML = html;

        // Bind remove buttons
        qsa('.mp3w-item-remove', this.previewWrap).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var fn = this.getAttribute('data-filename');
                var current = self._getFiles();
                current = current.filter(function (f) { return f !== fn; });
                self._setFiles(current);
            });
        });

        // Details ansehen: oeffnet den Overlay direkt im Detail-Panel des
        // Mediums (Browse-only, kein Callback -- siehe MP3.openFile()),
        // ohne die Widget-Auswahl selbst zu veraendern. stopPropagation()
        // noetig, sonst wuerde der Item-Klick-Handler unten (Single-Modus)
        // zusaetzlich den Picker zum Ersetzen oeffnen.
        qsa('.mp3w-item-view', this.previewWrap).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var fn = this.getAttribute('data-filename');
                if (fn && typeof MP3 !== 'undefined' && MP3.openFile) {
                    MP3.openFile(fn);
                }
            });
        });

        // Bind item clicks → re-open picker to replace (single) or view
        qsa('.mp3w-item', this.previewWrap).forEach(function (item) {
            item.addEventListener('click', function () {
                if (!self.multiple) {
                    self._openPicker();
                }
            });
        });

        // Show/hide clear button
        var clearBtn = qs('.mp3w-btn-clear', this.container);
        if (clearBtn) {
            clearBtn.style.display = files.length ? '' : 'none';
        }
    };

    MP3Widget.prototype._renderItem = function (filename, index) {
        var preview;
        if (isImage(filename)) {
            preview = '<img src="' + escAttr(thumbUrl(filename)) + '" alt="' + escAttr(filename) + '" draggable="false">';
        } else {
            preview = '<div class="mp3w-item-icon"><i class="' + fileIcon(filename) + '"></i></div>';
        }

        var html = '<div class="mp3w-item" data-filename="' + escAttr(filename) + '" data-index="' + index + '"' +
            (this.multiple ? ' draggable="true"' : '') + '>';
        html += '<div class="mp3w-item-preview">' + preview + '</div>';
        html += '<div class="mp3w-item-name">' + escAttr(filename) + '</div>';
        html += '<button type="button" class="mp3w-item-view" data-filename="' + escAttr(filename) + '" title="' + escAttr(t('mediaplace_widget_view_details')) + '">' +
            '<i class="fa-solid fa-magnifying-glass"></i></button>';
        html += '<button type="button" class="mp3w-item-remove" data-filename="' + escAttr(filename) + '" title="' + escAttr(t('mediaplace_widget_remove')) + '">' +
            '<i class="fa-solid fa-xmark"></i></button>';
        html += '</div>';
        return html;
    };

    // ---- Drag & Drop Sort (Multi only) ----
    MP3Widget.prototype._initDragSort = function () {
        var self = this;
        var dragItem = null;

        this.previewWrap.addEventListener('dragstart', function (e) {
            var item = e.target.closest('.mp3w-item');
            if (!item) return;
            dragItem = item;
            item.classList.add('mp3w-item-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.getAttribute('data-index'));
        });

        this.previewWrap.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            var target = e.target.closest('.mp3w-item');
            if (target && target !== dragItem) {
                var rect = target.getBoundingClientRect();
                var mid = rect.left + rect.width / 2;
                if (e.clientX < mid) {
                    target.classList.add('mp3w-drop-before');
                    target.classList.remove('mp3w-drop-after');
                } else {
                    target.classList.remove('mp3w-drop-before');
                    target.classList.add('mp3w-drop-after');
                }
            }
        });

        this.previewWrap.addEventListener('dragleave', function (e) {
            var item = e.target.closest('.mp3w-item');
            if (item) {
                item.classList.remove('mp3w-drop-before', 'mp3w-drop-after');
            }
        });

        this.previewWrap.addEventListener('drop', function (e) {
            e.preventDefault();
            qsa('.mp3w-item', self.previewWrap).forEach(function (el) {
                el.classList.remove('mp3w-drop-before', 'mp3w-drop-after');
            });

            if (!dragItem) return;
            var target = e.target.closest('.mp3w-item');
            if (!target || target === dragItem) return;

            var files = self._getFiles();
            var fromIdx = parseInt(dragItem.getAttribute('data-index'), 10);
            var toIdx = parseInt(target.getAttribute('data-index'), 10);

            // Reorder array
            var moved = files.splice(fromIdx, 1)[0];
            var rect = target.getBoundingClientRect();
            var mid = rect.left + rect.width / 2;
            var insertIdx = e.clientX < mid ? toIdx : toIdx + 1;
            if (fromIdx < toIdx) insertIdx--;
            if (insertIdx < 0) insertIdx = 0;
            files.splice(insertIdx, 0, moved);
            self._setFiles(files);
        });

        this.previewWrap.addEventListener('dragend', function () {
            if (dragItem) {
                dragItem.classList.remove('mp3w-item-dragging');
                dragItem = null;
            }
            qsa('.mp3w-item', self.previewWrap).forEach(function (el) {
                el.classList.remove('mp3w-drop-before', 'mp3w-drop-after');
            });
        });
    };

    // ---- Auto-Init ----

    /**
     * Initialize widgets – optionally scoped to a container (for MBlock support).
     * When MBlock clones a block, the cloned DOM already contains the old
     * .mp3w-container and the hidden input has data-mp3-initialized.
     * We must:
     *   1. Remove any cloned .mp3w-container inside the scope
     *   2. Clear data-mp3-initialized so the input gets re-initialized
     *   3. Build fresh widget instances
     */
    function initWidgets(scope) {
        // Eigenstaendiger Aufruf noetig, da dieses Skript unabhaengig vom
        // Overlay-Kern (mediapool3.js, dessen build() erst beim Oeffnen des
        // Overlays laeuft) auf Widgets auf der Seite reagiert -- idempotent,
        // mehrfacher Aufruf (z.B. auch spaeter durch build()) ist unproblematisch.
        if (window.MP3Core && window.MP3Core.i18n) {
            window.MP3Core.i18n.initLang();
        }

        var root = scope || document;

        // MBlock cleanup: remove cloned widget containers & reset flag
        qsa('input.mp3-widget[data-mp3-initialized]', root).forEach(function (input) {
            // The container sits right after the hidden input
            var next = input.nextElementSibling;
            if (next && next.classList.contains('mp3w-container')) {
                next.parentNode.removeChild(next);
            }
            input.removeAttribute('data-mp3-initialized');
            input.style.display = '';
        });

        // Init all un-initialized widgets in scope
        qsa('input.mp3-widget', root).forEach(function (input) {
            if (input.getAttribute('data-mp3-initialized')) return;
            new MP3Widget(input);
        });
    }

    // Init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initWidgets(); });
    } else {
        initWidgets();
    }

    // Re-init on REDAXO rex:ready (MBlock, Gridblock, etc.)
    // MBlock triggers $(container).trigger('rex:ready', [container])
    // REDAXO core triggers $(document).trigger('rex:ready', [container])
    if (typeof jQuery !== 'undefined') {
        jQuery(document).on('rex:ready', function (e, container) {
            // container is a jQuery object or undefined
            var scope = container && container.length ? container[0] : null;
            initWidgets(scope);
        });
    }

    // Public API for manual init
    window.MP3Widget = {
        init: function (scope) {
            initWidgets(scope || null);
        }
    };

})();
