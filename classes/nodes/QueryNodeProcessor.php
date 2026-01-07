<?php
// webroot/database/classes/nodes/QueryNodeProcessor.php

require_once __DIR__ . '/NodeProcessor.php';

/**
 * QueryNode プロセッサ
 * 
 * 役割:
 * - 前段のノード（テーブルやファイルインポート結果）を入力としてSQLクエリを実行する。
 * - SQL内のマクロ（{input}, {var}など）を実際のテーブル名や変数値に置換する。
 * - 実行結果を新しい一時テーブルとして保存し、後続のノードに渡す。
 */
class QueryNodeProcessor extends NodeProcessor {
    public function process($node, $nodeId, $connections) {
        $sql = $node['sql'] ?? ($node['data']['sql'] ?? '');

        $sql = $node['sql'] ?? ($node['data']['sql'] ?? '');

        // Override SQL from file if argument provided via --file AND SQL is empty
        // This prevents QueryNodes with defined SQL from consuming file overrides intended for FileNodes
        if (empty($sql)) {
            $override = $this->controller->getNextFileOverride();
            if ($override) {
                $path = $this->projectRoot . '/' . trim($override, '/');
                if (!file_exists($path)) {
                    if (file_exists($override)) {
                        $path = $override;
                    } else {
                        throw new Exception("Override SQL file not found: $override");
                    }
                }
                
                $this->log("-> Override: Loading SQL from $path");
                $sql = file_get_contents($path);
                $this->controller->incrementFileOverride();
            }
        }

        if (empty($sql)) return;

        $inputs = $this->resolveInputs($nodeId, $connections);

        // Replace macros
        $resolvedSql = $sql;
        if (isset($inputs['input'])) $resolvedSql = str_replace('{input}', $inputs['input'], $resolvedSql);
        foreach ($inputs as $key => $val) $resolvedSql = str_replace("{{$key}}", $val, $resolvedSql);
        
        // Vars
        $vars = $this->controller->getVars();
        foreach ($vars as $key => $val) $resolvedSql = str_replace("{{$key}}", $val, $resolvedSql);

        // Validation
        if (preg_match('/\{[a-zA-Z0-9_]+\}/', $resolvedSql)) {
            $this->log("-> ERROR: Unresolved macros in SQL. Sources missing?");
            return;
        }

        $outTable = 'webapp_cache_cli_' . uniqid();
        $createSql = "CREATE TABLE $outTable AS $resolvedSql";
        $this->log("-> Executing SQL...");
        
        $this->dbExecutor->execute($createSql);
        $this->controller->setRuntimeData($nodeId, $outTable);
        $this->log("-> Created Table: $outTable");
    }

    private function resolveInputs($nodeId, $connections) {
        $inputs = [];
        foreach ($connections as $c) {
            if ($c['to'] === $nodeId) {
                $socket = $c['toSocketName'] ?? 'input';
                $data = $this->controller->getRuntimeData($c['from']);
                if ($data) {
                    $inputs[$socket] = $data;
                }
            }
        }
        return $inputs;
    }
}
