<?php

/**
 * Settings for mediaplace.
 */

$form = rex_config_form::factory('mediaplace');
$form->addFieldset(rex_i18n::msg('mediaplace_settings_menu_legend'));

$field = $form->addCheckboxField('replace_classic_mediapool');
$field->addOption(rex_i18n::msg('mediaplace_settings_menu_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_menu_hint'));

$form->addFieldset(rex_i18n::msg('mediaplace_settings_features_legend'));

$field = $form->addCheckboxField('enable_own_metadata');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_own_metadata_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_own_metadata_hint'));

$field = $form->addCheckboxField('enable_metainfo_editing');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_metainfo_editing_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_metainfo_editing_hint'));

$field = $form->addCheckboxField('disable_tagging');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_tagging_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_tagging_hint'));

$field = $form->addCheckboxField('disable_collections');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_collections_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_collections_hint'));

$fragment = new rex_fragment();
$fragment->setVar('class', 'edit', false);
$fragment->setVar('title', rex_i18n::msg('mediaplace_settings_menu_legend'));
$fragment->setVar('body', $form->get(), false);
echo $fragment->parse('core/page/section.php');
