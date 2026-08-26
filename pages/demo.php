<?php

// ---- Section 1: Overlay Demo ----
$content1 = '
<p>Klicken Sie auf den Button, um den MediaPlace Overlay direkt zu öffnen.</p>
<p><small class="text-muted">Im Detail-Panel lassen sich jetzt nicht nur der Titel, sondern auch vorhandene <code>med_*</code>-Metadaten direkt speichern.</small></p>
<div style="display:flex;gap:10px;flex-wrap:wrap;">
    <button class="btn btn-default" onclick="MP3.open()">
        <i class="fa-solid fa-eye"></i> Nur Ansehen
    </button>
    <button class="btn btn-primary" onclick="MP3.open(function(f){ alert(\'Gewählt: \' + f); })">
        <i class="fa-solid fa-photo-film"></i> Einzelauswahl
    </button>
    <button class="btn btn-success" onclick="MP3.open(function(files){ alert(\'Gewählt: \' + files.join(\', \')); }, { multiple: true })">
        <i class="fa-solid fa-images"></i> Mehrfachauswahl
    </button>
</div>
<pre style="margin-top:15px;font-size:12px;background:#f5f5f5;padding:12px;border-radius:4px;"><code>// Nur Ansehen (Browse-only, kein Callback)
MP3.open();

