<?php

/**
 * MediaPlace – Debug Page (Admin only)
 * Shows DB stats, API responses, and diagnostics.
 */

// ---- DB Stats ----
$sql = rex_sql::factory();

// Total media count
$totalMedia = (int) $sql->setQuery('SELECT COUNT(*) as cnt FROM ' . rex::getTable('media'))->getValue('cnt');

// Media per category
$sql->setQuery('SELECT category_id, COUNT(*) as cnt FROM ' . rex::getTable('media') . ' GROUP BY category_id ORDER BY category_id');
$catCounts = [];
for ($i = 0; $i < $sql->getRows(); $i++) {
    $catCounts[] = [
        'category_id' => $sql->getValue('category_id'),
        'count' => $sql->getValue('cnt'),
    ];
    $sql->next();
}

// Category tree
$sql->setQuery('SELECT id, name, parent_id FROM ' . rex::getTable('media_category') . ' ORDER BY parent_id, name');
$categories = [];
for ($i = 0; $i < $sql->getRows(); $i++) {
    $categories[] = [
        'id' => $sql->getValue('id'),
        'name' => $sql->getValue('name'),
        'parent_id' => $sql->getValue('parent_id'),
    ];
    $sql->next();
}

// Total categories
$totalCategories = count($categories);

// ---- API Endpoint Tests ----
$apiBase = rex::getServer() . 'api/backend/';
$apiTests = [];

// We'll test API calls via internal PHP (no auth needed)
// Test 1: media without filter
$sql1 = rex_sql::factory();
$sql1->setQuery('SELECT COUNT(*) as cnt FROM ' . rex::getTable('media'));
$allCount = (int) $sql1->getValue('cnt');

// Test 2: media with category_id=0
$sql2 = rex_sql::factory();
$sql2->setQuery('SELECT COUNT(*) as cnt FROM ' . rex::getTable('media') . ' WHERE category_id = 0');
$cat0Count = (int) $sql2->getValue('cnt');

// ---- Build output ----
$html = '<div class="row">';

// Panel 1: DB Overview
$html .= '<div class="col-md-6">';
$tableHtml = '<table class="table table-striped table-hover">';
$tableHtml .= '<tr><td><strong>Medien gesamt</strong></td><td><span class="label label-primary">' . $totalMedia . '</span></td></tr>';
$tableHtml .= '<tr><td><strong>Medien in Kategorie 0 (Root)</strong></td><td><span class="label label-info">' . $cat0Count . '</span></td></tr>';
$tableHtml .= '<tr><td><strong>Medien in Unterkategorien</strong></td><td><span class="label label-warning">' . ($totalMedia - $cat0Count) . '</span></td></tr>';
$tableHtml .= '<tr><td><strong>Kategorien gesamt</strong></td><td><span class="label label-default">' . $totalCategories . '</span></td></tr>';
$tableHtml .= '</table>';

$fragment = new rex_fragment();
$fragment->setVar('title', '<i class="fa-solid fa-database"></i> Datenbank-Übersicht', false);
$fragment->setVar('body', $tableHtml, false);
$html .= $fragment->parse('core/page/section.php');
$html .= '</div>';

// Panel 2: Media per Category
$html .= '<div class="col-md-6">';
$tableHtml = '<table class="table table-striped table-hover">';
$tableHtml .= '<thead><tr><th>Kategorie-ID</th><th>Kategorie-Name</th><th>Anzahl Medien</th></tr></thead><tbody>';
foreach ($catCounts as $row) {
    $catId = (int) $row['category_id'];
    $catName = '—';
    if ($catId === 0) {
        $catName = '<em>(Root / keine Kategorie)</em>';
    } else {
        foreach ($categories as $c) {
            if ((int) $c['id'] === $catId) {
                $catName = rex_escape($c['name']);
                break;
            }
        }
    }
    $tableHtml .= '<tr><td>' . $catId . '</td><td>' . $catName . '</td><td><span class="label label-default">' . $row['count'] . '</span></td></tr>';
}
$tableHtml .= '</tbody></table>';

$fragment = new rex_fragment();
$fragment->setVar('title', '<i class="fa-solid fa-chart-bar"></i> Medien pro Kategorie', false);
$fragment->setVar('body', $tableHtml, false);
$html .= $fragment->parse('core/page/section.php');
$html .= '</div>';

$html .= '</div>'; // .row

// Panel 3: Category Tree
$html .= '<div class="row"><div class="col-md-6">';
$tableHtml = '<table class="table table-striped table-hover">';
$tableHtml .= '<thead><tr><th>ID</th><th>Name</th><th>Parent-ID</th></tr></thead><tbody>';
foreach ($categories as $c) {
    $tableHtml .= '<tr><td>' . $c['id'] . '</td><td>' . rex_escape($c['name']) . '</td><td>' . $c['parent_id'] . '</td></tr>';
}
if ($totalCategories === 0) {
    $tableHtml .= '<tr><td colspan="3"><em>Keine Kategorien vorhanden</em></td></tr>';
}
$tableHtml .= '</tbody></table>';

$fragment = new rex_fragment();
$fragment->setVar('title', '<i class="fa-solid fa-folder-tree"></i> Kategorie-Baum (' . $totalCategories . ')', false);
$fragment->setVar('body', $tableHtml, false);
$html .= $fragment->parse('core/page/section.php');
$html .= '</div>';

