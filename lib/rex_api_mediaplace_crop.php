<?php

/**
 * Bettet die echte UI und Speicherlogik des cropper-Addons
 * (FriendsOfRedaxo/cropper) im MediaPlace-Overlay ein, statt sie
 * nachzubauen -- siehe FriendsOfRedaxo\Mediaplace\CropperIntegration.
 *
 * GET  ?rex-api-call=mediaplace_crop&file=...
 *      Liefert dasselbe Panel-Markup wie cropper/pages/mediapool.cropper.php
 *      (fragments/cropper_panel.php + Speicheroptionen/Dateiname/Kategorie),
 *      nur ohne die dortige Seiten-Huelle (section.php/Zurueck-Button) --
 *      der eigene Canvas liefert Titel/Zurueck selbst.
 *
 * POST ?rex-api-call=mediaplace_crop&file=...
 *      Body: dieselben Felder wie cropper's eigenes Formular
 *      (multipart/form-data, x/y/width/height/rotate/scaleX/scaleY/
 *      canvas_width/canvas_height/image_box_x/_y/_width/_height/
 *      create_new_image/new_file_name/new_file_extension/jpg_quality/png_compression/
 *      rex_file_category). Fuehrt den Crop ueber cropper's eigenen
 *      CropperExecutor aus (keine eigene Bildverarbeitung).
 */
class rex_api_mediaplace_crop extends rex_api_function
{
    public function execute(): rex_api_result
    {
        rex_response::cleanOutputBuffers();

        if (!rex::getUser()) {
            rex_response::setStatus(rex_response::HTTP_UNAUTHORIZED);
            rex_response::sendJson(['error' => 'Unauthorized']);
            exit;
        }

        if (!\FriendsOfRedaxo\Mediaplace\CropperIntegration::isAvailable()) {
            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
            rex_response::sendJson(['error' => 'cropper addon not available']);
            exit;
        }

        if (!rex::getUser()->hasPerm('cropper[]')) {
            rex_response::setStatus(rex_response::HTTP_FORBIDDEN);
            rex_response::sendJson(['error' => 'Permission denied']);
            exit;
        }

        $filename = rex_request('file', 'string', '');
        $media = '' !== $filename ? rex_media::get($filename) : null;
        if (!$media) {
            rex_response::setStatus(rex_response::HTTP_NOT_FOUND);
            rex_response::sendJson(['error' => 'Media not found']);
            exit;
        }

        // Quell-Kategorie: gilt fuer GET (Panel anzeigen) UND POST (Speichern
        // ueberschreibt/liest von hier) gleichermassen.
        if (!\FriendsOfRedaxo\Mediaplace\MediaPermission::hasCategoryAccess($media->getCategoryId())) {
            rex_response::setStatus(rex_response::HTTP_FORBIDDEN);
            rex_response::sendJson(['error' => 'Permission denied']);
            exit;
        }

        if ('post' === rex_request_method()) {
            $this->handleSave($media);
        } else {
            $this->handleForm($media);
        }
        exit;
    }

