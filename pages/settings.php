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

$field = $form->addCheckboxField('enable_alt_missing_filter');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_alt_missing_filter_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_alt_missing_filter_hint'));

$field = $form->addCheckboxField('disable_tagging');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_tagging_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_tagging_hint'));

$field = $form->addCheckboxField('disable_collections');
$field->addOption(rex_i18n::msg('mediaplace_settings_feature_collections_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_feature_collections_hint'));

// Nur relevant/sichtbar, wenn das ffmpeg-Addon installiert ist -- ohne ffmpeg
// zeigt das Grid ohnehin immer nur das Datei-Icon, unabhaengig von dieser
// Einstellung (siehe FfmpegIntegration::isAvailable()).
if (rex_addon::get('ffmpeg')->isAvailable()) {
    $field = $form->addSelectField('video_thumb_mode');
    $field->setLabel(rex_i18n::msg('mediaplace_settings_video_thumb_mode_label'));
    $select = $field->getSelect();
    $select->addOption(rex_i18n::msg('mediaplace_settings_video_thumb_mode_off'), 'off');
    $select->addOption(rex_i18n::msg('mediaplace_settings_video_thumb_mode_static'), 'static');
    $select->addOption(rex_i18n::msg('mediaplace_settings_video_thumb_mode_animated'), 'animated');
    $field->setAttribute('class', 'form-control');
    $field->setNotice(rex_i18n::msg('mediaplace_settings_video_thumb_mode_hint'));
}

$form->addFieldset(rex_i18n::msg('mediaplace_settings_upload_legend'));

$field = $form->addCheckboxField('enable_upload_resize');
$field->addOption(rex_i18n::msg('mediaplace_settings_upload_resize_label'), 1);
$field->setNotice(rex_i18n::msg('mediaplace_settings_upload_resize_hint'));

$field = $form->addInputField('number', 'upload_resize_width', null, [
    'class' => 'form-control',
    'min' => '100',
]);
$field->setLabel(rex_i18n::msg('mediaplace_settings_upload_resize_width'));

$field = $form->addInputField('number', 'upload_resize_height', null, [
    'class' => 'form-control',
    'min' => '100',
]);
$field->setLabel(rex_i18n::msg('mediaplace_settings_upload_resize_height'));

// Upload-Anbieter (siehe UploadProviderRegistry): "Eingebaut" (leerer Wert)
// ersetzt den bisherigen Upload-Button/Drag&Drop durch nichts -- der eigene
// Flow bleibt aktiv. Liste zeigt ALLE registrierten Provider (nicht nach
// Recht des aktuell eingeloggten Admins gefiltert), da hier konfiguriert
// wird, nicht genutzt -- die Rechtepruefung fuer den TATSAECHLICH
// nutzenden User passiert separat in boot.php beim Ausliefern an #mp3-root.
$uploadProviders = \FriendsOfRedaxo\Mediaplace\UploadProviderRegistry::getAllProviders();
$field = $form->addSelectField('upload_provider', null, [
    'class' => 'form-control selectpicker',
]);
$field->setLabel(rex_i18n::msg('mediaplace_settings_upload_provider_label'));
$select = $field->getSelect();
$select->addOption(rex_i18n::msg('mediaplace_settings_upload_provider_builtin'), '');
foreach ($uploadProviders as $providerId => $providerMeta) {
    $select->addOption((string) ($providerMeta['label'] ?? $providerId), $providerId);
}
$field->setNotice(rex_i18n::msg($uploadProviders ? 'mediaplace_settings_upload_provider_hint' : 'mediaplace_settings_upload_provider_hint_none'));

$formHtml = $form->get();

// rex_form_base::createElement() faellt bei einer NICHT abgeschickten Checkbox
// (der Browser sendet fuer eine deaktivierte Checkbox ueberhaupt kein Feld mit)
// auf den zuvor gespeicherten Wert zurueck, statt "aus" zu speichern -- eine
// Checkbox in einem rex_config_form laesst sich dadurch nie wieder deaktivieren,
// sobald sie einmal aktiviert wurde (live beobachtet: "Klassischen Medienpool-
// Menuepunkt ersetzen" liess sich nicht abschalten). Betrifft jedes
// addCheckboxField() auf dieser Seite gleichermassen -- nach dem generischen
// Form-Save (oben) deshalb fuer alle hier den tatsaechlich gesendeten Zustand
// explizit nachtragen, als echten Bool-Wert statt des sonst ueblichen
// Pipe-Strings (beides wird ueberall nur truthy/falsy ausgewertet, siehe
// boot.php/lib/*).
$checkboxFields = [
    'replace_classic_mediapool',
    'enable_own_metadata',
    'enable_metainfo_editing',
    'enable_alt_missing_filter',
    'disable_tagging',
    'disable_collections',
    'enable_upload_resize',
];
$submittedFieldset = rex_post('mediaplace', 'array', null);
if (null !== $submittedFieldset) {
    foreach ($checkboxFields as $checkboxField) {
        rex_config::set('mediaplace', $checkboxField, isset($submittedFieldset[$checkboxField]['1']));
    }
}

$fragment = new rex_fragment();
$fragment->setVar('class', 'edit', false);
$fragment->setVar('title', rex_i18n::msg('mediaplace_settings_menu_legend'));
$fragment->setVar('body', $formHtml, false);
echo $fragment->parse('core/page/section.php');
