---
name: mediaplace-dev
description: MediaPlace addon development skill. Use when working on this REDAXO media pool overlay/picker, its input widget (incl. direct upload, max-files, batch delete), the native Metainfo-field editing canvas, tags/collections, focuspoint integration, custom JSON metadata field types, YForm integration, classic-mediapool replacement, dark-mode CSS theming, custom rex_api_function endpoints, permission checks, or asset/lang deployment for this addon.
---

# MediaPlace Development Skill

Du arbeitest im REDAXO-Addon `mediaplace` (FriendsOfREDAXO, Vollbild-Medienpool-Overlay + Input-Widget + Ersatz für den klassischen Medienpool). Kein Build-Step, Vanilla JS/CSS (ES5), `#mp3-overlay`-Namespace.

## Leitprinzipien

1. **API-Addon first.** Medien-CRUD läuft über `FriendsOfREDAXO/api` (`/api/backend/media/...`), nicht über eigenes SQL. Vor jedem Eigenbau erst `src/addons/api/lib/RoutePackage/Media.php` nach einer passenden Route durchsuchen — es gibt oft mehr, als das eigene README dokumentiert. Zu Beginn jeder Session mit API-Bezug (und immer, bevor an einem der unten dokumentierten Eigenbauten/Fallbacks gearbeitet wird) die *installierte* `api`-Version und deren `CHANGELOG.md`/Routen-Definitionen aktiv gegenprüfen (`rex_addon::get('api')->getVersion()`, `git log`/`CHANGELOG.md` im `api`-Repo) — nicht nur einmalig zum Zeitpunkt des Eigenbaus. Das Addon entwickelt sich unabhängig weiter; ein Workaround, der heute noch nötig ist, kann es morgen nicht mehr sein (siehe `getAccessibleCategoryIds()`/`rex_api_mediaplace_media_list.php`, bereits mit eingebautem Versionscheck als Vorbild). Jeden bestehenden Eigenbau explizit in Frage stellen, sobald sich die api-Version geändert hat, statt ihn stillschweigend weiterzuführen.
2. **REDAXO-eigene Methoden nutzen, kein Parallel-Code.** Wo REDAXO selbst schon eine Fähigkeit hat (Medien-Berechtigungen, `rex_media`, `rex_mediapool::mediaIsInUse()`, Metainfo-Rendering/Speichern über `MEDIA_FORM_EDIT`/`MEDIA_UPDATED`, YForm-Feldtyp-Konventionen), diese wiederverwenden statt nachzubauen. Der native Metainfo-Canvas (siehe unten) ist das Musterbeispiel: rendert/speichert über REDAXOs eigene Extension Points, keine eigene Feldtyp-Logik für `med_*`-Felder.
3. **Modularisieren.** Neue, in sich geschlossene Fähigkeiten (Widget-Typen, YForm-Integration, Tag-Verwaltung) als eigene Dateien/Klassen in `lib/`, `lib/Widgets/`, `lib/yform/value/` etc. — nicht alles in `mediaplace.js`/`boot.php` anhäufen. `assets/mediaplace-*.js` (i18n/helpers/api) sind bereits so ausgelagert und werden per Alias in `mediaplace.js` UND `mediaplace_widget.js` eingebunden (`MP3Core.helpers.xxx`).
4. **Kommentare knapp halten** (pre-1.0, kein Fix-Verlauf im Code dokumentieren — das gehört in Commit-Messages, nicht in Inline-Kommentare).

## Architektur in Kürze

Fünf Teile, die unabhängig voneinander (de)aktivierbar sind (Einstellungsseite, `default_config` in `package.yml`):