// Panel 4: API Endpoint Info
$html .= '<div class="col-md-6">';
$apiHtml = '<table class="table table-striped">';
$apiHtml .= '<thead><tr><th>Endpoint</th><th>Beschreibung</th><th>Erwartete Ergebnisse</th></tr></thead><tbody>';
$apiHtml .= '<tr><td><code>GET media?per_page=1000</code></td><td>Alle Medien (kein Kategorie-Filter)</td><td><span class="label label-primary">' . $totalMedia . '</span></td></tr>';
$apiHtml .= '<tr><td><code>GET media?per_page=1000&amp;filter[category_id]=0</code></td><td>Medien in Root-Kategorie</td><td><span class="label label-info">' . $cat0Count . '</span></td></tr>';

foreach ($catCounts as $row) {
    $catId = (int) $row['category_id'];
    if ($catId > 0) {
        $apiHtml .= '<tr><td><code>GET media?filter[category_id]=' . $catId . '</code></td><td>Kategorie ' . $catId . '</td><td><span class="label label-default">' . $row['count'] . '</span></td></tr>';
    }
}

$apiHtml .= '</tbody></table>';

$fragment = new rex_fragment();
$fragment->setVar('title', '<i class="fa-solid fa-plug"></i> API Endpoints', false);
$fragment->setVar('body', $apiHtml, false);
$html .= $fragment->parse('core/page/section.php');
$html .= '</div></div>';

// Panel 5: Live API Test (JS)
$html .= '<div class="row"><div class="col-md-12">';
$testHtml = '<p>Klicken Sie auf einen Button, um die API live zu testen. Die Antwort wird unten angezeigt.</p>';
$testHtml .= '<div class="btn-group" style="margin-bottom:15px;">';
$testHtml .= '<button class="btn btn-default mp3-debug-api" data-endpoint="media?per_page=10"><i class="fa-solid fa-play"></i> Alle (10)</button>';
$testHtml .= '<button class="btn btn-default mp3-debug-api" data-endpoint="media?per_page=10&filter[category_id]=0"><i class="fa-solid fa-play"></i> Cat 0 (10)</button>';
$testHtml .= '<button class="btn btn-default mp3-debug-api" data-endpoint="media?per_page=1000"><i class="fa-solid fa-play"></i> Alle (1000)</button>';
$testHtml .= '<button class="btn btn-default mp3-debug-api" data-endpoint="media/category"><i class="fa-solid fa-play"></i> Kategorien (Root)</button>';
$testHtml .= '</div>';
$testHtml .= '<pre id="mp3-debug-output" style="max-height:400px;overflow:auto;background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:4px;font-size:12px;">Noch kein Test ausgeführt…</pre>';

$testHtml .= '<script>
document.addEventListener("click", function(e) {
    var btn = e.target.closest(".mp3-debug-api");
    if (!btn) return;
    var endpoint = btn.getAttribute("data-endpoint");
    var out = document.getElementById("mp3-debug-output");
    out.textContent = "Lade: /api/backend/" + endpoint + " …";
    fetch("/api/backend/" + endpoint, {
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" }
    })
    .then(function(r) {
        var status = r.status + " " + r.statusText;
        return r.json().then(function(json) {
            var dataLen = Array.isArray(json.data) ? json.data.length : "n/a";
            var info = "HTTP " + status + "\\n";
            info += "Anzahl data-Einträge: " + dataLen + "\\n";
            info += "Response-Keys: " + Object.keys(json).join(", ") + "\\n\\n";
            info += JSON.stringify(json, null, 2);
            out.textContent = info;
        });
    })
    .catch(function(err) {
        out.textContent = "FEHLER: " + err.message;
    });
});
</script>';

$fragment = new rex_fragment();
$fragment->setVar('title', '<i class="fa-solid fa-vial"></i> Live API-Test', false);
$fragment->setVar('body', $testHtml, false);
$html .= $fragment->parse('core/page/section.php');
$html .= '</div></div>';

// Panel 6: Current JS Config
$html .= '<div class="row"><div class="col-md-12">';
$configHtml = '<table class="table">';
$configHtml .= '<tr><td><strong>API Base</strong></td><td><code>/api/backend/</code></td></tr>';
$configHtml .= '<tr><td><strong>per_page</strong></td><td><code>1000</code></td></tr>';
$configHtml .= '<tr><td><strong>Category Filter Syntax</strong></td><td><code>filter[category_id]=X</code></td></tr>';
$configHtml .= '<tr><td><strong>Alle Medien (catId)</strong></td><td><code>-1</code> (kein Filter)</td></tr>';
$configHtml .= '<tr><td><strong>Root Medienpool (catId)</strong></td><td><code>0</code> (filter[category_id]=0)</td></tr>';
$configHtml .= '<tr><td><strong>Media Manager Types</strong></td><td><code>rex_media_small</code> (Grid), <code>rex_media_medium</code> (Detail)</td></tr>';
$configHtml .= '</table>';

$fragment = new rex_fragment();
$fragment->setVar('title', '<i class="fa-solid fa-gear"></i> JS-Konfiguration', false);
$fragment->setVar('body', $configHtml, false);
$html .= $fragment->parse('core/page/section.php');
$html .= '</div></div>';

echo $html;
