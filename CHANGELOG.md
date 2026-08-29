# Changelog

## Version 1.9.3 – 2026-08-29

### Bugfix
- Kategorie-Auswahl-Dialog beim Cloud-Import (siehe 1.9.2) zeigte die Kategorien flach ohne Einrückung – im Gegensatz zum bestehenden Upload-Dialog nutzte er dafür versehentlich normale Leerzeichen statt `&nbsp;`, die native und bootstrap-select-Dropdowns beim Rendern kollabieren.

### Intern
- Kategorie-Auswahl-Dialoge nicht mehr pro Aufrufer neu geschrieben: neue gemeinsame `showCategoryPickerModal()` (mediapool3.js) für Sammlungs-Upload und Cloud-Import, neue geteilte `buildCategoryOptionsHtml()` (mediapool3-helpers.js, `MP3Core.helpers`) für die eingerückte Options-Liste, jetzt auch vom Input-Widget (`mediapool3_widget.js`) genutzt statt einer eigenen Kopie.

## Version 1.9.2 – 2026-08-29

### Bugfix
- Cloud-Provider (siehe 1.9.0): Detailansicht einer Cloud-Datei nutzte erfundene, nirgends definierte CSS-Klassen (`mp3-detail-title`, `mp3-detail-info-table`, `mp3-info-table`) statt der echten, bereits gestylten (`mp3-detail-inner`, `mp3-detail-header` + `mp3-detail-header-name`, `mp3-detail-table`) – Dateiname überlappte die Toolbar, Größe/Datum standen ohne Abstand. Auf das reale Markup aus `fragments/mediaplace/detail_panel.php`/`detail_info_table.php` umgestellt.
- Cloud-Provider: Umschalten zwischen Listen-/Kachel-/Media-Wall-Ansicht während des Cloud-Browsens sprang zurück zu den lokalen Ordnern, weil `refreshDisplay()` (vom Ansicht-Umschalter aufgerufen) den Cloud-Modus nicht kannte. Neue `renderProviderFiles()`-Weiche (Listen-Rendering ergänzt, Media-Wall/Masonry fällt bewusst auf die Kachelansicht zurück – Cloud-Einträge liefern keine Bildmaße) + `refreshDisplay()` jetzt Cloud-Modus-bewusst.
- Cloud-Provider: Import lief beim Klick sofort in die zuletzt im lokalen Baum aktive Kategorie (oder in den Stamm), ohne zu fragen. Neuer Kategorie-Auswahl-Dialog vor dem eigentlichen Import (gleiches Muster wie beim Sammlungs-Upload).

## Version 1.9.1 – 2026-08-29

### Bugfix
- Cloud-Provider (siehe 1.9.0): Klick auf eine Datei zeigte kein Detail-/Import-Panel – `.mp3-detail` hat per Default `width:0`/`overflow:hidden`, die Klasse `mp3-detail-open` macht das Panel erst sichtbar. Wurde bei der neuen Cloud-Datei-Detailansicht fälschlich nur im Compact-Layout gesetzt statt (wie bei lokalen Dateien in `showDetail()`) immer. Browsen/Suchen selbst war davon nicht betroffen.

## Version 1.9.0 – 2026-08-29

### Neu
- Cloud-Provider-Anbindung: andere Addons können sich jetzt als eigener, zusätzlicher Baum in die Sidebar einklinken (Browsen, Suchen sofern der Provider das anbietet, Import einzelner Dateien in den lokalen Medienpool – kein Sync, nach dem Import ist es eine ganz normale lokale Datei). Neuer Erweiterungspunkt `MEDIAPLACE_STORAGE_PROVIDERS` + `StorageProviderInterface` (5 Methoden: Ordner/Dateien auflisten, Suchfähigkeit, Thumbnail, Import) + `StorageProviderRegistry` (Rechte-Check: jeder Provider bringt sein eigenes Berechtigungs-String mit, kein globaler MediaPlace-weiter Schalter). Erster Provider: das `nextcloud`-Addon (siehe dortiges Changelog 1.7.0). Im Picker-Modus (`MP3.open()`) importiert die Auswahl einer Cloud-Datei sie zuerst synchron, `onSelect` feuert erst danach mit dem neuen lokalen Dateinamen – schlägt der Import fehl, bricht die Auswahl mit Fehlermeldung ab. Im Mehrfachauswahl-Modus wird der Cloud-Bereich vorerst nicht angezeigt (nur Einzelauswahl/-import in dieser Version).

## Version 1.8.0 – 2026-08-29

