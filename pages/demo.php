<?php

// ---- Section 1: Overlay Demo ----
$chosenLabel = rex_i18n::msg('mediaplace_demo_chosen');
$content1 = '
<p>' . rex_i18n::msg('mediaplace_demo_overlay_intro') . '</p>
<p><small class="text-muted">' . rex_i18n::msg('mediaplace_demo_overlay_hint') . '</small></p>
<div style="display:flex;gap:10px;flex-wrap:wrap;">
    <button class="btn btn-default" onclick="MP3.open()">
        <i class="fa-solid fa-eye"></i> ' . rex_i18n::msg('mediaplace_demo_browse_only') . '
    </button>
    <button class="btn btn-primary" onclick="MP3.open(function(f){ alert(\'' . rex_i18n::msg('mediaplace_demo_chosen') . ': \' + f); })">
        <i class="fa-solid fa-photo-film"></i> ' . rex_i18n::msg('mediaplace_demo_single_select') . '
    </button>
    <button class="btn btn-success" onclick="MP3.open(function(files){ alert(\'' . rex_i18n::msg('mediaplace_demo_chosen') . ': \' + files.join(\', \')); }, { multiple: true })">
        <i class="fa-solid fa-images"></i> ' . rex_i18n::msg('mediaplace_demo_multi_select') . '
    </button>
</div>
<pre style="margin-top:15px;font-size:12px;background:#f5f5f5;padding:12px;border-radius:4px;"><code>// Nur Ansehen (Browse-only, kein Callback)
MP3.open();

// Einzelauswahl
MP3.open(function(filename) {
    console.log(\'' . $chosenLabel . ':\', filename);
});

// Mehrfachauswahl
MP3.open(function(filenames) {
    console.log(\'' . $chosenLabel . ':\', filenames); // Array von Dateinamen
}, { multiple: true });</code></pre>
';

$fragment = new rex_fragment();
$fragment->setVar('title', rex_i18n::msg('mediaplace_demo_section_overlay_title'), false);
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
<p>' . rex_i18n::msg('mediaplace_demo_widget_intro') . '</p>

<div class="form-group">
    <label>' . rex_i18n::msg('mediaplace_demo_widget_label_empty') . '</label>
    <input class="mp3-widget form-control" name="demo_image" value="">
</div>

<div class="form-group">
    <label>' . rex_i18n::msg('mediaplace_demo_widget_label_prefilled') . '</label>
    <input class="mp3-widget form-control" name="demo_doc" value="' . rex_escape($demoFile1) . '">
</div>

<h4 style="margin-top:25px;">' . rex_i18n::msg('mediaplace_demo_usage') . '</h4>
<pre style="font-size:12px;background:#f5f5f5;padding:12px;border-radius:4px;"><code>&lt;!-- Einfach die CSS-Klasse mp3-widget setzen --&gt;
&lt;input class="mp3-widget" name="REX_INPUT_VALUE[1]" value="REX_VALUE[1]"&gt;</code></pre>

<p style="margin-top:10px;"><small class="text-muted">' . rex_i18n::msg('mediaplace_demo_widget_hint') . '</small></p>
';

$fragment = new rex_fragment();
$fragment->setVar('title', rex_i18n::msg('mediaplace_demo_section_widget_single_title') . ' <code>mp3-widget</code>', false);
$fragment->setVar('body', $content2, false);
echo $fragment->parse('core/page/section.php');

// ---- Section 3: Multi Widget ----
$content3 = '
<p>' . rex_i18n::msg('mediaplace_demo_multi_widget_intro') . '</p>

<div class="form-group">
    <label>' . rex_i18n::msg('mediaplace_demo_gallery_label_empty') . '</label>
    <input class="mp3-widget form-control" name="demo_gallery" data-mp3-multiple="true" value="">
</div>

<div class="form-group">
    <label>' . rex_i18n::msg('mediaplace_demo_gallery_label_prefilled') . '</label>
    <input class="mp3-widget form-control" name="demo_downloads" data-mp3-multiple="true"
        value="' . rex_escape($demoMultiVal) . '">
</div>

<h4 style="margin-top:25px;">' . rex_i18n::msg('mediaplace_demo_usage') . '</h4>
<pre style="font-size:12px;background:#f5f5f5;padding:12px;border-radius:4px;"><code>&lt;!-- data-mp3-multiple="true" für Mehrfachauswahl --&gt;
&lt;input class="mp3-widget" name="REX_INPUT_VALUE[2]"
       data-mp3-multiple="true"
       value="REX_VALUE[2]"&gt;

&lt;!-- Wert: kommaseparierte Dateinamen --&gt;
&lt;!-- z.B. "bild1.jpg,bild2.png,dokument.pdf" --&gt;</code></pre>

<p style="margin-top:10px;"><small class="text-muted">' . rex_i18n::msg('mediaplace_demo_gallery_hint') . ' <i class="fa-solid fa-xmark"></i> ' . rex_i18n::msg('mediaplace_demo_gallery_hint_remove') . '</small></p>
';

$fragment = new rex_fragment();
$fragment->setVar('title', rex_i18n::msg('mediaplace_demo_section_widget_multi_title') . ' <code>data-mp3-multiple="true"</code>', false);
$fragment->setVar('body', $content3, false);
echo $fragment->parse('core/page/section.php');

// ---- Section 4: API Reference ----
$content4 = '
<table class="table table-striped">
<thead><tr><th>' . rex_i18n::msg('mediaplace_demo_th_attribute') . '</th><th>' . rex_i18n::msg('mediaplace_demo_th_description') . '</th><th>' . rex_i18n::msg('mediaplace_demo_th_example') . '</th></tr></thead>
<tbody>
<tr>
    <td><code>class="mp3-widget"</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_attr_widget_class') . '</td>
    <td><code>&lt;input class="mp3-widget" name="bild"&gt;</code></td>
</tr>
<tr>
    <td><code>data-mp3-multiple="true"</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_attr_multiple') . '</td>
    <td><code>&lt;input class="mp3-widget" data-mp3-multiple="true"&gt;</code></td>
</tr>
<tr>
    <td><code>value="datei.jpg"</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_attr_value') . '</td>
    <td><code>value="a.jpg,b.png"</code></td>
</tr>
</tbody>
</table>

<h4>JavaScript API</h4>
<table class="table table-striped">
<thead><tr><th>' . rex_i18n::msg('mediaplace_demo_th_method') . '</th><th>' . rex_i18n::msg('mediaplace_demo_th_description') . '</th></tr></thead>
<tbody>
<tr>
    <td><code>MP3.open()</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_api_open') . '</td>
</tr>
<tr>
    <td><code>MP3.open(callback)</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_api_open_callback') . '</td>
</tr>
<tr>
    <td><code>MP3.open(callback, { multiple: true })</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_api_open_multiple') . '</td>
</tr>
<tr>
    <td><code>MP3.close()</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_api_close') . '</td>
</tr>
<tr>
    <td><code>MP3Widget.init()</code></td>
    <td>' . rex_i18n::msg('mediaplace_demo_api_widget_init') . '</td>
</tr>
</tbody>
</table>

<h4>' . rex_i18n::msg('mediaplace_demo_modules_heading') . '</h4>
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
$fragment->setVar('title', rex_i18n::msg('mediaplace_demo_section_api_title'), false);
$fragment->setVar('body', $content4, false);
echo $fragment->parse('core/page/section.php');
