---
name: mediaplace-dev
description: MediaPlace addon development skill. Use when working on this REDAXO media pool overlay/picker, its input widget (incl. direct upload, max-files, batch delete), the native Metainfo-field editing canvas, tags/collections, cloud-storage provider browsing/import, KI-Funktionen (ALT-Text/Tag-Vorschläge), focuspoint integration, custom JSON metadata field types, YForm integration, classic-mediapool replacement, dark-mode CSS theming, custom rex_api_function endpoints, permission checks, the esbuild-based Overlay-JS build, or asset/lang deployment for this addon.
---

# MediaPlace Development Skill

Du arbeitest im REDAXO-Addon `mediaplace` (FriendsOfREDAXO, Vollbild-Medienpool-Overlay + Input-Widget + Ersatz für den klassischen Medienpool). `#mp3-overlay`-Namespace. **Der Overlay-Kern hat einen Build-Step** (esbuild, siehe unten) – die übrigen Assets (Widget, klassische Integration, geteilte Helfer, CSS) bleiben normale, von Hand editierte Dateien ohne Build.

## Leitprinzipien

1. **API-Addon first.** Medien-CRUD läuft über `FriendsOfREDAXO/api` (`/api/backend/media/...`), nicht über eigenes SQL. Vor jedem Eigenbau erst `src/addons/api/lib/RoutePackage/Media.php` nach einer passenden Route durchsuchen — es gibt oft mehr, als das eigene README dokumentiert. Zu Beginn jeder Session mit API-Bezug (und immer, bevor an einem der unten dokumentierten Eigenbauten/Fallbacks gearbeitet wird) die *installierte* `api`-Version und deren `CHANGELOG.md`/Routen-Definitionen aktiv gegenprüfen (`rex_addon::get('api')->getVersion()`, `git log`/`CHANGELOG.md` im `api`-Repo) — nicht nur einmalig zum Zeitpunkt des Eigenbaus. Das Addon entwickelt sich unabhängig weiter; ein Workaround, der heute noch nötig ist, kann es morgen nicht mehr sein (siehe `getAccessibleCategoryIds()`/`lib/Api/MediaList.php`, bereits mit eingebautem Versionscheck als Vorbild). Jeden bestehenden Eigenbau explizit in Frage stellen, sobald sich die api-Version geändert hat, statt ihn stillschweigend weiterzuführen.
2. **REDAXO-eigene Methoden nutzen, kein Parallel-Code.** Wo REDAXO selbst schon eine Fähigkeit hat (Medien-Berechtigungen, `rex_media`, `rex_mediapool::mediaIsInUse()`, Metainfo-Rendering/Speichern über `MEDIA_FORM_EDIT`/`MEDIA_UPDATED`, YForm-Feldtyp-Konventionen), diese wiederverwenden statt nachzubauen. Der native Metainfo-Canvas (siehe unten) ist das Musterbeispiel: rendert/speichert über REDAXOs eigene Extension Points, keine eigene Feldtyp-Logik für `med_*`-Felder.
3. **Modularisieren.** Der Overlay-Kern selbst folgt einem Hub-and-Spoke-Muster: `src/mediaplace/core.js` importiert benannte Funktionen aus `src/mediaplace/modules/*.js` (ein File pro Feature: `grid.js`, `detail.js`, `categories.js`, `filters.js`, `multiselect.js`, `providers.js`, `ai_alt.js`, `ai_tags.js`, `modals.js`, `upload.js`, `collections.js`, `cropper.js`, `focuspoint.js`, `lightbox.js`, `optimize.js`, ...) und verdrahtet sie über ein `ctx`-Objekt (DOM-Refs + Getter/Setter für noch in `core.js` verbliebenen State) – kein zentraler Event-Bus, direkte Funktionsimporte. Server-seitig: neue, in sich geschlossene Fähigkeiten als eigene Klassen in `lib/`, `lib/Api/` (REST-Endpunkte), `lib/Widgets/`, `lib/yform/value/` etc. — nicht alles in `boot.php` anhäufen. `assets/mediaplace-*.js` (i18n/helpers/api) sind bereits ausgelagert und werden per Alias in `src/mediaplace/core.js` UND `assets/mediaplace_widget.js` eingebunden (`MP3Core.helpers.xxx`).
4. **Kommentare knapp halten** (pre-1.0, kein Fix-Verlauf im Code dokumentieren — das gehört in Commit-Messages, nicht in Inline-Kommentare).

