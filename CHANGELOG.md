# Changelog

## Version 1.0.0 – 2026-08-26

Erste Version von **MediaPlace**: ein vollständiger, moderner Medienpool für das REDAXO-Backend als Ersatz für den klassischen Medienpool.

### Sicherheit
- **Alle eigenen API-Endpunkte (`rex_api_mediaplace_*`) hatten `published = true` gesetzt** — das schaltet REDAXOs eigene, automatische Absicherung in `rex_api_function::handleCall()` (`rex::isBackend()` + `rex::getUser()`, laufen sonst VOR `execute()`) ab, nicht an. Da `rex-api-call` sowohl von `backend.php` als auch von `frontend.php` verarbeitet wird, waren die Endpunkte dadurch auch über die normale Frontend-URL erreichbar, nicht nur über den Backend-Controller. Die vorhandenen manuellen Prüfungen (`rex::getUser()`/`rex_backend_login::hasSession()`) blockierten zwar nicht angemeldete Anfragen zuverlässig, prüften aber nie `rex::isBackend()` — ein am Backend angemeldeter Nutzer hätte die Endpunkte also auch über die Frontend-Domain erreichen können. `published = true` in allen sechs Endpunkten entfernt (Basisklassen-Default ist bereits `false`); live verifiziert: authentifizierte Backend-Anfrage weiterhin 200, nicht authentifizierte Anfrage weiterhin 401, authentifizierte Anfrage über die Frontend-URL jetzt korrekt 403.

### Medienpool-Overlay
- Vollbild-Overlay (`MP3.open()`) mit Kategorie-Baum (inkl. Kategoriesuche, Verschieben, Anlegen/Umbenennen), Grid-, Listen- und Media-Wall-Ansicht, Kachelgröße per Slider.
- Serverseitige Suche über Titel, Dateiname, Originalname und JSON-Metadaten; Typ-Filter (Bilder/Videos/Audio/Dokumente/Sonstige), Tag-Filter, „Nur unbenutzte Medien“-Filter (eigenes granulares Recht `mediaplace[view_unused_media]`), 8 Sortieroptionen, Pagination mit „Mehr laden“.
- Upload per Drag & Drop, Upload-Button oder Cmd/Ctrl+V-Paste; Kategorie erstellen/umbenennen direkt in der Sidebar; Breadcrumb-Navigation.
- Responsive Compact-Mode (Offcanvas-Sidebar, Bottom-Sheet Detail-Panel, mobiles Filter-Dropdown) für schmale Modal-Breiten; Dark-Mode-Toggle unabhängig vom REDAXO-Theme.