    /**
     * Baut dasselbe Panel wie cropper/pages/mediapool.cropper.php
     * (Zeilen ~176-407 dort), nur ohne core/page/section.php-Huelle.
     */
    private function handleForm(rex_media $media): void
    {
        $mediaName = $media->getFileName();
        $allowedExtensions = ['jpg' => ['jpg', 'jpeg'], 'png' => ['png'], 'gif' => ['gif']];

        if (!rex_media::isImageType(rex_file::extension($mediaName)) || !\FriendsOfRedaxo\Mediaplace\CropperIntegration::isSupportedMedia($mediaName)) {
            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
            rex_response::sendJson(['error' => 'Unsupported media type']);
            return;
        }

        $user = rex::requireUser();

        $mediaPoolWidth = (int) $media->getWidth();
        $mediaPoolHeight = (int) $media->getHeight();

        $mediaSql = rex_sql::factory();
        $mediaSql->setQuery(
            'SELECT width, height FROM ' . rex::getTable('media') . ' WHERE filename = ? LIMIT 1',
            [$mediaName],
        );
        if ($mediaSql->getRows() > 0) {
            $dbWidth = (int) $mediaSql->getValue('width');
            $dbHeight = (int) $mediaSql->getValue('height');
            if ($dbWidth > 0 && $dbHeight > 0) {
                $mediaPoolWidth = $dbWidth;
                $mediaPoolHeight = $dbHeight;
            }
        }

        $defaultJpgQuality = max(0, min(100, (int) rex_config::get('cropper', 'default_jpg_quality', 100)));
        $showCompressionSettings = (bool) rex_config::get('cropper', 'show_compression_settings_in_mediapool', 1);
        $defaultPngCompression = max(0, min(9, (int) rex_config::get('cropper', 'default_png_compression', 9)));

        $pngIn = ('png' === $media->getExtension() && $user->isAdmin() && $showCompressionSettings) ? ' in' : '';
        $jpgIn = (\in_array($media->getExtension(), ['jpg', 'jpeg'], true) && $user->isAdmin() && $showCompressionSettings) ? ' in' : '';

        $jpgQuality = max(0, min(100, $defaultJpgQuality));
        $pngCompression = max(0, min(9, $defaultPngCompression));
        $newFileName = rex_escape(pathinfo($mediaName, PATHINFO_FILENAME));

        $fileMtime = @filemtime(rex_path::media($mediaName));
        $mtime = (false !== $fileMtime ? (string) $fileMtime : (string) time()) . uniqid('', true);

        $previewUrl = rex_url::backendPage('mediapool/cropper', [
            'media_name' => $mediaName,
            'cropper_preview' => 1,
        ], false);

        $fragment = new rex_fragment();
        $fragment->setVar('mediaUrl', $previewUrl);
        $fragment->setVar('media', $media);
        $fragment->setVar('mediaPoolWidth', $mediaPoolWidth);
        $fragment->setVar('mediaPoolHeight', $mediaPoolHeight);
        $fragment->setVar('mtime', $mtime);
        // cropper_panel.php liegt im fragments/-Verzeichnis des cropper-Addons,
        // nicht in unserem eigenen -- Pfad explizit registrieren statt zu kopieren.
        rex_fragment::addDirectory(rex_addon::get('cropper')->getPath('fragments/'));
        $panel = $fragment->parse('cropper_panel.php');

        $jpgQualityElement = '<div class="rex-range-input-group">'
            . '<input id="rex-js-rating-source-jpg-quality" type="range" min="0" max="100" step="1" value="' . $jpgQuality . '" />'
            . '<input class="form-control" id="rex-js-rating-text-jpg-quality" type="text" name="jpg_quality" value="' . $jpgQuality . '" />'
            . '</div>';
        $pngCompressionElement = '<div class="rex-range-input-group">'
            . '<input id="rex-js-rating-source-png-compression" type="range" min="0" max="9" step="1" value="' . $pngCompression . '" />'
            . '<input class="form-control" id="rex-js-rating-text-png-compression" type="text" name="png_compression" value="' . $pngCompression . '" />'
            . '</div>';

        $checkbox = '<label class="checkbox-inline checbox-switch switch-primary">'
            . '<input type="checkbox" name="create_new_image" id="create_new_image" checked />'
            . '<span></span>' . rex_i18n::msg('cropper_img_save_info') . '</label>';
        if (!\FriendsOfRedaxo\Mediaplace\CropperIntegration::canOverwrite()) {
            $checkbox = '<div class="nocheckbox"><input type="hidden" name="create_new_image" value="1" />' . rex_i18n::msg('cropper_img_save_info_nochoice') . '</div>';
        }

        $panel .= '<dl class="rex-form-group form-group"><dt><label>' . rex_i18n::msg('cropper_save_options') . '</label></dt><dd>' . $checkbox . '</dd></dl>';

        $panel .= '<div id="new_file_name" class="collapse in">'
            . '<dl class="rex-form-group form-group"><dt><label for="rex-mediapool-title">' . rex_i18n::msg('pool_filename') . '</label></dt><dd>'
            . '<div class="input-group">'
            . '<input class="form-control" type="text" name="new_file_name" value="' . $newFileName . '" />'
            . '<input type="hidden" name="new_file_extension" value="' . rex_escape($media->getExtension()) . '" />'
            . '<span class="input-group-addon">' . rex_escape($media->getExtension()) . '</span>'
            . '</div></dd></dl>';

        // Kategorie-Auswahl: kaskadierende Liste (MediaPermission) statt
        // klassischem rex_media_category_select -- konsistent mit dem Rest
        // von MediaPlace (siehe rex_api_mediaplace_categories::getFlatCategoryList()).
        $currentCategoryId = $media->getCategoryId();
        if (!\FriendsOfRedaxo\Mediaplace\MediaPermission::hasCategoryAccess($currentCategoryId)) {
            $currentCategoryId = 0;
        }
        $catOptions = '<option value="0"' . (0 === $currentCategoryId ? ' selected' : '') . '>' . rex_i18n::msg('pool_kats_no') . '</option>';
        foreach (rex_api_mediaplace_categories::getFlatCategoryList() as $cat) {
            $catOptions .= '<option value="' . $cat['id'] . '"' . ($cat['id'] === $currentCategoryId ? ' selected' : '') . '>' . rex_escape($cat['label']) . '</option>';
        }
        $panel .= '<dl class="rex-form-group form-group"><dt><label for="mp3-crop-category">' . rex_i18n::msg('pool_file_category') . '</label></dt><dd>'
            . '<select class="form-control selectpicker" id="mp3-crop-category" name="rex_file_category">' . $catOptions . '</select>'
            . '</dd></dl></div>';

        if ($showCompressionSettings) {
            $panel .= '<div class="collapse' . $jpgIn . '"><dl class="rex-form-group form-group"><dt><label>' . rex_i18n::msg('cropper_jpg_quality') . '</label></dt><dd>' . $jpgQualityElement . '</dd></dl></div>';
            $panel .= '<div class="collapse' . $pngIn . '"><dl class="rex-form-group form-group"><dt><label>' . rex_i18n::msg('cropper_png_compression') . '</label></dt><dd>' . $pngCompressionElement . '</dd></dl></div>';
        } else {
            $panel .= '<input type="hidden" name="jpg_quality" value="' . $defaultJpgQuality . '" />';
            $panel .= '<input type="hidden" name="png_compression" value="' . $defaultPngCompression . '" />';
        }

        // METAINFO-Felder (med_*) des Originals als versteckte Felder mitschicken,
        // exakt wie cropper's eigene Seite -- sonst wuerde das metainfo-Addon sie
        // beim Speichern des zugeschnittenen Bildes leeren.
        $metaHiddenFields = '';
        if (rex_addon::get('metainfo')->isAvailable()) {
            $sql = rex_sql::factory();
            $prefix = $sql->escapeLikeWildcards('med_') . '%';
            $metaFields = $sql->getArray(
                'SELECT name, type_id, attributes FROM ' . rex::getTable('metainfo_field') . ' WHERE name LIKE :prefix',
                ['prefix' => $prefix],
            );
            foreach ($metaFields as $metaField) {
                $name = (string) $metaField['name'];
                $stored = (string) $media->getValue($name);
                $typeId = (int) $metaField['type_id'];
                $attributes = (string) $metaField['attributes'];
                $isMulti = 6 === $typeId || (7 === $typeId && str_contains($attributes, 'multiple'));
                if ($isMulti && '' !== $stored) {
                    foreach (array_filter(explode('|', $stored), static fn ($v) => '' !== $v) as $part) {
                        $metaHiddenFields .= '<input type="hidden" name="' . rex_escape($name) . '[]" value="' . rex_escape($part) . '" />';
                    }
                } else {
                    $metaHiddenFields .= '<input type="hidden" name="' . rex_escape($name) . '" value="' . rex_escape($stored) . '" />';
                }
            }
        }

        $buttons = '<div class="rex-form-panel-footer"><button class="btn btn-apply" type="submit" value="1" name="btn_save">' . rex_i18n::msg('form_save') . '</button></div>';

        $html = '<form class="mp3-crop-form" data-filename="' . rex_escape($mediaName) . '">'
            . '<input type="hidden" name="file_id" value="' . $media->getId() . '" />'
            . '<input type="hidden" name="media_name" value="' . rex_escape($mediaName) . '" />'
            . $metaHiddenFields
            . $panel . $buttons
            . '</form>';

        rex_response::sendJson(['success' => true, 'html' => $html]);
    }