### Neu
- Neuer "Bild optimieren"-Button im Detail-Panel für Bilder, deren gespeicherte Breite/Höhe die konfigurierten Upload-Resize-Grenzen (Einstellungen → "Bilder beim Upload verkleinern") überschreiten – für Bestandsdateien, die vor Aktivierung dieses Schalters hochgeladen wurden. Verkleinert die Datei in-place (gleicher Dateiname) synchron per GD, nutzt dabei den Media-Manager-Kern (`rex_effect_resize` für die Fit-Berechnung, `rex_media_service::updateMedia()` für Datei-Ersetzung/Cache-Invalidierung/`MEDIA_UPDATED`) statt eigener Bildverarbeitung. Anders als beim Video-Optimieren kein Job/Poll-Zyklus (GD-Resize ist schnell genug für einen einzelnen Request) und keine "bereits optimiert"-Registry nötig – der Button verschwindet einfach von selbst, sobald das Bild innerhalb der Grenzen liegt. Neues Rollenrecht `mediaplace[optimize_image]`, nur sichtbar wenn "Bilder beim Upload verkleinern" aktiv ist.

## Version 1.7.4 – 2026-08-29

### Geändert
- 10-MB-Grenze für Bild-Vorschaubilder (siehe 1.6.0) wieder entfernt: Fotos über 10 MB bekamen dadurch nie ein Vorschaubild, nur noch das Datei-Icon – für eine Mediathek mit hochauflösender Fotografie eine spürbare Einschränkung. Der ursprüngliche Grund (teure/riskante Live-Generierung bei großen Kategorien) ist durch den seither eingeführten Warmup-Cronjob (1.6.0) hinfällig: die eigentliche Generierung läuft jetzt kontrolliert im Hintergrund statt live beim ersten Betrachten, der Datei-Icon-Fallback bei Fehlschlägen bleibt unabhängig davon bestehen.

## Version 1.7.3 – 2026-08-29

### Bugfix
- Video-Symbol-Overlay im Einzelbild-Modus (siehe 1.7.0) saß an der Nahtstelle zwischen Bild und Dateiname/-größe, statt sauber im Bild zu sitzen – `bottom` positionierte es relativ zur gesamten Karte (inkl. Info-Text darunter), nicht relativ zum Bild allein. Jetzt oben links statt unten links positioniert.

## Version 1.7.2 – 2026-08-29

### Geändert
- "Metadaten bearbeiten" (native Bearbeitung echter Metainfo-Felder im Detail-Panel, Einstellungen → `enable_metainfo_editing`) ist bei Neuinstallationen jetzt standardmäßig aktiviert. Betrifft nur den `default_config`-Wert für neue Installationen – bereits installierte Instanzen behalten ihre bisher gespeicherte Einstellung unverändert.

## Version 1.7.1 – 2026-08-29

### Bugfix
- Fokuspunkt-Button reagierte manchmal gar nicht auf Klicks (kein Dialog, keine Fehlermeldung, auch nicht in der Browser-Konsole), obwohl im Media-Manager bereits ein Fokuspunkt-Effekt eingerichtet war und der Button auch sichtbar war. Ursache: ein zusätzlicher client-seitiger Gate-Check auf ein Flag, das nur einmal beim Laden der Seite gesetzt wurde – wurde der Media-Manager-Effekt erst angelegt, während die MediaPlace-Sitzung bereits offen war, blieb dieses Flag bis zum nächsten Seiten-Reload veraltet auf "nicht verfügbar" stehen, obwohl der Button selbst (serverseitig live pro Datei geprüft) längst korrekt sichtbar war. Der veraltete Gate-Check ist entfernt – die Sichtbarkeit des Buttons selbst ist bereits die aktuelle, korrekte Prüfung.

## Version 1.7.0 – 2026-08-29

