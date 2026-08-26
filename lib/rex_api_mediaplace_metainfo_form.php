<?php

/**
 * MediaPlace – Prototyp: echte REDAXO-Metainfo-Felder direkt im Overlay
 * editieren, ueber REDAXOs eigenen Rendering-/Speicherpfad statt eigener
 * Re-Implementierung pro Feldtyp.
 *
 * GET  ?rex-api-call=mediaplace_metainfo_form&file=...
 *      Feuert denselben MEDIA_FORM_EDIT-Erweiterungspunkt wie die klassische
 *      Medienpool-Bearbeiten-Seite (mediapool/pages/media.detail.php:228) und
 *      liefert das daraus resultierende Formular-HTML unveraendert zurueck --
 *      exakt dieselben Feld-Widgets (Select/Date/Medien-Picker/Link-Picker/...)
 *      wie im klassischen Medienpool, kein eigenes Rendering noetig.
 *
 * POST ?rex-api-call=mediaplace_metainfo_form&file=...
 *      Body: die vom obigen Formular geposteten Feldwerte, als echtes
 *      multipart/form-data -- NICHT JSON. REDAXOs eigener Speicherpfad liest
 *      $_POST direkt (metainfo/lib/handler/handler.php::fetchRequestValues()/
 *      getSaveValue()), kein manuelles Body-Parsing hier. Ruft
 *      rex_media_service::updateMedia() mit unveraendertem title/category_id
 *      auf -- das feuert intern MEDIA_UPDATED, woran sich metainfo's eigener
 *      Handler (metainfo/lib/handler/media_handler.php) haengt und die
 *      echten med_*-Spalten selbst speichert. Wir fassen sie nirgends an.
 */
class rex_api_mediaplace_metainfo_form extends rex_api_function
{
    public function execute(): rex_api_result
    {
        rex_response::cleanOutputBuffers();

        if (!rex::getUser()) {
            rex_response::setStatus(rex_response::HTTP_UNAUTHORIZED);
            rex_response::sendJson(['error' => 'Unauthorized']);
            exit;
        }

        if (!rex_addon::get('metainfo')->isAvailable()) {
            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
            rex_response::sendJson(['error' => 'metainfo addon not available']);
            exit;
        }

        $this->ensureMetainfoMediaHandler();

        $filename = rex_request('file', 'string', '');
        $media = '' !== $filename ? rex_media::get($filename) : null;
        if (!$media) {
            rex_response::setStatus(rex_response::HTTP_NOT_FOUND);
            rex_response::sendJson(['error' => 'Media not found']);
            exit;
        }

        if (!\FriendsOfRedaxo\Mediaplace\MediaPermission::hasCategoryAccess($media->getCategoryId())) {
            rex_response::setStatus(rex_response::HTTP_FORBIDDEN);
            rex_response::sendJson(['error' => 'Permission denied']);
            exit;
        }

        if ('post' === rex_request_method()) {
            $this->handleSave($media);
        } else {
            $this->handleForm($media);
        }
        exit;
    }

    private function handleForm(rex_media $media): void
    {
        // Gleiche Query wie media.detail.php:99-100 -- MEDIA_FORM_EDIT
        // erwartet ein rex_sql-Objekt mit der vollen Zeile, kein rex_media.
        $gf = rex_sql::factory();
        $gf->setQuery('SELECT * FROM ' . rex::getTablePrefix() . 'media WHERE id = ?', [$media->getId()]);
        if (1 !== $gf->getRows()) {
            rex_response::setStatus(rex_response::HTTP_NOT_FOUND);
            rex_response::sendJson(['error' => 'Media not found']);
            return;
        }

        $html = rex_extension::registerPoint(new rex_extension_point('MEDIA_FORM_EDIT', '', [
            'id' => $media->getId(),
            'media' => $gf,
        ]));

        rex_response::sendJson(['success' => true, 'html' => $html]);
    }

    private function handleSave(rex_media $media): void
    {
        try {
            \rex_media_service::updateMedia($media->getFileName(), [
                'title' => $media->getTitle(),
                'category_id' => $media->getCategoryId(),
            ]);
        } catch (rex_api_exception $e) {
            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
            rex_response::sendJson(['error' => $e->getMessage()]);
            return;
        }

        rex_response::sendJson(['success' => true]);
    }

    /**
     * media_handler.php (registriert MEDIA_FORM_EDIT/MEDIA_UPDATED) wird von
     * REDAXO-Core nur lazy geladen, wenn man tatsaechlich die klassische
     * Medienpool-Seite besucht (rex_metainfo_extensions_handler() am
     * PAGE_CHECKED-EP, gebunden an rex_be_controller::getCurrentPagePart(1)
     * === 'mediapool', siehe metainfo/functions/function_metainfo.php:256-257).
     * Ein rex-api-call-Request durchlaeuft das nie -- ohne dieses manuelle
     * Require bleiben beide Erweiterungspunkte wirkungslos (kein Listener
     * registriert), ohne dass das sichtbar fehlschlaegt. @internal-Datei,
     * kein oeffentlicher Vertrag -- kann bei einem metainfo-Update brechen.
     */
    private function ensureMetainfoMediaHandler(): void
    {
        if (class_exists('rex_metainfo_media_handler', false)) {
            return;
        }
        $handlerPath = rex_addon::get('metainfo')->getPath('lib/handler/');
        require_once $handlerPath . 'handler.php';
        require_once $handlerPath . 'media_handler.php';
    }
}
