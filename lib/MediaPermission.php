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
     * Alle Kategorie-IDs (inkl. 0 = "kein Ordner"), auf die der aktuelle User
     * Zugriff hat. Nur relevant, wenn hasFullAccess() false ist -- Aufrufer
     * sollte das zuerst pruefen, statt hier unnoetig durch alle Kategorien
     * zu iterieren. Es gibt keinen oeffentlichen Getter fuer die rohe
     * Rechteliste auf rex_complex_perm, daher Einzelpruefung pro Kategorie
     * (gleiches Muster wie mediapool/lib/media_category_select.php::addCatOption()).
     * Genutzt vom eigenen Medienlisten-Fallback (rex_api_mediaplace_media_list),
     * solange das FriendsOfRedaxo/api-Addon media/list selbst noch nicht nach
     * Kategorie-Rechten filtert (siehe README/CHANGELOG).
     *
     * @return list<int>
     */
    public static function getAccessibleCategoryIds(): array
    {
        $user = \rex::getUser();
        if (!$user) {
            return [];
        }
        if (self::hasFullAccess()) {
            return array_map('intval', array_column(
                \rex_sql::factory()->getArray('SELECT id FROM ' . \rex::getTable('media_category')),
                'id',
            ));
        }

        $perm = $user->getComplexPerm('media');
        $allCategoryIds = array_map('intval', array_column(
            \rex_sql::factory()->getArray('SELECT id FROM ' . \rex::getTable('media_category')),
            'id',
        ));
        $allCategoryIds[] = 0; // "kein Ordner" ist ein eigenes Recht, siehe hasCategoryPerm(0)

        return array_values(array_filter(
            $allCategoryIds,
            static fn (int $id): bool => $perm->hasCategoryPerm($id),
        ));
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
