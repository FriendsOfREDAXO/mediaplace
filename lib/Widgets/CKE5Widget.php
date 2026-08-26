<?php

namespace FriendsOfRedaxo\Mediaplace\Widgets;

use FriendsOfRedaxo\Mediaplace\MetainfoWidget;

/**
 * CKEditor5 WYSIWYG widget (requires cke5 addon).
 * Supports multiple languages. Same value shape as TinyMceWidget -- both
 * store plain HTML, only the editing UI (mediapool3.js) differs.
 */
class CKE5Widget extends MetainfoWidget
{
    public function normalizeValue(mixed $value): mixed
    {
        if (is_string($value)) {
            return trim($value);
        }
        if (is_array($value)) {
            return array_filter(array_map(fn($v) => is_string($v) ? trim($v) : $v, $value));
        }
        return $value;
    }
}
