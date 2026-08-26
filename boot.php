<?php

// Kein Seitenrecht (steuert keinen eigenen Menuepunkt, sondern nur ob der
// "Nur unbenutzte Medien"-Filter im Overlay verfuegbar ist) -- muss deshalb
// explizit registriert werden, damit es in der Rollen-Verwaltung waehlbar
// ist. Ausserhalb der isBackend()/getUser()-Bedingung, weil die
// Rollen-Verwaltung die registrierten Rechte unabhaengig vom aktuell
// eingeloggten User auflisten koennen muss.
rex_perm::register('mediaplace[view_unused_media]', 'Filter "Nur unbenutzte Medien" nutzen');

if (rex::isBackend() && rex::getUser()) {
    // Pro-Datei-Cache-Buster (nicht ein einzelner, von mediapool3.css
    // abgeleiteter Wert fuer alle Dateien): sonst faellt ein Deploy, das nur
    // z.B. mediapool3.js aendert, unbemerkt unter den Tisch, weil sich die
    // Asset-URL nicht aendert und Browser die alte JS-Datei aus dem Cache
    // weiterverwenden -- inkompatibel mit einem inzwischen geaenderten
    // Server-Endpunkt (siehe CHANGELOG zur render_detail-Umstellung).
    $bust = function (string $file) {
        return '?v=' . filemtime($this->getPath('assets/' . $file));
    };

    // Core: Overlay Picker -- Helfer/API-Schicht zuerst laden (mediapool3.js
    // bindet sie per Alias ein, siehe deren Datei-Header-Kommentare).
    rex_view::addCssFile($this->getAssetsUrl('mediapool3.css') . $bust('mediapool3.css'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3-helpers.js') . $bust('mediapool3-helpers.js'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3-api.js') . $bust('mediapool3-api.js'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3.js') . $bust('mediapool3.js'));

    // Widget: Input-Feld → Media Picker
    rex_view::addCssFile($this->getAssetsUrl('mediapool3_widget.css') . $bust('mediapool3_widget.css'));
    rex_view::addJsFile($this->getAssetsUrl('mediapool3_widget.js') . $bust('mediapool3_widget.js'));

    // Klassische REX_MEDIA[n]/REX_MEDIALIST[n]-Widgets auf den neuen Overlay umleiten
    rex_view::addJsFile($this->getAssetsUrl('mediapool3_classic.js') . $bust('mediapool3_classic.js'));

    // Klassischen "Medienpool"-Menüpunkt (core-Addon mediapool) auf unseren Overlay umbiegen,
    // statt das Popup-Fenster (openMediaPool) zu öffnen. Wirkt auf jede Stelle, die den
    // Link/onclick der Seite rendert (Hauptnavigation, Flyout-Menü, ggf. Breadcrumbs),
    // da direkt am rex_be_page-Objekt angesetzt wird statt am DOM.
    // Ueber "Einstellungen" abschaltbar (rex_config), falls der klassische Medienpool
    // parallel weiterverwendet werden soll.
    // https://friendsofredaxo.github.io/tricks/backend/backend_snippets#seite-eines-addons-durch-eigene-austauschenersetzen
    $addonName = $this->getName();
    rex_extension::register('PAGES_PREPARED', static function () use ($addonName) {
        if (!rex_config::get($addonName, 'replace_classic_mediapool', true)) {
            return;
        }

        $mediapool = rex_be_controller::getPages()['mediapool'] ?? null;
        if ($mediapool instanceof rex_be_page) {
            $mediapool->setPopup('MP3.open(); return false;');

            // Die klassische Dateiliste (mediapool/media) ist durch unseren Overlay ersetzt
            // und wird aus der Navigation entfernt. Die Route bleibt aber aktiv, da TinyMCE/
            // CKEditor5 sie intern per echtem Popup-Fenster fuer die Bildauswahl im Editor
            // ansteuern (openREXMedia('tinymce_medialink', ...) -> page=mediapool/media).
            $mediaSubpage = $mediapool->getSubpage('media');
            if ($mediaSubpage instanceof rex_be_page) {
                $mediaSubpage->setHidden(true);
            }
        }
    });

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

        // Feature-Toggles (Einstellungsseite) -- Tagging/Sammlungen koennen unabhaengig
        // voneinander abgeschaltet werden, siehe features-Objekt in mediapool3.js.
        // rex_config speichert "disable_*" (nicht "feature_*"): eine nicht angehakte
        // rex_config_form-Checkbox schreibt null statt 0, was von "Key nie gesetzt"
        // nicht unterscheidbar ist -- mit Default false ("nicht deaktiviert") passt
        // das trotzdem, weil unberuehrt/nie gespeichert dann korrekt "aktiviert" ergibt.
        $featureTagging = rex_config::get($addonName, 'disable_tagging', false) ? '0' : '1';
        $featureCollections = rex_config::get($addonName, 'disable_collections', false) ? '0' : '1';

        // Klassische Unterseiten des Medienpools (Struktur, Hochladen, Sync, sowie von
        // Drittaddons wie mediatools/ffmpeg eingeklinkte Seiten) bleiben ueber ein
        // Verwaltungs-Icon im Overlay erreichbar, da der Hauptmenuepunkt jetzt den
        // Overlay statt der klassischen Seite oeffnet.
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

        $inject = '<div id="mp3-root" data-schema-url="' . rex_escape($schemaUrl) . '" data-json-url="' . rex_escape($jsonUrl) . '" data-tags-url="' . rex_escape($tagsUrl) . '" data-categories-url="' . rex_escape($categoriesUrl) . '" data-unused-url="' . rex_escape($unusedUrl) . '" data-can-filter-unused="' . $canFilterUnused . '" data-focuspoint-url="' . rex_escape($focuspointUrl) . '" data-focuspoint-available="' . $focuspointAvailable . '" data-subpages="' . rex_escape(json_encode($subpages)) . '" data-feature-tagging="' . $featureTagging . '" data-feature-collections="' . $featureCollections . '"></div>';
        $content = str_replace('</body>', $inject . "\n" . '</body>', $content);
        $ep->setSubject($content);
    });
}
