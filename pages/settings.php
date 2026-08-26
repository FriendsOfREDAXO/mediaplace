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

$field = $form->addCheckboxField('disable_tagging');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_tagging_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_tagging_hint'));

$field = $form->addCheckboxField('disable_collections');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_collections_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_collections_hint'));

$field = $form->addCheckboxField('enable_legacy_metainfo');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_legacy_metainfo_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_legacy_metainfo_hint'));

$form->addFieldset(rex_i18n::msg('mediaplace_settings_experimental_legend'));

$field = $form->addCheckboxField('enable_metainfo_form_prototype');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_metainfo_prototype_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_metainfo_prototype_hint'));

$fragment = new rex_fragment();
$fragment->setVar('class', 'edit', false);
$fragment->setVar('title', rex_i18n::msg('mediaplace_settings_menu_legend'));
$fragment->setVar('body', $form->get(), false);
echo $fragment->parse('core/page/section.php');