### Detail-Panel & Metadaten
- Strukturierte JSON-Metadaten (`med_json_data`) mit eigenem Feld-Editor (Text/Textarea/TinyMCE/CKEditor5/Alt-Text/Medienverknüpfung), Mehrsprachigkeit, dekorativem ALT-Text-Modus. TinyMCE und CKEditor5 teilen sich denselben Vollbild-Editor-Canvas (Bedienung identisch, nur die Engine dahinter unterscheidet sich) und binden das jeweils installierte Addon direkt über dessen öffentliche JS-API ein.
- Erweiterungspunkt `MEDIAPLACE_WIDGET_TYPES` für eigene Feldtypen aus Drittaddons (Registry-Pattern, kein Zwang zur Vererbung).
- System-Tags mit Autocomplete, Datei-Kategorie direkt im Panel wechselbar, Medien tauschen (gleicher Dateiname/kompatible Endung), Download, PDF-Öffnen-Button.
- Echte, über das REDAXO-Metainfo-Addon angelegte `med_*`-Felder (z.B. Copyright): Übergangslösung, standardmäßig deaktiviert (Einstellungen → „Klassische Metainfo-Felder verlinken“). Zeigt bei Aktivierung den bestehenden „Alte Metadaten“-Bereich (read-only) plus einen Link, der die Datei direkt zum Bearbeiten in der klassischen Medienpool-Detailseite öffnet — natives Editieren dieser Felder in MediaPlace selbst folgt in einer späteren Version.
- Fokuspunkt-Editor: nur sichtbar bei installiertem [focuspoint](https://github.com/FriendsOfREDAXO/focuspoint)-Addon und mindestens einem Media-Manager-Typ mit Fokuspunkt-Effekt. Vollflächiger Editor mit Klick-zum-Setzen und Live-Zuschnitt-Vorschau; Speicherung bleibt im klassischen Metainfo-Feld (`med_focuspoint`), damit andere Konsumenten (Templates, Effekte) unverändert funktionieren.

### Sammlungen & Mehrfachauswahl
- Sammlungen (Collections) als eigener Modus: anlegen/umbenennen/löschen, Zuordnung per Lesezeichen-Button oder Drag & Drop (inkl. Batch-Drag mit Cmd/Ctrl+Klick-Markierung).
- Multi-Select im Picker-Modus (Auswahl übernehmen) sowie unabhängig davon eine Cmd/Ctrl+Klick-Mehrfachauswahl im Normalmodus mit Batch-Löschen (überspringt automatisch noch verwendete Dateien) und „Alle auswählen“.
- Beide Bereiche (Tagging, Sammlungen) einzeln über die Einstellungsseite deaktivierbar.

### Input-Widget & klassische Integration
- `<input class="mp3-widget">` wird automatisch zu einem visuellen Medien-Picker mit Vorschau, Hinzufügen/Entfernen, Drag & Drop-Sortierung.
- Jedes ausgewählte Medium bekommt einen „Details ansehen“-Button (Lupe), der den Overlay direkt im Detail-Panel dieses Mediums öffnet (Browse-only, ändert die Auswahl nicht) — nutzt `MP3.openFile()`.
- Der klassische „Medienpool“-Menüpunkt sowie die `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widgets öffnen wahlweise direkt den neuen Overlay statt der alten Seiten/Popups (abschaltbar in den Einstellungen).

### i18n-Infrastruktur
- `lang/de_de.lang` ist die **einzige** Quelle der Wahrheit für übersetzbare Texte — auch für JS-seitige Strings, keine zweite, separat gepflegte Übersetzungstabelle. `boot.php` löst beim Seitenaufbau jeden dort vorhandenen `mediaplace_*`-Schlüssel über `rex_i18n::msg()` für die aktive Locale auf (inkl. deren eingebauter Fallback-Kette) und embedded das Ergebnis als JSON (`<script type="application/json" id="mp3-i18n-data">`). Neue Datei `assets/mediapool3-i18n.js` liest dieses JSON und stellt `MP3Core.i18n.t(key, vars)` bereit — reines PHP-gerendertes JSON, keine Abhängigkeit von REDAXO-Backend-JS-Globals, funktioniert deshalb unverändert auch im Frontend, sobald MediaPlace dort eingesetzt wird.
- Das komplette Addon ist migriert: Overlay-Kern (`mediapool3.js`), Input-Widget (`mediapool3_widget.js`), alle 17 PHP-Fragmente des Detail-Panels (`fragments/mediaplace/*.php`), sowie die Seiten `settings.php`, `metainfo_fields.php` und `demo.php` nutzen durchgängig `t()`/`rex_i18n::msg()` statt hartkodiertem Text (262 Schlüssel in `lang/de_de.lang`).
- `lang/en_gb.lang` (Englisch) ist vollständig gepflegt (gleiche 262 Schlüssel). Weitere Sprachen fallen dank REDAXOs Locale-Fallback (`lang_fallback`) auf Englisch bzw. Deutsch zurück statt einen kaputten Platzhalter zu zeigen.

### Technik
- Eigene `rex_api_function`-Endpunkte (`mediaplace_categories`, `mediaplace_json_metainfo`, `mediaplace_tags`, `mediaplace_unused`, `mediaplace_focuspoint`, `mediaplace_schema`) mit zentraler Rechteprüfung (`MediaPermission`), die REDAXOs Medien-Berechtigungen spiegelt.
- Serverseitig gerenderte Fragmente für Kategoriebaum und Detail-Panel; JS-Kern in mehrere Dateien aufgeteilt (API-Schicht, generische Helfer, Hauptmodul).
- Vanilla JS/CSS ohne Build-Step oder Framework-Abhängigkeit; vollständiges Dark-Mode-Theming über CSS Custom Properties.