## Architektur in Kürze

Fünf Teile, die unabhängig voneinander (de)aktivierbar sind (Einstellungsseite, `default_config` in `package.yml`):

1. **Overlay** (`MP3.open()`, Quelle `src/mediaplace/core.js` + `src/mediaplace/modules/*.js`, per esbuild zu `assets/mediaplace.js` gebündelt — siehe DEV.md für den Build-Workflow) — Vollbild-Picker: Kategoriebaum, Grid/Liste/Media-Wall, Suche, Tag-/Typ-Filter, Sammlungen, Cloud-Provider-Browsing (siehe `modules/providers.js`), Multi-Select, Detail-Panel mit eigenen JSON-Metadaten-Feldern, KI-Funktionen.
2. **Input-Widget** (`<input class="mp3-widget">`, `assets/mediaplace_widget.js`, kein Build-Step) — visueller Picker für Module/YForm. Optional: `data-mp3-upload="true"` (Direkt-Upload per Drag&Drop/Klick, ganzer Container ist Drop-Zone, Kategorie-Auswahl-Dialog vor dem Upload), `data-mp3-types` (erlaubte Dateitypen), `data-mp3-max` (Obergrenze bei Mehrfachauswahl, mit Klick/Cmd/Ctrl-Klick-Markierung zum gemeinsamen Löschen), `data-mp3-view="grid"|"list"` (Start-Ansicht dieses Widgets, unabhängig von Einzel-/Mehrfachauswahl; ohne Angabe gilt die geteilte Nutzer-Präferenz aus `localStorage`, ein späterer Umschalter-Klick wechselt weiterhin global für alle Widgets der Seite).
3. **Klassische Integration** (`assets/mediaplace_classic.js`, `boot.php`, kein Build-Step) — Hauptmenüpunkt "Medienpool" sowie `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widgets öffnen wahlweise den Overlay statt der alten Seiten/Popups.
4. **Metainfo-Canvas** (`openMetainfoCanvas()` in `src/mediaplace/core.js`, `lib/Api/MetainfoForm.php`) — natives Bearbeiten echter, über das Metainfo-Addon angelegter `med_*`-Felder direkt im Overlay, über REDAXOs eigenen `MEDIA_FORM_EDIT`/`MEDIA_UPDATED`-Pfad (kein eigenes Feldtyp-System für diese Felder). Klick auf ein klassisches `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widget *innerhalb* des Canvas öffnet das eigene Grid zur Auswahl statt REDAXOs Popup (`MP3.startMetainfoPick()`).
5. **YForm-Integration** (`lib/yform/value/yform_value_mediaplace.php`, `ytemplates/bootstrap/value.mediaplace.tpl.php`) — eigener YForm-Werttyp `mediaplace`, registriert sich per Klassennamens-Konvention automatisch bei YForm (kein Boot-Hook nötig), registriert aber explizit `MEDIA_IS_IN_USE` in `boot.php` (siehe unten, kritisch).

Daneben, optional zuschaltbar: **KI-Funktionen** (ALT-Text-Generierung + geschlossenes-Vokabular-Tagging über das separate `ai_platform`-Addon, `lib/AiAltTextService.php`/`AiAutoTagService.php`/`AiImagePreparer.php`, `modules/ai_alt.js`/`ai_tags.js`) und **Cloud-Provider-Browsing** (Fremdspeicher wie Nextcloud direkt im Overlay durchsuchen/importieren, siehe eigener Abschnitt unten).

## Wo du was findest

