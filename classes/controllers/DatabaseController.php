<?php
// webroot/database/classes/controllers/DatabaseController.php

require_once __DIR__ . '/BaseController.php';

class DatabaseController extends BaseController {

    /**
     * データベース一覧を取得 (システムDBを除く)
     */
    public function actionGetDatabases() {
        $sql = "SELECT schema_name as db FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')";
        $data = $this->dbExecutor->execute($sql, 'information_schema');
        return ['databases' => array_column($data, 'db')];
    }

    /**
     * 指定されたDB内のテーブル一覧を取得
     */
    public function actionGetTables() {
        $db = $_GET['db'] ?? '';
        if (empty($db)) throw new Exception('No database provided');
        
        $data = $this->dbExecutor->execute("SHOW TABLES", $db);
        $tables = [];
        foreach ($data as $row) {
            $tables[] = reset($row);
        }
        return ['tables' => $tables];
    }

    /**
     * SQLクエリを実行する
     * SELECT文の場合は一時テーブルを作成して結果をキャッシュ・インデックス化する
     */
    public function actionQuery() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Method not allowed');
        $input = $this->getInputJson();
        $sql = $input['sql'] ?? '';

        $trimmedSql = trim($sql);
        $isSelect = stripos($trimmedSql, 'SELECT') === 0;

        // 安全性チェック
        if (!$isSelect && stripos($trimmedSql, 'SHOW') !== 0 && stripos($trimmedSql, 'DESCRIBE') !== 0) {
            throw new Exception('Only SELECT/SHOW/DESCRIBE queries allowed');
        }

        if ($isSelect) {
            // 結果を実体化 (Materialize)
            $tableName = 'webapp_cache_' . uniqid();
            $cleanSql = rtrim($trimmedSql, ';');
            $createSql = "CREATE TABLE $tableName AS $cleanSql";
            
            $this->dbExecutor->execute($createSql);
            
            // プレビュー取得
            $rows = $this->dbExecutor->execute("SELECT * FROM $tableName LIMIT 500");
            
            // インデックス作成処理
            $this->handleIndexing($tableName, $input['index_column'] ?? '', $rows);
            
            // 件数取得
            $countRes = $this->dbExecutor->execute("SELECT COUNT(*) as cnt FROM $tableName");
            $totalRows = $countRes[0]['cnt'] ?? 0;
            
            return ['rows' => $rows, 'table' => $tableName, 'total_rows' => $totalRows];
        } else {
            // 非実体化クエリ (SHOW, DESCRIBE)
            $rows = $this->dbExecutor->execute($sql);
            return ['rows' => $rows];
        }
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
            $alterSql = "ALTER TABLE $tableName ADD INDEX $indexName (`$targetCol`)";
            Logger::log("Action: query - Adding index: $alterSql");
            
            try {
                $this->dbExecutor->execute($alterSql);
            } catch (Exception $e) {
                // BLOB/TEXTエラーのリトライ
                $msg = $e->getMessage();
                if (strpos($msg, 'BLOB/TEXT column') !== false && strpos($msg, 'without a key length') !== false) {
                    Logger::log("Action: query - Index retrying with prefix.");
                    $this->dbExecutor->execute("ALTER TABLE $tableName ADD INDEX $indexName (`$targetCol`(255))");
                } else {
                    Logger::log("Action: query - Failed to add index: $msg");
                }
            }
        }
    }

    /**
     * 一時テーブル (webapp_cache_*) をクリーンアップする
     */
    public function actionCleanup() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Method not allowed');
        
        $targetDb = 'mngtools';
        Logger::log("ACTION: cleanup started");
        
        $tablesData = $this->dbExecutor->execute("SHOW TABLES", $targetDb);
        $tablesToDrop = [];
        
        foreach ($tablesData as $row) {
            $table = reset($row);
            if (strpos($table, 'webapp_cache_') === 0) {
                $tablesToDrop[] = "`" . $table . "`";
            }
        }
        
        $count = count($tablesToDrop);
        if ($count > 0) {
            Logger::log("Cleanup: Dropping tables: " . implode(',', $tablesToDrop));
            $sql = "DROP TABLE IF EXISTS " . implode(", ", $tablesToDrop);
            $this->dbExecutor->execute($sql, $targetDb);
        } else {
            Logger::log("Cleanup: No tables to drop.");
        }
        
        return ['count' => $count, 'dropped' => $tablesToDrop];
    }

    /**
     * テーブルのカラム情報を取得
     */
    public function actionGetColumns() {
        $db = $_GET['db'] ?? 'mngtools';
        $table = $_GET['table'] ?? '';
        
        if (empty($table)) throw new Exception('No table provided');
        if (!preg_match('/^[a-zA-Z0-9_.]+$/', $table)) throw new Exception('Invalid table name');
        
        $data = $this->dbExecutor->execute("SHOW COLUMNS FROM $table", $db);
        $columns = [];
        foreach ($data as $row) {
            $columns[] = $row['Field'] ?? reset($row);
        }
        return ['columns' => $columns];
    }

    /**
     * テーブルの詳細情報（作成日時、行数など）を取得
     */
    public function actionGetTableDetails() {
        $db = $_GET['db'] ?? '';
        if (empty($db)) throw new Exception('Database required');
        
        $sql = "SELECT TABLE_NAME, CREATE_TIME, UPDATE_TIME, TABLE_ROWS 
                FROM information_schema.tables 
                WHERE TABLE_SCHEMA = '" . addslashes($db) . "'";
        $rows = $this->dbExecutor->execute($sql, 'information_schema');
        return ['tables' => $rows];
    }

    /**
     * テーブル定義 (CREATE TABLE文) を取得
     */
    public function actionGetTableDefinition() {
        $db = $_GET['db'] ?? '';
        $table = $_GET['table'] ?? '';
        
        if (empty($db) || empty($table)) throw new Exception('DB and Table required');

        $rows = $this->dbExecutor->execute("SHOW CREATE TABLE `$table`", $db);
        $def = '';
        if (!empty($rows)) {
            $row = $rows[0];
            foreach ($row as $key => $val) {
                if (stripos($key, 'Create Table') !== false || stripos($key, 'Create View') !== false) {
                    $def = $val;
                    break;
                }
            }
        }
        return ['definition' => $def];
    }

    /**
     * 指定されたテーブルを一括削除
     */
    public function actionDropTables() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Method not allowed');
        $input = $this->getInputJson();
        $db = $input['db'] ?? '';
        $tables = $input['tables'] ?? [];
        
        if (empty($db) || empty($tables) || !is_array($tables)) throw new Exception('Invalid params');

        $count = 0;
        foreach ($tables as $table) {
            if (!preg_match('/^[a-zA-Z0-9_.]+$/', $table)) continue;
            $this->dbExecutor->execute("DROP TABLE IF EXISTS `$table`", $db);
            $count++;
        }
        return ['count' => $count];
    }
}