// Einzelauswahl
MP3.open(function(filename) {
    console.log(\'Gewählt:\', filename);
});

// Mehrfachauswahl
MP3.open(function(filenames) {
    console.log(\'Gewählt:\', filenames); // Array von Dateinamen
}, { multiple: true });</code></pre>
';

$fragment = new rex_fragment();
$fragment->setVar('title', 'Overlay – Direkte API-Nutzung', false);
$fragment->setVar('body', $content1, false);
echo $fragment->parse('core/page/section.php');

// ---- Dynamically pick example media from DB ----
$sql = rex_sql::factory();
$anyMedia = $sql->getArray('SELECT filename FROM ' . rex::getTable('media') . ' ORDER BY id ASC LIMIT 3');
$demoFile1 = !empty($anyMedia[0]['filename']) ? $anyMedia[0]['filename'] : '';
$demoFile2 = !empty($anyMedia[1]['filename']) ? $anyMedia[1]['filename'] : '';
$demoFile3 = !empty($anyMedia[2]['filename']) ? $anyMedia[2]['filename'] : '';
$demoMultiVal = implode(',', array_filter([$demoFile1, $demoFile2, $demoFile3]));

// ---- Section 2: Single Widget ----
$content2 = '
<p>Ein <code>&lt;input class="mp3-widget"&gt;</code> wird automatisch zu einem Media-Picker mit Vorschau.</p>

<div class="form-group">
    <label>Titelbild (Einzelmedium, leer)</label>
    <input class="mp3-widget form-control" name="demo_image" value="">
</div>

<div class="form-group">
    <label>Einzelmedium (mit erstem vorhandenen Medium vorbelegt)</label>
    <input class="mp3-widget form-control" name="demo_doc" value="' . rex_escape($demoFile1) . '">
</div>

<h4 style="margin-top:25px;">Verwendung</h4>
<pre style="font-size:12px;background:#f5f5f5;padding:12px;border-radius:4px;"><code>&lt;!-- Einfach die CSS-Klasse mp3-widget setzen --&gt;
&lt;input class="mp3-widget" name="REX_INPUT_VALUE[1]" value="REX_VALUE[1]"&gt;</code></pre>

<p style="margin-top:10px;"><small class="text-muted">
Klick auf <i class="fa-solid fa-plus"></i> öffnet den Medienpool, Klick auf das Bild ersetzt die Auswahl.
Der Dateiname wird im versteckten Input gespeichert.</small></p>
';

$fragment = new rex_fragment();
$fragment->setVar('title', 'Widget – Einzelmedium <code>mp3-widget</code>', false);
$fragment->setVar('body', $content2, false);
echo $fragment->parse('core/page/section.php');

// ---- Section 3: Multi Widget ----
$content3 = '
<p>Mit <code>data-mp3-multiple="true"</code> wird das Widget zur Galerie mit Drag&amp;Drop-Sortierung.</p>

<div class="form-group">
    <label>Bildergalerie (Mehrfachauswahl)</label>
    <input class="mp3-widget form-control" name="demo_gallery" data-mp3-multiple="true" value="">
</div>

<div class="form-group">
    <label>Mehrfachauswahl (mit ersten vorhandenen Medien vorbelegt)</label>
    <input class="mp3-widget form-control" name="demo_downloads" data-mp3-multiple="true"
        value="' . rex_escape($demoMultiVal) . '">
</div>

<h4 style="margin-top:25px;">Verwendung</h4>
<pre style="font-size:12px;background:#f5f5f5;padding:12px;border-radius:4px;"><code>&lt;!-- data-mp3-multiple="true" für Mehrfachauswahl --&gt;
&lt;input class="mp3-widget" name="REX_INPUT_VALUE[2]"
       data-mp3-multiple="true"
       value="REX_VALUE[2]"&gt;

&lt;!-- Wert: kommaseparierte Dateinamen --&gt;
&lt;!-- z.B. "bild1.jpg,bild2.png,dokument.pdf" --&gt;</code></pre>

<p style="margin-top:10px;"><small class="text-muted">
Mehrere Medien werden als kommaseparierte Dateinamen gespeichert.
Per Drag&amp;Drop können die Einträge sortiert werden.
<i class="fa-solid fa-xmark"></i> entfernt einzelne Medien.</small></p>
';

$fragment = new rex_fragment();
$fragment->setVar('title', 'Widget – Mehrfachauswahl <code>data-mp3-multiple="true"</code>', false);
$fragment->setVar('body', $content3, false);
echo $fragment->parse('core/page/section.php');

// ---- Section 4: API Reference ----
$content4 = '
<table class="table table-striped">
<thead><tr><th>Attribut / Klasse</th><th>Beschreibung</th><th>Beispiel</th></tr></thead>
<tbody>
<tr>
    <td><code>class="mp3-widget"</code></td>
    <td>Aktiviert das Widget auf einem <code>&lt;input&gt;</code>-Feld</td>
    <td><code>&lt;input class="mp3-widget" name="bild"&gt;</code></td>
</tr>
<tr>
    <td><code>data-mp3-multiple="true"</code></td>
    <td>Mehrfachauswahl. Wert wird kommasepariert gespeichert.</td>
    <td><code>&lt;input class="mp3-widget" data-mp3-multiple="true"&gt;</code></td>
</tr>
<tr>
    <td><code>value="datei.jpg"</code></td>
    <td>Vorauswahl. Bei Multi kommasepariert.</td>
    <td><code>value="a.jpg,b.png"</code></td>
</tr>
</tbody>
</table>

<h4>JavaScript API</h4>
<table class="table table-striped">
<thead><tr><th>Methode</th><th>Beschreibung</th></tr></thead>
<tbody>
<tr>
    <td><code>MP3.open()</code></td>
    <td>Öffnet den Medienpool-Overlay im Nur-Ansehen-Modus (Browse-only). Kein Auswählen-Button im Detail-Panel.</td>
</tr>
<tr>
    <td><code>MP3.open(callback)</code></td>
    <td>Öffnet den Medienpool-Overlay (Einzelauswahl). <code>callback(filename)</code> wird bei Auswahl aufgerufen.</td>
</tr>
<tr>
    <td><code>MP3.open(callback, { multiple: true })</code></td>
    <td>Öffnet im Mehrfachauswahl-Modus. <code>callback(filenames[])</code> erhält ein Array von Dateinamen. Dateien werden per Klick an-/abgewählt, mit „Übernehmen" bestätigt.</td>
</tr>
<tr>
    <td><code>MP3.close()</code></td>
    <td>Schließt den Overlay programmatisch.</td>
</tr>
<tr>
    <td><code>MP3Widget.init()</code></td>
    <td>Re-initialisiert Widgets (z.B. nach dynamischem Einfügen von Inputs via MBlock).</td>
</tr>
</tbody>
</table>

<h4>In REDAXO Modulen</h4>
<pre style="font-size:12px;background:#f5f5f5;padding:12px;border-radius:4px;"><code>&lt;!-- Modul-Eingabe: Einzelbild --&gt;
&lt;div class="form-group"&gt;
    &lt;label&gt;Bild&lt;/label&gt;
    &lt;input class="mp3-widget" name="REX_INPUT_VALUE[1]" value="REX_VALUE[1]"&gt;
&lt;/div&gt;

&lt;!-- Modul-Eingabe: Galerie --&gt;
&lt;div class="form-group"&gt;
    &lt;label&gt;Galerie&lt;/label&gt;
    &lt;input class="mp3-widget" name="REX_INPUT_VALUE[2]"
           data-mp3-multiple="true" value="REX_VALUE[2]"&gt;
&lt;/div&gt;

&lt;!-- Modul-Ausgabe --&gt;
&lt;?php
$image = "REX_VALUE[1]";
if ($image) {
    echo \'&lt;img src="\' . rex_url::media($image) . \'"&gt;\';
}

$gallery = explode(",", "REX_VALUE[2]");
foreach ($gallery as $file) {
    echo \'&lt;img src="\' . rex_url::media(trim($file)) . \'"&gt;\';
}
?&gt;</code></pre>
';

$fragment = new rex_fragment();
$fragment->setVar('title', 'API & Modul-Referenz', false);
$fragment->setVar('body', $content4, false);
echo $fragment->parse('core/page/section.php');