- `boot.php` — Assets laden, `PAGES_PREPARED`-Hook (Medienpool-Menüpunkt umbiegen), `METAINFO_CUSTOM_FIELD`-Hook (eigenes JSON-Feld read-only im klassischen Formular anzeigen), `OUTPUT_FILTER`-Hook (injiziert `#mp3-root` mit API-URLs, Feature-Toggles, i18n-JSON), YForm-Template-Pfad + `MEDIA_IS_IN_USE`-Registrierung (unconditional, außerhalb des `isBackend()`-Blocks), alle `rex_api_function::register()`-Aufrufe für `lib/Api/*.php`.
- `assets/mediaplace-i18n.js` / `-helpers.js` / `-api.js` — geteilte Basis (`window.MP3Core`), von `src/mediaplace/core.js` UND `assets/mediaplace_widget.js` per Alias genutzt, kein Build-Step. Bild-Resize-Logik (`resizeImageFile`, `isResizableImageType`) lebt hier, nicht im Overlay-Kern, damit Overlay-Upload UND Widget-Direkt-Upload sie gemeinsam nutzen.
- `src/mediaplace/core.js` + `src/mediaplace/modules/*.js` — Overlay-Kern-**Quelle** (echte ES-Module, hier wird entwickelt), per `npm run build` zu `assets/mediaplace.js` gebündelt. **`assets/mediaplace.js` selbst NIE von Hand editieren** — generierte Datei, jede Änderung geht beim nächsten Build verloren. Siehe DEV.md für Verzeichnis-Layout, Build-Kommandos und den vollständigen `ctx`-Vertrag pro Modul.
- `assets/mediaplace_widget.js` — Input-Widget (`window.MP3Widget`), kein Build-Step, inkl. Direkt-Upload, Kategorie-Auswahl-Modal (`.mp3w-catpick-*`, eigenständig von `#mp3-overlay` — Overlay-Root existiert ggf. noch nicht), Kacheln/Liste-Umschalter.
- `assets/mediaplace_classic.js` — fängt Klicks auf klassische Widget-Buttons per Event-Delegation ab (Capture-Phase), kein Build-Step. Überschreibt **bewusst nicht** `openREXMedia()`/`openMediaPool()` selbst (TinyMCE/CKEditor5 rufen diese direkt auf). Klicks *innerhalb* `#mp3-metainfo-canvas` werden separat behandelt (eigenes Grid statt Popup).
- `lib/Api/*.php` — eigene `rex_api_function`-Subklassen im Namespace `FriendsOfRedaxo\Mediaplace\Api` (z.B. `Categories`, `CategoryBulk`, `MediaList`, `MetainfoForm`, `Provider`, `Tags`, `Unused`, `AiAltBulk`, `AiAltText`, `AiAutoTag`, ...), explizit in `boot.php` registriert (nicht die `rex_api_<name>`-Namenskonvention). Siehe DEV.md-Tabelle "Eigene REST-Endpunkte" für den vollständigen, aktuellen Überblick.
- `lib/Api/MediaList.php` — Übergangs-Fallback für die Medienliste, nur aktiv, wenn `boot.php` die installierte `api`-Version als zu alt erkennt (`data-api-media-list-secure="0"`, siehe `#8`), UND immer (unabhängig davon) für die MediaPlace-eigenen Filter Sammlung/„Medien ohne ALT-Text"/Tags. Rückbau-TODO für den Fallback-Teil, siehe Kommentar im File.
- `lib/MediaPermission.php` — zentrale Rechteprüfung für eigene Endpunkte, inkl. `getAccessibleCategoryIds()` für den Media-List-Fallback.
- `lib/SystemTagManager.php` — Tags/Sammlungen (eigene Tabellen `rex_mediaplace_tags`/`_media_tags`). Sammlungen sind Tags mit `collection:`-Präfix (`SystemTagManager::COLLECTION_PREFIX`), keine separate Tabelle. `getFilenamesForTag()`/`getFilenamesForCollection()` für Reverse-Lookups (keine API-Route dafür, nur PHP). `getAiAllowedTagNames()`/`setAiAllowed()` steuern das geschlossene Vokabular der KI-Tag-Vorschläge (Tag-Verwaltung).
- `lib/MetainfoFieldGroup.php`, `lib/Widgets/*.php` — eigenes JSON-Feld-Metadatensystem (`med_json_data`), Widget-Typen text/textarea/checkbox/select/alt/media_link. Kein Rich-Text-Feldtyp (tinymce/cke5-Support bewusst entfernt). Erweiterbar über `MEDIAPLACE_WIDGET_TYPES` Extension Point.
- `lib/ClassicMetainfoFormatter.php` — formatiert `med_json_data` read-only im klassischen Medienpool-Formular; Format-Priorität: eigene Felder vor klassischem `med_alt`, siehe `lib/AltTextStatus.php`.
- `lib/FocuspointIntegration.php` — Fokuspunkt-Editor im Detail-Panel, nur sichtbar wenn `focuspoint`-Addon installiert; Speicherung bleibt im klassischen `med_focuspoint`-Feld.
- `lib/StorageProviderInterface.php`, `lib/StorageProviderRegistry.php`, `lib/Api/Provider.php`, `src/mediaplace/modules/providers.js` — Cloud-Provider-Browsing (siehe eigener Abschnitt unten).
- `lib/AiAltTextService.php`, `lib/AiAutoTagService.php`, `lib/AiImagePreparer.php`, `lib/Api/AiAltText.php`/`AiAltBulk.php`/`AiAutoTag.php`, `modules/ai_alt.js`/`ai_tags.js` — KI-Funktionen über das separate `ai_platform`-Addon. Schreibt nie automatisch (Review-vor-Speichern-Prinzip): Einzeldatei-Buttons füllen nur das sichtbare Feld, Bulk-Läufe zeigen Vorschläge zum Prüfen, gespeichert wird immer über den normalen Speichern-Button bzw. eine explizite „Übernehmen“-Aktion.
- `lib/yform/value/yform_value_mediaplace.php` — YForm-Werttyp, modelliert nach `yform/lib/Field/value/be_media.php`.
- `pages/settings.php` — `rex_config_form`, Feature-Toggles + Upload-Resize-Konfiguration (Breite/Höhe, opt-in) + KI-Funktionen-Konfiguration.
- `pages/tag_management.php` — Tag-Verwaltung: anlegen/umbenennen/Farbe/löschen/KI-Freigabe.
- `pages/metainfo_fields.php` — Verwaltung der eigenen JSON-Feld-Definitionen.
- `pages/demo.php` — Demo-Seite mit allen Widget-Varianten inkl. YForm-Beispielen (Pipe-Syntax + JSON).

