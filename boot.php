<?php

// Steuert kein eigenes Menu, nur den "Nur unbenutzte Medien"-Filter im
// Overlay -- Rollen-Verwaltung muss es unabhaengig vom eingeloggten User
// auflisten koennen, deshalb ausserhalb der isBackend()/getUser()-Bedingung.
rex_perm::register('mediaplace[view_unused_media]', 'Filter "Nur unbenutzte Medien" nutzen');

if (rex::isBackend() && rex::getUser()) {
    // Pro-Datei-Cache-Buster, damit ein Deploy einzelner JS/CSS-Dateien nicht
    // durch Browser-Caching unbemerkt ausbleibt.
    $bust = function (string $file) {
        return '?v=' . filemtime($this->getPath('assets/' . $file));
    };

    // Core: Overlay Picker -- i18n/Helfer/API-Schicht zuerst laden (mediapool3.js
    // bindet sie per Alias ein, siehe deren Datei-Header-Kommentare).
    rex_view::addCssFile($this->getAssetsUrl('mediapool3.css') . $bust('mediapool3.css'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3-i18n.js') . $bust('mediapool3-i18n.js'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3-helpers.js') . $bust('mediapool3-helpers.js'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3-api.js') . $bust('mediapool3-api.js'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3.js') . $bust('mediapool3.js'));

    // Widget: Input-Feld → Media Picker
    rex_view::addCssFile($this->getAssetsUrl('mediapool3_widget.css') . $bust('mediapool3_widget.css'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3_widget.js') . $bust('mediapool3_widget.js'));

    // Klassische REX_MEDIA[n]/REX_MEDIALIST[n]-Widgets auf den neuen Overlay umleiten
    rex_view::addJsFile($this->getAssetsUrl('mediapool3_classic.js') . $bust('mediapool3_classic.js'));

    // Biegt den klassischen "Medienpool"-Menuepunkt auf unseren Overlay um,
    // abschaltbar ueber die Einstellungsseite.
    // https://friendsofredaxo.github.io/tricks/backend/backend_snippets#seite-eines-addons-durch-eigene-austauschenersetzen
    $addonName = $this->getName();
    rex_extension::register('PAGES_PREPARED', static function () use ($addonName) {
        if (!rex_config::get($addonName, 'replace_classic_mediapool', true)) {
            return;
        }

        $mediapool = rex_be_controller::getPages()['mediapool'] ?? null;
        if ($mediapool instanceof rex_be_page) {
            $mediapool->setPopup('MP3.open(); return false;');
            $mediapool->setTitle('MediaPlace');
            $mediapool->setIcon('rex-icon fa-photo-film');

            // Route bleibt aktiv (TinyMCE/CKEditor5 steuern sie per Popup an),
            // nur aus der Navigation ausgeblendet.
            $mediaSubpage = $mediapool->getSubpage('media');
            if ($mediaSubpage instanceof rex_be_page) {
                $mediaSubpage->setHidden(true);
            }
        }
    });

    // Zeigt med_json_data im klassischen Medienpool-Formular formatiert und
    // schreibgeschuetzt an (Feldtyp "mediaplace_json", siehe install.php).
    if (rex_addon::get('metainfo')->isAvailable()) {
        rex_extension::register('METAINFO_CUSTOM_FIELD', static function (rex_extension_point $ep) {
            $subject = $ep->getSubject();
            $sqlFields = $subject['sql'] ?? null;
            if (!$sqlFields instanceof rex_sql || 'med_json_data' !== (string) $sqlFields->getValue('name')) {
                return null;
            }

            [$field, $tag, $tagAttr, $id, $label, $labelIt] = $subject;

            $rawValues = (array) ($subject['rawvalues'] ?? []);
            $raw = implode('|', $rawValues);

            $decoded = [];
            if ('' !== trim($raw)) {
                $decodedRaw = json_decode($raw, true);
                if (is_array($decodedRaw)) {
                    $decoded = $decodedRaw;
                }
            }

            $innerField = \FriendsOfRedaxo\Mediaplace\ClassicMetainfoFormatter::render($decoded);

            // media_handler.php::renderFormItem() baut keine dt/dd-Huelle --
            // die uebernehmen wir hier selbst per core/form/form.php.
            $formFragment = new rex_fragment();
            $formFragment->setVar('elements', [[
                'label' => $label,
                'field' => $innerField,
                'note' => rex_i18n::msg('mediaplace_metainfo_readonly_hint'),
            ]], false);
            $field = $formFragment->parse('core/form/form.php');

            return [$field, $tag, $tagAttr, $id, $label, $labelIt];
        });
    }

    rex_extension::register('OUTPUT_FILTER', static function (rex_extension_point $ep) use ($addonName) {
        $content = $ep->getSubject();
        $schemaUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_schema', 'prefix' => 'med_']);
        $jsonUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_json_metainfo']);
        $tagsUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_tags']);
        $categoriesUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_categories']);
        $unusedUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_unused']);
        $canFilterUnused = \FriendsOfRedaxo\Mediaplace\MediaPermission::hasUnusedFilterAccess() ? '1' : '0';
        $focuspointUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_focuspoint']);
        $focuspointAvailable = \FriendsOfRedaxo\Mediaplace\FocuspointIntegration::canEdit() ? '1' : '0';
        $metainfoFormUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_metainfo_form']);
        $metainfoFormAvailable = rex_addon::get('metainfo')->isAvailable() ? '1' : '0';

        // Feature-Toggles der Einstellungsseite, siehe features-Objekt in mediapool3.js.
        $featureTagging = rex_config::get($addonName, 'disable_tagging', false) ? '0' : '1';
        $featureCollections = rex_config::get($addonName, 'disable_collections', false) ? '0' : '1';
        $featureMetainfoEditing = rex_config::get($addonName, 'enable_metainfo_editing', false) ? '1' : '0';

        // Klassische Unterseiten (Struktur, Hochladen, Sync, ...) bleiben ueber
        // ein Verwaltungs-Icon im Overlay erreichbar.
        $subpages = [];
        $mediapool = rex_be_controller::getPages()['mediapool'] ?? null;
        if ($mediapool instanceof rex_be_page) {
            foreach ($mediapool->getSubpages() as $subpage) {
                if ($subpage->isHidden() || !$subpage->checkPermission(rex::requireUser())) {
                    continue;
                }
                $subpages[] = [
                    'title' => $subpage->getTitle(),
                    'href' => $subpage->getHref(),
                    'icon' => $subpage->hasIcon() ? $subpage->getIcon() : 'rex-icon rex-icon-package-addon',
                ];
            }
        }

        // JS-Uebersetzungen: jeder Schluessel aus lang/de_de.lang wird fuer die
        // aktive Locale aufgeloest und als JSON eingebettet (siehe mediapool3-i18n.js).
        $i18nMap = [];
        $langFile = rex_path::addon($addonName, 'lang/de_de.lang');
        if (is_file($langFile)) {
            foreach (file($langFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (preg_match('/^([a-zA-Z0-9_]+)\s*=/', $line, $m)) {
                    $i18nMap[$m[1]] = rex_i18n::msg($m[1]);
                }
            }
        }

        $inject = '<div id="mp3-root" data-schema-url="' . rex_escape($schemaUrl) . '" data-json-url="' . rex_escape($jsonUrl) . '" data-tags-url="' . rex_escape($tagsUrl) . '" data-categories-url="' . rex_escape($categoriesUrl) . '" data-unused-url="' . rex_escape($unusedUrl) . '" data-can-filter-unused="' . $canFilterUnused . '" data-focuspoint-url="' . rex_escape($focuspointUrl) . '" data-focuspoint-available="' . $focuspointAvailable . '" data-metainfo-form-url="' . rex_escape($metainfoFormUrl) . '" data-metainfo-form-available="' . $metainfoFormAvailable . '" data-subpages="' . rex_escape(json_encode($subpages)) . '" data-feature-tagging="' . $featureTagging . '" data-feature-collections="' . $featureCollections . '" data-feature-metainfo-editing="' . $featureMetainfoEditing . '"></div>'
            . "\n" . '<script type="application/json" id="mp3-i18n-data">' . json_encode($i18nMap, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) . '</script>';
        $content = str_replace('</body>', $inject . "\n" . '</body>', $content);
        $ep->setSubject($content);
    });
}
