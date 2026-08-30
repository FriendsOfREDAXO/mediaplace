# Changelog

## Version 1.20.0 – 2026-08-30

Zusammengefasste Änderungen seit Version 1.5.3 (Zwischenschritte entfernt, siehe Git-Historie für die volle Detailtiefe).

### Neu
- Vollständiger Ersatz des klassischen Medienpools durch MediaPlace: nicht nur der Haupt-Menüpunkt, auch "Medium hinzufügen"/"Kategorieverwaltung" sowie Direktaufrufe/Deep-Links (`?page=mediapool/media&file_id=...`) landen jetzt auf der MediaPlace-Vollbildansicht. TinyMCE/CKEditor5 und die klassischen `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Popups funktionieren unverändert weiter (eigener Popup-Vertrag wird nachgebildet). Kollisionsschutz mit `filepond_uploader`s eigenem `replace_mediapool`-Schalter.
- Cloud-Provider-Anbindung: andere Addons können sich als zusätzlicher Baum in die Sidebar einklinken (Browsen, Suchen, Import einzelner Dateien in den lokalen Medienpool) über einen neuen Erweiterungspunkt `MEDIAPLACE_STORAGE_PROVIDERS`. Erster Provider: das `nextcloud`-Addon.
- Mehrfachauswahl grundlegend überarbeitet: sichtbare Checkbox-Overlays statt nur versteckter Ctrl/Cmd+Klick-Geste, Sammelaktionen "Auswahl verschieben"/"Auswahl löschen" in einer Auswahl-Fußleiste – deckt jetzt alle klassischen Medienpool-Mehrfachaktionen ab.
- Sammlungen: fester Zuordnungs-Button im Detail-Panel (ersetzt das fehlerhafte Lesezeichen-System), echte globale Mitgliederzahl pro Sammlung statt nur der aktuell geladenen Kategorie.
- Tags: eigene Combobox mit Mehrfachauswahl + "neu anlegen"-Option ersetzt das frühere native `<datalist>`-Autocomplete. Neu abgeschlossen: zentrale **Tag-Verwaltung** (eigene Backend-Seite) zum Umbenennen (kaskadiert automatisch auf alle Dateien), Farbe zentral ändern und Löschen von System-Tags – erreichbar über eine neue, eigene Berechtigung `mediaplace[manage_tags]` sowie einen Eintrag im Zahnrad-Menü des Overlays. Die Farbe eines *bestehenden* Tags ist damit nur noch hier änderbar; das per-Datei-Farb-Swatch im Tag-Widget erscheint nur noch direkt bei der Neuanlage eines Tags.
- Sidebar: die drei großen Abschnitte (Kategorien, Sammlungen, Tags) lassen sich einzeln ein-/ausklappen (Zustand in `localStorage`); der Tag-Filter zog aus einem Dropdown in einen eigenen, immer sichtbaren Sidebar-Abschnitt um.
- Video/Bild-Optimierung: "Bild optimieren"-Button für Bestandsdateien über den Upload-Resize-Grenzen (GD-Resize in-place), wählbarer Video-Vorschau-Modus (Aus/Einzelbild/Animiert), "Bereits optimiert"-Badge mit Kompressionsrate, aufklappbarer "Technische Details"-Bereich für Videos (ffprobe-Daten, lazy geladen), Cronjob "Vorschaubilder vorwärmen" für Bild- und Video-Thumbnails.
- "Pro Seite"-Auswahl bietet zusätzlich "Alle" an; Dark/Light-Umschalter zog ins Zahnrad-Menü.
- JS-Architektur: der komplette Overlay-Kern (ursprünglich 7313 Zeilen als Einzeldatei) wurde in einem esbuild-basierten Build-Prozess schrittweise in eigenständige ES-Module aufgeteilt (Cloud-Provider, Modals, Lightbox, Fokuspunkt, Zuschneiden, Optimieren, Sammlungen, Kategorien, Filter, Grid-Rendering, Detail-Panel, Upload, Multi-Select) – der verbleibende Hub ist dadurch auf ca. 3640 Zeilen geschrumpft (-50%), bei unveränderter Funktionalität.
- Neuer Sidebar-Eintrag "Medien ohne ALT-Text" direkt unter dem Medien-Abschnitt (nur sichtbar, wenn in den Einstellungen aktiviert – Default an – UND überhaupt ein ALT-Text-Feld – eigenes oder klassisches `med_alt` – existiert): globaler, rechte-gefilterter Filter über alle zugänglichen Kategorien, analog zu Sammlungen als eigener Ansichts-Modus. Folgt derselben Prioritäts-Logik wie der "ALT-Text fehlt"-Hinweis im Detail-Panel (`AltTextStatus`) – ist das eigene Metadaten-Feld aktiv, zählt ausschließlich dieses, nicht zusätzlich das klassische `med_alt`.

### Geändert
- Sammlungen sehen nirgends mehr wie Tags aus (Farb-Dots auf Datei-Kacheln, im Sammlungen-verwalten-Dialog und im Tag-Widget waren zuvor optisch nicht unterscheidbar).
- Lange, leerzeichenfreie Dateinamen sprengen Bestätigungs-/Auswahl-Dialoge nicht mehr um (zentral in den gemeinsamen Modal-Bausteinen behoben).
- Diverse Performance-/Speicher-Fixes für die Video-Vorschau im Grid (IntersectionObserver statt dauerhaft geladener animierter Bilder, kleinere Thumbnail-Zielgröße, konsequentes `loading="lazy"`).
- Mobile Auswahl-Fußleisten zeigen auf schmalen Bildschirmen nur noch Icons statt umbrechender Textlabel.
- "Metadaten bearbeiten" ist bei Neuinstallationen jetzt standardmäßig aktiviert.
- Der "Bitte ALT-Text hinterlegen"-Hinweis unter dem "Metadaten bearbeiten"-Button erscheint nur noch bei Bild-Dateien – bei PDF/Video/Audio ergibt der Hinweis keinen Sinn (`AltTextStatus::isMissing()` prüft jetzt zuerst `$media->isImage()`).
- Sidebar-Sektion "Kategorien" heißt jetzt "Medien" mit dem Icon des klassischen Medienpools (`rex-icon-media`) statt eines Ordnerbaum-Symbols.
- Der Panel-Header im Detail-Panel zeigt jetzt nur noch die statische Überschrift "Details" – ein kurzer Versuch, den Titel direkt dort editierbar zu machen (um die Dopplung mit dem "Titel"-Feld darunter zu vermeiden) machte das Eingabefeld dort zu schmal; das "Titel"-Feld bleibt daher wie gewohnt unterhalb der Vorschau.

### Intern
- Alle `mediapool3*`-Dateinamen (Erbe aus der Zeit vor dem eigenständigen `mediaplace`-Addon) auf `mediaplace*` umbenannt: `assets/mediaplace.js` (Overlay-Bundle, vorher `mediapool3.js`), `mediaplace.css`, `mediaplace-i18n.js`/`-helpers.js`/`-api.js`, `mediaplace_widget.js`/`.css`, `mediaplace_classic.js`, Quell-Ordner `src/mediaplace/` (vorher `src/mediapool3/`). `legacy.js` (der Hub, der alle `modules/*.js` importiert und verdrahtet) heißt jetzt `core.js` – der alte Name war seit Abschluss aller 12 Modularisierungs-Phasen irreführend. `DEV.md` entsprechend aktualisiert.
- Alle 13 eigenen `rex_api_function`-Endpunkte laufen jetzt unter dem Namespace `FriendsOfRedaxo\Mediaplace\Api` (siehe https://redaxo.org/doku/5.x/api#namespace-registrierung) statt der `rex_api_<name>`-Klassennamenskonvention – Klassen umbenannt (z. B. `rex_api_mediaplace_json_metainfo` → `Api\JsonMetainfo`), Dateien nach `lib/Api/` verschoben, explizite `rex_api_function::register()`-Aufrufe in `boot.php` ergänzt. Die `rex-api-call`-Bezeichner selbst (z. B. `mediaplace_json_metainfo`) bleiben unverändert – bestehende Client-Aufrufe sind nicht betroffen.

### Bugfix
- Mehrere Zustands-Sync-Probleme rund um den nativen Metainfo-Canvas behoben: ALT-Text-Warnungen und Speichern-Button blieben nach dem Zurückkehren aus dem klassischen Formular auf altem Stand.
- 500er-Fehler bei Videos behoben, wenn das `ffmpeg`-Addon nicht (mehr) installiert ist.
- Einstellungen-Checkboxen (inkl. "Klassischen Medienpool-Menüpunkt ersetzen") ließen sich nicht mehr deaktivieren (REDAXO-Kernverhalten von `rex_config_form` bei nicht gesendeten Checkboxen).
- Escape schloss im Metainfo-/Fokuspunkt-/Zuschneiden-Canvas fälschlich das komplette Overlay statt nur den Canvas.
- Fokuspunkt-Button reagierte teils gar nicht auf Klicks (veralteter clientseitiger Gate-Check).
- i18n-Platzhalter-Syntax-Fehler (`%s` statt `{0}`) beim Optimieren-Badge korrigiert.
- Dark/Light-Umschalter im Zahnrad-Menü blendet sich jetzt aus, wenn er ohnehin wirkungslos wäre: er kann nur eine helle Umgebung dunkel machen, nicht eine bereits (von REDAXO explizit oder REDAXO "automatisch" + dunklem System) dunkle Umgebung wieder hell erzwingen – vorher blieb er in diesem Fall sichtbar, hatte beim Klick aber keine erkennbare Wirkung.
- "System-Tags"-Feld im Detail-Panel heißt jetzt nur noch "Tags", Label größer (13px statt 11px) und Tag-Chips deutlich größer (15px statt 11px, plus etwas mehr Innenabstand).
- "Ansehen" (Auge-Icon) auf einem klassischen `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widget landete innerhalb des nativen Metainfo-Canvas fälschlich im Auswahl-Modus statt die Details der bereits ausgewählten Datei im eigenen Detail-Panel zu zeigen (nur auf "irgendeine Aktion" statt auf die konkrete Aktion geprüft).
- Video-Badge auf Grid-Kacheln (Standbild-Vorschau-Modus) verdeckte bei aktiver Mehrfachauswahl die Checkbox (beide oben links positioniert) – Badge sitzt im normalen Grid jetzt oben rechts, im Media-Wall unverändert oben links (dort ist die Checkbox rechts in der Toolbar).
- Feld-Labels (TITEL/SYSTEM-TAGS/BESCHREIBUNG/...) und der "Technische Details"-Umschalter im Detail-Panel waren zu klein (10px bzw. 12px) – jetzt 11px bzw. 13px.
- Der Tag-Feld-Hinweis "Autofill aus bestehenden Tags. Farben gelten systemweit." entfernt (unnötiger Text im Detail-Panel).
- Der "N weitere Sprache(n)"-Umschalter bei mehrsprachigen Feldern zeigte beim ersten Rendern wörtlich "%d weitere Sprache" statt der echten Anzahl (falsche Platzhalter-Syntax `%d` statt `{0}`, REDAXOs `rex_i18n::msg()` kennt nur Letzteres) – betraf ebenso den Tag-Umbenennen-Dialog-Titel (`%s` statt `{0}`). Der JS-seitige Auf-/Zuklappen-Text nutzte zusätzlich hartkodiertes Deutsch statt der Sprachdatei – zeigte an nicht-deutschen Installationen immer Deutsch.
- "Bild optimieren"-Button umbrach bei langem Label (inkl. Bildmaße, z. B. "Bild optimieren (3000×2000 → max. 2000×2000)") zweizeilig – Label bleibt jetzt einzeilig mit Ellipsis, voller Text weiterhin per Tooltip abrufbar.
- "Bitte ALT-Text hinterlegen" unter "Metadaten bearbeiten" erschien zusätzlich zum eigenen, direkt am ALT-Feld sitzenden Hinweis – doppelt und irreführend, da ein Klick auf "Metadaten bearbeiten" zum klassischen `med_alt`-Feld im nativen Formular führt, nicht zum eigentlich fehlenden eigenen Feld. Der Hinweis unter "Metadaten bearbeiten" erscheint jetzt nur noch, wenn tatsächlich das klassische `med_alt`-Feld die maßgebliche Quelle ist (kein eigenes Alt-Feld aktiv).
- Eine Sammlung zu aktivieren zeigte oft "0 Treffer", obwohl die Sidebar die echte (globale) Mitgliederzahl korrekt anzeigte: der Sammlungs-Modus lud serverseitig einfach Seite 1 der unsortierten Gesamtliste (kein Kategorie-Filter im Sammlungs-Modus, da Sammlungen kategorieübergreifend sind) und filterte erst danach clientseitig auf die Sammlung – lagen die Mitglieder nicht zufällig auf dieser einen geladenen Seite, blieb die Liste leer. `Api\MediaList` unterstützt jetzt `filter[collection]` (SQL-Filterung direkt auf `rex_mediaplace_media_tags`, kategorierechte-bewusst wie die übrige Abfrage) und wird für den Sammlungs-Modus jetzt immer direkt aufgerufen – unabhängig vom `data-api-media-list-secure`-Schalter, der nur die generische Kategorie-Rechtefilterung der normalen Medienliste betrifft, da Sammlungen ein reines MediaPlace-Konzept sind, das die `api`-Addon-Route ohnehin nie kennen konnte.

## Version 1.5.2 – 2026-08-28

### Bugfix
- Der "Video optimieren"-Button zeigte nie an, dass eine Datei bereits optimiert wurde – anders als ffmpeg's eigene Video-Tools-Seite (siehe dortiges Changelog 4.6.0), die dieselbe Registry bereits auswertet. Button-Beschriftung wechselt jetzt zu "Erneut optimieren" und ein kleines Badge zeigt die erreichte Kompressionsrate, sobald eine Datei per Overwrite-Modus optimiert wurde.

## Version 1.5.1 – 2026-08-28

### Neu
- Aufklappbarer "Technische Details"-Bereich im Detail-Panel bei Videos (Auflösung, Dauer, Seitenverhältnis, Framerate, Format, Bitrate, Video-/Audio-Codec) – nutzt ffmpeg's vorhandene `VideoInfo`-Klasse, lazy nachgeladen erst beim Aufklappen (ffprobe-Aufruf kostet spürbar Zeit, soll das normale Öffnen des Detail-Panels nicht verzögern).

### Bugfix
- Läuft gerade eine Videooptimierung (auch von einer anderen Session oder über ffmpeg's eigene Video-Tools-Seite gestartet), zeigte das Detail-Panel beim (Wieder-)Öffnen keinen Status – erst ein erneuter Klick auf "optimieren" hätte das bemerkt (und dabei nur "läuft bereits" gemeldet, ohne den echten Fortschritt zu zeigen). Das Detail-Panel prüft jetzt beim Rendern, ob für die geöffnete Datei bereits ein Job aktiv ist, und nimmt das Live-Polling automatisch wieder auf.
- Die Video-Vorschau im Grid und der "Video optimieren"-Button prüften bisher nur, ob das `ffmpeg`-Addon installiert ist – nicht, ob das `ffmpeg`-Programm auf dem Server tatsächlich vorhanden/lauffähig ist (viele Webspaces haben es nicht). Alle drei Fähigkeiten (Vorschau/Optimieren/Technische Details) prüfen jetzt einheitlich die echte Verfügbarkeit (gecacht, 1x pro Stunde), Fallback bleibt konsequent das bisherige Datei-Icon bzw. ausgeblendete Buttons.

## Version 1.5.0 – 2026-08-28

### Neu (ffmpeg-Integration)
- Ist das separate `ffmpeg`-Addon installiert, zeigt das Grid für Videos jetzt eine echte, animierte Vorschau (Media-Manager-Typ `mediaplace_video_thumb`, nutzt ffmpeg's `rex_effect_video_to_webp`) statt des Datei-Icons – nativ lazy geladen (`loading="lazy"`), wird also erst beim Sichtbarwerden der Kachel angefordert.
- Neuer "Video optimieren"-Button im Detail-Panel: stößt eine Konvertierung über ffmpeg's Job-Engine an (siehe dortiges Changelog 4.5.0, neuer `overwrite`-Modus) – die Original-Mediendatei wird direkt ersetzt (gleicher Dateiname), Titel/Kategorie/Metainfo-Felder bleiben automatisch erhalten. Läuft im Hintergrund weiter, das Detail-Panel bleibt währenddessen bedienbar; eine kleine Statuszeile unter dem Button zeigt Fortschritt/Ergebnis.
- Neues Rollenrecht `mediaplace[optimize_video]` – ohne dieses Recht ist der "Video optimieren"-Button nicht sichtbar, der Server-Endpunkt lehnt den Aufruf zusätzlich unabhängig vom UI ab. Bestehende Rollen haben das Recht nicht automatisch.

## Version 1.4.4 – 2026-08-28

### Bugfix
- Zurück-Button und Titel im Zuschneiden-Canvas-Header blieben ungestylt (Browser-Default statt des einheitlichen Buttons/Titels wie bei Metadaten und Fokuspunkt) – die entsprechenden CSS-Regeln fehlten für die Zuschneiden-Klassen. Jetzt auf dieselben Regeln gemappt, optisch identisch zu den anderen beiden Canvas-Headern.

## Version 1.4.3 – 2026-08-28

### Bugfix
- Die Zuschneiden-UI zeigte cropper's Info-Sidebar (Vorschau/Zuschnittdaten) immer eingeblendet und nahm dadurch unnötig Platz weg – der eigene Ein-/Ausblenden-Button dafür (`#cropper_sidebar_toggle`) fehlte im eingebetteten Canvas, ohne den bleibt die Sidebar laut cropper's eigener Logik immer sichtbar. Button jetzt im Canvas-Header ergänzt (cropper's `rex_cropper.js` steuert Ein-/Ausblenden und merkt sich die Wahl selbst) – startet standardmäßig eingeklappt.

## Version 1.4.2 – 2026-08-28

### Bugfix
- Die native Metainfo-Bearbeitung (siehe 1.4.0) zeigte auch den vom `cropper`-Addon selbst eingehängten "Zuschneiden"-Link auf die klassische Seite `mediapool/cropper` – ein Klick hätte das Overlay verlassen. Wird jetzt aus dem geladenen Formular-HTML herausgefiltert; der eigene, im Overlay eingebettete Zuschneiden-Button (Detail-Vorschau-Icon) bleibt die einzige Zuschneiden-Möglichkeit.

## Version 1.4.1 – 2026-08-28

### Bugfix
- Das Backend war für jeden User mit dem Recht `cropper[]` komplett unerreichbar (`rex_exception`: "cropper.css ... is already added"). Ursache: das separate `cropper`-Addon lädt seine eigene `cropper.css`/`cropper_ui_fix.css` bereits unconditional für jeden Backend-User mit diesem Recht – MediaPlace hat dieselben Dateien in der eigenen Cropper-Integration (siehe 1.4.0) ein zweites Mal eingebunden, was REDAXOs Asset-Verwaltung ablehnt. MediaPlace bindet die cropper-CSS jetzt nicht mehr selbst ein (JS weiterhin, da cropper das nur auf eigenen Seiten lädt).

## Version 1.4.0 – 2026-08-28

### Neu
- Ist das separate `cropper`-Addon (FriendsOfRedaxo/cropper) installiert und hat der User das Recht `cropper[]`, zeigt das Detail-Panel bei Bildern jetzt einen "Zuschneiden"-Button. Öffnet cropper's eigene UI (Ratio-Presets, Zoom/Rotate/Flip, Live-Vorschau) direkt im MediaPlace-Overlay statt einer eigenen Nachimplementierung – Speichern läuft über cropper's eigenen `CropperExecutor`, ohne Seitenwechsel. Ohne das Recht `cropper[overwrite]` kann nur eine neue Kopie erzeugt werden, nie das Original überschrieben (spiegelt cropper's eigene Rechte-Logik).

## Version 1.3.17 – 2026-08-28

### Neu
- Neues Rollenrecht "Ordner (Kategorien) umbenennen, verschieben oder löschen" (`mediaplace[manage_categories]`, in der Rollenverwaltung als eigene Checkbox). Ohne dieses Recht können User zwar weiterhin innerhalb ihrer freigegebenen Kategorien neue Unterkategorien anlegen, aber keine bestehende Kategorie mehr umbenennen, verschieben oder löschen – unabhängig davon, welche Kategorien ihnen zugewiesen sind. Admins sind wie üblich ausgenommen. Bestehende Rollen haben das Recht nicht automatisch (muss für Redakteure, die Ordner verwalten dürfen sollen, einmalig in der Rollenverwaltung gesetzt werden).

## Version 1.3.16 – 2026-08-28

### Bugfix
- Das Verwaltungsmenü am Zahnrad-Icon konnte auf schmalen Bildschirmen über den rechten Bildschirmrand hinausragen (rein CSS-relativ zum Button positioniert, ohne Rücksicht auf den verfügbaren Platz). Positioniert sich jetzt wie das Tag-Filter- und Kategorie-Aktionsmenü am Viewport geklemmt.

## Version 1.3.15 – 2026-08-28

### Bugfix
- Metadaten- und Fokuspunkt-Bearbeitung öffneten auf schmalen Bildschirmen (Smartphone, oder ein manuell auf Compact-Breite verkleinertes Modal) hinter dem weiterhin sichtbaren Detail-Panel – beide sind dort als Bottom-Sheet über demselben Bereich implementiert. Das Detail-Panel blendet sich jetzt beim Öffnen des jeweiligen Canvas automatisch aus und beim Zurückgehen wieder ein – nur auf schmalen Bildschirmen, auf Desktop-Breite bleiben Detail-Panel und Canvas wie bisher nebeneinander sichtbar.

## Version 1.3.14 – 2026-08-28

### Bugfix
- Auf manchen Backend-Themes/Setups schien auf schmalen Viewports (iPhone) ein fixes Icon (z.B. ein mobiles Nav-Toggle der umgebenden Backend-Seite) durch den Overlay hindurch und verdeckte Bedienelemente – u.a. den "Metadaten bearbeiten"-Button im Detail-Panel. `#mp3-overlay` lag mit `z-index: 10500` nicht immer über solchen Elementen. Auf `999999` angehoben (die separat an `document.body` angehängten Kategorie-Dialoge entsprechend auf `1000000`).

## Version 1.3.13 – 2026-08-28

### Übergangslösung für Installationen ohne den kaskadierenden `api`-Fix
Die eigentliche Behebung von 1.3.9–1.3.12 liegt teils im `api`-Addon (PR [#78](https://github.com/FriendsOfREDAXO/api/pull/78), noch offen). Bis das dort released ist, betreffen die folgenden zwei Punkte alle Installationen, die noch eine `api`-Version ohne diesen Fix einsetzen:

- **Durchsuchen selbst behoben, nicht mehr auf `api` angewiesen**: Die Medienliste nutzt jetzt in jedem Fall (bis `api` die Kaskadierung tatsächlich released hat) MediaPlace's eigenen, rechte-geprüften Fallback-Endpunkt (`rex_api_mediaplace_media_list.php`) statt der direkten `api`-Route – der Fallback kaskadiert bereits seit 1.3.9 korrekt über `MediaPermission`, war aber bisher nur bei `api <1.3.1` aktiv. Damit sind Unterkategorien einer freigegebenen Kategorie beim Durchsuchen jetzt unabhängig von der installierten `api`-Version korrekt sichtbar.
- **Hochladen/Löschen/Verschieben-Ziel bleibt vorerst von `api` abhängig**: Für diese Operationen bietet MediaPlace bewusst keinen eigenen Ersatz-Endpunkt (kein Duplizieren der Schreiblogik). Schlägt eine dieser Aktionen serverseitig mit HTTP 403 fehl (typischerweise beim Arbeiten in einer Unterkategorie einer freigegebenen Kategorie auf einer `api`-Version ohne den Fix), zeigt MediaPlace jetzt statt einer rohen Fehlermeldung einen verständlichen Hinweis auf die Rechte-Grenze – beim Hochladen als Tooltip auf dem fehlgeschlagenen Datei-Icon, sonst als Fehlermeldung im jeweiligen Dialog. Sobald die installierte `api`-Version den Fix enthält, funktionieren diese Aktionen ohne weiteres Update dieses Addons.

## Version 1.3.12 – 2026-08-28

### Bugfix
- Löschen, Titel/Kategorie ändern und Datei ersetzen schlugen für Dateien in einer Unterkategorie einer freigegebenen Kategorie mit HTTP 403 fehl – gleiche Ursache wie beim Durchsuchen (1.3.10) und Hochladen (1.3.11). Nutzt jetzt die kaskadierende `permitted_only`-Option des `api`-Addons auch bei diesen Operationen.
- ~~Bekannte verbleibende Lücke (im `api`-Addon, siehe [api#79](https://github.com/FriendsOfREDAXO/api/issues/79)): Beim Verschieben einer Datei in eine andere Kategorie über das Detail-Panel prüft der Server bislang nur die *aktuelle* Kategorie der Datei, nicht die neue Zielkategorie.~~ Inzwischen im `api`-Addon behoben (Ziel-Kategorie wird jetzt ebenfalls geprüft, unabhängig von `permitted_only`) – kein Update dieses Addons nötig, sobald die `api`-Addon-Version mit dem Fix installiert ist.

## Version 1.3.11 – 2026-08-28

### Bugfix
- Hochladen in eine Unterkategorie einer freigegebenen Kategorie schlug mit HTTP 403 fehl (Datei-Icon in der Upload-Warteschlange blieb rot) – gleiche Ursache wie beim Durchsuchen in 1.3.10: das `api`-Addon prüfte die Ziel-Kategorie beim Hochladen nur auf exakten Treffer, nicht auf Vorfahren. Nutzt jetzt dessen neue kaskadierende `permitted_only`-Option auch beim Hochladen (Direkt-Upload und Chunk-Upload für große Dateien).

## Version 1.3.10 – 2026-08-28

### Bugfix
- Eine leere Unterkategorie innerhalb einer freigegebenen Kategorie wurde als befüllt angezeigt und zeigte Dateien aus „Alle Medien" – Ursache war eine Rechte-Lücke im `api`-Addon (`filter[permitted_only]` prüfte beim Durchsuchen einer Kategorie nur exakten Treffer, nicht Vorfahren, siehe [api#79](https://github.com/FriendsOfREDAXO/api/issues/79)/dortiger Fix). Beim Fehlschlagen fiel MediaPlace automatisch auf „Alle Medien" zurück, aktualisierte dabei aber Breadcrumb und Sidebar-Markierung nicht – die Kategorie blieb optisch ausgewählt, obwohl bereits eine andere Ansicht geladen war. Breadcrumb/Sidebar werden jetzt beim automatischen Ausweichen korrekt mit aktualisiert, als zusätzliche Absicherung unabhängig vom eigentlichen Fix im `api`-Addon.

## Version 1.3.9 – 2026-08-28

### Bugfix
- 1.3.8 machte Umbenennen/Löschen/Verschieben einer freigegebenen Kategorie selbst zu Recht unmöglich – aber `MediaPermission::hasCategoryAccess()` prüfte weiterhin nur exakte Treffer, nicht Vorfahren. Dadurch waren Unterkategorien einer freigegebenen Kategorie (egal ob selbst neu angelegt oder bereits vorhanden) weder im Kategoriebaum sichtbar noch beim Durchsuchen erreichbar, obwohl der User sie laut 1.3.8 frei verwalten können soll. `hasCategoryAccess()` kaskadiert jetzt: Zugriff auf eine Kategorie gilt automatisch für ihren gesamten Unterbaum (bewusste, dokumentierte Abweichung vom klassischen Medienpool, dessen Rechte-Widget jede Kategorie unabhängig behandelt).

### Verbesserungen
- Das Kategorie-Aktionsmenü ("...") zeigt „Umbenennen"/„Verschieben"/„Löschen" jetzt nur noch an, wenn der User dafür tatsächlich Zugriff auf die Elternkategorie hat – „Unterkategorie" bleibt immer verfügbar. Vorher wurden alle vier Aktionen immer angeboten und liefen bei einer geschützten Kategorie serverseitig mit 403 ins Leere.
- „Kategorie verschieben" bietet „(Hauptverzeichnis)" als Ziel nicht mehr an, wenn der User dorthin ohnehin nicht verschieben darf.
- Kategorie anlegen/umbenennen/verschieben/löschen zeigt Fehler nicht mehr per rohem `alert()` mit unverständlichem "Permission denied", sondern inline im jeweiligen Dialog mit einer verständlichen Meldung, wenn die Rechte-Grenze der Grund ist.

## Version 1.3.8 – 2026-08-27

### Sicherheit
- Ein Backend-User mit auf einzelne Kategorien eingeschränkten Medienrechten konnte eine ihm zugewiesene Kategorie selbst umbenennen, löschen oder verschieben (das `api`-Addon prüfte für diese drei Operationen nur Zugriff auf die Kategorie selbst, nicht auf deren Elternkategorie) – die vom Admin festgelegte Ordner-Hauptstruktur war damit vom zugewiesenen User selbst auflösbar. Kategorie anlegen/umbenennen/löschen/verschieben laufen jetzt über einen eigenen, rechte-geprüften Endpunkt (`rex_api_mediaplace_categories`): Umbenennen/Löschen/Verschieben-als-Quelle brauchen jetzt Zugriff auf die **Elternkategorie**, nicht auf die Kategorie selbst – ein User mit Zugriff auf Kategorie X kann weiterhin frei innerhalb von X arbeiten (Unterkategorien anlegen/umbenennen/löschen/verschieben), X selbst bleibt aber vor ihm geschützt. Anlegen unter X bleibt unverändert erlaubt (das war bereits korrekt).

## Version 1.3.7 – 2026-08-27

### Bugfix
- Die Zähler an den Typ-Filter-Tabs ("Bilder", "Dokumente", ...) zeigten bisher nur, wie viele der bereits *geladenen* Dateien passen – bei großen Kategorien stand dort z.B. "Dokumente 0", obwohl reichlich PDFs existierten, nur eben noch nicht auf der ersten geladenen Seite dabei waren. Ein Klick auf einen Typ-Tab lud außerdem nicht gezielt nach, sondern filterte nur innerhalb der schon geladenen Treffer. Beide Zähler und das Laden nutzen jetzt serverseitige `filter[types]`-Abfragen (Kategorie + Suche exakt berücksichtigt) und zeigen/laden die echte Gesamtzahl. Tag-Filter bleiben bewusst client-seitig (keine serverseitige Tag-Filterung in der Medienliste vorhanden) – bei aktivem Tag-Filter fallen die Zähler auf die bisherige Zählung innerhalb der geladenen Seite zurück.

## Version 1.3.6 – 2026-08-27

### Neu
- `MP3.open(callback, { allowedExtensions: [...] })`: neue, harte Auswahl-Einschränkung für Aufrufer, die bereits klassisch eine Dateiendungs-Beschränkung durchgesetzt haben (z. B. `mform`s Custom-Link-/Medialisten-Widgets mit `types="jpg,png"`). Anders als `filter` (nur Start-Tab, jederzeit umschaltbar) blendet dies nicht passende Dateien komplett aus dem Grid aus und blockiert die Auswahl auch über die Mehrfachauswahl-Bestätigung.

## Version 1.3.5 – 2026-08-27

### Entfernt
- Die Feldtypen „TinyMCE" und „CKEditor5" für eigene JSON-Metainfo-Felder (MediaPlace → Metainfo Felder) sind entfallen, inklusive des dafür eingeführten Vollbild-Editor-Canvas im Overlay. Bereits gespeicherte Felder dieses Typs werden jetzt als einfaches Textfeld angezeigt statt zu crashen. Betrifft ausschließlich MediaPlace' eigenes JSON-Feldsystem (`med_json_data`) – die Metainfo-Canvas-Bearbeitung echter REDAXO-Kernfelder (`med_*`) sowie die TinyMCE/CKEditor5-Integration als Bild-/Medien-Picker (siehe 1.3.4 und früher) sind davon nicht betroffen.

## Version 1.3.4 – 2026-08-27

### Bugfix
- Die Lightbox-Großansicht im Detail-Panel zeigte bislang dieselbe verkleinerte `rex_media_medium`-Vorschau wie das kleine Bild daneben, statt die Original-Datei in Upload-Qualität – genau der Zweck des Vergrößerns. Nutzt jetzt die Original-Datei.
- SVG-Vorschaubilder (Grid, Detail-Panel, Widget) referenzierten die Original-Datei bislang über einen geratenen Pfad (`../media/`, relativ zur aktuellen Backend-Seite) statt über REDAXOs eigene `rex_url::media()` – funktioniert zuverlässig nur, solange die Seite in einer ganz bestimmten Verzeichnistiefe liegt, und wäre bei Unterordner-Installationen mit abweichender Struktur oder einem späteren Frontend-Einsatz zerbrochen. Die Basis-URL wird jetzt serverseitig berechnet und über `#mp3-root` an den Client durchgereicht.

## Version 1.3.3 – 2026-08-27

### Verbesserungen
- Startet ein User das Overlay zum ersten Mal (noch keine gespeicherte Kategorie-Präferenz), landet er jetzt bei „Alle Medien" statt bei Kategorie „Kein Ordner" – letztere braucht ein eigenes Recht (`hasCategoryPerm(0)`), das viele auf einzelne Kategorien eingeschränkte User gar nicht haben.
- Der „Medienpool"-Link (Sidebar-Wurzel und Breadcrumb-Icon) ist jetzt nicht mehr anklickbar, wenn der User keinen Zugriff auf Kategorie „Kein Ordner" hat – vorher führte ein Klick dort zuverlässig in eine Sackgasse. Mit Tooltip, der erklärt, wo die eigenen Medien stattdessen zu finden sind.

### Bugfix
- Der automatische Ausweich-Mechanismus auf „Alle Medien" bei fehlendem Kategorie-Zugriff (siehe 1.3.2) blieb in einem Fall hängen: löste er selbst aus, während bereits eine Anfrage lief, blockierte die eigene `mediaLoading`-Sperre den Ausweich-Versuch stillschweigend – das Grid zeigte dauerhaft den Lade-Spinner, obwohl die Daten längst geladen waren.

## Version 1.3.2 – 2026-08-27

### Sicherheit
- Der klassische Medienpool gibt traditionell jedem Backend-User mit Basis-Medienrecht Leserecht auf **alle** Kategorien – nur Schreibaktionen (verschieben/löschen) prüfen die Kategorie-Rechte. Der zugehörige Fix im `api`-Addon ([PR #78](https://github.com/FriendsOfREDAXO/api/pull/78)) spiegelt dieses Verhalten deshalb per Default weiterhin exakt, um bestehende Aufrufer nicht zu brechen – die strengere Kategorie-Filterung, die MediaPlace will, ist dort jetzt ein expliziter Opt-in (`filter[permitted_only]=1`). MediaPlace schickt dieses Flag ab sofort bei jeder Medienlisten-Anfrage automatisch mit, damit die gewünschte strikte Filterung erhalten bleibt, sobald die installierte `api`-Version den Fix mitbringt und der eigene Fallback-Endpunkt nicht mehr greift.

## Version 1.3.1 – 2026-08-27

### Bugfix
- Sortierung ("Neueste zuerst" etc.) wirkte bisher nur auf die bereits geladene Seite: `buildMediaEndpoint()` schickte nie einen `sort`-Parameter mit, Server (sowohl das `api`-Addon als auch der eigene Fallback-Endpunkt) sortierten deshalb immer nach Dateiname aufsteigend. Bei mehr Dateien als `mediaPerPage` (Standard 30) konnte dadurch z. B. eine gerade erst hochgeladene Datei alphabetisch weit hinten liegen und in "Alle Medien" gar nicht erst mitgeladen werden, obwohl sie bei "Neueste zuerst" ganz oben stehen müsste. `buildMediaEndpoint()` schickt jetzt den tatsächlich gewählten Sortmodus als `sort=feld:richtung` mit (`ListHelper::parseSort()`-Syntax), beide Endpunkte respektieren ihn serverseitig.

## Version 1.3.0 – 2026-08-27

### Widget: Direkt-Upload, Mehrfachmarkierung, Ansichten
- Neu: `data-mp3-upload="true"` erlaubt Direkt-Upload per Drag&Drop/Klick direkt im Widget (ganzer Container ist Drop-Zone), inklusive Kategorie-Auswahl-Dialog vor dem Hochladen und optionaler Dateityp-Beschränkung (`data-mp3-types`, wie das native `accept`-Attribut).
- Neu: `data-mp3-max` begrenzt die Anzahl Dateien bei Mehrfachauswahl.
- Neu: Klick markiert genau ein Medium (hebt andere Markierungen auf), Cmd/Ctrl-Klick fügt es zu einer Mehrfachmarkierung hinzu/entfernt es daraus. Zwei getrennte Aktionen dafür: Papierkorb entfernt nur die markierten Dateien (deaktiviert ohne Markierung), separater roter „Leeren"-Button (REDAXOs `.btn-delete`-Konvention) entfernt nach Bestätigung alle Dateien.
- Neu: Kacheln/Liste-Umschalter, jetzt auch bei Einzelauswahl-Widgets verfügbar; `data-mp3-view="grid"|"list"` legt die Start-Ansicht eines einzelnen Widgets fest (ohne Angabe gilt die geteilte Nutzer-Präferenz), ein späterer Umschalter-Klick wirkt weiterhin global für alle Widgets der Seite.
- Neu: Auge-Button in der unteren Leiste jedes Grid-Elements (immer sichtbar, öffnet die Detailansicht in MediaPlace) zusätzlich zur bestehenden, nur bei Hover sichtbaren Lupe.

### YForm-Integration
- Neuer nativer YForm-Werttyp `mediaplace` (`lib/yform/value/yform_value_mediaplace.php`), modelliert nach `yform/lib/Field/value/be_media.php`: bindet das Widget direkt inkl. Direkt-Upload, Typ-/Mengen-Beschränkung und Start-Ansicht als Feld-Optionen. Registriert sich automatisch per Klassennamens-Konvention bei YForm und meldet referenzierte Dateien korrekt beim „Datei in Verwendung"-Check von REDAXO (`MEDIA_IS_IN_USE`), damit sie nicht versehentlich gelöscht werden können.

### Demo-Seite
- Überarbeitet: Einleitung, nummerierte Abschnitte (Overlay → Einzelmedium → Mehrfachauswahl → Direkt-Upload → API-Referenz), neue Attribut-Tabelle (inkl. `data-mp3-max`/`data-mp3-view`), YForm-Abschnitt zeigt jetzt zuerst den empfohlenen nativen Feldtyp (inkl. echtem, verifiziertem JSON-Export-Beispiel) und danach die ältere HTML-Feldtyp-Alternative.

## Version 1.2.2 – 2026-08-27

### Sicherheit
- Kategoriebaum und flache Kategorienliste (`rex_api_mediaplace_categories`) zeigten bisher **alle** Medienkategorien, unabhängig von den tatsächlichen Medienordner-Rechten des Users – ein auf einzelne Kategorien eingeschränkter Backend-User sah trotzdem den kompletten Kategoriebaum. Kategorienliste und Sidebar-Baum filtern jetzt per `MediaPermission::hasCategoryAccess()`; eine nicht erlaubte Kategorie wird übersprungen, ihre erlaubten Unterkategorien aber weiterhin angezeigt (an der nächsthöheren sichtbaren Stelle "hochgezogen"), analog zu `mediapool/lib/media_category_select.php::addCatOption()`.
- Die eigentliche Medienliste läuft über das `api`-Addon (`media`/`backend/media`), dessen `handleMediaList()` bislang ebenfalls keinerlei Kategorie-Rechte prüfte – ein eingeschränkter User bekam dort trotzdem sämtliche Dateien aller Kategorien zurück (separater Fix im `api`-Repository, [PR #78](https://github.com/FriendsOfREDAXO/api/pull/78), ab Version 1.3.1). Solange die installierte `api`-Version das noch nicht mitbringt, weicht MediaPlace automatisch auf einen eigenen, rechte-geprüften Fallback-Endpunkt aus (`rex_api_mediaplace_media_list`, Versionserkennung in `boot.php`) – kein manuelles Eingreifen nötig, die Weiche greift automatisch und entfällt von selbst, sobald `api` >=1.3.1 installiert ist.

## Version 1.2.1 – 2026-08-27

### Bugfix
- Upload-Verkleinerung (1.2.0): `canvas.toBlob()` fällt bei nicht unterstützten Ausgabeformaten (z. B. AVIF praktisch überall, WebP in älterem Safari) laut Spezifikation still auf PNG zurück. Der Code vertraute bisher blind darauf, dass die Ausgabe dem angeforderten Format entspricht, wodurch eine Datei mit falschem `.type`-Label (Originalformat), aber tatsächlich PNG-kodiertem Inhalt hochgeladen worden wäre. Jetzt wird der tatsächliche `blob.type` geprüft; bei einer Abweichung wird die Verkleinerung verworfen und die Originaldatei unverändert hochgeladen.

## Version 1.2.0 – 2026-08-27

### Bilder beim Upload verkleinern
- Neue Einstellung (Upload, standardmäßig aus): Bilder werden vor dem Hochladen im Browser per Canvas auf eine konfigurierbare maximale Breite/Höhe herunterskaliert – Seitenverhältnis bleibt erhalten, kleinere Bilder werden nie vergrößert, Dateiformat bleibt unverändert.
- GIFs (könnten animiert sein) und SVGs (kein Rasterbild) werden dabei nie angefasst.
- Funktioniert für alle Upload-Wege (Button, Drag & Drop, Ordner-Upload, Paste) sowie weiterhin mit dem Chunk-Upload für große Dateien; schlägt die Skalierung fehl, wird die Originaldatei hochgeladen.

## Version 1.1.1 – 2026-08-27

### Metadaten bearbeiten
- Umbenannt von „Nativ bearbeiten (Prototyp)" zu **„Metadaten bearbeiten"** – nicht mehr als experimentell/Prototyp gekennzeichnet, eigener „Experimentell"-Bereich in den Einstellungen entfernt und in „Funktionen" zusammengeführt.
- Klick auf ein klassisches `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widget innerhalb des Canvas öffnet jetzt das eigene Grid zum Auswählen statt REDAXOs natives Popup – Canvas blendet sich kurz aus, nach der Auswahl (bzw. „Übernehmen" bei Mehrfachauswahl) geht es zurück zum Formular, ohne dass unsauber gespeicherte Eingaben verloren gehen.
- Speichern zeigt jetzt eine kurze Erfolgs-/Fehler-Rückmeldung im Button, statt kommentarlos ins Grid zu wechseln.
- Kompatibilität mit dem `metainfo_lang_fields`-Addon: dessen Sprachfelder werden jetzt korrekt im Canvas gerendert (siehe auch `metainfo_lang_fields` 1.0.8).

### Eigene Metadaten-Felder
- Neuer Schalter „Eigene Metadaten-Felder aktivieren" – **Opt-in, standardmäßig aus** (vorher standardmäßig an). Titel, System-Tags und Sammlungen sind davon unabhängig und bleiben immer verfügbar.
- Neuer Hinweis „Bitte ALT-Text hinterlegen" unter dem „Metadaten bearbeiten"-Button, wenn kein ALT-Text vorhanden ist. Eigenes ALT-Feld hat Vorrang, wenn eigene Metadaten aktiv sind, sonst zählt das klassische `med_alt`-Feld.
- Den vorherigen Übergangsmodus „Klassische Metainfo-Felder verlinken" (Link zur klassischen Medienpool-Bearbeitung) entfernt – durch „Metadaten bearbeiten" abgelöst.

### Bugfixes
- Checkbox-Felder lösten den Speichern-Button fälschlich sofort nach dem Laden aus (Dirty-Check verglich ein nie gesetztes Feld gegen `false`).

## Version 1.1.0 – 2026-08-27

### Echte Metainfo-Felder (Prototyp)
- Neuer, experimenteller Modus zum nativen Bearbeiten echter, über das REDAXO-Metainfo-Addon angelegter `med_*`-Felder direkt im MediaPlace-Detail-Panel: ein eigener Canvas rendert das Formular über REDAXOs eigenen `MEDIA_FORM_EDIT`-Erweiterungspunkt und speichert über `rex_media_service::updateMedia()` – inklusive Widgets wie dem klassischen Medienlisten-Feld, ohne eigene Nachbau-Logik.
- Eigener Einstellungen-Schalter (Standard: aus), unabhängig vom bestehenden „Klassische Metainfo-Felder verlinken“-Schalter; der API-Endpunkt verweigert Auslieferung/Speichern serverseitig, wenn der Schalter aus ist.
- „Nativ bearbeiten“-Button sitzt jetzt direkt unter dem Titelfeld, im gleichen Button-Stil wie der TinyMCE/CKEditor5-„Bearbeiten“-Button, mit dem Icon des klassischen Metainfo-Addons.
- Die schreibgeschützte „MediaPlace Metadaten“-Anzeige im klassischen Medienpool-Formular entfernt jetzt HTML-Tags aus TinyMCE/CKEditor5-Feldwerten, statt sie roh als Text anzuzeigen.

### Medien nach Tags/Sammlungen auslesen
- Neue Methoden in `SystemTagManager`: `getFilenamesForTag()`, `getFilenamesForCollection()`, `getTags()`/`getCollections()` (Katalog nach Sammlungen gefiltert) und `isCollectionTagName()` – für Entwickler, die Medien programmatisch nach Tag oder Sammlung auslesen wollen, ohne eigenes SQL zu schreiben.
- README dokumentiert diesen Anwendungsfall neu.

### Technik & Bugfixes
- Default-Config-Werte (`replace_classic_mediapool`, `disable_tagging`, …) kommen jetzt aus `package.yml` (`default_config:`), nicht mehr aus manuellem Code in `install.php`.
- Tastaturkürzel „F“ für Vollbild löste versehentlich aus, während man innerhalb von TinyMCE tippte (Iframe-Fokus wurde von der bisherigen Eingabefeld-Prüfung nicht erkannt).
- Klick auf klassische `REX_MEDIA[n]`/`REX_MEDIALIST[n]`-Widgets innerhalb des neuen Metainfo-Canvas öffnete versehentlich rekursiv den MediaPlace-Overlay statt des erwarteten klassischen Popups.
- Vereinheitlichtes Erscheinungsbild: Alle Canvas-Header (Editor, Fokuspunkt, Metainfo) teilen sich jetzt dieselben Styles, alle „Speichern“-Buttons sind einheitlich grün.
- Kompaktere Abstände in Kopfzeile und Filterleiste, damit Toolbar-Buttons und Tag-Filter auch bei der Standardgröße des Overlays ohne Umbruch passen.

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
- Strukturierte JSON-Metadaten (`med_json_data`) mit eigenem Feld-Editor (Text/Textarea/Checkbox/Select/TinyMCE/CKEditor5/Alt-Text/Medienverknüpfung), Mehrsprachigkeit, dekorativem ALT-Text-Modus. TinyMCE und CKEditor5 teilen sich denselben Vollbild-Editor-Canvas (Bedienung identisch, nur die Engine dahinter unterscheidet sich) und binden das jeweils installierte Addon direkt über dessen öffentliche JS-API ein.
- Neue Feldtypen **Checkbox** (einfacher Ja/Nein-Schalter) und **Select** (Dropdown oder Mehrfachauswahl): Auswahlmöglichkeiten entweder als Zeilenliste (`Wert|Beschriftung`) oder als SQL-`SELECT`-Abfrage (Konvention wie bei REDAXOs klassischem Metainfo-Addon) – wird bei jedem Laden neu aufgelöst, damit SQL-basierte Auswahllisten stets aktuell bleiben.
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
