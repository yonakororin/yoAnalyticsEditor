<?php
// webroot/database/classes/controllers/DataController.php

require_once __DIR__ . '/BaseController.php';

class DataController extends BaseController {

    /**
     * アクセスログから利用可能な日付一覧を取得
     */
    public function actionGetDates() {
        $data = $this->dbExecutor->execute("SELECT DISTINCT DATE(timestamp) as date FROM accesslog ORDER BY date DESC");
        return ['dates' => array_column($data, 'date')];
    }

    /**
     * 選択した日付に基づいて一時的なソーステーブルを作成
     */
    public function actionCreateSource() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Method not allowed');
        $input = $this->getInputJson();
        $dates = $input['dates'] ?? [];
        if (empty($dates)) throw new Exception('No dates provided');

        $dateStr = implode(',', array_map(function($d) {
            return "'" . addslashes($d) . "'";
        }, $dates));

        $tableName = 'webapp_cache_' . uniqid();
        $sql = "CREATE TABLE $tableName AS 
                SELECT DISTINCT user_id 
                FROM accesslog 
                WHERE DATE(timestamp) IN ($dateStr);
                ALTER TABLE $tableName ADD PRIMARY KEY (user_id);";
        
        $this->dbExecutor->execute($sql);
        return ['table' => $tableName];
    }

    /**
     * 指定テーブルの内容をCSVとしてエクスポート (ダウンロード用)
     */
    public function actionExportCsv() {
        $input = $this->getInputJson();
        $table = $input['table'] ?? '';
        $path = $input['path'] ?? '';
        
        if (empty($table) || empty($path)) throw new Exception('Table and path are required');
        
        // パス検証
        $fullPath = $this->validatePath($path);
        if (!preg_match('/^[a-zA-Z0-9_.]+$/', $table)) throw new Exception('Invalid table name');

        $rows = $this->dbExecutor->execute("SELECT * FROM $table", 'mngtools');
        if (empty($rows)) throw new Exception('Table is empty');

        $fp = fopen($fullPath, 'w');
        if (!$fp) throw new Exception('Could not open file for writing');

        fputcsv($fp, array_keys($rows[0]));
        foreach ($rows as $row) {
            fputcsv($fp, $row);
        }
        fclose($fp);
        
        return ['success' => true, 'count' => count($rows), 'path' => $fullPath];
    }

    /**
     * データのエクスポート処理 (ファイル保存またはGoogle Sheet連携)
     * ストリーミング処理によりメモリ効率化
     */
    public function actionExportData() {
        $data = $this->getInputJson();
        $table = $data['table'] ?? '';
        $type = $data['type'] ?? 'file';

        if (empty($table)) throw new Exception('Table required');
        
        $tempFile = tempnam(sys_get_temp_dir(), 'export_');
        
        try {
            // ストリーミングCSV作成
            $rowCount = $this->dbExecutor->streamToCsv($table, $tempFile, 'mngtools');
            
            if ($type === 'file') {
                $path = $data['path'] ?? 'export.csv';
                $fullPath = $this->validatePath($path);
                
                Logger::log("Export: Target path: $path / Full: $fullPath");
                
                if (!copy($tempFile, $fullPath)) {
                    $err = error_get_last();
                    throw new Exception('Failed to write to destination: ' . ($err['message'] ?? 'Unknown error'));
                }
                
                return ['success' => true, 'count' => $rowCount - 1, 'path' => $path]; // -1 header

            } elseif ($type === 'google_sheet') {
                $spreadsheetId = $data['spreadsheetId'] ?? '';
                $sheetName = $data['sheetName'] ?? '';
                $credentialsPath = $this->projectRoot . '/config/service_account.json';
                
                if (empty($spreadsheetId) || empty($sheetName)) throw new Exception('Spreadsheet details required');
                if (!file_exists($credentialsPath)) throw new Exception('Service account credentials not found');
                
                $scriptPath = $this->projectRoot . '/db/upload_to_sheet.py';
                $cmd = "python3 " . escapeshellarg($scriptPath) . 
                       " --csv " . escapeshellarg($tempFile) . 
                       " --creds " . escapeshellarg($credentialsPath) . 
                       " --id " . escapeshellarg($spreadsheetId) . 
                       " --sheet " . escapeshellarg($sheetName);
                
                $output = [];
                $returnVar = 0;
                exec($cmd . " 2>&1", $output, $returnVar);

                if ($returnVar !== 0) {
                    throw new Exception("Python Error: " . implode("\n", $output));
                }
                
                return ['success' => true, 'output' => implode("\n", $output)];
            } else {
                throw new Exception('Unknown export type');
            }
        } finally {
            if (file_exists($tempFile)) unlink($tempFile);
        }
    }

    /**
     * CSV/TSVファイルのインポート処理
     * 自動的に型推論を行いテーブルを作成してデータを挿入する
     */
    public function actionImportFile() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Method not allowed');
        $input = $this->getInputJson();
        
        $paths = $input['paths'] ?? [];
        if (empty($paths) && !empty($input['path'])) $paths = [$input['path']];
        
        $hasHeader = $input['has_header'] ?? true;
        
        // ファイル検証
        $realPaths = [];
        foreach ($paths as $p) {
            $realPaths[] = $this->validatePath($p, true);
        }
        if (empty($realPaths)) throw new Exception('No valid files');

        // 型推論とテーブル作成のロジック
        return $this->processFileImport($realPaths, $hasHeader, $input['index_column'] ?? '');
    }

    private function processFileImport($filePaths, $hasHeader, $indexColumn) {
        $firstFile = $filePaths[0];
        
        // 1. ヘッダー検出
        $handle = fopen($firstFile, 'r');
        $line = fgets($handle);
        fclose($handle);
        
        $delimiter = (strpos($line, "\t") !== false) ? "\t" : ",";
        $headers = [];
        
        if ($hasHeader) {
            $rawHeaders = str_getcsv($line, $delimiter);
            $headers = array_map(function($h) {
                return preg_replace('/[^a-zA-Z0-9_]/', '_', trim($h));
            }, $rawHeaders);
        } else {
            $firstRow = str_getcsv($line, $delimiter);
            for ($i = 0; $i < count($firstRow); $i++) $headers[] = 'Col' . $i;
        }

        // 2. 型推論
        $colTypes = array_fill(0, count($headers), 'INT');
        $handle = fopen($firstFile, 'r');
        if ($hasHeader) fgets($handle);
        
        $limit = 1000;
        $scanned = 0;
        
        while (($row = fgetcsv($handle, 0, $delimiter)) !== false && $scanned < $limit) {
            if (count($row) !== count($headers)) continue;
            $scanned++;
            
            foreach ($row as $i => $val) {
                $val = trim($val);
                if ($val === '' || strtolower($val) === 'null') continue;
                
                $cType = $colTypes[$i];
                if ($cType === 'TEXT') continue;
                
                if (!is_numeric($val)) {
                    $colTypes[$i] = 'TEXT';
                } elseif (strpos($val, '.') !== false) {
                    if ($cType === 'INT') $colTypes[$i] = 'DOUBLE';
                }
            }
        }
        fclose($handle);

        // 3. テーブル作成
        $tableName = 'webapp_cache_file_' . uniqid();
        $colDefs = [];
        foreach ($headers as $i => $h) {
            $type = ($colTypes[$i] === 'INT') ? 'BIGINT' : $colTypes[$i];
            $colDefs[] = "`$h` $type";
        }
        
        $this->dbExecutor->execute("CREATE TABLE $tableName (" . implode(', ', $colDefs) . ")");

        // 4. データ挿入
        foreach ($filePaths as $fPath) {
            $this->importSingleFile($fPath, $tableName, $delimiter, $hasHeader, count($headers));
        }

        // 5. インデックス作成 (既存ロジック再利用)
        // ここでは簡易的に Query アクションと同じロジックを流用せず再実装 (contextが違うため)
        if ($indexColumn !== '') {
            $this->handleIndexing($tableName, $indexColumn, [array_flip($headers)]); // Dummy row just for headers keys
        }

        return ['success' => true, 'table' => $tableName];
    }

    private function importSingleFile($path, $tableName, $delimiter, $skipHeader, $expectedCols) {
        $handle = fopen($path, 'r');
        if($skipHeader) fgets($handle);
        
        $batchSize = 1000;
        $values = [];
        
        while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
            if (count($row) !== $expectedCols) continue;
            
            $vals = array_map(function($v) { return "'" . addslashes($v) . "'"; }, $row);
            $values[] = "(" . implode(',', $vals) . ")";
            
            if (count($values) >= $batchSize) {
                $this->dbExecutor->execute("INSERT INTO $tableName VALUES " . implode(',', $values));
                $values = [];
            }
        }
        
        if (!empty($values)) {
            $this->dbExecutor->execute("INSERT INTO $tableName VALUES " . implode(',', $values));
        }
        fclose($handle);
    }
    
    private function handleIndexing($tableName, $indexColumn, $rows) {
        if ($indexColumn === '' || empty($rows)) return;
        
        $headers = array_keys($rows[0]);
        $targetCol = '';
        
        if (is_numeric($indexColumn)) {
            $idx = intval($indexColumn);
            if (isset($headers[$idx])) $targetCol = $headers[$idx];
        } elseif (in_array($indexColumn, $headers)) {
            $targetCol = $indexColumn;
        }
        
        if ($targetCol) {
            $indexName = 'idx_' . $targetCol;
            // 簡易的にTEXTと仮定
            $alterSql = "ALTER TABLE $tableName ADD INDEX $indexName (`$targetCol`(255))";
            
            try {
                $this->dbExecutor->execute($alterSql);
            } catch (Exception $e) {
                // Ignore
            }
        }
    }
}
