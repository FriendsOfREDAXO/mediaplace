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
     * Zugriff auf eine konkrete Kategorie (inkl. "Alle Kategorien"-Recht) --
     * KASKADIEREND: ist ein VORFAHRE der Kategorie freigegeben, gilt das auch
     * fuer ihren gesamten Unterbaum. Bewusste Abweichung vom klassischen
     * Medienpool, dessen Rechte-Widget (rex_media_category_select mit
     * checkPerms=false) jede Kategorie unabhaengig/flach behandelt -- ein
     * Admin muesste dort jede Unterkategorie einzeln ankreuzen. MediaPlace
     * behandelt "Zugriff auf X" bewusst als "Zugriff auf X und alles
     * darunter", konsequente Fortsetzung von hasParentCategoryAccess()'s
     * Modell ("frei arbeiten innerhalb einer freigegebenen Kategorie"): eine
     * dort neu angelegte -- oder bereits vorhandene, vom Admin nicht separat
     * freigegebene -- Unterkategorie muss fuer denselben User auch
     * sichtbar/durchsuchbar sein, sonst waere "frei anlegen/verwalten"
     * halbfertig (siehe CHANGELOG fuer die Diskussion der Kompromisse).
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

        $perm = $user->getComplexPerm('media');
        if ($perm->hasCategoryPerm($categoryId)) {
            return true;
        }

        if (0 === $categoryId) {
            return false; // "kein Ordner" hat keine Vorfahren zum Kaskadieren
        }
        $category = \rex_media_category::get($categoryId);
        if (!$category) {
            return false;
        }
        foreach (explode('|', trim($category->getPath(), '|')) as $ancestorId) {
            if ('' === $ancestorId) {
                continue;
            }
            if ($perm->hasCategoryPerm((int) $ancestorId)) {
                return true;
            }
        }

        return false;
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

        $allCategoryIds = array_map('intval', array_column(
            \rex_sql::factory()->getArray('SELECT id FROM ' . \rex::getTable('media_category')),
            'id',
        ));
        $allCategoryIds[] = 0; // "kein Ordner" ist ein eigenes Recht, siehe hasCategoryPerm(0)

        // hasCategoryAccess() statt rohem $perm->hasCategoryPerm(): kaskadiert
        // auf Vorfahren, siehe dortiger Kommentar -- sonst waeren Unterkategorien
        // einer freigegebenen Kategorie hier faelschlich nicht enthalten.
        return array_values(array_filter(
            $allCategoryIds,
            static fn (int $id): bool => self::hasCategoryAccess($id),
        ));
    }

    /**
     * Zugriff auf die ELTERN-Kategorie einer Kategorie -- massgeblich fuer
     * Operationen, die die Kategorie selbst aus ihrem Elternverzeichnis
     * entfernen/veraendern (umbenennen, loeschen, Verschieben als Quelle).
     *
     * Bewusst NICHT hasCategoryAccess() auf die Kategorie selbst: ein User
     * mit Zugriff nur auf Kategorie X soll innerhalb von X frei arbeiten
     * koennen (Unterkategorien anlegen/umbenennen/loeschen/verschieben),
     * X selbst aber nicht umbenennen/loeschen/verschieben koennen -- sonst
     * koennte er die ihm zugewiesene Ordnergrenze selbst aufloesen. Klassisches
     * REDAXO ist hier zum Vergleich strenger: Kategorieverwaltung ist komplett
     * PERMALL-only (mediapool/pages/structure.php, $PERMALL = hasCategoryPerm(0)),
     * ein auf einzelne Kategorien eingeschraenkter User kann dort ueberhaupt
     * keine Kategorie anlegen/umbenennen/loeschen, auch nicht innerhalb der
     * eigenen. MediaPlace erlaubt das bewusst (bessere UX fuer Redakteure, die
     * ihren Bereich selbst organisieren sollen) -- schuetzt dafuer aber die
     * Grenze selbst ueber diese Methode.
     *
     * $parentId 0 = echte Wurzel (rex_media_category.parent_id bei
     * Top-Level-Kategorien). Trotz identischer Zahl technisch etwas anderes
     * als categoryId 0 ("kein Ordner", Dateien ohne Kategorie) -- REDAXO-Core
     * verwendet fuer die Kategorieverwaltungs-Berechtigung an der Wurzel aber
     * exakt dasselbe Recht ($PERMALL = hasCategoryPerm(0), siehe
     * mediapool/pages/structure.php), das inkludiert hasAll() bereits selbst
     * (rex_media_perm::hasCategoryPerm() = hasAll() || in_array(...)).
     * hasCategoryAccess(0) deckt genau das schon korrekt ab -- keine
     * Sonderbehandlung noetig.
     */
    public static function hasParentCategoryAccess(int $parentId): bool
    {
        return self::hasCategoryAccess($parentId);
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