## Kritische Bereiche — hier besonders vorsichtig sein

### 1. API-Abhängigkeit: FriendsOfRedaxo/api

Medien-CRUD läuft über `/api/backend/media/...`. **Bekannte Eigenbauten mit Rückbau-TODO**: Kategorie verschieben (`Categories::handleMove()` in `lib/Api/Categories.php`, eigenes SQL weil `media/category/update` nur `name` ändern lässt); Medienliste-Fallback (`lib/Api/MediaList.php`), aktiv solange die installierte `api`-Version `media`/`backend/media` noch nicht nach Kategorie-Rechten filtert (behoben ab api 1.3.1, [PR #78](https://github.com/FriendsOfREDAXO/api/pull/78)) — Versionscheck in `boot.php` (`data-api-media-list-secure`), Umschaltung in `mediaplace-api.js` (`apiFetchMediaList()`). Vor Arbeit an einem dieser beiden prüfen, ob das api-Addon die fehlende Route/Absicherung inzwischen hat, und den Eigenbau dann entfernen.

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

Weitere Fallen: REDAXO/Bootstrap setzt global `table{background-color:#fff}` (eigene Tabellen brauchen `background:transparent`); native `<select>` braucht `-webkit-appearance:none;appearance:none;` + eigenes Pfeil-SVG; REDAXOs Muted-Grau ist `#777`, nicht `#9ca5b2` (das ist Rand-/Icon-Grau); kein `border-radius` außer bei echten Kreisen. Bei neuen Buttons in bereits bestehenden Leisten (z.B. `.mp3-batch-footer`) IMMER eigene, eindeutige Klassennamen für die klickbaren Buttons selbst vergeben (Container-Klassen wie `.mp3-batch-footer`/`.mp3-batch-left`/`.mp3-batch-actions` dürfen geteilt werden) — zwei Buttons mit identischem Klassennamen würden von BEIDEN `e.target.closest(...)`-Event-Delegationen gleichzeitig behandelt (siehe `.mp3-provider-batch-*` vs. `.mp3-batch-*` als Vorbild für „gleiche Optik, eigene Klasse, eigene CSS-Regeln").

### 4. Opcache-Falle (PHP-Änderungen erscheinen verzögert)

Ist auf dem Zielsystem `opcache.validate_timestamps=On` mit einer `revalidate_freq` > 0 gesetzt, können PHP-Edits eine Weile "stale" wirken. Falls Änderungen nicht ankommen: Webserver/PHP-Prozess neu laden lassen (z.B. `apache2ctl graceful`, PHP-FPM-Reload, oder Opcache-Reset je nach Setup) statt am Code zu zweifeln.

### 5. Metainfo-Canvas: Extension Points werden lazy geladen

`metainfo/lib/handler/media_handler.php` registriert `MEDIA_FORM_EDIT`/`MEDIA_UPDATED` nur, wenn REDAXO selbst erkennt, dass die aktuelle Seite `mediapool` ist (`PAGE_CHECKED`-Hook) — ein eigener `rex-api-call`-Endpunkt löst das nie aus. `lib/Api/MetainfoForm.php::ensureMetainfoMediaHandler()` lädt die Handler-Datei deshalb manuell nach (`@internal`-Datei, kein öffentlicher Vertrag — kann bei Metainfo-Updates ohne Vorwarnung brechen). Drittanbieter-Feldtypen wie `metainfo_lang_fields` können **eigene** Seiten-Erkennung haben, die denselben Fehler macht (siehe dessen `boot.php` — dort wurde die Seiten-Allowlist entfernt und die Registrierung unconditional gemacht, plus ein `defined()`-Guard gegen doppeltes Booten bei kombinierten `page`+`rex-api-call`-Requests).

### 6. Upload-Resize: `canvas.toBlob()` fällt bei nicht unterstützten Formaten still auf PNG zurück

`MP3Core.helpers.resizeImageFile()` prüft `blob.type !== file.type` und verwirft die Verkleinerung in dem Fall (Original wird unverändert hochgeladen) — sonst würde z.B. eine `.avif`-Datei mit falschem `.type`-Label aber tatsächlich PNG-kodiertem Inhalt hochgeladen. GIFs und SVGs werden von `isResizableImageType()` immer ausgeschlossen (GIFs könnten animiert sein, SVGs sind kein Rasterbild). Für KI-Bildanalyse gilt dieselbe Grund-Idee, aber eigene Klasse: `lib/AiImagePreparer.php` rasterisiert SVGs clientseitig (Canvas, siehe `ai_alt.js`) statt serverseitig (unzuverlässig) und skaliert zu große Rasterbilder vor dem Senden herunter.

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
`rex_i18n::msg()` nutzt `{0}`/`{1}`-Positions-Platzhalter (bzw. benannte `{key}`-Platzhalter über das assoziative Array, siehe bestehende Keys), **nicht** sprintf-`%s`/`%d` — vor dem Anlegen eines neuen Platzhalter-Keys immer an einem bestehenden `t('key', {...})`-Aufruf in `src/mediaplace/` orientieren.

### 11. Neue `rex_api_*`-Endpunkte: `$published` nicht vergessen, falls per JS/`fetch()` statt normaler Navigation aufgerufen

`rex_api_function::$published` ist standardmäßig `false` — dann greift der Aufruf nur, wenn `rex::isBackend()` zum Zeitpunkt des konkreten Requests wahr ist. Das hängt am tatsächlichen PHP-Einstiegspunkt, nicht an der Session: in diesem (modernen Layout-)Setup setzt `public/index.php` `$REX['REDAXO'] = false`, nur `public/redaxo/index.php` setzt `true`. `rex_url::backendController()` liefert bewusst einen *relativen* Pfad (`index.php?rex-api-call=...`), der sich beim Aufruf per `fetch()` gegen die aktuelle Seiten-URL auflöst — landet die aufrufende Seite selbst nicht unter `/redaxo/...`, landet auch der API-Call auf dem Frontend-Einstiegspunkt und wird mit `rex_api_exception: "... is not published, therefore can only be called from the backend!"` abgewiesen (kein Hinweis auf die eigentliche Ursache). Betraf `lib/Api/MediaList.php` konkret. Für jeden neuen Endpunkt, der Eigenrechte prüft (wie hier `MediaPermission::hasMediaAccess()`), `protected $published = true;` setzen — keine Sicherheitslockerung, `execute()` prüft die Berechtigung ohnehin selbst, umgeht nur das `isBackend()`-Gate. Vor dem Melden eines mysteriösen Fetch-Fehlers ("SyntaxError", "did not match expected pattern" o.ä.) immer zuerst den `system.log`-Eintrag bzw. die HTTP-Response direkt prüfen (`curl`), bevor man in der URL-Konstruktion sucht — die eigentliche Fehlermeldung steht meist im Response-Body, nicht in der irreführenden generischen JS-Fehlermeldung.

### 12. Chunked-Bulk-Action-Vertrag (wiederkehrendes Muster)

Jede Massenaktion, die potenziell viele Einzel-Roundtrips braucht (Kategorie-Massenaktionen, KI-Bulk-Läufe, Cloud-Provider-Massenimport), folgt demselben Vertrag statt eigener Ad-hoc-Logik: serverseitig ein `limit`/Batch-Konstante (z.B. `Api\CategoryBulk::BATCH_LIMIT_DEFAULT`, `Api\AiAltBulk`, `Api\Provider::IMPORT_BATCH_MAX = 25`), Antwortform `{succeeded/processed, remaining, errors}` bzw. pro Element `{results:[{..., success, error?}]}`. Client-seitig läuft eine Schleife, die **nur weiterläuft, solange `remaining > 0 UND succeeded/processed > 0`** dieses Batches — nicht nur `remaining > 0` allein, sonst entsteht bei dauerhaft fehlschlagenden Elementen (z.B. gesperrte Dateien) eine Endlosschleife (live aufgetreten, siehe `runChunkedBulkAction()` in `modules/categories.js`). Ein "Abbrechen"-Button muss keinen laufenden Request hart per `AbortController` kappen — bei kleinen Batch-Größen (≤25-100) reicht "keinen weiteren Batch mehr starten" (siehe `modules/providers.js::runProviderBulkImport()` als schlankere Variante ohne AbortController, `modules/categories.js::showBulkProgressModal()` als Variante MIT). Das Fortschritts-Modal selbst (`.mp3-cat-move-modal-overlay` + `.mp3-bulk-progress-*`-Klassen) wird bewusst pro Modul **dupliziert**, nicht geteilt (kein Re-Export, siehe `ai_alt.js::openBulkPanel()`, `categories.js::showBulkProgressModal()`, `providers.js::showProviderBulkProgressModal()`) — gleiches "kein Zirkelbezug"-Prinzip wie bei den Modul-Importen selbst.

### 13. Cloud-Provider-Browsing: Erweiterungspunkt statt Kernänderung

Fremde Speicher (Nextcloud, ...) werden über `MEDIAPLACE_STORAGE_PROVIDERS` (siehe DEV.md) angebunden — die Provider-Addons implementieren nur `lib/StorageProviderInterface.php` (`listEntries()`, `hasSearch()`, `getThumbnail()`, `importToMediaPool()`), MediaPlace selbst bringt Sidebar-Navigation, Grid-Rendering, Massenimport (`lib/Api/Provider.php`, `src/mediaplace/modules/providers.js`) mit. **Wichtig beim Erweitern des Provider-Dispatchers** (z.B. um `func=import_batch`, siehe `Provider::handleImportBatch()`): NIE `StorageProviderInterface` selbst erweitern, wenn sich eine neue Fähigkeit rein durch Schleifen über bestehende Methoden bauen lässt — jeder bestehende Provider (z.B. `nextcloud`) funktioniert dann unverändert weiter, ohne selbst angepasst werden zu müssen. Auswahl/Selektion für den Massenimport (`providerSelectMode`/`providerSelected` in `providers.js`) ist bewusst eigener State, komplett getrennt von der lokalen Mehrfachauswahl (`multiSelected`/`collectionDragSelected`/`batchSelectMode` in `core.js`/`multiselect.js`) — andere Datengrundlage (Provider-Pfade statt lokaler Dateinamen), andere Aktion (Importieren statt Verschieben/Löschen). Selektierbar sind ausschließlich Dateien, nie Ordner (`importToMediaPool()` importiert eine einzelne Datei).

## Arbeitsweise

1. Kleinsten Codepfad finden, der das Verhalten kontrolliert.
2. Vor JS-Änderungen: `node --check <datei>.js` für jede geänderte Datei einzeln — sowohl für die Overlay-Kern-Quelle (`src/mediaplace/core.js`, `src/mediaplace/modules/*.js`) als auch für die hand-editierten Assets (`assets/mediaplace-helpers.js`/`-api.js`/`-i18n.js`, `assets/mediaplace_widget.js`/`_classic.js`).
3. Vor CSS-Änderungen: Undefined-Var-Check (Overlay) + Brace-Balance (beide CSS-Dateien).
4. Vor PHP-Änderungen: `php -l <file>`.
5. Nach Änderungen an `src/mediaplace/core.js`/`modules/*.js`: **zuerst** `npm run build` (esbuild-Bundle nach `assets/mediaplace.js`), **dann** `assets:sync` — die Reihenfolge ist entscheidend, sonst landet ein veralteter Bundle-Stand im Backend. Nach Änderungen an allen anderen Assets (`mediaplace-*.js`, `mediaplace_widget.js`/`_classic.js`, `mediaplace.css`, `mediaplace_widget.css`) direkt `assets:sync`, kein Build nötig. Siehe DEV.md für die vollständigen Build-Kommandos (`npm install`/`npm run build`/`npm run watch`) und das Verzeichnis-Layout.
6. Nach package.yml/lang-Änderungen: `bin/console cache:clear`.
7. Nach PHP-Änderungen ggf. Opcache-Reset/Prozess-Reload, siehe Punkt 4 oben.
8. Nach jedem Deploy: `var/log/system.log` (ab REDAXO-Root) auf neue Einträge nach dem eigenen Zeitstempel prüfen — echtes Warnsignal, keine stillschweigend ignorieren.
9. Bei sichtbaren Feature-Änderungen: `CHANGELOG.md` (neue Bullets unter der aktuellen, noch **nicht** getaggten Version-Überschrift einfügen — vorher per `git diff <letzter-tag> -- CHANGELOG.md` prüfen, ob diese Überschrift bereits released/getaggt ist; falls ja, NICHT dort weiterschreiben, sondern auf das nächste Release warten bzw. eine neue Überschrift erst bei explizitem Release-Wunsch anlegen), `package.yml`-Version nur bei explizitem Release-Wunsch mitziehen, `README.md` und `pages/demo.php` aktuell halten.

## Verifikations-Disziplin

- Live-Verifikation bevorzugen (curl mit Session-Cookie, direkte DB-Abfragen) statt "sollte funktionieren" anzunehmen — besonders bei Extension-Point-Registrierungen und Datenbank-Constraints.
- Eigene Testdaten (Skripte unter `bin/_tmp_*.php`, YForm-Testtabellen, testweise gesetzte Config-Werte) **immer** wieder aufräumen, auch wenn das Skript mit einem Fehler abbricht — danach explizit per SQL/Dateisystem prüfen, dass nichts übrig geblieben ist.
- `rm -rf`/`DROP TABLE`/Config-Reset nur auf selbst angelegte Testartefakte anwenden, nie auf bestehende Daten ohne Rückfrage.
