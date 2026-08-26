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

// Bewusst als "disable_*" statt "feature_*" gespeichert (Checkbox = deaktivieren,
// nicht aktivieren): rex_config_form schreibt fuer eine nicht angehakte Checkbox
// null statt 0 (kein POST-Feld fuer nicht angehakte HTML-Checkboxen) --
// rex_config::get()'s "??"-Fallback kann das nicht von "nie gesetzt" unterscheiden.
// Mit Default false ("nicht deaktiviert") ergibt genau dieses null-bei-nicht-
// angehakt-Verhalten trotzdem das gewuenschte Resultat (Funktion bleibt an).
$field = $form->addCheckboxField('disable_tagging');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_tagging_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_tagging_hint'));

$field = $form->addCheckboxField('disable_collections');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_collections_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_collections_hint'));

// Anders als die beiden oberen Checkboxen bewusst als "enable_*" (nicht "disable_*")
// gespeichert: Default ist hier AUS, nicht AN -- die "disable_*"-Notiz oben betrifft
// nur Default-an-Features, bei denen das Checkbox-null-Problem eine Rolle spielt.
$field = $form->addCheckboxField('enable_legacy_metainfo');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_legacy_metainfo_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_legacy_metainfo_hint'));

$fragment = new rex_fragment();
$fragment->setVar('class', 'edit', false);
$fragment->setVar('title', rex_i18n::msg('mediaplace_settings_menu_legend'));
$fragment->setVar('body', $form->get(), false);
echo $fragment->parse('core/page/section.php');
