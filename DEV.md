# MediaPlace – Entwicklung am Overlay-Kern (mediaplace.js)

Dieses Dokument beschreibt den Build-Workflow für den Overlay-Kern (`window.MP3`).
Die Quelle liegt als echte ES-Module unter `src/mediaplace/` und wird per
[esbuild](https://esbuild.github.io/) zu der einen ausgelieferten Datei
`assets/mediaplace.js` gebündelt – nach demselben Muster, das im
`code`-Addon (Monaco-Editor) bereits produktiv läuft.

Alle anderen Assets des Addons (`mediaplace-helpers.js`, `mediaplace-api.js`,
`mediaplace-i18n.js`, `mediaplace_widget.js`, `mediaplace_classic.js`,
`mediaplace.css`, ...) sind davon **nicht** betroffen – die bleiben normale,
von Hand editierte Dateien wie bisher, kein Build-Step nötig.

## Verzeichnis-Layout

```
src/addons/mediaplace/
  src/mediaplace/          <- Quelle (echte ES-Module, hier wird entwickelt)
    index.js                  Einstiegspunkt für den Bundle (importiert nur core.js)
    core.js                   Hub: importiert alle modules/*.js, verdrahtet sie
                               per ctx-Objekt, enthaelt daneben noch nicht
                               extrahierten Code (Data-Loading, build()/open()/
                               close(), zentrale Event-Delegation)
    modules/                  Feature-Module (siehe unten)
  assets/mediaplace.js     <- Build-OUTPUT, von esbuild generiert.
                               NICHT VON HAND EDITIEREN – jede Änderung geht beim
                               nächsten `npm run build` verloren.
  package.json, build.js   <- Build-Tooling
```

**Wichtig:** `src/mediaplace/` liegt bewusst **außerhalb** von `assets/`, nicht
darunter. `bin/console assets:sync` synct den kompletten `assets/`-Ordner 1:1
in den öffentlichen Assets-Pfad – läge die Quelle dort drin, würde
unminifizierter Quellcode mit veröffentlicht.

## Setup

Voraussetzung: Node.js (irgendeine aktuelle LTS-Version reicht, getestet mit
Node 24). Einmalig im Addon-Verzeichnis:

```bash
cd src/addons/mediaplace
npm install
```

## Bauen

```bash
npm run build   # einmaliger, minifizierter Build -> assets/mediaplace.js (Auslieferungsstand)
npm run watch   # Inkrementalbau bei jeder Änderung, unminifiziert + Inline-Sourcemap (Entwicklung)
```

**Deploy-Reihenfolge ist entscheidend:** immer erst `npm run build`, **dann**
`assets:sync` + `cache:clear`. Wird das vergessen, landet ein veralteter Stand
von `assets/mediaplace.js` im Backend (die Datei ändert sich ja nicht von
selbst, nur weil sich `src/mediaplace/*.js` geändert hat).

```bash
npm run build
docker exec -w /var/www/html fairplayweb php bin/console assets:sync
docker exec -w /var/www/html fairplayweb php bin/console cache:clear
```

Der committete `assets/mediaplace.js` ist der tatsächliche Auslieferungsstand
des Addons (wie bei `code`/`cropper`/`mblock` in diesem Repo) – Endnutzer, die
das Addon installieren, führen kein `npm install`/`npm run build` aus. Jede
Änderung an `src/mediaplace/*.js` muss also **vor dem Commit** neu gebaut
werden, sonst weicht das Verhalten des committeten Bundles von der Quelle ab.

## Architektur: Hub-and-Spoke

Die ursprünglich geplante Kernel/State/Bus-Architektur (zentraler Event-Bus,
`ctx.state.*`-Getter/Setter-Layer) wurde beim tatsächlichen Umbau durch ein
einfacheres, direkteres Muster ersetzt:

- **`core.js` ist der Hub.** Er importiert benannte Funktionen direkt aus
  jedem `modules/*.js` und ruft sie als normale Funktionen auf (kein ctx nötig
  für die Richtung core.js → Modul).
- **Jedes Modul exportiert eine `initX(ctx)`-Funktion**, die `core.js` einmal
  innerhalb von `build()` aufruft. `ctx` ist ein einfaches Objekt aus
  DOM-Referenzen, Gettern/Settern für State, der noch in `core.js` lebt, und
  Funktionsreferenzen (z. B. `loadFiles`, `refreshDisplay`) – das deckt die
  Richtung Modul → core.js ab. Jede Extraktion dokumentiert ihren `ctx`
  explizit in einem "ctx-Vertrag"-Docblock direkt über `initX()`.
- **Module, die etwas von einem Geschwistermodul brauchen, importieren es
  direkt** (z. B. importiert `filters.js` `applyCollectionFilter` aus
  `collections.js`) – kein Umweg über core.js oder einen Event-Bus.
- **Kein Laufzeit-Registrierungsmechanismus** (`MP3.registerModule()` o. ä.):
  Cropper-, Fokuspunkt- und Optimieren-Integration sind normale Module wie
  jedes andere, per `import` fest in `core.js` verdrahtet und Teil desselben
  Haupt-Bundles – nicht (wie ursprünglich angedacht) separate, nur bei
  installiertem Fremd-Addon geladene Zusatz-Bundles. Das wäre ein größerer,
  eigenständiger Architekturumbau; bislang nicht umgesetzt.

## Module (Stand: alle 12 Extraktionsphasen abgeschlossen)

`providers.js`, `modals.js`, `lightbox.js`, `focuspoint.js`, `cropper.js`,
`optimize.js`, `collections.js`, `categories.js`, `filters.js`, `grid.js`,
`detail.js`, `upload.js`, `multiselect.js`.

Bewusst weiterhin in `core.js` (nicht extrahiert, siehe jeweilige
ctx-Vertrag-Kommentare in den Modulen für die genaue Begründung):
Data-Loading (`loadFiles()`/`buildMediaEndpoint()`/`fetchTypeCounts()`),
`build()`/`open()`/`close()` selbst, die zentrale Event-Delegation auf
`overlay`, sowie diverses noch geteiltes State (`currentCat`, `selectedFile`,
`multiMode`, `viewMode`, ...), das an zu vielen Stellen direkt gelesen/
geschrieben wird, um sich ohne unverhältnismäßigen ctx-Umweg sauber
auslagern zu lassen.

## Bekannte Stolperfallen

- `assets/mediaplace.js` ist generiert – Änderungen dort gehen beim nächsten
  Build verloren. Immer in `src/mediaplace/*.js` arbeiten.
- `npm run watch` läuft im Vordergrund (esbuild-Kontext mit aktivem File-
  Watcher) – für einen einmaligen Build in CI/Deploy-Skripten `npm run build`
  verwenden, nicht `watch`.
- `node_modules/` wird nicht committet (siehe `.gitignore`) – nach einem
  frischen Checkout erst `npm install` laufen lassen.
