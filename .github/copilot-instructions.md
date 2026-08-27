# MediaPlace – Copilot Instructions

## Leitprinzipien

1. **API-Addon first** – Medien-CRUD (Liste/Upload/Update/Delete/Kategorien) läuft über `FriendsOfREDAXO/api` (`/api/backend/media/...`). Vor jedem Eigenbau erst prüfen, ob das api-Addon die Route schon hat (`src/addons/api/lib/RoutePackage/Media.php`) — nicht blind annehmen, dass eine Fähigkeit fehlt. Bestehende Eigenbauten/Fallbacks (z.B. `rex_api_mediaplace_media_list.php`) sind kein einmaliges Urteil: bei API-Arbeit die installierte `api`-Version (`rex_addon::get('api')->getVersion()`) und deren Changelog aktiv gegenprüfen und den Workaround in Frage stellen, sobald sich die Version geändert hat.
2. **REDAXO-eigene Methoden nutzen, kein Parallel-Code** – Wo REDAXO schon eine Fähigkeit hat (`rex_media`, `rex_mediapool::mediaIsInUse()`, Metainfo-Rendering/Speichern über `MEDIA_FORM_EDIT`/`MEDIA_UPDATED`, YForm-Feldtyp-Konventionen), diese wiederverwenden statt nachzubauen.
3. **Modularisieren** – neue, in sich geschlossene Fähigkeiten als eigene Dateien/Klassen (`lib/`, `lib/Widgets/`, `lib/yform/value/`), nicht alles in `mediapool3.js`/`boot.php` anhäufen.
4. **Kommentare knapp halten** – pre-1.0, kein Fix-Verlauf im Code dokumentieren, das gehört in Commit-Messages.

## Projekt-Überblick

Dieses REDAXO-AddOn implementiert einen modernen Medienpool-Overlay-Picker als Ersatz für das Standard-REDAXO-Medienpool-Widget. Fünf Teile, unabhängig voneinander (de)aktivierbar (Einstellungsseite / `default_config` in `package.yml`):

1. **Overlay-Picker** (`mediapool3.js` / `mediapool3.css`) – Vollbild-Overlay mit Kategoriebaum, Grid/Listen-/Media-Wall-Ansicht, Suche, Tag-/Typ-Filter, Sammlungen, Multi-Select, Detail-Panel mit eigenen JSON-Metadaten-Feldern.
2. **Widget** (`mediapool3_widget.js` / `mediapool3_widget.css`) – wandelt `<input class="mp3-widget">` in visuellen Picker um; optional Direkt-Upload (`data-mp3-upload`), Typ-Beschränkung (`data-mp3-types`), Maximal-Anzahl (`data-mp3-max`), Start-Ansicht Kacheln/Liste (`data-mp3-view`).
3. **Klassische Integration** (`mediapool3_classic.js`) – klassische `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widgets und der Medienpool-Menüpunkt öffnen wahlweise den Overlay.
4. **Metainfo-Canvas** (`openMetainfoCanvas()` in `mediapool3.js`, `lib/rex_api_mediaplace_metainfo_form.php`) – natives Bearbeiten echter `med_*`-Metainfo-Felder im Overlay über REDAXOs eigene Extension Points, kein eigenes Feldtyp-System dafür.
5. **YForm-Integration** (`lib/yform/value/yform_value_mediaplace.php`) – eigener YForm-Werttyp `mediaplace`.

## Architektur

### Dateistruktur

```
assets/
  mediapool3-i18n.js      – geteilte i18n-Basis (window.MP3Core.i18n)
  mediapool3-helpers.js   – geteilte Utility-Funktionen (window.MP3Core.helpers), inkl. Bild-Resize
  mediapool3-api.js       – geteilte API-Fetch-Wrapper (window.MP3Core.api)
  mediapool3.js           – Overlay IIFE, exponiert window.MP3
  mediapool3.css          – Overlay Styles, CSS Custom Properties
  mediapool3_widget.js    – Widget IIFE, exponiert window.MP3Widget
  mediapool3_widget.css   – Widget Styles
  mediapool3_classic.js   – fängt klassische Widget-Klicks ab, leitet auf MP3.open() um
boot.php                  – Lädt Assets, PAGES_PREPARED/METAINFO_CUSTOM_FIELD/OUTPUT_FILTER-Hooks,
                             YForm-Templatepfad + MEDIA_IS_IN_USE-Registrierung
