<?php
// webroot/database/classes/Logger.php

class Logger {
    const LOG_PATH = '/var/log/mngtools/api_debug.log';

    public static function log($message) {
        $timestamp = date('Y-m-d H:i:s');
        $pid = getmypid();
        $entry = "[$timestamp] [$pid] $message\n";
        @file_put_contents(self::LOG_PATH, $entry, FILE_APPEND);
    }
}