1. **Overlay** (`MP3.open()`, `mediaplace.js`) — Vollbild-Picker: Kategoriebaum, Grid/Liste/Media-Wall, Suche, Tag-/Typ-Filter, Sammlungen, Multi-Select, Detail-Panel mit eigenen JSON-Metadaten-Feldern.
2. **Input-Widget** (`<input class="mp3-widget">`, `mediaplace_widget.js`) — visueller Picker für Module/YForm. Optional: `data-mp3-upload="true"` (Direkt-Upload per Drag&Drop/Klick, ganzer Container ist Drop-Zone, Kategorie-Auswahl-Dialog vor dem Upload), `data-mp3-types` (erlaubte Dateitypen), `data-mp3-max` (Obergrenze bei Mehrfachauswahl, mit Klick/Cmd/Ctrl-Klick-Markierung zum gemeinsamen Löschen), `data-mp3-view="grid"|"list"` (Start-Ansicht dieses Widgets, unabhängig von Einzel-/Mehrfachauswahl; ohne Angabe gilt die geteilte Nutzer-Präferenz aus `localStorage`, ein späterer Umschalter-Klick wechselt weiterhin global für alle Widgets der Seite).
3. **Klassische Integration** (`mediaplace_classic.js`, `boot.php`) — Hauptmenüpunkt "Medienpool" sowie `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widgets öffnen wahlweise den Overlay statt der alten Seiten/Popups.
4. **Metainfo-Canvas** (`openMetainfoCanvas()` in `mediaplace.js`, `lib/rex_api_mediaplace_metainfo_form.php`) — natives Bearbeiten echter, über das Metainfo-Addon angelegter `med_*`-Felder direkt im Overlay, über REDAXOs eigenen `MEDIA_FORM_EDIT`/`MEDIA_UPDATED`-Pfad (kein eigenes Feldtyp-System für diese Felder). Klick auf ein klassisches `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widget *innerhalb* des Canvas öffnet das eigene Grid zur Auswahl statt REDAXOs Popup (`MP3.startMetainfoPick()`).
5. **YForm-Integration** (`lib/yform/value/yform_value_mediaplace.php`, `ytemplates/bootstrap/value.mediaplace.tpl.php`) — eigener YForm-Werttyp `mediaplace`, registriert sich per Klassennamens-Konvention automatisch bei YForm (kein Boot-Hook nötig), registriert aber explizit `MEDIA_IS_IN_USE` in `boot.php` (siehe unten, kritisch).

## Wo du was findest

- `boot.php` — Assets laden, `PAGES_PREPARED`-Hook (Medienpool-Menüpunkt umbiegen), `METAINFO_CUSTOM_FIELD`-Hook (eigenes JSON-Feld read-only im klassischen Formular anzeigen), `OUTPUT_FILTER`-Hook (injiziert `#mp3-root` mit API-URLs, Feature-Toggles, i18n-JSON), YForm-Template-Pfad + `MEDIA_IS_IN_USE`-Registrierung (unconditional, außerhalb des `isBackend()`-Blocks).
- `assets/mediaplace-i18n.js` / `-helpers.js` / `-api.js` — geteilte Basis (`window.MP3Core`), von `mediaplace.js` UND `mediaplace_widget.js` per Alias genutzt. Bild-Resize-Logik (`resizeImageFile`, `isResizableImageType`) lebt hier, nicht in `mediaplace.js`, damit Overlay-Upload UND Widget-Direkt-Upload sie gemeinsam nutzen.
- `assets/mediaplace.js` — Overlay-Kern (IIFE, `window.MP3`), mehrere Tausend Zeilen, ein File.
- `assets/mediaplace_widget.js` — Input-Widget (`window.MP3Widget`), inkl. Direkt-Upload, Kategorie-Auswahl-Modal (`.mp3w-catpick-*`, eigenständig von `#mp3-overlay` — Overlay-Root existiert ggf. noch nicht), Kacheln/Liste-Umschalter.
- `assets/mediaplace_classic.js` — fängt Klicks auf klassische Widget-Buttons per Event-Delegation ab (Capture-Phase). Überschreibt **bewusst nicht** `openREXMedia()`/`openMediaPool()` selbst (TinyMCE/CKEditor5 rufen diese direkt auf). Klicks *innerhalb* `#mp3-metainfo-canvas` werden separat behandelt (eigenes Grid statt Popup).
- `lib/rex_api_mediaplace_*.php` — eigene `rex_api_function`-Endpunkte (categories, tags, json_metainfo, schema, unused, focuspoint, metainfo_form, media_list).
- `lib/rex_api_mediaplace_media_list.php` — Übergangs-Fallback für die Medienliste, nur aktiv, wenn `boot.php` die installierte `api`-Version als zu alt erkennt (`data-api-media-list-secure="0"`, siehe `#8`). Rückbau-TODO, siehe Kommentar im File.
- `lib/MediaPermission.php` — zentrale Rechteprüfung für eigene Endpunkte, inkl. `getAccessibleCategoryIds()` für den Media-List-Fallback.
- `lib/SystemTagManager.php` — Tags/Sammlungen (eigene Tabellen `rex_mediaplace_tags`/`_media_tags`). Sammlungen sind Tags mit `collection:`-Präfix (`SystemTagManager::COLLECTION_PREFIX`), keine separate Tabelle. `getFilenamesForTag()`/`getFilenamesForCollection()` für Reverse-Lookups (keine API-Route dafür, nur PHP).
- `lib/MetainfoFieldGroup.php`, `lib/Widgets/*.php` — eigenes JSON-Feld-Metadatensystem (`med_json_data`), Widget-Typen text/textarea/checkbox/select/alt/media_link. Kein Rich-Text-Feldtyp (tinymce/cke5-Support bewusst entfernt). Erweiterbar über `MEDIAPLACE_WIDGET_TYPES` Extension Point.
- `lib/ClassicMetainfoFormatter.php` — formatiert `med_json_data` read-only im klassischen Medienpool-Formular; Format-Priorität: eigene Felder vor klassischem `med_alt`, siehe `lib/AltTextStatus.php`.
- `lib/FocuspointIntegration.php` — Fokuspunkt-Editor im Detail-Panel, nur sichtbar wenn `focuspoint`-Addon installiert; Speicherung bleibt im klassischen `med_focuspoint`-Feld.
- `lib/yform/value/yform_value_mediaplace.php` — YForm-Werttyp, modelliert nach `yform/lib/Field/value/be_media.php`.
- `pages/settings.php` — `rex_config_form`, Feature-Toggles + Upload-Resize-Konfiguration (Breite/Höhe, opt-in).
- `pages/metainfo_fields.php` — Verwaltung der eigenen JSON-Feld-Definitionen.
- `pages/demo.php` — Demo-Seite mit allen Widget-Varianten inkl. YForm-Beispielen (Pipe-Syntax + JSON).

