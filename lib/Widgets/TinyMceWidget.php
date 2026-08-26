<?php

namespace FriendsOfRedaxo\Mediaplace\Widgets;

use FriendsOfRedaxo\Mediaplace\MetainfoWidget;

/**
 * TinyMCE WYSIWYG widget (requires TinyMCE addon).
 * Supports multiple languages.
 */
class TinyMceWidget extends MetainfoWidget
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
