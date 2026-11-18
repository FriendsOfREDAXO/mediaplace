<?php

// Läuft beim Update über den Installer (install.php nicht) – noch im Kontext der alten Version, daher keine
// Klassen aus lib/, nur eigenständige Dateien aus dem neuen Paket.

// filename-Spalten an rex_media angleichen (Collation), siehe install/align_filename_collation.php
(require __DIR__ . '/install/align_filename_collation.php')();
