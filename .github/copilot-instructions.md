# MediaPlace – Copilot Instructions

## Projekt-Überblick

Dieses REDAXO-AddOn implementiert einen modernen Medienpool-Overlay-Picker als Ersatz für das Standard-REDAXO-Medienpool-Widget. Es besteht aus zwei Schichten:

1. **Overlay-Picker** (`mediapool3.js` / `mediapool3.css`) – Vollbild-Overlay mit Kategoriebaum, Grid/Listen-Ansicht, Suche, Filter, Sortierung, Detail-Panel, Multi-Upload, Multi-Select
2. **Widget** (`mediapool3_widget.js` / `mediapool3_widget.css`) – Wandelt `<input class="mp3-widget">` in visuelle Medien-Picker mit Vorschau um

## Architektur

### Dateistruktur

```
assets/
  mediapool3.js          – Overlay IIFE (~1800 Zeilen), exponiert window.MP3
  mediapool3.css         – Overlay Styles mit CSS Custom Properties (~2000 Zeilen)
  mediapool3_widget.js   – Widget IIFE (~350 Zeilen), exponiert window.MP3Widget
  mediapool3_widget.css  – Widget Styles (~210 Zeilen)
boot.php                 – Lädt Assets, injiziert <div id="mp3-root"> via OUTPUT_FILTER
pages/
  demo.php               – Demo-Seite mit Widget-Beispielen
  debug.php              – Debug-Seite für API-Tests
```

### JavaScript-Muster

- **Vanilla JS, kein Framework** – Kein jQuery, kein React. Alles in IIFEs gekapselt.
- **ES5-kompatibel** – Kein `let`/`const`, keine Arrow Functions, kein Template Literals, keine Destructuring, keine Klassen-Syntax (`class`). Verwende `var`, `function`, String-Concatenation.
- **IIFE-Pattern**: Jede Datei ist in `(function() { 'use strict'; ... })();` gekapselt.
- **Public API** wird über `window.MP3` und `window.MP3Widget` exponiert.
- **Helper-Funktionen**: `qs(sel, ctx)` und `qsa(sel, ctx)` als Wrapper für `querySelector`/`querySelectorAll`.
- **Keine globalen Variablen** außer `window.MP3` und `window.MP3Widget`.

### CSS-Architektur

#### Spezifitäts-Strategie

Alle Selektoren sind unter `#mp3-overlay` (ID-Selektor) geschachtelt, um Bootstrap 3 und REDAXO-Backend-Styles zuverlässig zu überschreiben:

```css
/* Richtig – hohe Spezifität durch ID */
#mp3-overlay .mp3-card { ... }

/* Falsch – wird von Bootstrap überschrieben */
.mp3-card { ... }
```

#### CSS Custom Properties (`--mp3-` Prefix)

Alle Farben und Theme-Werte als CSS-Variablen mit `--mp3-`-Prefix:

```css
:root {
    --mp3-modal-bg: #fff;
    --mp3-sidebar-bg: #f8f9fa;
    /* ~100+ Variablen */
}
```

#### Dark Mode – Dreistufiges Pattern

**IMMER** alle drei Blöcke pflegen:

```css
/* 1. Light-Defaults in :root */
:root {
    --mp3-modal-bg: #fff;
}

/* 2. Expliziter Dark Mode */
body.rex-theme-dark {
    --mp3-modal-bg: #1a2636;
}

/* 3. Auto Dark Mode (System-Präferenz) */
@media (prefers-color-scheme: dark) {
    body.rex-has-theme:not(.rex-theme-light) {
        --mp3-modal-bg: #1a2636;
    }
}
```

**Block 2 und 3 MÜSSEN identische Werte haben.**

#### Header-Tools: Transparent-White-Pattern

Elemente im Header (Suche, Sort-Select, View-Toggle, Upload-Button) verwenden `rgba(255,255,255,...)` auf dem dunklen Header-Hintergrund. Dadurch sind **keine Dark-Mode-Overrides** nötig:

```css
#mp3-overlay .mp3-search {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
}
```

### Widget CSS (`mediapool3_widget.css`)

Widget-Styles verwenden `mp3w-`-Prefix (ohne `#mp3-overlay`-Scoping, da Widgets im normalen DOM leben). Dark Mode hier mit direkten Property-Werten (keine Variablen):

```css
body.rex-theme-dark .mp3w-container { ... }
@media (prefers-color-scheme: dark) {
    body.rex-has-theme:not(.rex-theme-light) .mp3w-container { ... }
}
```

## API-Anbindung

Das AddOn nutzt die **FriendsOfREDAXO/api** REST-API:

```
GET  /api/backend/media                     – Medienliste (mit Filter/Sort)
GET  /api/backend/media/{filename}/info     – Detailinformationen
GET  /api/backend/media/{filename}/file     – Datei-Download
POST /api/backend/media                     – Upload (FormData)
PATCH/PUT /api/backend/media/{filename}/update – Metadaten aktualisieren
DELETE /api/backend/media/{filename}/delete  – Datei löschen
```

**Endpunkte immer über `API_BASE`-Variable aufrufen** (definiert am Anfang der IIFE).

Thumbnails kommen über den REDAXO Media Manager:
```
index.php?rex_media_type=rex_media_small&rex_media_file={filename}
```

## MBlock-Kompatibilität (KRITISCH)

Das Widget MUSS mit dem MBlock-AddOn funktionieren. MBlock klont DOM-Elemente und triggert `rex:ready`.

### Regeln

