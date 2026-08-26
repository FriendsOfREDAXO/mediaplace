---
name: mediaplace-dev
description: MediaPlace (formerly Mediapool 3.0 / mediapool3_demo) addon development skill. Use when working on this REDAXO media pool overlay/picker, its classic-mediapool replacement (menu/widget redirection), dark-mode CSS theming, the custom rex_api_function endpoints, permission checks, folder upload, or asset/lang deployment for this addon.
---

# MediaPlace Development Skill

Du arbeitest im REDAXO-Addon `mediaplace` (FriendsOfREDAXO, Vollbild-Medienpool-Overlay + Input-Widget + Ersatz für den klassischen Medienpool). Kein Build-Step, Vanilla JS/CSS, `#mp3-overlay`-Namespace.

## Architektur in Kürze

Drei Teile: **Overlay** (`MP3.open()`), **Input-Widget** (`<input class="mp3-widget">`), **Klassische Integration** (Hauptmenüpunkt "Medienpool" + `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widgets öffnen wahlweise den Overlay statt der alten Seiten/Popups — abschaltbar unter *Einstellungen*).

## Wo du was findest

- `boot.php` — Assets laden, `PAGES_PREPARED`-Hook (biegt "Medienpool"-Menüpunkt via `rex_be_page::setPopup()` um, blendet klassische Dateiliste aus), `OUTPUT_FILTER`-Hook (injiziert `#mp3-root` mit API-URLs + Subpages-Liste)
- `assets/mediapool3.js` — Overlay-Kern (IIFE, `window.MP3`), ~5000+ Zeilen, ein File
- `assets/mediapool3_widget.js` — Input-Widget Auto-Init (`window.MP3Widget`)
- `assets/mediapool3_classic.js` — fängt Klicks auf klassische `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widget-Buttons per Event-Delegation ab (Capture-Phase), leitet auf `MP3.open()` um. **Überschreibt bewusst NICHT** die globalen Funktionen `openREXMedia()`/`openMediaPool()` selbst — TinyMCE/CKEditor5 rufen diese direkt auf und erwarten den Popup-`window` als jQuery-Eventziel.
- `assets/mediapool3.css` — komplettes Overlay-Styling, CSS-Custom-Properties für Theming
- `lib/rex_api_mediaplace_*.php` — eigene `rex_api_function`-Endpunkte (categories, tags, json_metainfo, schema)
- `lib/MediaPermission.php` — zentrale Rechteprüfung für unsere eigenen Endpunkte
- `lib/SystemTagManager.php` — Tags/Sammlungen (eigene Tabellen `rex_mediaplace_tags`/`_media_tags`, eigenes SQL)
- `lib/MetainfoFieldGroup.php`, `lib/Widgets/` — Felddefinitionen fürs Detail-Panel (JSON-Storage in `med_json_data`)
- `pages/einstellungen.php` — `rex_config_form`-basierte Settings-Seite (Ersetzen des klassischen Medienpools ein/aus)
- `pages/metainfo_fields.php` — Feldverwaltung, `core/page/section.php`-Fragments + Bootstrap-3-Klassen (siehe unten)

## Kritische Bereiche — hier besonders vorsichtig sein

### 1. API-Abhängigkeit: FriendsOfRedaxo/api

Medien-CRUD (Liste/Upload/Update/Delete/Kategorien) läuft über `/api/backend/media/...` (Addon `api`, Session-Auth via `BackendUser`). Vor Erweiterungen dort **immer erst** `src/addons/api/lib/RoutePackage/Media.php` nach vorhandenen Routen durchsuchen (`grep -n "'media/"`) — es gibt mehr Routen als in unserem README dokumentiert (z.B. `media/category/delete` war lange ungenutzt, obwohl vorhanden). Nicht blind annehmen, dass eine Fähigkeit fehlt.

**Bekannte Eigenbauten mit Rückbau-TODO** (siehe Code-Kommentare an den jeweiligen Stellen + README "Rückbau-Hinweise"):
- Kategorie verschieben (`lib/rex_api_mediaplace_categories.php`, `apiMoveCategory()`) — eigenes SQL, weil `media/category/update` im api-Addon bewusst nur `name` ändern lässt.
- Suche (`buildMediaEndpoint()` in mediapool3.js) — lädt bei aktiver Suche ungefiltert einen großen Batch (`SEARCH_PER_PAGE`) und filtert client-seitig, weil `filter[title]` nur die `title`-Spalte matcht (meist leer) und es keinen Mehrfeld-Filter gibt.

Vor Arbeit an Kategorie-Verschieben oder Suche: prüfen, ob das api-Addon inzwischen die fehlende Route bekommen hat — falls ja, Eigenbau entfernen statt weiter drumherum zu bauen.

### 2. Eigene API-Endpunkte brauchen explizite Rechteprüfung

`rex::getUser()` / `rex_backend_login::hasSession()` prüft nur "eingeloggt", **nicht** REDAXOs Medien-Berechtigungen. Jeder eigene Endpunkt (`lib/rex_api_mediaplace_*.php`) muss zusätzlich `MediaPermission::hasMediaAccess()` (Baseline), `::hasCategoryAccess($catId)` (dateispezifische Operationen) oder `::hasFullAccess()` (kategorieübergreifende Operationen wie Sammlungs-Katalog) aufrufen — siehe `lib/MediaPermission.php`. Neue Endpunkte/Actions von Anfang an mit dem passenden Check bauen, nicht nachträglich vergessen.

### 3. CSS-Theming: drei Dark-Mode-Quellen, alle synchron halten

Farben laufen über `--mp3-*`-Custom-Properties, definiert in **vier** Blöcken in `mediapool3.css`:
- `:root` (Light-Default)
- `body.rex-theme-dark { ... }` (REDAXO-Backend-Theme dunkel)
- `@media (prefers-color-scheme: dark) { body.rex-has-theme:not(.rex-theme-light) { ... } }` (System-Präferenz)
- `#mp3-overlay.mp3-dark-mode { ... }` (eigener In-Overlay-Toggle, unabhängig vom REDAXO-Theme)

Neue Variable **immer in allen vier Blöcken** definieren, sonst fällt sie in einem der drei Dark-Modi auf den Light-Fallback zurück (unsichtbarer Bug, der nur in einem bestimmten Dark-Mode-Pfad auffällt). Vor jeder CSS-Änderung zur Sicherheit:

```bash
cd src/addons/mediaplace/assets
grep -oE -- '--mp3-[a-z0-9-]+\s*:' mediapool3.css | sed 's/\s*:$//' | sort -u > /tmp/defined.txt
grep -oE -- 'var\(--mp3-[a-z0-9-]+' mediapool3.css | sed 's/^var(//' | sort -u > /tmp/used.txt
comm -23 /tmp/used.txt /tmp/defined.txt   # muss leer sein
```

**Weitere Theming-Fallen, die schon zugeschlagen haben:**
- REDAXO/Bootstrap setzt global `table { background-color: #fff }` — jede eigene `<table>` (`.mp3-detail-table`, `.mp3-list-table`) braucht explizit `background: transparent`, sonst weiß im Dark Mode, egal was die Ahnen-Elemente machen.
- Native `<select>`-Elemente ignorieren teils `background`/`color` ohne `-webkit-appearance: none; appearance: none;` + eigenes SVG-Pfeil-Icon (Muster: `.mp3-sort-select`). Jeden neuen Custom-Select damit bauen.
- REDAXOs echtes Muted-Text-Grau ist `#777` (`$text-muted`/`$gray-light`), **nicht** `#9ca5b2` (`$color-a`, das ist Rand-/Icon-Grau mit nur ~2.5:1 Kontrast auf Weiß). Für lesbaren Fließtext `#777` verwenden, `#9ca5b2` nur für Icons/Ränder/echte Platzhalter.
- REDAXO-Palette: `#f3f6fb` (a-lighter, BG), `#dfe3e9` (a-light, Rahmen), `#324050` (a-dark, Primärtext/Akzent), `#4b9ad9` (b, Links/Fokus). Kein `border-radius` außer echten Kreisen (Farb-Dots, Fokuspunkt-Marker) — REDAXOs `$border-radius-base` ist `0`.

### 4. Hintergrund-Scroll beim Öffnen des Overlays

`<html>` hat in diesem Backend-Theme `overflow-y: scroll; height: 100%`, `<body>`/`.rex-page` sind `height: 100%` fix. **Kein** `overflow: hidden` auf `html`/`body` setzen, um Hintergrund-Scroll zu sperren — das klappt bei fixer Höhe den überstehenden Inhalt komplett weg und lässt `scrollTop` einrasten. Das Overlay ist ohnehin `position: fixed` vollflächig und fängt alle Klicks/Wheel-Events ab, eine Sperre ist nicht nötig. Scrollposition wird stattdessen nur passiv über einen kurzen `requestAnimationFrame`-Pin gehalten (`pinScrollPosition()`), falls z.B. `focus({preventScroll:true})` in manchen Browsern doch scrollt.

### 5. Sprachdateien: flaches Format, kein PHP

`lang/*.lang` sind **reine Text-Dateien** im Format `key = value` pro Zeile — REDAXO liest sie per Regex (`rex_i18n::loadFile()`), führt sie nicht als PHP aus. Das alte `<?php $I18N = new rex_i18n(...); $I18N->msg('key', 'value');`-Format registriert **gar nichts** (stille no-ops), war lange unbemerkt kaputt. Kein `<?php`-Tag, keine PHP-Syntax in `.lang`-Dateien.

## Arbeitsweise

1. Kleinsten Codepfad finden, der das Verhalten kontrolliert.
2. Vor JS-Änderungen: `node --check assets/mediapool3.js` (auch für `_widget.js`/`_classic.js`).
3. Vor CSS-Änderungen: Undefined-Var-Check (siehe oben) + Brace-Balance (`python3 -c "c=open('mediapool3.css').read(); print(c.count('{'), c.count('}'))"`).
4. Vor PHP-Änderungen: `php -l <file>`.
5. **Nach jeder Asset-Änderung** (`assets/*.js`, `assets/*.css`): `bin/console assets:sync` im Container ausführen — kein automatischer Watcher, sonst bleibt die alte Version in `public/assets/` liegen.
6. **Nach package.yml/lang-Änderungen**: `bin/console cache:clear`.
7. Bei sichtbaren Feature-Änderungen: `CHANGELOG.md` (neuer Versionseintrag, `package.yml`-Version mitziehen) und `README.md` aktuell halten (inkl. Dateistruktur-Baum und API-Endpunkt-Tabellen).

## Ohne Browser-Zugriff arbeiten

In dieser Umgebung gibt es typischerweise kein Browser-/DevTools-Werkzeug. Fixes für visuelle/interaktive Bugs (Scroll, Kontrast, Dark Mode) müssen über Code-Lesen + gezielte Greps verifiziert werden, nicht durch Live-Testen. Sei entsprechend gründlich beim Nachvollziehen des Rendering-Pfads (CSS-Kaskade, Spezifität, welches Element wirklich die Eigenschaft setzt), bevor du eine Änderung als "behoben" meldest — und sag es offen, wenn du etwas nicht verifizieren kannst.

## Deployment-Kontext dieser Instanz

Läuft in einem Docker-Setup (`fairplayweb`/`fairplaydb`), DB-Zugriff via `docker exec fairplaydb mariadb -ufairplay -pfairplay fairplay`. `bin/console` im Container unter `/var/www/html` aufrufen (`docker exec -w /var/www/html fairplayweb php bin/console ...`).
