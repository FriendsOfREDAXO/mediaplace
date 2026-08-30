<?php

/**
 * Zentrale Verwaltung des System-Tag-Katalogs (rex_mediaplace_tags): Tags
 * umbenennen (kaskadiert automatisch auf alle Dateien, siehe
 * SystemTagManager::renameCatalogTag()), Farbe bestehender Tags aendern
 * (SystemTagManager::ensureCatalogTag() aktualisiert die Farbe eines schon
 * vorhandenen Tags statt einen zweiten anzulegen) oder komplett loeschen.
 * Sammlungen (collection:-Praefix, siehe SystemTagManager::COLLECTION_PREFIX)
 * werden hier bewusst nicht gelistet -- die haben ihre eigene Verwaltung
 * ("Sammlungen verwalten" im Overlay).
 *
 * Farbe EINZELNER Dateien ist im Tag-Widget nur noch bei der Neuanlage eines
 * Tags direkt aenderbar; ein bereits vorhandener Tag ist danach nur noch
 * hier zentral umfaerbbar (siehe repaintTagsWidget()/newlyCreatedTagNames
 * in modules/detail.js).
 */

use FriendsOfRedaxo\Mediaplace\SystemTagManager;

SystemTagManager::ensureSchema();

$func = rex_request('func', 'string', '');
$tagName = rex_request('tag', 'string', '');

$listUrl = rex_url::currentBackendPage([], false);

// Delete
if ('delete' === $func && '' !== $tagName) {
    SystemTagManager::deleteCatalogTag($tagName);
    echo rex_view::success(rex_i18n::msg('mediaplace_tag_deleted'));
    $func = '';
    $tagName = '';
}

// Save (rename + color, from the edit form)
if (1 === rex_post('save', 'int', 0)) {
    $originalName = rex_post('original_name', 'string', '');
    $newName = rex_post('name', 'string', '');
    $newColor = rex_post('color', 'string', '#4a90d9');

    if ('' === $originalName || '' === $newName) {
        echo rex_view::error(rex_i18n::msg('mediaplace_invalid_input'));
        $tagName = $originalName;
        $func = 'edit';
    } elseif (SystemTagManager::isCollectionTagName($newName)) {
        // Waere sonst als Sammlung interpretiert (COLLECTION_PREFIX) und
        // verschwaende aus dieser Liste, obwohl der User nur den Namen
        // geaendert hat -- lieber vorher ablehnen als den Tag "verlieren".
        echo rex_view::error(rex_i18n::msg('mediaplace_tag_name_reserved'));
        $tagName = $originalName;
        $func = 'edit';
    } else {
        if ($newName !== $originalName) {
            SystemTagManager::renameCatalogTag($originalName, $newName);
        }
        SystemTagManager::ensureCatalogTag($newName, $newColor);
        echo rex_view::success(rex_i18n::msg('mediaplace_tag_saved'));
        $func = '';
    }
}

// Edit form
if ('edit' === $func && '' !== $tagName) {
    $current = null;
    foreach (SystemTagManager::getCatalog() as $tag) {
        if ($tag['name'] === $tagName) {
            $current = $tag;
            break;
        }
    }

    if (!$current) {
        echo rex_view::error(rex_i18n::msg('mediaplace_tag_not_found'));
        $func = '';
    } else {
        ob_start();
        ?>
        <form method="post">
            <input type="hidden" name="original_name" value="<?php echo rex_escape($current['name']); ?>">
            <div class="row">
                <div class="col-md-8">
                    <div class="form-group">
                        <label for="name" class="control-label"><?php echo rex_i18n::msg('mediaplace_tag_name'); ?></label>
                        <input type="text" id="name" name="name" value="<?php echo rex_escape($current['name']); ?>" class="form-control" required>
                        <p class="help-block"><?php echo rex_i18n::msg('mediaplace_tag_rename_hint'); ?></p>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label for="color" class="control-label"><?php echo rex_i18n::msg('mediaplace_tag_color'); ?></label><br>
                        <input type="color" id="color" name="color" value="<?php echo rex_escape($current['color']); ?>">
                    </div>
                </div>
            </div>

            <div class="rex-form-panel-footer">
                <button type="submit" name="save" value="1" class="btn btn-save"><i class="fa-solid fa-floppy-disk"></i> <?php echo rex_i18n::msg('mediaplace_save'); ?></button>
                <a href="<?php echo $listUrl; ?>" class="btn btn-abort"><?php echo rex_i18n::msg('mediaplace_cancel'); ?></a>
            </div>
        </form>
        <?php
        $body = ob_get_clean();

        $fragment = new rex_fragment();
        $fragment->setVar('title', rex_i18n::msg('mediaplace_tag_edit_title', $current['name']));
        $fragment->setVar('body', $body, false);
        echo $fragment->parse('core/page/section.php');
    }
}

// List
if ('' === $func) {
    echo rex_view::info(rex_i18n::msg('mediaplace_tag_management_hint'));

    $tags = [];
    foreach (SystemTagManager::getCatalog() as $catalogTag) {
        if (SystemTagManager::isCollectionTagName($catalogTag['name'])) {
            continue;
        }
        $tags[] = $catalogTag;
    }

    $usageSql = rex_sql::factory();
    $usageRows = $usageSql->getArray(
        'SELECT tag_name, COUNT(*) AS cnt FROM ' . rex::getTable('mediaplace_media_tags') . ' GROUP BY tag_name',
    );
    $usageCounts = [];
    foreach ($usageRows as $usageRow) {
        $usageCounts[(string) $usageRow['tag_name']] = (int) $usageRow['cnt'];
    }

    ob_start();
    if (empty($tags)): ?>
        <div class="alert alert-info">
            <?php echo rex_i18n::msg('mediaplace_no_tags_found'); ?>
        </div>
    <?php else: ?>
        <table class="table table-striped">
            <thead>
                <tr>
                    <th style="width: 40px;"></th>
                    <th><?php echo rex_i18n::msg('mediaplace_tag_name'); ?></th>
                    <th><?php echo rex_i18n::msg('mediaplace_tag_usage_count'); ?></th>
                    <th class="rex-table-action" colspan="2"><?php echo rex_i18n::msg('mediaplace_functions'); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($tags as $tag): ?>
                    <tr>
                        <td><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:<?php echo rex_escape($tag['color']); ?>;"></span></td>
                        <td><?php echo rex_escape($tag['name']); ?></td>
                        <td><?php echo (int) ($usageCounts[$tag['name']] ?? 0); ?></td>
                        <td class="rex-table-action"><a href="<?php echo rex_url::currentBackendPage(['func' => 'edit', 'tag' => $tag['name']], false); ?>" class="rex-edit"><i class="rex-icon rex-icon-edit"></i> <?php echo rex_i18n::msg('mediaplace_edit'); ?></a></td>
                        <td class="rex-table-action"><a href="<?php echo rex_url::currentBackendPage(['func' => 'delete', 'tag' => $tag['name']], false); ?>" class="rex-delete" data-confirm="<?php echo rex_escape(rex_i18n::msg('mediaplace_confirm_delete_generic')); ?>"><i class="rex-icon rex-icon-delete"></i> <?php echo rex_i18n::msg('mediaplace_delete'); ?></a></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif;
    $content = ob_get_clean();

    $fragment = new rex_fragment();
    $fragment->setVar('title', rex_i18n::msg('mediaplace_tag_management_title'));
    $fragment->setVar('content', $content, false);
    echo $fragment->parse('core/page/section.php');
}
