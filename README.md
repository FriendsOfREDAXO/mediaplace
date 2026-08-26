# MediaPlace

![REDAXO](https://img.shields.io/badge/REDAXO-%3E%3D5.20-red) ![PHP](https://img.shields.io/badge/PHP-%3E%3D8.4-blue) ![API](https://img.shields.io/badge/API_AddOn-%3E%3D1.3-green)

Hey! Ihr wünscht Euch den Medienpool 3, das können wir nicht bieten. Aber hier ist **MediaPlace** – ein moderner Medienpool-Ersatz fürs REDAXO-Backend, mit dem sich das Warten schon mal ganz gut aushalten lässt.

Vollbild-Overlay statt Popup-Gefrickel, dazu ein Eingabe-Widget für Module/Formulare und eine nahtlose Übernahme aller klassischen Zugangspunkte (Hauptmenü, `REX_MEDIA[n]`/`REX_MEDIALIST[n]`). Unter der Haube läuft die REST-API des [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api)-Addons.

## Features

**Overlay & Medienverwaltung**
- 📁 Kategorie-Baum mit Suche, Verschieben, Anlegen/Umbenennen
- 🔍 Serverseitige Suche über Titel, Dateiname, Originalname und Metadaten
- 🏷️ Typ- und Tag-Filter, „Nur unbenutzte Medien“-Filter, 8 Sortieroptionen
- 🖼️ Grid, Liste & Media Wall (Masonry), Kachelgröße per Slider
- 📄 Detail-Panel mit editierbarem Titel, eigenen Metadaten-Feldern, Verwendungsstatus, Datei tauschen/löschen/downloaden
- 🎯 Fokuspunkt-Editor direkt im Detail-Panel, sobald das [focuspoint](https://github.com/FriendsOfREDAXO/focuspoint)-Addon installiert ist
- ☁️ Upload per Drag & Drop, Button oder einfach **Cmd+V/Ctrl+V** pasten
- 📱 Responsive Compact-Mode fürs schmale Fenster, Dark Mode Toggle
- 🎨 Sieht aus wie REDAXO, weil es sich an `be_style` orientiert

**Sammlungen**
- 📚 Eigene Sammlungen anlegen, Medien per Lesezeichen-Button oder Drag & Drop zuordnen
- 🎯 Auch als Batch: mehrere Medien mit Cmd/Ctrl+Klick markieren und gemeinsam ziehen

**Mehrfachauswahl**
- ☑️ Im Picker-Modus: Dateien markieren, „Übernehmen“ liefert die Auswahl als Array zurück
- 🖱️ Im Normalmodus: Cmd/Ctrl+Klick markiert mehrere Medien für Batch-Löschen oder Sammlungs-Zuordnung

**Input-Widget**
- 🖼️ Vorschau, Hinzufügen/Entfernen, Drag & Drop-Sortierung bei Mehrfachauswahl
- 🔄 Initialisiert sich automatisch, auch bei dynamisch nachgeladenen Feldern (MBlock & Co.)

## Anwenderhilfe

### Installieren

1. AddOn installieren und aktivieren.
2. Das [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api)-Addon muss ebenfalls installiert sein – unter **API → Konfiguration** die `backend/media*`-Endpunkte (Liste, Get, Add, Delete, Update, Category) aktivieren.
3. Fertig. Der Hauptmenüpunkt „Medienpool“ öffnet ab sofort direkt den neuen Overlay.

Unter **MediaPlace** finden sich die Admin-Seiten **Einstellungen**, **Metainfo Felder**, **Demo** und **Hilfe**. Der Picker/Overlay selbst bleibt für alle Backend-User mit Medienrecht nutzbar – nur der „Nur unbenutzte Medien“-Filter braucht zusätzlich ein eigenes Recht, das sich über Benutzer → Rollen vergeben lässt.

### Klassischen Medienpool zurückholen

Falls doch lieber der alte Medienpool gewünscht ist: unter **MediaPlace → Einstellungen** die Checkbox „Klassischen Medienpool-Menüpunkt ersetzen“ abschalten. Dann verhält sich alles wieder wie im REDAXO-Standard.

> **Hinweis:** Der alte Medienpool bleibt als Picker-Seite erreichbar – für AddOns, die MediaPlace noch nicht unterstützen (z. B. TinyMCE/CKEditor5), springt der klassische Auswahl-Popup weiterhin ein.

### Tagging und Sammlungen einzeln abschalten

Ebenfalls in den Einstellungen: „Tagging (System-Tags) deaktivieren“ und „Sammlungen deaktivieren“ blenden die jeweiligen Bereiche unabhängig voneinander aus. Bereits gespeicherte Daten gehen dabei nicht verloren, nur die Bedienoberfläche verschwindet.

### Als Eingabefeld in Modulen/Formularen nutzen

```html
<!-- Einzelbild -->
<input class="mp3-widget" name="REX_INPUT_VALUE[1]" value="REX_VALUE[1]">

<!-- Galerie (mehrere Dateien, kommasepariert) -->
<input class="mp3-widget" data-mp3-multiple="true" name="REX_INPUT_VALUE[2]" value="REX_VALUE[2]">
```

Klick auf ➕ öffnet den Picker. Werden Felder dynamisch nachgeladen (z. B. MBlock), einfach `MP3Widget.init()` erneut aufrufen.

### Den Picker direkt per JavaScript öffnen

```javascript
MP3.open(function (filename) {
    console.log('Gewählt:', filename);
});

// Mehrfachauswahl
MP3.open(function (filenames) {
    console.log('Gewählt:', filenames);
}, { multiple: true });
```

## Für Entwickler

### Eigene API-Endpunkte

| Methode | Endpunkt | Zweck |
|---|---|---|
| GET | `?rex-api-call=mediaplace_json_metainfo&filename={f}` | Metadaten + Felder + Tags eines Mediums laden |
| PATCH | `?rex-api-call=mediaplace_json_metainfo&filename={f}` | Metadaten + Tags speichern |
| GET/PATCH | `?rex-api-call=mediaplace_tags` | Tag-Katalog laden, Sammlungen verwalten |
| GET/PATCH | `?rex-api-call=mediaplace_categories` | Kategorien laden, verschieben |
| GET | `?rex-api-call=mediaplace_unused&filenames=a,b,c` | Prüft, welche Dateien unbenutzt sind |
| GET/POST | `?rex-api-call=mediaplace_focuspoint` | Fokuspunkt lesen/speichern (nur mit `focuspoint`-Addon) |

### Eigene Feldtypen registrieren

Das Detail-Panel ist über den Extension Point `MEDIAPLACE_WIDGET_TYPES` erweiterbar – andere Addons können so eigene Feldtypen anmelden, ohne dass MediaPlace sie kennen muss:

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

`MyWidget` implementiert nur `normalizeValue(mixed $value): mixed` fürs Speichern; das Fragment bekommt `$field`, `$value`, `$info` und `$clangs` und liefert nur den Feldkörper (die Hülle kommt vom Dispatcher). Passt der Wert nicht ins generische Einzelfeld-Schema, lässt sich das Auslesen beim Speichern per `MP3.registerFieldCollector(widgetType, function (key, panelEl) { return value; })` anpassen.

## Credits

- [FriendsOfREDAXO](https://github.com/FriendsOfREDAXO)
- Inspiriert von [MediaNeo](https://github.com/FriendsOfREDAXO/medianeo) und dem nativen REDAXO-Medienpool
- Nutzt die [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api)-REST-Schnittstelle
- Lizenz: MIT
