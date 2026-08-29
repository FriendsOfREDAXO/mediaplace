<?php

// Steuert kein eigenes Menu, nur den "Nur unbenutzte Medien"-Filter im
// Overlay -- Rollen-Verwaltung muss es unabhaengig vom eingeloggten User
// auflisten koennen, deshalb ausserhalb der isBackend()/getUser()-Bedingung.
rex_perm::register('mediaplace[view_unused_media]', 'Filter "Nur unbenutzte Medien" nutzen');
rex_perm::register('mediaplace[manage_categories]', 'Ordner (Kategorien) umbenennen, verschieben oder löschen');
rex_perm::register('mediaplace[optimize_video]', 'Videos optimieren (ffmpeg-Addon)');

// YForm-Werttyp "mediaplace" (lib/yform/value/yform_value_mediaplace.php, per
// Klassennamenskonvention automatisch von YForm erkannt -- keine explizite
// Feldtyp-Registrierung noetig, nur das Template-Verzeichnis und der
// MEDIA_IS_IN_USE-Hook). Unconditional wie bei filepond_uploader/boot.php,
// nicht auf isBackend() beschraenkt, da der Loeschen-Check auch aus anderen
// Kontexten heraus feuern kann.
if (rex_addon::get('yform')->isAvailable()) {
    rex_yform::addTemplatePath($this->getPath('ytemplates'));
    rex_extension::register('MEDIA_IS_IN_USE', ['rex_yform_value_mediaplace', 'isMediaInUse']);
}

// Sicherheitsnetz fuer die eigenen Video-Vorschau-Typen (animiert +
// statisches Standbild, siehe FfmpegIntegration::ensureVideoThumbTypes()):
// beide referenzieren ffmpeg's Effekt "video_to_webp". Wird ffmpeg NACH dem
// Anlegen dieser Typen deinstalliert (oder faellt das Binary weg), bleiben
// die Typ-/Effekt-Zeilen in der DB stehen -- media_manager selbst hat vor dem
// Instanziieren eines Effekts keine class_exists()-Absicherung
// (media_manager.php, applyEffects(): "new $effectClass()") und stuerzt mit
// einem Fatal Error (500) ab, sobald IRGENDEINE Anfrage (auch eine alte/
// gecachte <img>-URL) einen dieser Typen fuer ein Video anfordert. Statt das
// crashen zu lassen, wird das Effekt-Set fuer beide Typen auf leer gesetzt,
// sobald ffmpeg nicht mehr verfuegbar ist -- media_manager liefert dann sein
// eigenes "nicht gefunden"-Verhalten statt eines Fatal Errors. Unconditional
// (nicht nur im isBackend()-Block), da Media-Manager-Anfragen auch anonym/
// frontend-seitig eintreffen koennen.
rex_extension::register('MEDIA_MANAGER_FILTERSET', static function (rex_extension_point $ep) {
    $videoThumbTypes = [
        \FriendsOfRedaxo\Mediaplace\FfmpegIntegration::VIDEO_THUMB_TYPE,
        \FriendsOfRedaxo\Mediaplace\FfmpegIntegration::VIDEO_THUMB_TYPE_STATIC,
    ];
    if (in_array($ep->getParam('rex_media_type'), $videoThumbTypes, true)
        && !\FriendsOfRedaxo\Mediaplace\FfmpegIntegration::isAvailable()) {
        return [];
    }

    return $ep->getSubject();
});