### Neu
- Video-Vorschau im Grid ist jetzt optional und wahlweise animiert oder als Einzelbild (Einstellungen → "Video-Vorschau im Grid": Aus / Einzelbild / Animiert, nur sichtbar wenn ffmpeg installiert ist). "Aus" zeigt konsequent nur das Datei-Icon, keine Vorschau-Generierung. "Einzelbild" extrahiert nur ein einziges Standbild statt einer animierten Sequenz (nutzt ffmpeg's neuen "Animiert"-Parameter, siehe dortiges Changelog 4.8.0) – deutlich günstiger in Erzeugung und Dateigröße als die animierte Variante. Im Einzelbild-Modus zeigt ein kleines Video-Symbol unten links auf der Kachel, dass es sich trotz Standbild um ein Video handelt. Standard bleibt "Animiert" (bisheriges Verhalten), bestehende Installationen sind davon nicht betroffen. Der Warmup-Cronjob (siehe 1.6.0) respektiert die Einstellung automatisch.

## Version 1.6.0 – 2026-08-29

### Neu
- Neuer Cronjob-Typ "MediaPlace: Vorschaubilder vorwärmen" (nur sichtbar, wenn das `cronjob`-Addon installiert ist): erzeugt sowohl die normalen Bild- als auch die animierten Video-Vorschaubilder im Hintergrund vorab, statt sie ausschließlich beim ersten Betrachten im Grid zu generieren. Pro Lauf wird je Typ nur eine begrenzte, getrennt konfigurierbare Anzahl NEUER Vorschaubilder erzeugt (Standard 20 für Bilder, 5 für Videos – Video-Konvertierung ist ungleich teurer), der Rest folgt beim nächsten planmäßigen Lauf. Neueste Dateien zuerst, damit frisch hochgeladene Medien möglichst schnell eine Vorschau bekommen. Bereits gecachte Dateien werden übersprungen. Video-Vorwärmung läuft nur, wenn ffmpeg tatsächlich verfügbar ist.

### Bugfix
- Browser-Absturz ("Diese Webseite wurde neu geladen, weil sie sehr viel Speicher benötigte") beim Durchsuchen von Video-reichen Kategorien: animierte Video-Vorschaubilder wurden zwar per `loading="lazy"` erst beim Sichtbarwerden geladen, beim Herausscrollen aber nie wieder aus dem Speicher entfernt – der Speicherverbrauch wuchs beim Scrollen durch eine große Kategorie unbegrenzt. Video-Vorschaubilder werden jetzt über einen `IntersectionObserver` verwaltet: `src` wird erst beim Sichtbarwerden gesetzt und beim Verlassen des Viewports wieder entfernt (der HTTP-Cache hält die Bytes weiter vor, ein erneutes Sichtbarwerden ist praktisch instant).
- Garantierter Datei-Icon-Fallback für Video-Vorschaubilder bei jedem Fehlschlag (ffmpeg nicht installiert, Server-Fehler, Timeout) – nicht mehr nur, wenn ffmpeg bereits beim Seitenaufbau als nicht verfügbar erkannt wurde. Ein fehlgeschlagenes `<img>` wird jetzt zuverlässig durch das übliche Datei-Icon ersetzt statt ein kaputtes Bild anzuzeigen.
- Bild-Vorschaubilder im Grid/Media-Wall sowie in der Listenansicht luden bisher ohne `loading="lazy"` – bei großen Kategorien wurden dadurch alle sichtbaren UND unsichtbaren Bild-Kacheln gleichzeitig angefordert. Jetzt konsequent `loading="lazy"` wie bereits beim Video-Vorschaubild.
- Grid-Thumbnail-Zielgröße von 500×500 auf 300×300 px reduziert – reine Vorschaubilder brauchen keine Arbeitskopie-Qualität, kleiner spart spürbar Speicher/CPU bei der Erzeugung und Bandbreite beim Laden. Bereits installierte Instanzen ziehen die neue Größe automatisch beim nächsten Addon-Update nach (Update-Pfad in `install.php`, kein manuelles Neuanlegen des Media-Manager-Typs nötig).
- Große Bild-Quelldateien (insbesondere mehrstellige-MB animierte GIFs, in der Praxis bei einem Kunden 1920×1080/12 MB) konnten den Server-seitigen Resize unverhältnismäßig teuer machen oder ihn (abhängig vom PHP-Speicherlimit) fehlschlagen lassen – im Fehlerfall landete dann eine ungefähr originalgroße Datei im Cache statt eines kleinen Vorschaubilds. Bild-Vorschaubilder ab 10 MB Quelldateigröße werden jetzt gar nicht mehr angefordert (weder live im Grid noch im Warmup-Cronjob) – Datei-Icon statt eines unverhältnismäßig teuren Vorschaubilds für so große Bilder. Gilt bewusst nicht für Videos (dort sind mehrstellige MB der Normalfall, nicht die Ausnahme).

## Version 1.5.4 – 2026-08-29

### Bugfix
- 500er (Fatal Error) bei Videos, wenn das separate `ffmpeg`-Addon nicht (mehr) installiert ist: der eigene Video-Vorschau-Typ `mediaplace_video_thumb` referenziert ffmpeg's Effekt `video_to_webp` – wird ffmpeg nach dem Anlegen dieses Typs deinstalliert, bleibt die Typ-/Effekt-Zeile in der Datenbank stehen. `media_manager` selbst hat vor dem Instanziieren eines Effekts keine `class_exists()`-Absicherung und stürzt hart ab, sobald irgendeine (auch eine alte/gecachte) Anfrage diesen Typ für ein Video anfordert. Neuer `MEDIA_MANAGER_FILTERSET`-Hook setzt das Effekt-Set für diesen Typ auf leer, sobald ffmpeg nicht mehr verfügbar ist – `media_manager` liefert dann sein eigenes "nicht gefunden"-Verhalten statt eines Fatal Errors. Live verifiziert (ffmpeg-Addon testweise deaktiviert): Crash reproduziert ohne den Hook, kein Crash mit dem Hook.

## Version 1.5.3 – 2026-08-28

### Bugfix
- Badge "Bereits optimiert (X% kleiner)" zeigte im Detail-Panel wörtlich `%s%%` statt der Prozentzahl – REDAXOs `rex_i18n`/`rex_fragment::i18n()` nutzen `{0}`, `{1}`, … als Platzhalter-Syntax, nicht `sprintf`s `%s`. Lang-Datei entsprechend korrigiert.
- Nebenbei gefunden: Button-Beschriftung und Badge-Text im Detail-Panel wurden doppelt escaped (`rex_escape()` um einen bereits von `$this->i18n()` escapten Wert) – behoben.

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
