<?php
// webroot/database/classes/nodes/FileNodeProcessor.php

require_once __DIR__ . '/NodeProcessor.php';

/**
 * FileNode プロセッサ
 * 
 * 役割:
 * - CSVやTSVなどのテキストファイルを読み込み、一時データベーステーブルにインポートする。
 * - 複数のファイル読み込みや、CLI引数（--file）による読み込みファイルの動的な差し替えに対応する。
 * - ヘッダー有無に基づくカラム名の自動生成や型推論（簡易）を行う。
 */
class FileNodeProcessor extends NodeProcessor {
    public function process($node, $nodeId, $connections) {
        $override = $this->controller->getNextFileOverride();
        $isOverridden = false;
        $targetFileStr = "";

        if ($override) {
            $targetFileStr = $override;
            $this->log("-> Override (Index {$this->controller->fileOverrideIdx}): Using file(s) $targetFileStr");
            $this->controller->incrementFileOverride();
            $isOverridden = true;
        } else {
            // Support multiple files (new format) or single file (legacy)
            $selectedFiles = $node['selectedFiles'] ?? ($node['data']['selectedFiles'] ?? []);
            if (!empty($selectedFiles) && is_array($selectedFiles)) {
                $targetFileStr = implode(',', $selectedFiles);
            } else {
                $targetFileStr = $node['selectedFile'] ?? ($node['data']['selectedFile'] ?? '');
            }
        }

        if (!$targetFileStr) {
            $this->log("-> Skipped: No file selected.");
            return;
        }

        $rawFiles = explode(",", $targetFileStr);
        $validFiles = [];

        foreach ($rawFiles as $f) {
            $f = trim($f);
            if (!$f) continue;

            if ($isOverridden) {
                $importPath = $this->projectRoot . '/' . trim($f, '/');
                if (!file_exists($importPath)) {
                    if (file_exists($f)) $importPath = $f;
                    else throw new Exception("File override not found: $f");
                }
                $validFiles[] = $importPath;
            } else {
                $importPath = $this->projectRoot . '/' . trim($f, '/');
                if (!file_exists($importPath)) {
                    $currentPath = $node['currentPath'] ?? ($node['data']['currentPath'] ?? '');
                    $importPath2 = $this->projectRoot . '/' . trim($currentPath, '/') . '/' . trim($f, '/');
                    if (file_exists($importPath2)) $importPath = $importPath2;
                    else throw new Exception("File not found: $f");
                }
                $validFiles[] = $importPath;
            }
        }

        if (empty($validFiles)) throw new Exception("No valid files found.");

        $hasHeader = $node['hasHeader'] ?? ($node['data']['hasHeader'] ?? true);
        $tableName = 'webapp_cache_cli_file_' . uniqid();

        $this->createTableFromFile($validFiles[0], $tableName, $hasHeader);

        $totalCount = 0;
        foreach ($validFiles as $file) {
            $totalCount += $this->importFileToTable($file, $tableName, $hasHeader);
        }

        $this->log("-> Imported [" . implode(', ', $rawFiles) . "] ($totalCount rows) into Table: $tableName");
        $this->controller->setRuntimeData($nodeId, $tableName);
    }

    private function createTableFromFile($file, $tableName, $hasHeader) {
        $fp = fopen($file, 'r');
        if (!$fp) throw new Exception("Cannot open file: $file");

        $line = file_get_contents($file, false, null, 0, 1000);
        $delimiter = (substr_count($line, "\t") > substr_count($line, ",")) ? "\t" : ",";
        
        fseek($fp, 0);
        $firstRow = fgetcsv($fp, 0, $delimiter);
        
        $headers = [];
        if ($hasHeader) {
            foreach ($firstRow as $idx => $col) {
                $headers[] = preg_replace('/[^a-zA-Z0-9_]/', '', $col) ?: "col_$idx";
            }
        } else {
            foreach ($firstRow as $idx => $val) $headers[] = "col_$idx";
        }

        $colsDef = [];
        foreach ($headers as $h) {
            $h = preg_replace('/[^a-zA-Z0-9_]/', '', $h) ?: "col_unknown";
            $colsDef[] = "`$h` TEXT";
        }
        
        $sql = "CREATE TABLE `$tableName` (" . implode(", ", $colsDef) . ")";
        $this->dbExecutor->execute("DROP TABLE IF EXISTS `$tableName`");
        $this->dbExecutor->execute($sql);
        
        fclose($fp);
    }

    private function importFileToTable($file, $tableName, $hasHeader) {
        $fp = fopen($file, 'r');
        if (!$fp) return 0;

        $line = file_get_contents($file, false, null, 0, 1000);
        $delimiter = (substr_count($line, "\t") > substr_count($line, ",")) ? "\t" : ",";
        fseek($fp, 0);

        if ($hasHeader) fgetcsv($fp, 0, $delimiter);

        $batchSize = 1000;
        $buffer = [];
        $count = 0;
        
        while (($row = fgetcsv($fp, 0, $delimiter)) !== false) {
            if (count($row) === 1 && $row[0] === null) continue;

            $vals = array_map(function($v) { return "'" . addslashes($v) . "'"; }, $row);
            $buffer[] = "(" . implode(",", $vals) . ")";

            if (count($buffer) >= $batchSize) {
                $this->dbExecutor->execute("INSERT INTO `$tableName` VALUES " . implode(",", $buffer));
                $buffer = [];
            }
            $count++;
        }
        
        if (!empty($buffer)) {
            $this->dbExecutor->execute("INSERT INTO `$tableName` VALUES " . implode(",", $buffer));
        }
        fclose($fp);
        return $count;
    }
}