// Cronjob-Typ "Vorschaubilder vorwaermen" (siehe ThumbWarmupCronjob) --
// unconditional registrierbar, gleiches Muster wie activity_log/boot.php.
// Bild-Vorschaubilder laufen immer, Video-Vorschaubilder nur wenn ffmpeg
// verfuegbar ist -- entscheidet der Cronjob selbst zur Laufzeit.
if (rex_addon::get('cronjob')->isAvailable() && !rex::isSafeMode()) {
    rex_cronjob_manager::registerType(\FriendsOfRedaxo\Mediaplace\ThumbWarmupCronjob::class);
}

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

    // Zuschneiden-Canvas nutzt cropper's eigene Assets 1:1 (siehe CropperIntegration) --
    // nur laden, wenn das Addon installiert ist und der User das Recht hat.
    if (\FriendsOfRedaxo\Mediaplace\CropperIntegration::isAvailable() && rex::getUser()->hasPerm('cropper[]')) {
        $cropperAssets = \FriendsOfRedaxo\Mediaplace\CropperIntegration::assetUrls();
        foreach ($cropperAssets['css'] as $cssUrl) {
            rex_view::addCssFile($cssUrl);
        }
        foreach ($cropperAssets['js'] as $jsUrl) {
            rex_view::addJsFile($jsUrl);
        }
        rex_view::setJsProperty('cropperI18n', [
            'savingMessage' => rex_i18n::msg('cropper_saving_message'),
        ]);
    }

    // Video-Vorschau-Typen (ffmpeg-Integration, siehe FfmpegIntegration) --
    // idempotente Existenzpruefung, legt beide Typen (animiert + Standbild)
    // bei Bedarf an (z.B. wenn ffmpeg erst nach MediaPlace installiert wurde).
    \FriendsOfRedaxo\Mediaplace\FfmpegIntegration::ensureVideoThumbTypes();

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
        // Basis-URL fuer Original-Mediendateien (SVG-Vorschau, Lightbox-
        // Grossansicht) serverseitig per rex_url::media() berechnen, statt
        // clientseitig zu raten -- rex_url::media() nutzt REDAXOs eigenen
        // PathProvider und ist damit unabhaengig davon korrekt, ob die Seite,
        // von der aus MediaPlace aufgerufen wird, im Backend (z.B. unter
        // "/redaxo/") oder potenziell im Frontend liegt. Ein clientseitiger
        // Trick wie "../media/" (relativ zur aktuellen Seite) oder ein Split
        // auf "/redaxo/" im aktuellen Pfad (siehe filepond_uploader) waere
        // nur fuer Backend-Seiten in exakt einer bestimmten Verzeichnistiefe
        // zuverlaessig.
        $mediaBaseUrl = rex_url::media();
        $schemaUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_schema', 'prefix' => 'med_']);
        $jsonUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_json_metainfo']);
        $tagsUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_tags']);
        $categoriesUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_categories']);
        $unusedUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_unused']);
        // Uebergangs-Fallback, solange die installierte FriendsOfRedaxo/api-Version
        // media/list noch keinen filter[permitted_only]-Parameter unterstuetzt
        // (Opt-in fuer Kategorie-Rechte-Filterung, api-Addon PR #78 -- der
        // klassische Medienpool gibt traditionell jedem Basis-Medienrecht
        // Leserecht auf alle Kategorien, daher bewusst kein neues Default-
        // Verhalten der Route). buildMediaEndpoint() schickt permitted_only
        // immer mit; eine aeltere api-Version wuerde den unbekannten Parameter
        // aber stillschweigend ignorieren und dadurch wieder ungefiltert
        // liefern -- deshalb der eigene, rechte-gepruefte Fallback-Endpunkt
        // hier. Schwelle bewusst auf 1.3.2 gesetzt (noch keine reale
        // api-Release-Version, Platzhalter fuer die erste Version, die PR #78
        // MIT der spaeter ergaenzten Kaskadierung enthaelt): der eigene
        // Fallback-Endpunkt (rex_api_mediaplace_media_list.php) nutzt
        // MediaPermission::getAccessibleCategoryIds(), das bereits kaskadiert
        // (Zugriff auf X gilt fuer den ganzen Unterbaum) -- ohne die Anhebung
        // wuerden Installationen mit reinem api 1.3.1 (Kategorie-Filterung,
        // aber noch exakt statt kaskadierend) den direkten, nicht
        // kaskadierenden media/list-Endpunkt nutzen und Unterkategorien einer
        // freigegebenen Kategorie faelschlich leer/gefiltert sehen. Sobald
        // api die Kaskadierung tatsaechlich released hat, hier die echte
        // Versionsnummer eintragen (dann kann fuer >= diese Version wieder
        // direkt auf media/list gegangen werden); bis api ueberall >= dieser
        // Version installiert ist, bleibt die Weiche inkl. Fallback-Endpunkt
        // noetig.
        $apiVersion = (string) (rex_addon::get('api')->getVersion() ?: '0');
        $apiMediaListSecure = version_compare($apiVersion, '1.3.2', '>=') ? '1' : '0';
        $mediaListFallbackUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_media_list']);
        $canFilterUnused = \FriendsOfRedaxo\Mediaplace\MediaPermission::hasUnusedFilterAccess() ? '1' : '0';
        // Kategorie 0 ("kein Ordner") ist ein eigenes Recht (hasCategoryPerm(0)),
        // das viele auf einzelne Kategorien eingeschraenkte User nicht haben --
        // steuert, ob der "Medienpool"-Sidebar-/Breadcrumb-Link anklickbar ist.
        $canAccessRootCategory = \FriendsOfRedaxo\Mediaplace\MediaPermission::hasCategoryAccess(0) ? '1' : '0';
        $focuspointUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_focuspoint']);
        $metainfoFormUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_metainfo_form']);
        $metainfoFormAvailable = rex_addon::get('metainfo')->isAvailable() ? '1' : '0';
        // Globale Verfuegbarkeit (Addon + Recht) -- ob eine KONKRETE Datei
        // zuschneidbar ist (Bild-Endung), entscheidet der Client anhand des
        // Dateinamens, siehe CropperIntegration::isSupportedMedia()/mediapool3.js.
        $cropperUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_crop']);
        $cropperAvailable = \FriendsOfRedaxo\Mediaplace\CropperIntegration::isAvailable()
            && null !== rex::getUser() && rex::getUser()->hasPerm('cropper[]') ? '1' : '0';

        // ffmpeg-Integration (siehe FfmpegIntegration): Video-Vorschau im Grid
        // (Typ-Name direkt, kein API-Umweg -- Grid baut die Thumb-URL genauso
        // wie fuer mediaplace_thumb selbst) + "Video optimieren"-Button.
        // Typ-Name statt reinem Flag: haengt vom Einstellungen-Modus ab (aus/
        // Standbild/animiert, siehe getActiveVideoThumbType()) -- leerer
        // String = Video-Vorschau aus, previewHtml() zeigt dann konsequent
        // nur das Datei-Icon.
        $videoThumbType = \FriendsOfRedaxo\Mediaplace\FfmpegIntegration::isAvailable()
            ? (string) (\FriendsOfRedaxo\Mediaplace\FfmpegIntegration::getActiveVideoThumbType() ?? '')
            : '';
        $videoThumbStatic = \FriendsOfRedaxo\Mediaplace\FfmpegIntegration::getVideoThumbMode() === 'static' ? '1' : '0';
        $optimizeVideoUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_video_optimize']);
        $optimizeVideoAvailable = null !== rex::getUser() && rex::getUser()->hasPerm('mediaplace[optimize_video]')
            && \FriendsOfRedaxo\Mediaplace\FfmpegIntegration::isAvailable() ? '1' : '0';
        $videoInfoUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_video_info']);

        // Feature-Toggles der Einstellungsseite, siehe features-Objekt in mediapool3.js.
        $featureTagging = rex_config::get($addonName, 'disable_tagging', false) ? '0' : '1';
        $featureCollections = rex_config::get($addonName, 'disable_collections', false) ? '0' : '1';
        $featureMetainfoEditing = rex_config::get($addonName, 'enable_metainfo_editing', false) ? '1' : '0';
        $featureUploadResize = rex_config::get($addonName, 'enable_upload_resize', false) ? '1' : '0';
        $uploadResizeWidth = (int) rex_config::get($addonName, 'upload_resize_width', 2000);
        $uploadResizeHeight = (int) rex_config::get($addonName, 'upload_resize_height', 2000);

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

        $inject = '<div id="mp3-root" data-media-base-url="' . rex_escape($mediaBaseUrl) . '" data-schema-url="' . rex_escape($schemaUrl) . '" data-json-url="' . rex_escape($jsonUrl) . '" data-tags-url="' . rex_escape($tagsUrl) . '" data-categories-url="' . rex_escape($categoriesUrl) . '" data-unused-url="' . rex_escape($unusedUrl) . '" data-can-filter-unused="' . $canFilterUnused . '" data-can-access-root-category="' . $canAccessRootCategory . '" data-media-list-fallback-url="' . rex_escape($mediaListFallbackUrl) . '" data-api-media-list-secure="' . $apiMediaListSecure . '" data-focuspoint-url="' . rex_escape($focuspointUrl) . '" data-metainfo-form-url="' . rex_escape($metainfoFormUrl) . '" data-metainfo-form-available="' . $metainfoFormAvailable . '" data-cropper-url="' . rex_escape($cropperUrl) . '" data-cropper-available="' . $cropperAvailable . '" data-video-thumb-type="' . rex_escape($videoThumbType) . '" data-video-thumb-static="' . $videoThumbStatic . '" data-optimize-video-url="' . rex_escape($optimizeVideoUrl) . '" data-optimize-video-available="' . $optimizeVideoAvailable . '" data-video-info-url="' . rex_escape($videoInfoUrl) . '" data-subpages="' . rex_escape(json_encode($subpages)) . '" data-feature-tagging="' . $featureTagging . '" data-feature-collections="' . $featureCollections . '" data-feature-metainfo-editing="' . $featureMetainfoEditing . '" data-feature-upload-resize="' . $featureUploadResize . '" data-upload-resize-width="' . $uploadResizeWidth . '" data-upload-resize-height="' . $uploadResizeHeight . '"></div>'
            . "\n" . '<script type="application/json" id="mp3-i18n-data">' . json_encode($i18nMap, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) . '</script>';
        $content = str_replace('</body>', $inject . "\n" . '</body>', $content);
        $ep->setSubject($content);
    });
}
