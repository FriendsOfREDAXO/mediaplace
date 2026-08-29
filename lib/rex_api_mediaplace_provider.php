<?php

/**
 * Dispatcher fuer Cloud-Provider-Addons (siehe StorageProviderInterface /
 * StorageProviderRegistry) -- ein Endpunkt fuer Browsen/Suchen, Thumbnails
 * und Import, statt dass jeder Provider seine eigene, einzeln abzusichernde
 * Route mitbringen muss. Rechte-Pruefung zentral an einer Stelle:
 * StorageProviderRegistry::getInstance() liefert nur eine Instanz, wenn der
 * aktuelle User das vom Provider selbst deklarierte `perm` hat.
 *
 * GET ?rex-api-call=mediaplace_provider&func=entries&provider=X&path=P[&search=Q]
 * GET ?rex-api-call=mediaplace_provider&func=thumbnail&provider=X&path=P
 * GET ?rex-api-call=mediaplace_provider&func=import&provider=X&path=P&category_id=C
 */
class rex_api_mediaplace_provider extends rex_api_function
{
    public function execute(): rex_api_result
    {
        rex_response::cleanOutputBuffers();

        $user = rex::getUser();
        if (!$user) {
            rex_response::setStatus(rex_response::HTTP_UNAUTHORIZED);
            rex_response::sendJson(['error' => 'Unauthorized']);
            exit;
        }

        $providerId = rex_request('provider', 'string', '');
        $provider = '' !== $providerId ? \FriendsOfRedaxo\Mediaplace\StorageProviderRegistry::getInstance($providerId) : null;
        if (!$provider) {
            rex_response::setStatus(rex_response::HTTP_FORBIDDEN);
            rex_response::sendJson(['error' => 'Unknown provider or permission denied']);
            exit;
        }

        $func = rex_request('func', 'string', '');
        match ($func) {
            'entries' => $this->handleEntries($provider),
            'thumbnail' => $this->handleThumbnail($provider),
            'import' => $this->handleImport($provider),
            default => $this->handleUnknownFunc(),
        };
        exit;
    }

    private function handleEntries(\FriendsOfRedaxo\Mediaplace\StorageProviderInterface $provider): void
    {
        $path = rex_request('path', 'string', '');
        $search = rex_request('search', 'string', '');

        try {
            $entries = $provider->listEntries($path, '' !== $search ? $search : null);
        } catch (\Throwable $e) {
            rex_response::setStatus(rex_response::HTTP_INTERNAL_ERROR);
            rex_response::sendJson(['error' => $e->getMessage()]);
            return;
        }

        rex_response::sendJson(['data' => $entries, 'has_search' => $provider->hasSearch()]);
    }

    private function handleThumbnail(\FriendsOfRedaxo\Mediaplace\StorageProviderInterface $provider): void
    {
        $path = rex_request('path', 'string', '');

        try {
            $thumbnail = $provider->getThumbnail($path);
        } catch (\Throwable $e) {
            $thumbnail = null;
        }

        if (!$thumbnail) {
            // Kein JSON-Fehler hier: der Client bindet diesen Endpunkt direkt
            // als <img src> ein und faellt bei einem fehlgeschlagenen Laden
            // auf das Datei-Icon zurueck (gleicher error-Listener wie bei
            // lokalen Video-/Bild-Vorschaubildern, siehe mediapool3.js).
            rex_response::setStatus(rex_response::HTTP_NOT_FOUND);
            exit;
        }

        rex_response::setHeader('Content-Type', $thumbnail['contentType']);
        // "private": Thumbnails koennen je nach Provider zugriffsgeschuetzt
        // sein, kein geteilter/oeffentlicher Proxy-Cache.
        rex_response::setHeader('Cache-Control', 'private, max-age=3600');
        echo $thumbnail['content'];
    }

    private function handleImport(\FriendsOfRedaxo\Mediaplace\StorageProviderInterface $provider): void
    {
        $path = rex_request('path', 'string', '');
        $categoryId = rex_request('category_id', 'int', 0);

        if (!\FriendsOfRedaxo\Mediaplace\MediaPermission::hasCategoryAccess($categoryId)) {
            rex_response::setStatus(rex_response::HTTP_FORBIDDEN);
            rex_response::sendJson(['error' => 'Permission denied']);
            return;
        }

        try {
            $filename = $provider->importToMediaPool($path, $categoryId);
        } catch (\Throwable $e) {
            rex_response::setStatus(rex_response::HTTP_INTERNAL_ERROR);
            rex_response::sendJson(['error' => $e->getMessage()]);
            return;
        }

        rex_response::sendJson(['filename' => $filename]);
    }

    private function handleUnknownFunc(): void
    {
        rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
        rex_response::sendJson(['error' => 'Unknown func']);
    }
}
