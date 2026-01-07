<?php
// webroot/database/classes/nodes/TableNodeProcessor.php

require_once __DIR__ . '/NodeProcessor.php';

/**
 * TableNode プロセッサ
 * 
 * 役割:
 * - 既存のデータベーステーブルを参照として設定する。
 * - CLI引数（--db, --table）で指定されたオーバーライドを適用して、
 *   本来の設定とは別のテーブルを動的に参照先に切り替える処理を行う。
 */
class TableNodeProcessor extends NodeProcessor {
    public function process($node, $nodeId, $connections) {
        $dbOverride = $this->controller->getNextDbOverride();
        $tableOverride = $this->controller->getNextTableOverride();

        $db = $dbOverride ?? ($node['selectedDb'] ?? ($node['data']['selectedDb'] ?? 'mngtools'));
        $table = $tableOverride ?? ($node['selectedTable'] ?? ($node['data']['selectedTable'] ?? ''));

        if ($db && $table) {
            $ref = "$db.$table";
            $this->controller->setRuntimeData($nodeId, $ref);
            
            $msg = "-> Table Reference: $ref";
            if ($tableOverride || $dbOverride) $msg .= " (Overridden)";
            $this->log($msg);
            
            // Increment override counter ONLY if used
            if ($tableOverride) $this->controller->incrementTableOverride();
        }
    }
}
