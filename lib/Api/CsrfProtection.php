<?php

namespace FriendsOfRedaxo\Mediaplace\Api;

/**
 * CSRF-Schutz für die MediaPlace-Endpunkte – REDAXOs eigener Mechanismus (rex_api_function::requiresCsrfProtection(),
 * ein Token je Endpunkt-Klasse), nur mit JSON-Antwort statt stillem Abbruch.
 *
 * Warum: Die Endpunkte prüfen Login und Rechte, aber ohne Token kann eine fremde Webseite einen angemeldeten
 * Redakteur dazu bringen, Aktionen auszulösen – z. B. per Weiterleitung auf ?rex-api-call=mediaplace_video_optimize
 * &func=start&file=… (der Session-Cookie ist SameSite=Lax und wird bei solchen Navigationen mitgeschickt).
 *
 * Lesende Anfragen brauchen kein Token (z. B. Vorschaubilder als <img src>, Listen für andere AddOns). Jede Klasse
 * legt in CSRF_READ_ONLY fest, welche GET-Anfragen nur lesen:
 *  - true                          jede GET-Anfrage liest nur
 *  - ['func' => ['entries', …]]    nur GET-Anfragen mit diesen Werten
 *  - []                            jede Anfrage braucht ein Token
 *
 * Das Token kommt aus dem Overlay (#mp-root[data-api-tokens], siehe boot.php und csrfUrl() in mediaplace-api.js) bzw.
 * per Klasse::getUrlParams().
 */
trait CsrfProtection
{
    protected function requiresCsrfProtection()
    {
        if (!$this->isReadOnlyRequest() && !\rex_csrf_token::factory(static::class)->isValid()) {
            \rex_response::cleanOutputBuffers();
            \rex_response::setStatus(\rex_response::HTTP_FORBIDDEN);
            \rex_response::sendJson(['error' => \rex_i18n::msg('csrf_token_invalid')]);
            exit;
        }

        // geprüft (oder nur lesend) – REDAXO muss nicht noch einmal prüfen
        return false;
    }

    private function isReadOnlyRequest(): bool
    {
        if ('get' !== rex_request_method()) {
            return false;
        }
        $rule = static::CSRF_READ_ONLY;
        if (true === $rule) {
            return true;
        }
        foreach ((array) $rule as $param => $values) {
            if (in_array(rex_get((string) $param, 'string', ''), (array) $values, true)) {
                return true;
            }
        }

        return false;
    }
}