## Kritische Bereiche — hier besonders vorsichtig sein

### 1. API-Abhängigkeit: FriendsOfRedaxo/api

Medien-CRUD läuft über `/api/backend/media/...`. **Bekannte Eigenbauten mit Rückbau-TODO**: Kategorie verschieben (`apiMoveCategory()` in `rex_api_mediaplace_categories.php`, eigenes SQL weil `media/category/update` nur `name` ändern lässt); Medienliste-Fallback (`rex_api_mediaplace_media_list.php`), aktiv solange die installierte `api`-Version `media`/`backend/media` noch nicht nach Kategorie-Rechten filtert (behoben ab api 1.3.1, [PR #78](https://github.com/FriendsOfREDAXO/api/pull/78)) — Versionscheck in `boot.php` (`data-api-media-list-secure`), Umschaltung in `mediaplace-api.js` (`apiFetchMediaList()`). Vor Arbeit an einem dieser beiden prüfen, ob das api-Addon die fehlende Route/Absicherung inzwischen hat, und den Eigenbau dann entfernen.

### 2. Eigene API-Endpunkte brauchen explizite Rechteprüfung

`rex::getUser()` prüft nur "eingeloggt", nicht REDAXOs Medien-Berechtigungen. Jeder Endpunkt braucht zusätzlich `MediaPermission::hasMediaAccess()` / `::hasCategoryAccess($catId)` / `::hasFullAccess()`.

### 3. CSS-Theming: Overlay vs. Widget unterschiedlich

**Overlay** (`mediaplace.css`): `--mp3-*`-Variablen in **vier** Blöcken (`:root`, `body.rex-theme-dark`, `@media (prefers-color-scheme: dark)`, `#mp3-overlay.mp3-dark-mode`) — neue Variable immer in allen vieren definieren. Vor CSS-Änderungen:
```bash
grep -oE -- '--mp3-[a-z0-9-]+\s*:' assets/mediaplace.css | sed 's/\s*:$//' | sort -u > /tmp/defined.txt
grep -oE -- 'var\(--mp3-[a-z0-9-]+' assets/mediaplace.css | sed 's/^var(//' | sort -u > /tmp/used.txt
comm -23 /tmp/used.txt /tmp/defined.txt   # muss leer sein
python3 -c "c=open('assets/mediaplace.css').read(); print(c.count('{'), c.count('}'))"
```
**Widget** (`mediaplace_widget.css`, `mp3w-`-Prefix, kein `#mp3-overlay`-Scoping): nur **zwei** Dark-Mode-Blöcke (`body.rex-theme-dark`, `@media`), direkte Hex-Werte statt Variablen — beide synchron halten.

Weitere Fallen: REDAXO/Bootstrap setzt global `table{background-color:#fff}` (eigene Tabellen brauchen `background:transparent`); native `<select>` braucht `-webkit-appearance:none;appearance:none;` + eigenes Pfeil-SVG; REDAXOs Muted-Grau ist `#777`, nicht `#9ca5b2` (das ist Rand-/Icon-Grau); kein `border-radius` außer bei echten Kreisen.

### 4. Opcache-Falle (PHP-Änderungen erscheinen verzögert)

Ist auf dem Zielsystem `opcache.validate_timestamps=On` mit einer `revalidate_freq` > 0 gesetzt, können PHP-Edits eine Weile "stale" wirken. Falls Änderungen nicht ankommen: Webserver/PHP-Prozess neu laden lassen (z.B. `apache2ctl graceful`, PHP-FPM-Reload, oder Opcache-Reset je nach Setup) statt am Code zu zweifeln.

### 5. Metainfo-Canvas: Extension Points werden lazy geladen

`metainfo/lib/handler/media_handler.php` registriert `MEDIA_FORM_EDIT`/`MEDIA_UPDATED` nur, wenn REDAXO selbst erkennt, dass die aktuelle Seite `mediapool` ist (`PAGE_CHECKED`-Hook) — ein eigener `rex-api-call`-Endpunkt löst das nie aus. `rex_api_mediaplace_metainfo_form.php::ensureMetainfoMediaHandler()` lädt die Handler-Datei deshalb manuell nach (`@internal`-Datei, kein öffentlicher Vertrag — kann bei Metainfo-Updates ohne Vorwarnung brechen). Drittanbieter-Feldtypen wie `metainfo_lang_fields` können **eigene** Seiten-Erkennung haben, die denselben Fehler macht (siehe dessen `boot.php` — dort wurde die Seiten-Allowlist entfernt und die Registrierung unconditional gemacht, plus ein `defined()`-Guard gegen doppeltes Booten bei kombinierten `page`+`rex-api-call`-Requests).

### 6. Upload-Resize: `canvas.toBlob()` fällt bei nicht unterstützten Formaten still auf PNG zurück

`MP3Core.helpers.resizeImageFile()` prüft `blob.type !== file.type` und verwirft die Verkleinerung in dem Fall (Original wird unverändert hochgeladen) — sonst würde z.B. eine `.avif`-Datei mit falschem `.type`-Label aber tatsächlich PNG-kodiertem Inhalt hochgeladen. GIFs und SVGs werden von `isResizableImageType()` immer ausgeschlossen (GIFs könnten animiert sein, SVGs sind kein Rasterbild).

### 7. bootstrap-select + Kategorie-Hierarchie: `&nbsp;` statt Leerzeichen

Wird ein `<select>` per `.selectpicker()` initialisiert (Kategorie-Auswahl-Dialoge), rendert es Optionen in eigenen `<a>`-Elementen — normale führende Leerzeichen zur Einrückung der Baumtiefe werden dabei wie üblich beim HTML-Rendering kollabiert. `&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth)` verwenden, nicht `'    '.repeat(depth)` (Letzteres funktioniert nur bei einem *nativen*, nicht-selectpicker-isierten `<select>`).

### 8. YForm-Integration: `MEDIA_IS_IN_USE` muss explizit registriert werden

YForm entdeckt eigene Werttypen (`rex_yform_value_<name>`) automatisch per Klassennamens-Konvention (keine Registrierung nötig) — der "Datei in Verwendung"-Check (`rex_mediapool::mediaIsInUse()`) ist aber ein **separater** Mechanismus. Ohne eigene `rex_extension::register('MEDIA_IS_IN_USE', [...])`-Registrierung in `boot.php` (siehe `yform_value_mediaplace::isMediaInUse()`, modelliert nach `yform/lib/Field/value/be_media.php`) würde REDAXO Dateien, die nur über das `mediaplace`-YForm-Feld referenziert werden, fälschlich als "unbenutzt, kann gelöscht werden" melden. Kein anderer YForm-Feldtyp übernimmt das automatisch für neue Typen — jeder Werttyp, der Medien referenziert, muss selbst registrieren (das first-party `be_media` und das Drittanbieter `filepond`/`uppy` tun es alle einzeln).

### 9. CLI/Console-Kontext führt kein `boot.php` aus

`bin/console`-Kommandos (und jedes eigene CLI-Testskript, das REDAXO manuell per `rex_package::require($id)->enlist()` bootstrapped) laden zwar Autoload/Klassen, führen aber **keine** `boot.php`-Dateien der Addons aus — `rex_extension::register()`-Aufrufe darin greifen also in CLI-Testskripten nicht, auch wenn die Klasse selbst `class_exists()` liefert. Für Live-Verifikation von boot.php-registrierten Extension Points entweder die Registrierung im Testskript selbst nachholen (nur zum isolierten Prüfen der Logik) oder über einen echten HTTP-Request testen (`curl` mit Session-Cookie).

### 10. Sprachdateien: flaches Format, kein PHP

`lang/*.lang` sind reine Text-Dateien (`key = value`), keine PHP-Syntax. DE/EN müssen exakt dieselben Keys haben — vor jedem Commit prüfen:
```bash
diff <(grep -oE "^mediaplace_[a-z0-9_]+" lang/de_de.lang | sort -u) <(grep -oE "^mediaplace_[a-z0-9_]+" lang/en_gb.lang | sort -u)
```

### 11. Neue `rex_api_*`-Endpunkte: `$published` nicht vergessen, falls per JS/`fetch()` statt normaler Navigation aufgerufen

`rex_api_function::$published` ist standardmäßig `false` — dann greift der Aufruf nur, wenn `rex::isBackend()` zum Zeitpunkt des konkreten Requests wahr ist. Das hängt am tatsächlichen PHP-Einstiegspunkt, nicht an der Session: in diesem (modernen Layout-)Setup setzt `public/index.php` `$REX['REDAXO'] = false`, nur `public/redaxo/index.php` setzt `true`. `rex_url::backendController()` liefert bewusst einen *relativen* Pfad (`index.php?rex-api-call=...`), der sich beim Aufruf per `fetch()` gegen die aktuelle Seiten-URL auflöst — landet die aufrufende Seite selbst nicht unter `/redaxo/...`, landet auch der API-Call auf dem Frontend-Einstiegspunkt und wird mit `rex_api_exception: "... is not published, therefore can only be called from the backend!"` abgewiesen (kein Hinweis auf die eigentliche Ursache). Betraf `rex_api_mediaplace_media_list.php` konkret. Für jeden neuen Endpunkt, der Eigenrechte prüft (wie hier `MediaPermission::hasMediaAccess()`), `protected $published = true;` setzen — keine Sicherheitslockerung, `execute()` prüft die Berechtigung ohnehin selbst, umgeht nur das `isBackend()`-Gate. Vor dem Melden eines mysteriösen Fetch-Fehlers ("SyntaxError", "did not match expected pattern" o.ä.) immer zuerst den `system.log`-Eintrag bzw. die HTTP-Response direkt prüfen (`curl`), bevor man in der URL-Konstruktion sucht — die eigentliche Fehlermeldung steht meist im Response-Body, nicht in der irreführenden generischen JS-Fehlermeldung.

## Arbeitsweise

1. Kleinsten Codepfad finden, der das Verhalten kontrolliert.
2. Vor JS-Änderungen: `node --check assets/<datei>.js` (jede geänderte Datei einzeln, inkl. `-helpers.js`/`-api.js`/`_widget.js`/`_classic.js`).
3. Vor CSS-Änderungen: Undefined-Var-Check (Overlay) + Brace-Balance (beide CSS-Dateien).
4. Vor PHP-Änderungen: `php -l <file>`.
5. Nach jeder Asset-Änderung: `php bin/console assets:sync` (vom REDAXO-Root aus; ggf. in den Kontext des jeweiligen Setups einbetten, z.B. Container-Exec, SSH).
6. Nach package.yml/lang-Änderungen: `php bin/console cache:clear`.
7. Nach PHP-Änderungen ggf. Opcache-Reset/Prozess-Reload, siehe Punkt 4 oben.
8. Nach jedem Deploy: `var/log/system.log` (ab REDAXO-Root) auf neue Einträge nach dem eigenen Zeitstempel prüfen — echtes Warnsignal, keine stillschweigend ignorieren.
9. Bei sichtbaren Feature-Änderungen: `CHANGELOG.md` (neuer Versionseintrag, `package.yml`-Version mitziehen), `README.md` und `pages/demo.php` aktuell halten.

## Verifikations-Disziplin

- Live-Verifikation bevorzugen (curl mit Session-Cookie, direkte DB-Abfragen) statt "sollte funktionieren" anzunehmen — besonders bei Extension-Point-Registrierungen und Datenbank-Constraints.
- Eigene Testdaten (Skripte unter `bin/_tmp_*.php`, YForm-Testtabellen, testweise gesetzte Config-Werte) **immer** wieder aufräumen, auch wenn das Skript mit einem Fehler abbricht — danach explizit per SQL/Dateisystem prüfen, dass nichts übrig geblieben ist.
- `rm -rf`/`DROP TABLE`/Config-Reset nur auf selbst angelegte Testartefakte anwenden, nie auf bestehende Daten ohne Rückfrage.