1. **`initWidgets(scope)`** akzeptiert einen optionalen DOM-Container als Scope
2. **Clone-Cleanup**: Bei `rex:ready` werden geklonte `.mp3w-container` entfernt und `data-mp3-initialized` zurückgesetzt, bevor Widgets neu gebaut werden
3. **`rex:ready`-Handler** muss den Container-Parameter von jQuery nutzen:
   ```javascript
   jQuery(document).on('rex:ready', function (e, container) {
       var scope = container && container.length ? container[0] : null;
       initWidgets(scope);
   });
   ```
4. **Keine IDs in Widget-HTML** – MBlock ändert IDs/Names, daher nur Klassen und relative DOM-Traversierung verwenden
5. **Events am Widget** werden lokal am Container gebunden, nicht am Document (keine Event-Delegation für Widgets)
6. **`data-mp3-initialized`** Flag verhindert doppelte Initialisierung – muss bei Clone-Cleanup entfernt werden

### MBlock-Ablauf

```
MBlock klont Block → Input + alter .mp3w-container werden kopiert
  → MBlock triggert rex:ready auf dem neuen Block
  → initWidgets(scope) findet Input mit data-mp3-initialized
  → Entfernt geklonten .mp3w-container
  → Löscht data-mp3-initialized
  → Baut frisches Widget mit eigenem State
```

## Overlay-Verhalten

### Drag & Resize

- Header ist Drag-Handle (ausgenommen: `.mp3-close`, `.mp3-header-tools`, `input`, `select`, `button`, `label`)
- Unten-rechts-Ecke ist Resize-Handle (`.mp3-resize-handle`)
- **`interacting`-Flag**: Während Drag/Resize wird `interacting = true` gesetzt. Der Backdrop-Click-Handler prüft `!interacting` bevor er schließt. Flag wird via `setTimeout(..., 0)` nach `mouseup` zurückgesetzt.

### Multi-Select-Modus

- Aktiviert via `MP3.open(callback, { multiple: true })`
- Dateien werden über `multiSelected`-Object verwaltet (filename → true)
- Footer-Bar zeigt Anzahl + „Übernehmen"-Button
- Callback erhält Array von Dateinamen

### State-Management

- Kein externer Store – alles in Closure-Variablen der IIFE
- `lastLoadedFiles` – Rohdaten vom API, client-seitig gefiltert/sortiert
- `catCache` – Kategorie-Baum mit Lazy Loading
- `currentCat`, `currentFilter`, `currentSort`, `viewMode` – UI-State

## Deploy-Workflow

Assets müssen nach Änderungen manuell in den öffentlichen Assets-Ordner kopiert werden:

```bash
docker exec coreweb bash -c "cd /var/www/html/public && \
  cp redaxo/src/addons/mediaplace/assets/mediapool3.js assets/addons/mediaplace/mediapool3.js && \
  cp redaxo/src/addons/mediaplace/assets/mediapool3.css assets/addons/mediaplace/mediapool3.css && \
  cp redaxo/src/addons/mediaplace/assets/mediapool3_widget.js assets/addons/mediaplace/mediapool3_widget.js && \
  cp redaxo/src/addons/mediaplace/assets/mediapool3_widget.css assets/addons/mediaplace/mediapool3_widget.css && \
  php redaxo/bin/console cache:clear"
```

## Häufige Fehlerquellen

### CSS

- **Bootstrap 3 Override vergessen** – Immer `#mp3-overlay` im Selektor verwenden
- **`!important` vermeiden** – Lieber Spezifität durch ID erhöhen (`#mp3-overlay .klasse`)
- **Dark Mode nur in einem Block geändert** – Immer `body.rex-theme-dark` UND `@media (prefers-color-scheme: dark)` synchron halten
- **`:has()`-Selektor** – Wird verwendet (z.B. für List-View), hat guten Browser-Support aber kein IE11

### JavaScript

- **ES5-Syntax beibehalten** – Kein `const`/`let`, kein `=>`, kein Template-Literal, kein `class`
- **`window.MP3` und `window.MP3Widget`** sind die einzigen globalen Exports
- **Event-Handler im Overlay**: Am Overlay-Element oder seinen Kindern binden, nicht am Document (außer `mousemove`/`mouseup` für Drag/Resize und `keydown` für ESC)
- **API-Fehler abfangen** – Alle `apiFetch`/`apiUpload`/etc. haben `.catch()`-Handler

### MBlock

- **Widget-Container nach Clone entfernen** – Sonst doppelte UI
- **Keine Widget-Referenzen cachen** die über den Scope hinausgehen – MBlock kann jederzeit DOM entfernen/hinzufügen
- **`change`-Events dispatchen** nach Wertänderung – MBlock und andere Listener brauchen das

## Bennenungs-Konventionen

| Kontext | Prefix | Beispiel |
|---------|--------|----------|
| Overlay CSS-Klassen | `mp3-` | `.mp3-card`, `.mp3-sidebar` |
| Overlay CSS-Variablen | `--mp3-` | `--mp3-modal-bg` |
| Widget CSS-Klassen | `mp3w-` | `.mp3w-container`, `.mp3w-item` |
| Overlay JS-Funktionen | camelCase | `showDetail()`, `renderFiles()` |
| Widget Daten-Attribute | `data-mp3-` | `data-mp3-multiple`, `data-mp3-initialized` |

## Abhängigkeiten

- **REDAXO ≥ 5.10** mit Backend-Login
- **FriendsOfREDAXO/api** AddOn für REST-Endpunkte
- **Font Awesome** (im REDAXO-Backend enthalten)
- **Bootstrap 3** (im REDAXO-Backend enthalten – daher die hohe CSS-Spezifität)
