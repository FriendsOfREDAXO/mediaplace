# Changelog

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
