<?php
// webroot/database/classes/DatabaseExecutor.php

class DatabaseExecutor {
    private $config;
    private $host;
    private $port;
    private $user;
    private $password;

    public function __construct($dbConfig) {
        $this->config = $dbConfig;
        $this->host = escapeshellarg($dbConfig['host']);
        $this->port = escapeshellarg($dbConfig['port']);
        $this->user = escapeshellarg($dbConfig['user']);
        $this->password = $dbConfig['password'];
    }

    public function execute($sql, $dbName = 'mngtools') {
        $this->validateName($dbName);

        // SQLを一時ファイルに保存
        $tmpFile = $this->createSqlTempFile($sql, $dbName);
        
        $cmd = "mysql -h {$this->host} -P {$this->port} -u {$this->user} -B";
        $env = ['MYSQL_PWD' => $this->password];

        // ログ (長いSQLは省略)
        $cleanSql = str_replace(["\n", "\r", "\t"], " ", $sql);
        $displaySql = mb_strlen($cleanSql) > 200 ? mb_substr($cleanSql, 0, 200) . "..." : $cleanSql;
        Logger::log("EXEC SQL [$dbName]: $displaySql");

        $descriptors = [
            0 => ['file', $tmpFile, 'r'],
            1 => ['pipe', 'w'], // stdout
            2 => ['pipe', 'w']  // stderr
        ];

        $process = proc_open($cmd, $descriptors, $pipes, null, $env);

        if (is_resource($process)) {
            $stdout = stream_get_contents($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $returnValue = proc_close($process);
            unlink($tmpFile);

            if ($returnValue !== 0) {
                Logger::log("SQL FAIL: $stderr");
                throw new Exception("MySQL Error: $stderr");
            }

            return $this->parseTsv($stdout);
        }

        unlink($tmpFile);
        Logger::log("FATAL: Failed to launch mysql process");
        throw new Exception("Failed to launch mysql process");
    }

    public function streamToCsv($table, $outputPath, $dbName = 'mngtools') {
        $this->validateName($dbName);
        if (!preg_match('/^[a-zA-Z0-9_.]+$/', $table)) {
            throw new Exception("Invalid table name: $table");
        }

        $sql = "SELECT * FROM $table"; // 必要に応じて ORDER BY を追加
        $tmpFile = $this->createSqlTempFile($sql, $dbName);

        $cmd = "mysql -h {$this->host} -P {$this->port} -u {$this->user} -B --quick";
        $env = ['MYSQL_PWD' => $this->password];

        Logger::log("Export Stream: Starting export for $table to $outputPath");

        $descriptors = [
            0 => ['file', $tmpFile, 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w']
        ];

        $process = proc_open($cmd, $descriptors, $pipes, null, $env);

        if (!is_resource($process)) {
            unlink($tmpFile);
            throw new Exception("Failed to launch mysql process");
        }

        $fpOut = fopen($outputPath, 'w');
        if (!$fpOut) {
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);
            unlink($tmpFile);
            throw new Exception("Failed to open output file: $outputPath");
        }

        $rowCount = 0;
        // TSV -> CSV 変換
        while (($row = fgetcsv($pipes[1], 0, "\t")) !== false) {
            fputcsv($fpOut, $row);
            $rowCount++;
        }

        fclose($fpOut);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $returnValue = proc_close($process);
        unlink($tmpFile);

        if ($returnValue !== 0) {
            Logger::log("Export Stream FAIL: $stderr");
            throw new Exception("MySQL Export Error: $stderr");
        }

        Logger::log("Export Stream: Completed. $rowCount rows exported.");
        return $rowCount;
    }

    private function createSqlTempFile($sql, $dbName) {
        $tmpFile = tempnam(sys_get_temp_dir(), 'sql_');
        if (!$tmpFile) {
            Logger::log("ERROR: Failed to create temp file for SQL");
            throw new Exception("Internal Error");
        }
        file_put_contents($tmpFile, "USE $dbName;\n" . $sql);
        return $tmpFile;
    }

    private function parseTsv($tsv) {
        $lines = explode("\n", trim($tsv));
        if (empty($lines) || (count($lines) == 1 && empty($lines[0]))) return [];

        $headers = explode("\t", array_shift($lines));
        $result = [];

        foreach ($lines as $line) {
            if (trim($line) === '') continue;
            $values = explode("\t", $line);
            $row = [];
            foreach ($headers as $i => $h) {
                $row[$h] = $values[$i] ?? null;
            }
            $result[] = $row;
        }
        return $result;
    }

    private function validateName($name) {
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $name)) {
            Logger::log("ERROR: Invalid DB Name: $name");
            throw new Exception("Invalid database name");
        }
    }
}
