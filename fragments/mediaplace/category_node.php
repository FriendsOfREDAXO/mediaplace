<?php

/**
 * Eine Kategorie-Zeile im Sidebar-Baum, ruft sich fuer Kinder rekursiv selbst
 * auf (siehe rex_fragment::subfragment()). Markup ist bewusst 1:1 identisch
 * zu dem, was frueher renderCatChildren() in mediapool3.js gebaut hat --
 * gleiche Klassen/data-Attribute, damit die bestehende Event-Delegation
 * (overlay.addEventListener('click', ...) in mediapool3.js) unveraendert
 * weiterfunktioniert.
 *
 * Vars:
 * - rex_media_category $category
 * - int $depth
 * - int $current_cat
 *
 * @var rex_fragment $this
 */

/** @var rex_media_category $category */
$category = $this->getVar('category');
$depth = (int) $this->getVar('depth');
$currentCat = (int) $this->getVar('current_cat');

$id = $category->getId();
$name = $category->getName();
$children = rex_api_mediaplace_categories::filterVisibleCategories($category->getChildren());
$hasKids = count($children) > 0;
$indent = ($depth + 1) * 16;
// Umbenennen/Verschieben/Loeschen brauchen Zugriff auf die ELTERN-Kategorie,
// nicht auf die Kategorie selbst -- siehe MediaPermission::hasParentCategoryAccess().
// Steuert, welche Aktionen das "..."-Menue ueberhaupt anbietet (openCatMenu()
// liest data-can-manage) -- Unterkategorie-Anlegen bleibt davon unberuehrt,
// da die Kategorie ueberhaupt nur sichtbar ist, wenn hasCategoryAccess($id)
// bereits zutrifft.
$canManage = \FriendsOfRedaxo\Mediaplace\MediaPermission::hasParentCategoryAccess($category->getParentId());
?>
<div class="mp3-cat-node" data-cat-id="<?= $id ?>">
    <div class="mp3-cat-row">
        <a class="mp3-cat<?= $currentCat === $id ? ' mp3-cat-active' : '' ?>" data-cat="<?= $id ?>" title="<?= rex_escape($name) ?>" style="padding-left:<?= $indent ?>px;">
<?php if ($hasKids): ?>
            <i class="fa-solid fa-chevron-right mp3-cat-toggle" data-toggle-cat="<?= $id ?>"></i>
<?php else: ?>
            <i class="fa-solid fa-folder mp3-cat-folder-icon"></i>
<?php endif; ?>
            <?= rex_escape($name) ?></a>
        <button class="mp3-cat-menu-btn" data-cat-menu-toggle="<?= $id ?>" data-cat-menu-name="<?= rex_escape($name) ?>" data-can-manage="<?= $canManage ? '1' : '0' ?>" title="<?= rex_escape($this->i18n('mediaplace_cat_actions')) ?>">
            <i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>
<?php if ($hasKids): ?>
    <?php $this->subfragment('mediaplace/category_children.php', [
        'categories' => $children,
        'depth' => $depth + 1,
        'current_cat' => $currentCat,
    ]); ?>
<?php endif; ?>
</div>