    private function handleSave(rex_media $media): void
    {
        // create_new_image-Checkbox-Semantik ist "als neue Kopie speichern":
        // !create_new_image == ueberschreiben.
        $wantsOverwrite = !rex_post('create_new_image', 'boolean', false);
        if ($wantsOverwrite && !\FriendsOfRedaxo\Mediaplace\CropperIntegration::canOverwrite()) {
            rex_response::setStatus(rex_response::HTTP_FORBIDDEN);
            rex_response::sendJson(['error' => 'Permission denied (overwrite)']);
            return;
        }

        $targetCategoryId = rex_post('rex_file_category', 'int', $media->getCategoryId());
        if (!\FriendsOfRedaxo\Mediaplace\MediaPermission::hasCategoryAccess($targetCategoryId)) {
            rex_response::setStatus(rex_response::HTTP_FORBIDDEN);
            rex_response::sendJson(['error' => 'Permission denied (target category)']);
            return;
        }

        $parameter = $_POST;
        $parameter['media_name'] = $media->getFileName();

        try {
            $executor = new \FriendsOfRedaxo\Cropper\Cropper\CropperExecutor($parameter);
            $result = $executor->crop();
        } catch (\Throwable $e) {
            rex_response::setStatus(rex_response::HTTP_INTERNAL_SERVER_ERROR);
            rex_response::sendJson(['error' => $e->getMessage()]);
            return;
        }

        if (!$result['ok'] || !$result['media'] instanceof rex_media) {
            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
            rex_response::sendJson(['error' => rex_i18n::msg($result['msg'])]);
            return;
        }

        rex_response::sendJson([
            'success' => true,
            'filename' => $result['media']->getFileName(),
        ]);
    }
}