lib/
  rex_api_mediaplace_*.php   – eigene rex_api_function-Endpunkte
  MediaPermission.php        – zentrale Rechteprüfung
  SystemTagManager.php       – Tags/Sammlungen (Sammlung = Tag mit "collection:"-Präfix)
  MetainfoFieldGroup.php, Widgets/*.php – eigenes JSON-Metadatensystem (med_json_data)
  ClassicMetainfoFormatter.php, AltTextStatus.php – klassische Formular-Anzeige, ALT-Text-Priorität
  FocuspointIntegration.php  – Fokuspunkt-Editor (nur mit focuspoint-Addon)
  yform/value/yform_value_mediaplace.php – YForm-Werttyp
ytemplates/bootstrap/value.mediaplace.tpl.php – Backend-Formular-Template für den YForm-Werttyp
pages/
  demo.php, settings.php, metainfo_fields.php
```

### JavaScript-Muster

- **Vanilla JS, kein Framework** – kein React. jQuery nur dort genutzt, wo REDAXO/Bootstrap-Komponenten es verlangen (`selectpicker`, `rex:ready`-Events).
- **ES5-kompatibel** – kein `let`/`const`, keine Arrow Functions, keine Template Literals, kein Destructuring, keine `class`-Syntax. `var`, `function`, String-Concatenation.
- **IIFE-Pattern**: jede Datei in `(function() { 'use strict'; ... })();` gekapselt.
- **Geteilte Basis über `window.MP3Core`**: `mediapool3-i18n.js`/`-helpers.js`/`-api.js` laden zuerst, `mediapool3.js` UND `mediapool3_widget.js` aliasen daraus (`var apiUpload = MP3Core.api.apiUpload;` usw.), statt Code zu duplizieren. Neue geteilte Logik (z.B. Bild-Resize) gehört dorthin, nicht in eine der beiden Verbraucher-Dateien.
- **Public API** über `window.MP3` und `window.MP3Widget`.
- **Helper**: `qs(sel, ctx)`/`qsa(sel, ctx)` als `querySelector`/`querySelectorAll`-Wrapper.

### CSS-Architektur

#### Spezifitäts-Strategie

Overlay-Selektoren unter `#mp3-overlay` (ID) geschachtelt, um Bootstrap 3/REDAXO-Backend-Styles sicher zu überschreiben:

```css
/* Richtig */
#mp3-overlay .mp3-card { ... }
/* Falsch – wird von Bootstrap überschrieben */
.mp3-card { ... }
```

Widget-Styles (`mp3w-`-Prefix) leben im normalen Seiten-DOM, daher **kein** `#mp3-overlay`-Scoping.

#### CSS Custom Properties (`--mp3-` Prefix, nur Overlay)

#### Dark Mode – Overlay: vierstufiges Pattern

**IMMER alle vier Blöcke pflegen**, sonst fällt eine neue Variable in einem Dark-Mode-Pfad auf den Light-Fallback zurück:

```css
:root { --mp3-modal-bg: #fff; }                                    /* 1. Light-Default */
body.rex-theme-dark { --mp3-modal-bg: #1a2636; }                   /* 2. Explizites Dark-Theme */
@media (prefers-color-scheme: dark) {
    body.rex-has-theme:not(.rex-theme-light) { --mp3-modal-bg: #1a2636; }  /* 3. System-Präferenz */
}
#mp3-overlay.mp3-dark-mode { --mp3-modal-bg: #1a2636; }             /* 4. Eigener In-Overlay-Toggle */
```

Block 2, 3 und 4 MÜSSEN identische Werte haben. Vor jeder CSS-Änderung:

```bash
grep -oE -- '--mp3-[a-z0-9-]+\s*:' assets/mediapool3.css | sed 's/\s*:$//' | sort -u > /tmp/defined.txt
grep -oE -- 'var\(--mp3-[a-z0-9-]+' assets/mediapool3.css | sed 's/^var(//' | sort -u > /tmp/used.txt
comm -23 /tmp/used.txt /tmp/defined.txt   # muss leer sein
python3 -c "c=open('assets/mediapool3.css').read(); print(c.count('{'), c.count('}'))"
```

#### Widget CSS – nur zwei Dark-Mode-Blöcke, direkte Werte

```css
body.rex-theme-dark .mp3w-container { ... }
@media (prefers-color-scheme: dark) {
    body.rex-has-theme:not(.rex-theme-light) .mp3w-container { ... }
}
```

