<?php

namespace FriendsOfRedaxo\Mediaplace;

/**
 * Zentrale Berechtigungspruefung fuer die Mediapool3-API-Endpunkte.
 * Spiegelt die Rechte, die REDAXO fuer den klassischen Medienpool durchsetzt
 * (rex_media_perm), damit unsere Endpunkte nicht mehr pruefen als
 * "irgendein eingeloggter Backend-User" -- vorher wurde die tatsaechliche
 * Medien-Berechtigung (hasMediaPerm/hasCategoryPerm/hasAll) nirgends
 * ausgewertet.
 */
class MediaPermission
{
    /**
     * Mindestens irgendeine Medien-Berechtigung (irgendeine Kategorie oder "Alle").
     */
    public static function hasMediaAccess(): bool
    {
        $user = \rex::getUser();
        if (!$user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }

        return $user->getComplexPerm('media')->hasMediaPerm();
    }

    /**
     * Zugriff auf eine konkrete Kategorie (inkl. "Alle Kategorien"-Recht).
     */
    public static function hasCategoryAccess(int $categoryId): bool
    {
        $user = \rex::getUser();
        if (!$user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }

        return $user->getComplexPerm('media')->hasCategoryPerm($categoryId);
    }

    /**
     * Uneingeschraenkter Medienzugriff -- fuer kategorieuebergreifende
     * Operationen (z.B. globaler Sammlungs-Katalog).
     */
    public static function hasFullAccess(): bool
    {
        $user = \rex::getUser();
        if (!$user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }

        return $user->getComplexPerm('media')->hasAll();
    }

    /**
     * Eigenes, granulares Recht (nicht Teil von rex_media_perm) fuer den
     * "Nur unbenutzte Medien"-Filter -- registriert per rex_perm::register()
     * in boot.php. Getrennt von den media-Komplexrechten oben, weil "diesen
     * (teuren) Filter nutzen duerfen" eine andere Frage ist als "auf welche
     * Kategorien zugreifen".
     */
    public static function hasUnusedFilterAccess(): bool
    {
        $user = \rex::getUser();
        if (!$user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }

        return $user->hasPerm('mediaplace[view_unused_media]');
    }
}
