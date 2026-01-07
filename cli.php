<?php
// webroot/database/cli.php

// 共通クラスの読み込み
require_once __DIR__ . '/classes/CliController.php';

// エントリーポイント
try {
    $cli = new CliController();
    $cli->run($argv);
} catch (Exception $e) {
    echo "[" . date('Y-m-d H:i:s') . "] FATAL ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