Keine `--mp3w-*`-Variablen, direkte Hex-Werte, beide Blöcke synchron halten.

#### Weitere Theming-Fallen

- REDAXO/Bootstrap: `table { background-color: #fff }` global – eigene `<table>` braucht `background: transparent`.
- Native `<select>` braucht `-webkit-appearance: none; appearance: none;` + eigenes SVG-Pfeil-Icon.
- Wird ein `<select>` per `.selectpicker()` initialisiert (Kategorie-Auswahl-Dialoge), rendert es Optionen in eigenen `<a>`-Elementen – normale führende Leerzeichen zur Tiefen-Einrückung werden dabei kollabiert. `&nbsp;` verwenden, nicht `' '.repeat(depth)`.
- Muted-Text-Grau ist `#777`, nicht `#9ca5b2` (das ist Rand-/Icon-Grau, nur ~2.5:1 Kontrast).
- Kein `border-radius` außer bei echten Kreisen (REDAXOs `$border-radius-base` ist `0`).

## API-Anbindung

```
GET  /api/backend/media                       – Medienliste (Filter/Sort)
GET  /api/backend/media/{filename}/info       – Detailinformationen
POST /api/backend/media                       – Upload (FormData)
POST /api/backend/media/upload                – Chunk-Init (Dateien > 20 MB)
PATCH /api/backend/media/{filename}/update    – Metadaten aktualisieren
DELETE /api/backend/media/{filename}/delete   – Datei löschen
```

Immer über die Alias-Funktionen in `MP3Core.api` aufrufen, nicht direkt `fetch()`. Chunk-Upload-Entscheidung (`apiUpload()` vs. `apiUploadChunked()`) läuft anhand `file.size` automatisch – eigene Vorverarbeitung (z.B. Bild-Resize) muss **vor** diesem Aufruf passieren, damit die Größenprüfung die tatsächlich zu sendende Datei sieht.

Eigene `rex_api_function`-Endpunkte (`mediaplace_categories`, `_tags`, `_json_metainfo`, `_schema`, `_unused`, `_focuspoint`, `_metainfo_form`) brauchen **immer** eine explizite Rechteprüfung über `MediaPermission` – `rex::getUser()` prüft nur "eingeloggt", nicht REDAXOs Medien-Berechtigungen.

Thumbnails über den Media Manager: `index.php?rex_media_type=rex_media_small&rex_media_file={filename}`.

## Metainfo-Canvas: Extension Points werden lazy geladen

`metainfo/lib/handler/media_handler.php` registriert `MEDIA_FORM_EDIT`/`MEDIA_UPDATED` nur, wenn REDAXO selbst erkennt, dass die aktuelle Seite `mediapool` ist – ein eigener `rex-api-call`-Endpunkt löst das nie aus. `rex_api_mediaplace_metainfo_form.php` lädt die Handler-Datei deshalb manuell nach (`@internal`, kein öffentlicher Vertrag). Drittanbieter-Feldtypen können dieselbe Lücke haben – vor Arbeit daran deren `boot.php` auf ähnliche Seiten-Erkennung prüfen.

## Upload-Resize: Format-Fallback-Falle

`canvas.toBlob(cb, type)` fällt bei nicht unterstützten Ausgabeformaten (AVIF fast überall, WebP in älterem Safari) laut Spezifikation still auf PNG zurück. `MP3Core.helpers.resizeImageFile()` prüft deshalb `blob.type !== file.type` und verwirft die Verkleinerung in dem Fall, statt eine Datei mit falschem `.type`-Label hochzuladen. GIFs/SVGs werden immer ausgeschlossen (`isResizableImageType()`).

## YForm-Integration: `MEDIA_IS_IN_USE` ist Pflicht

YForm entdeckt eigene Werttypen (`rex_yform_value_<name>`) automatisch per Klassennamens-Konvention – der "Datei in Verwendung"-Check ist aber ein **separater**, expliziter Mechanismus. Ohne eigene `rex_extension::register('MEDIA_IS_IN_USE', [...])`-Registrierung in `boot.php` würden über das `mediaplace`-YForm-Feld referenzierte Dateien fälschlich als löschbar gemeldet. Siehe `yform_value_mediaplace::isMediaInUse()`, modelliert nach `yform/lib/Field/value/be_media.php`.

## MBlock-Kompatibilität (KRITISCH)

Das Widget MUSS mit dem MBlock-AddOn funktionieren. MBlock klont DOM-Elemente und triggert `rex:ready`.

