<?php

/**
 * Manuelles Vorwaermen ALLER Grid-Vorschaubilder, mit Fortschrittsanzeige.
 * Siehe Api\ThumbWarmup fuer die Batch-Logik und lib/ThumbWarmupCronjob.php
 * fuer das automatische, periodische Pendant.
 */

$apiUrl = rex_url::backendController(['rex-api-call' => 'mediaplace_thumb_warmup']);

ob_start();
?>
<p><?php echo rex_i18n::msg('mediaplace_thumb_warmup_intro'); ?></p>

<div id="mp3-warmup-app">
    <button type="button" id="mp3-warmup-start" class="btn btn-save"><i class="fa-solid fa-fire"></i> <?php echo rex_i18n::msg('mediaplace_thumb_warmup_start'); ?></button>
    <button type="button" id="mp3-warmup-cancel" class="btn btn-abort" style="display:none"><?php echo rex_i18n::msg('mediaplace_thumb_warmup_cancel'); ?></button>

    <div id="mp3-warmup-progress-wrap" style="display:none; margin-top:20px;">
        <div style="margin-bottom:6px;">
            <strong><?php echo rex_i18n::msg('mediaplace_thumb_warmup_images'); ?></strong>
            <span id="mp3-warmup-image-text"></span>
        </div>
        <div class="progress" style="margin-bottom:20px;">
            <div id="mp3-warmup-image-bar" class="progress-bar" role="progressbar" style="width:0%"></div>
        </div>

        <div id="mp3-warmup-video-wrap" style="display:none;">
            <div style="margin-bottom:6px;">
                <strong><?php echo rex_i18n::msg('mediaplace_thumb_warmup_videos'); ?></strong>
                <span id="mp3-warmup-video-text"></span>
            </div>
            <div class="progress">
                <div id="mp3-warmup-video-bar" class="progress-bar" role="progressbar" style="width:0%"></div>
            </div>
        </div>
    </div>

    <div id="mp3-warmup-done" class="alert alert-success" style="display:none; margin-top:20px;">
        <?php echo rex_i18n::msg('mediaplace_thumb_warmup_done'); ?>
    </div>
</div>
<?php
$content = ob_get_clean();

$fragment = new rex_fragment();
$fragment->setVar('title', rex_i18n::msg('mediaplace_thumb_warmup_legend'));
$fragment->setVar('body', $content, false);
echo $fragment->parse('core/page/section.php');
?>
<script>
(function () {
    var API_URL = <?php echo json_encode($apiUrl); ?>;
    var TXT_OF = <?php echo json_encode(rex_i18n::msg('mediaplace_thumb_warmup_of')); ?>;

    var startBtn = document.getElementById('mp3-warmup-start');
    var cancelBtn = document.getElementById('mp3-warmup-cancel');
    var progressWrap = document.getElementById('mp3-warmup-progress-wrap');
    var videoWrap = document.getElementById('mp3-warmup-video-wrap');
    var doneBox = document.getElementById('mp3-warmup-done');
    var imageBar = document.getElementById('mp3-warmup-image-bar');
    var imageText = document.getElementById('mp3-warmup-image-text');
    var videoBar = document.getElementById('mp3-warmup-video-bar');
    var videoText = document.getElementById('mp3-warmup-video-text');

    if (!startBtn) return;

    var cancelled = false;

    function apiCall(body) {
        return fetch(API_URL, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json();
        });
    }

    function setProgress(bar, textEl, offset, total) {
        var pct = total > 0 ? Math.min(100, Math.round((offset / total) * 100)) : 100;
        bar.style.width = pct + '%';
        textEl.textContent = offset + ' ' + TXT_OF + ' ' + total;
    }

    // Sequentiell, ein Batch nach dem anderen -- kein Promise.all/paralleles
    // Feuern: genau die vielen gleichzeitigen Media-Manager-Anfragen sollen
    // hiermit ja vermieden werden (siehe Klassenkommentar Api\ThumbWarmup).
    function warmType(type, bar, textEl) {
        var offset = 0;
        function step() {
            if (cancelled) return Promise.resolve();
            return apiCall({ action: 'warm_batch', type: type, offset: offset }).then(function (result) {
                offset = result.next_offset;
                setProgress(bar, textEl, offset, result.total);
                if (result.done || cancelled) return;
                return step();
            });
        }
        return step();
    }

    startBtn.addEventListener('click', function () {
        cancelled = false;
        startBtn.disabled = true;
        startBtn.style.display = 'none';
        cancelBtn.style.display = '';
        progressWrap.style.display = '';
        doneBox.style.display = 'none';

        apiCall({ action: 'count' }).then(function (counts) {
            setProgress(imageBar, imageText, 0, counts.image.total);
            if (counts.video.active) {
                videoWrap.style.display = '';
                setProgress(videoBar, videoText, 0, counts.video.total);
            }
            return warmType('image', imageBar, imageText).then(function () {
                if (cancelled || !counts.video.active) return;
                return warmType('video', videoBar, videoText);
            });
        }).then(function () {
            cancelBtn.style.display = 'none';
            startBtn.style.display = '';
            startBtn.disabled = false;
            if (!cancelled) doneBox.style.display = '';
        });
    });

    cancelBtn.addEventListener('click', function () {
        cancelled = true;
    });
})();
</script>
