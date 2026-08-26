# MediaPlace

![REDAXO](https://img.shields.io/badge/REDAXO-%3E%3D5.10-red) ![PHP](https://img.shields.io/badge/PHP-%3E%3D7.4-blue) ![API](https://img.shields.io/badge/API_AddOn-%3E%3D1.0-green)

## Was ist das?

Ein vollständiger, moderner Medienpool für das REDAXO CMS Backend – als eigenständige Verwaltungsoberfläche und als einbettbares Picker-Overlay gleichermaßen. Das AddOn nutzt die REST-API des [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api)-Addons und bietet eine vollwertige Alternative zum klassischen REDAXO-Medienpool.

Es besteht aus drei Teilen:

1. **Medienpool-Overlay** (`MP3.open()`) – Vollbild-Overlay zur Medienverwaltung und -auswahl
2. **Input-Widget** (`<input class="mp3-widget">`) – Ersetzt ein Input-Feld durch eine visuelle Medienauswahl mit Vorschau
3. **Klassische Integration** – Der Hauptmenüpunkt „Medienpool“ sowie die klassischen REX_MEDIA[n]/REX_MEDIALIST[n]-Modulwidgets öffnen wahlweise direkt den neuen Overlay statt der alten Seiten/Popups (siehe [Klassischen Medienpool ersetzen](#klassischen-medienpool-ersetzen))

## Features

### Medienpool-Overlay
- 📁 **Kategorie-Baum** – Aufklappbare Sidebar mit allen Medienkategorien
- 🔎 **Kategoriesuche** – Filterfeld in der Sidebar zur schnellen Kategorie-Suche
- 📦 **Kategorie verschieben** – Kategorie per Modal in eine andere Elternkategorie verschieben (mit Zyklenschutz). Eigenlösung (nicht Teil des api-Addons), siehe "Rückbau-Hinweise" unten
- 🔍 **Suche** – Serverseitige Suche über Titel, Dateiname, Originalname und JSON-Metadaten
- 🏷️ **Typ-Filter** – Filter-Pills für Bilder, Videos, Audio, Dokumente, Sonstige (mit Anzahl-Badges)
- 🏷️ **Tag-Filter** – Mehrfachauswahl aus vorhandenen Tags (Collection-Tags werden ausgeblendet)
- 🗑️ **„Nur unbenutzte Medien“-Filter** – Eigenes granulares Recht (`mediaplace[view_unused_media]`), prüft `rex_mediapool::mediaIsInUse()` pro bereits geladener Seite statt für den ganzen Pool auf einmal, kombinierbar mit den übrigen Filtern
- ↕️ **Sortierung** – 8 Sortieroptionen (Datum, Dateiname, Titel, Größe – jeweils auf-/absteigend)
- 📄 **Pagination** – konfigurierbare Seitengröße inkl. „Mehr laden“, Footer zeigt Trefferzahl + Gesamtgröße der aktuell geladenen Ansicht
- 🖼️ **Grid, Liste & Masonry** – Umschaltbar zwischen Kachel-, Tabellen- und Masonry-Ansicht; Kachelgröße per Slider im Footer (Grid und Media Wall teilen sich `--mp3-tile-size`)
- 📄 **Detail-Panel** – Vorschau, editierbarer Titel, JSON-Metadaten, Legacy-Metadaten (einblendbar), Verwendungsstatus, Sammlungs-Info (read-only), per Drag-Handle in der Breite verstellbar (280–640px)
- 🗂️ **Datei-Kategorie wechseln** – Kategorie einer Datei direkt im Detailpanel per Dropdown ändern
- 🌐 **Sprachlabels** – Mehrsprachige Eingabefelder zeigen das Sprachkürzel als angekoppeltes Label rechts am Input
- 🖼️ **ALT-Text dekorativ** – Wird eine Datei als dekoratives Bild markiert, blendet das Detailpanel die ALT-Text-Felder aus
- ✍️ **TinyMCE-Teaser** – Richtext-Felder zeigen eine normalisierte Klartext-Vorschau (ohne HTML-Tags / `&nbsp;`) im Detailpanel; gespeichert wird stets der vollständige HTML-Inhalt
- 🏷️ **System-Tags Autocomplete** – Bereits dem Medium zugewiesene Tags werden aus der Vorschlagsliste ausgeblendet
- 🔁 **Medien tauschen** – Dateiinhalt ersetzen bei gleichem Dateinamen und kompatibler Dateiendung
- ⬇️ **Download** – Datei direkt aus dem Detailpanel herunterladen
- 🔗 **PDF in neuem Tab öffnen** – Eigener Button in der Vorschau bei PDF-Dateien (analog zum Lightbox-Button bei Bildern)
- 🎯 **Fokuspunkt-Editor** – Nur sichtbar, wenn das separate [focuspoint](https://github.com/FriendsOfREDAXO/focuspoint)-Addon installiert ist: Button auf der Bildvorschau öffnet einen Vollbild-Editor im Hauptbereich mit Klick-zum-Setzen und Live-Zuschnitt-Vorschau für Media-Manager-Typen mit Fokuspunkt-Effekt; Speicherung bleibt im klassischen Metainfo-Feld, siehe „Fokuspunkt-Integration“ unten
- 🗑️ **Löschen** – Datei löschen (inkl. In-Use-Schutz)
- ☁️ **Upload** – Dateien per Drag & Drop oder Upload-Button hochladen, sequenzieller Upload mit Fortschrittsanzeige
- 📋 **Paste-Upload** – Dateien und Bilder per **Cmd+V / Ctrl+V** direkt in die aktuelle Kategorie einfügen (Screenshots, Browser-Bilder, Finder/Explorer-Dateien)
- 📂 **Kategorie erstellen/umbenennen** – Kategorieverwaltung direkt in der Sidebar
- 🌐 **Alle Medien** – Kategorieübergreifende Ansicht aller Medien
- 🍞 **Breadcrumb** – Navigation mit Pfadanzeige
- 📱 **Responsive Compact-Mode** – Bei kleinen Modal-Breiten (< 760 px) schaltet ein ResizeObserver automatisch auf ein mobil-optimiertes Layout um: Offcanvas-Sidebar, Bottom-Sheet Detail-Panel, Filter-Leiste wird horizontal scrollbarer Streifen statt mehrzeiligem Umbruch (Tag-Filter-Dropdown rendert dabei als `position: fixed`-Portal außerhalb der Leiste, gleiches Muster wie das Kategorie-Aktionsmenü, sonst würde `overflow-x: auto` es abschneiden)
- 🌙 **Dark Mode Toggle** – Umschaltbar im Overlay, unabhängig vom REDAXO-Theme (Persistenz via localStorage)
- 🧭 **Stabiler Scroll-Start** – Beim Öffnen bleibt die aktuelle Backend-Scrollposition erhalten (kein Sprung nach oben); die Position wird kurz per `requestAnimationFrame` aktiv gehalten, um asynchrone Sprünge durch Fokus/Layout-Shift abzufangen
- 🖼️ **SVG-Vorschau** – SVGs laufen nicht durch den Media Manager (der sie nicht zuverlässig rendert), sondern werden direkt referenziert
- 📌 **Fixierter Detail-Footer** – Auswählen/Ersetzen/Download/Speichern/Löschen bleiben beim Scrollen im Detailpanel sichtbar (`position: sticky`); Auswählen (Primäraktion im Picker-Modus) steht auf einer eigenen vollbreiten Zeile über den übrigen Buttons
- 🎨 **REDAXO-Look** – Farbpalette (Light Mode) und Ecken-Radien folgen dem echten REDAXO-Backend-Theme (`be_style`), keine abgerundeten Ecken

### Sammlungen (Collections)
- 📚 **Sammlungskatalog** – Sammlungen anlegen, umbenennen und löschen
- 🎯 **Modus-Trennung** – Entweder Kategorie-Modus oder Sammlungs-Modus aktiv
- 🔖 **Zuordnung pro Medium** – In Grid/Liste/Masonry per Lesezeichen-Button zur aktiven Sammlung
- 🧲 **Drag-and-Drop** – Medien auf Sammlung in der Sidebar ziehen, um sie zuzuordnen
- 🎯 **Batch-Drag im Normalmodus** – Mehrere Medien mit **Cmd/Ctrl + Klick** markieren und gemeinsam auf eine Sammlung ziehen
- 🪶 **Kompaktes Drag-Preview** – Beim Ziehen wird ein kleines Drag-Bild verwendet (Trefffläche der Sammlung bleibt gut nutzbar)
- 🧾 **Detailanzeige** – Im Detailpanel wird nur angezeigt, in welchen Sammlungen das Medium liegt
- ⬆️ **Upload im Sammlungsmodus** – Vor dem Upload wird eine Zielkategorie abgefragt; erfolgreiche Uploads werden automatisch der aktiven Sammlung zugeordnet

### Multi-Select (nur Picker-Modus)
- ☑️ **Mehrfachauswahl** – Dateien per Klick an-/abwählen (Checkbox auf jeder Karte)
- ✅ **Alle auswählen / abwählen** – Toggle-Button in der Footer-Leiste, erscheint erst, sobald mindestens eine Datei manuell markiert wurde
- 📊 **Zähler** – Anzeige der Anzahl ausgewählter Dateien
- 📤 **Übernehmen** – Bestätigungs-Button gibt Array aller gewählten Dateinamen zurück

### Mehrfachauswahl im Normalmodus (Cmd/Ctrl + Klick)
- 🖱️ **Markieren per Cmd/Ctrl + Klick** – Ohne Picker-Multi-Select mehrere Medien markieren; eigene Footer-Leiste zeigt die Anzahl. Unabhängig vom Sammlungen-Feature-Toggle nutzbar (auch bei deaktivierten Sammlungen für Mehrfach-Löschen verfügbar)
- ✅ **Alle auswählen** – Toggle-Button in der Footer-Leiste, markiert/entfernt alle in der aktuellen (gefilterten) Ansicht sichtbaren Dateien; erscheint erst, sobald mindestens eine Datei manuell markiert wurde
- 🧲 **Sammlungs-Zuordnung** – Ein markiertes Medium auf eine Sammlung ziehen, alle markierten Medien werden zugeordnet (nur bei aktivem Sammlungen-Feature)
- 🗑️ **Auswahl löschen** – Alle markierten Dateien auf einmal löschen (eigener Bestätigungsdialog); Dateien, die noch verwendet werden, meldet die API pro Datei zurück und sie werden automatisch übersprungen statt den ganzen Vorgang abzubrechen
- 🧹 **Auto-Clear nach Erfolg** – Die Markierung wird nach erfolgreicher Zuordnung/Löschung zurückgesetzt

### Input-Widget
- 🖼️ **Vorschau** – Thumbnails für Bilder, Icons für andere Dateitypen
- ➕ **Hinzufügen** – Öffnet den Overlay-Picker zur Auswahl
- ❌ **Entfernen** – Einzelne Medien per X-Button entfernen
- 🔀 **Drag & Drop Sortierung** – Reihenfolge per Drag & Drop ändern (Multi)
- 🔄 **Auto-Init** – Automatische Initialisierung via `rex:ready` (kompatibel mit MBlock etc.)

## Klassischen Medienpool ersetzen

Standardmäßig übernimmt der neue Overlay die klassischen Zugangspunkte zum Medienpool:

- Der Hauptmenüpunkt **„Medienpool“** (core-Addon) öffnet direkt `MP3.open()` statt der alten Seite (`rex_be_page::setPopup`, wirkt unabhängig vom Backend-Theme).
- Die klassische Dateiliste (`mediapool/media`) wird aus der Navigation ausgeblendet. Die Route bleibt aktiv, da TinyMCE und CKEditor5 sie intern per echtem Popup-Fenster für die Bildauswahl im Editor ansteuern.
- Die klassischen Widgets `REX_MEDIA[n]` und `REX_MEDIALIST[n]` (Module, YForm, MForm) öffnen beim Klick auf „Öffnen“/„Hinzufügen“/„Ansehen“ ebenfalls den neuen Overlay statt des alten Popup-Fensters (`mediapool3_classic.js`, Event-Delegation – die globalen Funktionen `openREXMedia()` & Co. bleiben unangetastet, damit TinyMCE/CKEditor5 weiter funktionieren).
- Ein Verwaltungs-Icon (Zahnrad) im Overlay-Header verlinkt weiterhin auf die klassischen Unterseiten **Struktur**, **Hochladen** und **Synchronisation** (sowie alles, was weitere AddOns wie mediatools/ffmpeg dort einklinken) – als Popup-Fenster über `newPoolWindow()`.

Dieses Verhalten lässt sich unter **MediaPlace → Einstellungen** über die Checkbox „Klassischen Medienpool-Menüpunkt ersetzen“ komplett abschalten (Standard: aktiv). Ist die Option deaktiviert, verhält sich der klassische Medienpool wieder vollständig wie im REDAXO-Standard.

## Funktionen ein-/ausschalten

Unter **MediaPlace → Einstellungen** lassen sich zwei Funktionsbereiche unabhängig voneinander deaktivieren:

- **„Tagging (System-Tags) deaktivieren“** — blendet das System-Tags-Feld im Detail-Panel und den Tag-Filter in der Sidebar aus.
- **„Sammlungen deaktivieren“** — blendet den Sammlungen-Bereich in der Sidebar (anlegen/umbenennen/löschen, Drag&Drop-Zuordnung), den Merken-Button auf den Kacheln und die Sammlungen-Zeile im Detail-Panel aus.

Beide Checkboxen sind standardmäßig **nicht** angehakt (Funktion aktiv) — bewusst als „deaktivieren“ statt „aktivieren“ formuliert und so in `rex_config` gespeichert, weil eine nicht angehakte REDAXO-Config-Formular-Checkbox kein POST-Feld sendet und deshalb nicht zuverlässig von „nie gespeichert“ unterscheidbar ist; mit einem Default von „nicht deaktiviert“ ergibt genau dieser Fall trotzdem das gewünschte Verhalten (Funktion bleibt an). In beiden Fällen bleiben bereits gespeicherte Tags/Sammlungs-Zuordnungen erhalten, nur die UI dafür verschwindet.

## Voraussetzungen

### 1. API AddOn installieren

Das [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api) AddOn muss installiert und aktiviert sein (Version ≥ 1.0).

### 2. API Endpunkte aktivieren

Im REDAXO Backend unter **API → Konfiguration** müssen folgende Backend-Endpunkte aktiviert sein:

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `backend/media/list` | GET | Medienliste laden (mit Filter & Paginierung) |
| `backend/media/get` | GET | Detail-Informationen zu einer Datei |
| `backend/media/add` | POST | Dateien hochladen |
| `backend/media/delete` | DELETE | Datei löschen |
| `backend/media/update` | PATCH/POST | Datei updaten / Dateiinhalt ersetzen |
| `backend/media/category/list` | GET | Kategorien laden |
| `backend/media/category/add` | POST | Neue Kategorie erstellen |
| `backend/media/category/update` | PATCH | Kategorie umbenennen |

> **Wichtig:** Es werden die `backend/`-Endpunkte verwendet (Session-basierte Authentifizierung), nicht die Token-basierten Endpunkte.

## Installation

1. AddOn in `redaxo/src/addons/mediaplace/` ablegen
2. Im Backend unter **AddOns** installieren und aktivieren
3. API AddOn installieren und die benötigten Endpunkte aktivieren
4. Im Menü erscheint **MediaPlace** mit den Seiten **Einstellungen**, **Metainfo Felder**, **Demo** und **Debug** — die Hauptseite und alle Unterseiten sind `perm: admin`, also nur für Admins sichtbar. Der Picker/Overlay selbst ist davon unabhängig und bleibt für jeden Backend-User mit Medienrecht nutzbar (siehe `MediaPermission.php`); nur der „Nur unbenutzte Medien“-Filter braucht zusätzlich das eigene Recht `mediaplace[view_unused_media]` (Admins immer erlaubt, sonst über Benutzer → Rollen → Rechte vergeben)

## Verwendung

### Mehrfachauswahl erklärt

Es gibt zwei unterschiedliche Mehrfach-Mechaniken:

1. **Picker-Multi-Select** (`MP3.open(..., { multiple: true })`)
    - Zweck: Dateinamen als Array an einen Callback zurückgeben (z.B. Modul, YForm, Widget)
    - UI: Checkboxen, Footer mit „Alle auswählen“ und „Übernehmen“

2. **Sammlungs-Batch-Drag im Normalmodus** (`MP3.open()` oder Backend-Standardansicht)
    - Zweck: Mehrere vorhandene Medien gleichzeitig einer Sammlung zuordnen
    - Bedienung: Mit **Cmd/Ctrl + Klick** markieren, dann ein markiertes Medium auf eine Sammlung ziehen

Die beiden Modi sind bewusst getrennt: Der Picker-Multi-Select ist für Rückgabe/Selektion, der Batch-Drag im Normalmodus für schnelle Verwaltung von Sammlungen.

### JavaScript API

#### Einzelauswahl

```javascript
MP3.open(function(filename) {
    console.log('Gewählt:', filename);
});
```

#### Mehrfachauswahl

```javascript
MP3.open(function(filenames) {
    console.log('Gewählt:', filenames); // ["bild1.jpg", "bild2.png"]
}, { multiple: true });
```

#### Overlay schließen

```javascript
MP3.close();
```

### Input-Widget

#### Einzelmedium

```html
<input class="mp3-widget" name="bild" value="">
```

Klick auf ➕ öffnet den Picker (Einzelauswahl). Der gewählte Dateiname wird als `value` gespeichert.

#### Mehrfachauswahl (Galerie)

```html
<input class="mp3-widget" name="galerie" data-mp3-multiple="true" value="">
```

Klick auf ➕ öffnet den Picker im Multi-Select-Modus. Dateinamen werden **kommasepariert** gespeichert (z.B. `bild1.jpg,bild2.png,dokument.pdf`).

#### Widget-Attribute

| Attribut | Beschreibung | Beispiel |
|---|---|---|
| `class="mp3-widget"` | Aktiviert das Widget | `<input class="mp3-widget">` |
| `data-mp3-multiple="true"` | Mehrfachauswahl mit Drag & Drop-Sortierung | `<input class="mp3-widget" data-mp3-multiple="true">` |
| `value="datei.jpg"` | Vorauswahl (bei Multi kommasepariert) | `value="a.jpg,b.png"` |

#### Dynamische Inhalte (MBlock, etc.)

Nach dem dynamischen Einfügen neuer Input-Felder:

```javascript
MP3Widget.init(); // Re-initialisiert alle neuen mp3-widget Inputs
```

### In REDAXO Modulen

#### Modul-Eingabe

```html
<!-- Einzelbild -->
<div class="form-group">
    <label>Titelbild</label>
    <input class="mp3-widget" name="REX_INPUT_VALUE[1]" value="REX_VALUE[1]">
</div>

<!-- Galerie -->
<div class="form-group">
    <label>Bildergalerie</label>
    <input class="mp3-widget" name="REX_INPUT_VALUE[2]"
           data-mp3-multiple="true" value="REX_VALUE[2]">
</div>
```

#### Modul-Ausgabe

```php
// Einzelbild
$image = 'REX_VALUE[1]';
if ($image !== '') {
    echo '<img src="' . rex_url::media($image) . '" alt="">';
}

// Galerie
$gallery = array_filter(explode(',', 'REX_VALUE[2]'));
foreach ($gallery as $file) {
    echo '<img src="' . rex_url::media(trim($file)) . '" alt="">';
}
```

## Dateistruktur

```
mediaplace/
├── package.yml                  # AddOn-Manifest (Subpages: einstellungen, metainfo_fields, demo, debug)
├── boot.php                     # Lädt Assets, injiziert Root-Element, biegt den klassischen Medienpool um
├── install.php                  # Installations-Logik (Default-Config, Default-Feld "Beschreibung", Media-Manager-Typ mediaplace_thumb)
├── uninstall.php                # Deinstallations-Logik
├── assets/
│   ├── mediapool3.js            # Overlay-Picker (IIFE), bindet mediapool3-api.js/-helpers.js per Alias ein
│   ├── mediapool3-api.js        # API-Schicht (reine Funktionen), an window.MP3Core.api gehängt
│   ├── mediapool3-helpers.js    # Generische Utility-Funktionen, an window.MP3Core.helpers gehängt
│   ├── mediapool3.css           # Overlay-Styles (inkl. Dark Mode + Compact-Mode)
│   ├── mediapool3_widget.js     # Input-Widget Auto-Init
│   ├── mediapool3_widget.css    # Widget-Styles (inkl. Dark Mode)
│   └── mediapool3_classic.js    # Leitet klassische REX_MEDIA[n]/REX_MEDIALIST[n]-Widgets auf den Overlay um
├── lib/
│   ├── rex_api_mediaplace_categories.php  # API-Endpunkt (GET + PATCH) für Kategorie-Verwaltung, inkl. renderTreeHtml() + getFlatCategoryList()
│   ├── rex_api_mediaplace_json_metainfo.php  # API-Endpunkt (GET + PATCH) für JSON-Metadaten/System-Tags, inkl. buildFastInfoFields() + renderDetailHtml() fürs Detail-Panel
│   ├── rex_api_mediaplace_tags.php  # API-Endpunkt (GET + PATCH) für Tag-Katalog + Sammlungen (anlegen/umbenennen/löschen)
│   ├── rex_api_mediaplace_unused.php  # API-Endpunkt (GET), prüft übergebene Dateinamen auf rex_mediapool::mediaIsInUse(), eigenes Recht
│   ├── rex_api_mediaplace_focuspoint.php  # API-Endpunkt (GET info + POST save) für die Fokuspunkt-Integration, nur bei installiertem focuspoint-Addon
│   ├── rex_api_mediaplace_schema.php  # API-Endpunkt für die klassischen med_*/art_*/cat_*/clang_*-Metainfo-Felder (unabhängig vom JSON-System)
│   ├── FocuspointIntegration.php # Konsumiert die öffentliche API des focuspoint-Addons (Typen/Felder/Werte lesen, Fokuspunkt speichern)
│   ├── DetailPanelFormatter.php  # Formatierungs-Helfer fürs Detail-Panel (Bytes/Datum/Datei-Icon/Media-Manager-URLs)
│   ├── MediaPermission.php       # Rechteprüfung für die eigenen API-Endpunkte (spiegelt rex_media_perm) + eigenes granulares Recht für den Unbenutzt-Filter
│   ├── SystemTagManager.php      # Tags/Sammlungen: eigene Tabellen rex_mediaplace_tags/_media_tags
│   ├── MetainfoField.php         # Einzelne Felddefinition (Key/Label/Widget-Typ/Optionen/…)
│   ├── MetainfoFieldGroup.php    # Verwaltung aller Felddefinitionen fürs Detail-Panel
│   ├── MetainfoJsonStorage.php   # Laden/Speichern der Feldwerte in rex_media.med_json_data
│   ├── MetainfoWidget.php        # Basisklasse der eingebauten Widget-Typen + getRegisteredTypes() (Erweiterungspunkt-Registry)
│   ├── MetainfoWidgetInterface.php  # Vertrag (normalizeValue()) für eigene, per Erweiterungspunkt registrierte Widgets
│   └── Widgets/                  # Text/Textarea/TinyMce/AltField/MediaLink — je normalizeValue()
├── fragments/mediaplace/
│   ├── category_node.php        # Eine Kategorie-Zeile im Sidebar-Baum (ruft sich für Kinder rekursiv selbst auf)
│   ├── category_children.php    # ".mp3-cat-children"-Wrapper um eine Kategorie-Ebene
│   ├── detail_panel.php         # Äußerer Rahmen des Detail-Panels (Header/Vorschau/Edit-Sektion/Info-Tabelle/Aktionen)
│   ├── detail_preview.php       # Bild/Video/Audio/Icon-Vorschau je nach Dateityp
│   ├── detail_field_title.php   # Titel-Feld (inline Klick-zum-Bearbeiten)
│   ├── detail_field_system_tags.php  # Globales System-Tags-Feld (ohne Sammlungs-Tags), nur bei aktivem Tagging-Toggle
│   ├── detail_tags_widget.php   # Tag-Chip-Liste + Eingabefeld (System-Tags)
│   ├── detail_field.php         # Dispatcher für ein Custom-Feld: Hülle + Body-Fragment je widget_type (Pfad aus MetainfoWidget::getRegisteredTypes())
│   ├── detail_field_body_text.php / _textarea.php / _tinymce.php / _alt.php / _media_link.php  # Feldkörper je eingebautem Widget-Typ
│   ├── detail_lang_group.php    # Kollabierbare Mehrsprachigkeits-Hülle (>1 Sprache)
│   ├── detail_lang_row.php      # Einzelne Sprachzeile innerhalb eines übersetzbaren Feldes
│   ├── detail_info_table.php    # Metadaten-Tabelle inkl. Kategorie-Verschieben-Select, Sammlungen-Zeile nur bei aktivem Toggle
│   └── detail_actions.php       # Auswählen (eigene volle Zeile) + Ersetzen/Herunterladen/Speichern/Löschen-Buttons
├── lang/
│   ├── de_de.lang                # Übersetzungen (flaches key = value Format)
│   └── en_us.lang
└── pages/
    ├── index.php                # Subpage-Router
    ├── einstellungen.php        # Klassischer-Medienpool-Ersatz + Tagging-/Sammlungen-Toggles (rex_config_form)
    ├── metainfo_fields.php      # Verwaltung der Felddefinitionen fürs Detailpanel
    ├── demo.php                 # Demo-Seite mit Beispielen
    └── debug.php                # Admin-Debug-Seite (API-Tests, DB-Stats)
```

## Technische Details

### Architektur

- **Kein Framework / Build-Step** – Vanilla JS (ES5-kompatibel), reines CSS
- **IIFE-Pattern** – Globaler Namespace: `window.MP3` (Picker) und `window.MP3Widget` (Widget)
- **REST API** – Alle Daten via `fetch()` über die FriendsOfREDAXO/api Endpunkte
- **Session Auth** – Nutzt die REDAXO Backend-Session (`credentials: 'same-origin'`)
- **Thumbnails** – REDAXO Media Manager Typen `rex_media_small` (Liste, Media-Link-Vorschau) und der eigene, bei der Installation angelegte Typ `mediaplace_thumb` (500×500, Grid/Media Wall — größer skalierbar per Kachelgrößen-Slider als `rex_media_small`); SVGs umgehen den Media Manager (`mediaThumbSrc()`) und werden direkt aus `/media/` referenziert
- **CSS Scoping** – Alle Overlay-Selektoren unter `#mp3-overlay` (ID-Spezifität) mit `!important` gegen Bootstrap 3
- **Farbpalette** – Light-Mode-Variablen orientieren sich an `be_style/_variables.scss` (`$color-a-*`, `$color-b`), `border-radius: 0` passend zu REDAXO's `$border-radius-base`

### API-Kommunikation

Der Picker nutzt aktuell folgende Endpunkte.

### Genutzte API-Endpunkte (Backend API AddOn)

| Methode | Endpoint | Zweck |
|---|---|---|
| GET | `/api/backend/media?per_page={n}&page={n}` | Medienliste mit Paging |
| GET | `/api/backend/media?filter[category_id]={id}` | Medien je Kategorie |
| GET | `/api/backend/media?filter[term]={query}` | Suche (Server-seitig, Dateiname+Titel, `type:jpg,png`) |
| GET | `/api/backend/media/{filename}/metainfo` | Legacy `med_*` Felder anzeigen |
| GET | `/api/backend/media/{filename}/file` | Datei-Download |
| POST | `/api/backend/media` | Upload (`file`, `category_id`) |
| PATCH | `/api/backend/media/{filename}/update` | Titel/Kategorie etc. aktualisieren |
| POST | `/api/backend/media/{filename}/update` | Dateiinhalt ersetzen (Dateiname bleibt) |
| DELETE | `/api/backend/media/{filename}/delete` | Datei löschen |
| GET | `/api/backend/media/category` | Root-Kategorien |
| GET | `/api/backend/media/category?filter[category_id]={id}` | Unterkategorien |
| POST | `/api/backend/media/category` | Kategorie erstellen |
| PATCH | `/api/backend/media/category/{id}` | Kategorie umbenennen |

### Genutzte AddOn-interne API-Endpunkte (`rex_api_function`)

| Methode | Endpoint | Zweck |
|---|---|---|
| GET | `index.php?rex-api-call=mediaplace_json_metainfo&filename={filename}[&render_detail=1]` | JSON-Metadaten + Felddefinitionen + System-Tags eines Mediums laden. Info-Felder (Titel/Größe/Maße/Datum/`is_in_use`/…) berechnet der Endpunkt direkt aus `rex_media`/`rex_mediapool` (`buildFastInfoFields()`) — kein separater Client-Request nötig. Wird `render_detail=1` mitgeschickt, liefert die Antwort zusätzlich `detail_html` — das komplette, fertig gerenderte Detail-Panel (Vorschau, Felder, Info-Tabelle, Aktionen; siehe `fragments/mediaplace/detail_*.php`) |
| PATCH | `index.php?rex-api-call=mediaplace_json_metainfo&filename={filename}` | JSON-Metadaten + System-Tags eines Mediums speichern |
| GET | `index.php?rex-api-call=mediaplace_tags[&filenames=a,b,c]` | Tag-Katalog und Datei-Tag-Zuordnungen laden |
| PATCH | `index.php?rex-api-call=mediaplace_tags` | Sammlung anlegen/umbenennen/löschen (`action=collection_*`) |
| GET | `index.php?rex-api-call=mediaplace_categories[&current_cat={id}]` | Flache Kategorie-Liste (Tiefe, Parent-ID) **plus** `tree_html` — der komplette, fertig gerenderte Sidebar-Baum (siehe `fragments/mediaplace/`) |
| PATCH | `index.php?rex-api-call=mediaplace_categories` | `parent_id` einer Kategorie setzen (Verschieben, mit Zyklenschutz) |
| GET | `index.php?rex-api-call=mediaplace_unused&filenames=a,b,c` | Prüft, welche der übergebenen Dateien aktuell unbenutzt sind (`rex_mediapool::mediaIsInUse()`) — braucht zusätzlich das Recht `mediaplace[view_unused_media]` |
| GET | `index.php?rex-api-call=mediaplace_focuspoint&action=info&file={filename}` | Fokuspunkt-relevante Media-Manager-Typen, Metainfo-Felder und aktuelle Werte laden — nur verfügbar, wenn das `focuspoint`-Addon installiert ist |
| POST | `index.php?rex-api-call=mediaplace_focuspoint&action=save` | Neuen Fokuspunkt-Wert speichern (`file`, `meta`, `xy`) |

### Wie Metadaten gespeichert werden

- Die strukturierten Metadaten werden als JSON im Feld `rex_media.med_json_data` gespeichert.
- Laden/Speichern erfolgt über `rex_api_mediaplace_json_metainfo`.
- Das Payload enthält:
    - `data`: Feldwerte
    - `fields`: konfigurierte Felddefinitionen
    - `clangs`: Sprachen
    - `system_tags`: Tags des Mediums
    - `system_tag_catalog`: globaler Tag-Katalog
- Beim Speichern werden nur bekannte Felder verarbeitet; Widget-Werte werden normalisiert.

### Eigene Feldtypen registrieren

Das Metainfo-Widget-System ist über den Extension Point `MEDIAPLACE_WIDGET_TYPES` erweiterbar (Subject-Array-Pattern, analog zum `FOCUSPOINT_PREVIEW_SELECT`-EP des [FriendsOfRedaxo/focuspoint](https://github.com/FriendsOfREDAXO/focuspoint)-Addons). Andere Addons können so einen eigenen Feldtyp anmelden, ohne dass `mediaplace` ihn selbst kennen oder implementieren muss — das war früher der Fokuspunkt-Feldtyp, der jetzt zugunsten des spezialisierten `focuspoint`-Addons entfernt wurde.

```php
rex_extension::register('MEDIAPLACE_WIDGET_TYPES', function (rex_extension_point $ep) {
    $types = $ep->getSubject();
    $types['my_widget'] = [
        'label' => 'Mein Feldtyp',
        'class' => MyAddon\MyWidget::class, // implements MetainfoWidgetInterface
        'fragment' => 'my_addon/detail_field_body_my_widget.php',
    ];
    return $types;
});
```

- **`class`**: implementiert `FriendsOfRedaxo\Mediaplace\MetainfoWidgetInterface` (nur `normalizeValue(mixed $value): mixed` fürs Speichern) und braucht einen Konstruktor, der ein `MetainfoField` entgegennimmt — keine Vererbung von unserer internen `MetainfoWidget`-Klasse nötig.
- **`fragment`**: ein `rex_fragment`-Pfad im eigenen Addon-Namespace (z. B. `fragments/my_addon/detail_field_body_my_widget.php`, automatisch von REDAXO registriert). Bekommt dieselben Variablen wie die eingebauten `detail_field_body_*.php`-Fragmente: `$field` (Felddefinition), `$value` (aktueller Wert), `$info` (Datei-Infos, siehe `detail_panel.php`), `$clangs` (Sprachen). Markup-Konvention: äußere `.mp3-edit-field.mp3-json-field`-Hülle kommt schon vom Dispatcher (`detail_field.php`), das eigene Fragment liefert nur den Feldkörper.
- **JS-seitiges Auslesen beim Speichern**: passt der Feldwert ins generische Muster (ein `data-json-field="{key}"`-Element, skalar oder mit `data-clang` pro Sprache), ist keine JS-Änderung nötig. Für abweichende Wertformen (mehrere zusammengehörige Eingabefelder o. ä.) `MP3.registerFieldCollector(widgetType, function (key, panelEl) { return value; })` im eigenen JS aufrufen — wird von `collectJsonValuesFromDetail()` vor dem generischen Fallback geprüft. Interaktive Bedienung (Klicks, Live-Vorschau, …) ist Sache des registrierenden Addons, per eigener Event-Delegation auf denselben geteilten DOM-Elementen (`#mp3-overlay`/`#mp3-detail`).

### Fokuspunkt-Integration (mit dem `focuspoint`-Addon)

Ist das separate [FriendsOfRedaxo/focuspoint](https://github.com/FriendsOfREDAXO/focuspoint)-Addon installiert und aktiv, bekommen Bilder im Detail-Panel einen "Fokuspunkt bearbeiten"-Button (neben dem Lightbox-Button auf der Vorschau). Er öffnet einen vollflächigen Editor im Hauptbereich (dasselbe "Canvas"-Prinzip wie der TinyMCE-Vollbild-Editor, aber ein eigener Block): Klick auf das Bild setzt den Fokuspunkt, eine Live-Vorschau zeigt den Zuschnitt für einen wählbaren Media-Manager-Typ (nur Typen mit einem Fokuspunkt-Effekt).

Bewusst **keine** Anbindung über den Widget-Extension-Point (`MEDIAPLACE_WIDGET_TYPES`, siehe oben) — der ist für Felder aus dem eigenen `med_json_data`-System gedacht. Der Fokuspunkt lebt in einer klassischen `rex_media`-Spalte (Metainfo-Feld, i. d. R. `med_focuspoint`) und wird vom `focuspoint`-Addon selbst verwaltet (Format, Effekte, Cache-Invalidierung); `mediaplace` schreibt nur mit denselben Regeln in dieselbe Spalte, statt eine eigene Speicherung zu bauen:

- `lib/FocuspointIntegration.php` konsumiert ausschließlich die dokumentierte öffentliche API des `focuspoint`-Addons (`Focuspoint::getFocuspointEffectsInUse()`/`getMetafieldList()`, `FocuspointMedia::getFocus()`, `rex_effect_abstract_focuspoint::str2fp()`) — keine eigenen Dateien des `focuspoint`-Addons werden angefasst.
- `lib/rex_api_mediaplace_focuspoint.php` (Actions `info`/`save`) validiert das Zielfeld gegen eine Whitelist der tatsächlich vorhandenen Fokuspunkt-Metainfo-Felder, bevor per `rex_sql` geschrieben wird — verhindert beliebige Spalten-Writes über einen manipulierten Request.
- Die Live-Vorschau läuft über denselben `rex-api-call=focuspoint`-Endpunkt, den auch das `focuspoint`-Addon selbst für seine eigene Bearbeitungsoberfläche nutzt (uncached, mit den aktuell gewählten Koordinaten neu gerendert) — kein eigener Crop-Simulationscode.
- Ohne installiertes `focuspoint`-Addon ist der Button/Endpunkt unsichtbar bzw. liefert `501`; alle Aufrufe der `focuspoint`-Klassen sind auf `FocuspointIntegration::isAvailable()`-abgesicherte Zweige beschränkt.

### Wie Sammlungen gespeichert werden

- Sammlungen sind technisch System-Tags mit Prefix `collection:`.
- Ein Medium kann in mehreren Sammlungen liegen (n:m Zuordnung).
- Persistenz erfolgt über `SystemTagManager` in zwei Tabellen:
    - `rex_mediaplace_tags` (Tag-Katalog inkl. Farbe)
    - `rex_mediaplace_media_tags` (Zuordnung Medium ↔ Tag)
- Die Sidebar-Sammlungen (inkl. Drag-and-Drop-Zuordnung) arbeiten auf dieser Tag-Struktur.
- Im Detailpanel werden Collection-Tags nicht mehr bearbeitet; dort wird nur read-only angezeigt, in welchen Sammlungen ein Medium liegt.

### Dark Mode

Das AddOn unterstützt alle drei REDAXO-Theme-Modi:

- **Light**: Standard-Styles
- **Dark** (`body.rex-theme-dark`): Expliziter Dark Mode
- **Auto** (`@media (prefers-color-scheme: dark)` + `body.rex-has-theme:not(.rex-theme-light)`): System-Präferenz

### Debug-Seite

Unter **Medienpool 3.0 → Debug** (nur für Admins) gibt es:

- Datenbank-Übersicht (Anzahl Medien, Kategorien, Verteilung)
- Medien pro Kategorie
- Kategorie-Baum
- API-Endpunkt-Referenz mit erwarteten Werten
- **Live API-Tests** – Buttons, die Endpunkte abfragen und die JSON-Antwort anzeigen

## Bekannte Einschränkungen

- **Demo / Proof-of-Concept** – Nicht für den Produktiveinsatz optimiert
- **Kein YForm-Value** – Nur als HTML-Input-Widget, nicht als eigener YForm-Feldtyp

> **Hinweis Paste-Upload:** Der Clipboard-Upload per Cmd+V/Ctrl+V funktioniert mit Screenshots, kopierten Bildern aus dem Browser sowie mit Dateien, die im Finder/Explorer per Cmd+C/Ctrl+C kopiert wurden.

## Weiterentwicklung

Offene Ideen für eine produktionsreife Version (Erledigtes siehe `CHANGELOG.md`):

- [ ] YForm-Value-Typ `mp3_media` / `mp3_medialist`
- [ ] Bildbearbeitung (Crop, Resize) im Detail-Panel
- [ ] Keyboard-Navigation (Pfeiltasten, Enter, Space)
- [~] `mediapool3.js` weiter verkleinern — API-Schicht/Helfer sind bereits ausgelagert (CHANGELOG 1.10.0), Sidebar/Detail-Panel/Grid/Tags/Sammlungen/Upload sind noch ein Monolith und bräuchten dafür zuerst ein State-Sharing-Konzept, siehe [Code-Struktur entflechten](#code-struktur-entflechten-ausblick)

### Rückbau-Hinweise (Eigenbauten, die durch API-Addon-Erweiterungen ersetzt werden sollten)

Diese Workarounds existieren nur, weil das FriendsOfREDAXO/api-Addon die jeweilige Fähigkeit (noch) nicht bietet. Sobald es sie anbietet, sollte der Eigenbau entfernt und auf die offizielle Route umgestellt werden (Details direkt als `// TODO`-Kommentar an den jeweiligen Stellen im Code):

- **Kategorie verschieben** (`lib/rex_api_mediaplace_categories.php`, `apiMoveCategory()` in `mediapool3.js`): **komplette Eigenlösung**, nicht Teil des api-Addons — eigener Endpunkt mit direktem SQL auf `parent_id` (und `path`, siehe unten), von uns selbst implementiert und gewartet. `media/category/update` im api-Addon (Stand 1.3) lässt weiterhin bewusst nur `name` zu (Kommentar dort: "REDAXO core does not allow parent_id changes via the page"). Im api-Addon-Issue dazu explizit zurückgestellt (nicht abgelehnt) — ein Move wäre die erste bewusste Erweiterung der API über den Core hinaus (samt neuem Extension Point), das ist erst eine Grundsatzentscheidung wert. Unsere Eigenlösung bleibt also auf absehbare Zeit der einzige Weg; regelmäßig gegen `src/addons/api/lib/RoutePackage/Media.php` prüfen, ob sich das ändert.
  - **Wichtig für den Eigenbau selbst**: `rex_media_category.path` (Vorfahrenkette, z. B. `|1|4|`) wird vom Core nur beim Anlegen gesetzt und nie wieder gepflegt — er kennt kein Move. `handleMove()` muss `path` deshalb für die verschobene Kategorie und ihren gesamten Teilbaum selbst neu schreiben, sonst bleibt `filter[category_id_path]` im api-Addon (`path LIKE '%|id|%'`) auf dem alten Baum stehen und liefert still falsche Ergebnisse. War bis 1.6.0 nicht der Fall (nur `parent_id` wurde geschrieben) — inzwischen behoben, siehe CHANGELOG.

**Erledigt (nicht mehr Workaround):**

- ~~Suche~~ – seit api-Addon 1.3 läuft `buildMediaEndpoint()` über `filter[term]` (serverseitige Dateiname+Titel-Suche), der `SEARCH_PER_PAGE`-Batch-Hack in `refreshDisplay()` wurde entfernt.

## Integration mit mform/TinyMCE/CKEditor5/builder (Ausblick, teilweise umgesetzt)

Andere Addons sollen unseren Overlay nutzen können, statt ihren eigenen klassischen Medienpool-Aufruf zu behalten. Die meisten Picker rufen letztlich REDAXOs klassische `openREXMedia()`/`openMediaPool()` auf, aber auf zwei Arten:

- **Klickbare Widgets** (mforms `+media+`/`+medialist+`, builders `be_media`-Feldtyp): fangen wir bereits per Event-Delegation ab (`mediapool3_classic.js`) — läuft automatisch über unseren Overlay.
- **Direkte JS-Aufrufe ohne abfangbaren Klick** (TinyMCE, CKEditor5, mforms Custom-Link-Widget, builders `smart_link`): **wird aktuell nicht abgefangen**. Offene Idee: `openREXMedia`/`openMediaPool` global auf ein Ersatzobjekt umbiegen, das denselben `jQuery(...).on('rex:selectMedia', ...)`-Vertrag erfüllt statt eines echten Popup-Fensters — würde alle vier Fälle mit einer zentralen Änderung in `mediapool3_classic.js` abdecken.

Alternative für Addons, die aktiv mitziehen wollen: direkt `window.MP3.open()`/`MP3.openFile()` nutzen (siehe „JavaScript API“ oben) statt Popup-Kompatibilität zu emulieren.

## Code-Struktur entflechten (Ausblick)

`mediapool3.js` (~5000 Zeilen) ist weiterhin eine einzelne IIFE-Datei mit State/API-Calls/HTML-Markup (String-Konkatenation) gemischt — API-Layer und generische Helfer sind bereits ausgelagert (CHANGELOG 1.10.0), Sidebar/Detail-Panel/Grid/Tags/Sammlungen/Upload aber noch nicht: das bräuchte zusätzlich ein State-Sharing-Konzept (Getter/Setter statt direktem Variablenzugriff über Datei-Grenzen).

Langfristige Zielidee: ein framework-unabhängiges `<mp3-picker>`-Web-Component mit Shadow DOM (löst u. a. das globale Bootstrap-`table`-CSS-Leck strukturell statt einzeln zu patchen; `--mp3-*`-Custom-Properties vererben trotzdem sauber durch die Shadow-Grenze). Backend-Glue (`mediapool3_classic.js`, `PAGES_PREPARED`) bliebe bewusst außerhalb im Light DOM, da diese Schicht fremde Elemente (REDAXO-Nav, fremde Modul-Widgets) manipuliert.

Ohne automatisierten Test-Unterbau nur schrittweise vertretbar: erst Struktur trennen, Verhalten unverändert lassen, nach jedem Schritt komplett gegentesten.

## Frontend-Einsatz (Ausblick, zwei unabhängige Stufen)

1. **Reiner Picker ohne Login** (Bearer-Token, lesend): Das `api`-Addon unterstützt Bearer-Auth bereits (Token-Scopes auf `media/list`+`media/get` beschränken). Umsetzung wäre eine umschaltbare `API_BASE` (Backend-Session vs. Token-Route), gezielt statt global einbindbare Assets, Schreibaktionen im JS ausgeblendet, Theming vom Backend entkoppelt.
2. **YCom-Nutzer verwalten eigene Medien** (schreibend): Deutlich größerer Aufwand — weder das `api`-Addon noch unsere Endpunkte kennen ein Ownership-Konzept (`rex_media.createuser` existiert, wird aber nirgends als Rechtegrundlage ausgewertet). Bräuchte einen eigenen YCom-Auth-Pfad, serverseitige `createuser`-Filterung und eine Kategorie-Strategie; `ycom/plugins/media_auth` deckt nur den Ausliefer-Zugriff ab, nicht die Verwaltung.

## Lizenz

MIT

## Credits

- [FriendsOfREDAXO](https://github.com/FriendsOfREDAXO)
- Inspiriert von [MediaNeo](https://github.com/FriendsOfREDAXO/medianeo) und dem nativen REDAXO Medienpool
- Nutzt die [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api) REST-Schnittstelle