1. `initWidgets(scope)` akzeptiert einen optionalen DOM-Container als Scope.
2. Clone-Cleanup: bei `rex:ready` werden geklonte `.mp3w-container` entfernt und `data-mp3-initialized` zurückgesetzt, bevor Widgets neu gebaut werden.
3. `rex:ready`-Handler nutzt den Container-Parameter von jQuery:
   ```javascript
   jQuery(document).on('rex:ready', function (e, container) {
       var scope = container && container.length ? container[0] : null;
       initWidgets(scope);
   });
   ```
4. Keine IDs in Widget-HTML – MBlock ändert IDs/Names, nur Klassen/relative DOM-Traversierung.
5. Events am Widget lokal am Container binden, nicht am Document.
6. `data-mp3-initialized`-Flag verhindert Doppel-Init, muss bei Clone-Cleanup entfernt werden.

## Deploy-Workflow

Alle Kommandos vom REDAXO-Root aus (ggf. je nach Setup in Container-Exec/SSH einbetten):

```bash
php bin/console assets:sync     # nach jeder assets/*.js|css-Änderung
php bin/console cache:clear     # nach package.yml/lang-Änderungen
# nach jeder PHP-Änderung ggf. Opcache-Reset/Prozess-Reload (z.B. apache2ctl graceful, PHP-FPM-Reload)
tail -n 5 var/log/system.log    # nach jedem Deploy pruefen
```

**CLI/Console-Kontext führt kein `boot.php` aus** – `bin/console`-Kommandos und eigene Testskripte (`rex_package::require($id)->enlist()`) laden zwar Autoload/Klassen, aber keine Addon-`boot.php`. `rex_extension::register()`-Aufrufe daraus greifen in CLI-Tests nicht; für isolierte Logik-Tests die Registrierung im Testskript selbst nachholen, für echte End-to-End-Verifikation über HTTP (`curl` mit Session-Cookie) testen.

## Häufige Fehlerquellen

### CSS
- Bootstrap-3-Override vergessen – immer `#mp3-overlay` im Selektor (Overlay-Dateien).
- `!important` vermeiden – Spezifität durch ID erhöhen.
- Dark Mode nur in einem Block geändert.

### JavaScript
- ES5-Syntax beibehalten.
- `window.MP3` und `window.MP3Widget` sind die einzigen globalen Exports.
- API-Fehler abfangen – alle `apiFetch`/`apiUpload`/etc. brauchen `.catch()`.
- Geteilte Logik (Resize, Helpers, API) gehört in `mediapool3-*.js`, nicht dupliziert in Overlay UND Widget.

### PHP
- Eigene API-Endpunkte ohne `MediaPermission`-Check.
- Extension-Point-Registrierung vergessen (Metainfo-Handler-Lazy-Loading, YForm `MEDIA_IS_IN_USE`).
- Opcache: PHP-Änderung ohne `apache2ctl graceful` wirkt bis zu 60s "stale".

### MBlock
- Widget-Container nach Clone entfernen – sonst doppelte UI.
- Keine Widget-Referenzen über den Scope hinaus cachen.
- `change`-Events dispatchen nach Wertänderung.

## Benennungs-Konventionen

| Kontext | Prefix | Beispiel |
|---------|--------|----------|
| Overlay CSS-Klassen | `mp3-` | `.mp3-card`, `.mp3-sidebar` |
| Overlay CSS-Variablen | `--mp3-` | `--mp3-modal-bg` |
| Widget CSS-Klassen | `mp3w-` | `.mp3w-container`, `.mp3w-item` |
| Overlay JS-Funktionen | camelCase | `showDetail()`, `renderFiles()` |
| Widget Daten-Attribute | `data-mp3-` | `data-mp3-multiple`, `data-mp3-upload`, `data-mp3-max`, `data-mp3-view` |

## Abhängigkeiten

- REDAXO ≥ 5.20, PHP ≥ 8.4.
- **FriendsOfREDAXO/api** ≥ 1.3 (REST-Endpunkte, Pflicht).
- Optional: `metainfo` (Metainfo-Canvas), `focuspoint` (Fokuspunkt-Editor), `yform` (YForm-Werttyp), `metainfo_lang_fields` (mehrsprachige Metainfo-Felder).
- Font Awesome, Bootstrap 3 (im REDAXO-Backend enthalten – daher die hohe CSS-Spezifität).
