<?php
// webroot/database/classes/nodes/DisplayNodeProcessor.php

require_once __DIR__ . '/NodeProcessor.php';

/**
 * DisplayNode プロセッサ
 * 
 * 役割:
 * - 処理結果（前のノードのテーブルデータ）を外部に出力する。
 * - ローカルへのCSVファイル保存、またはGoogle Sheetsへのアップロード処理（Pythonスクリプト連携）を行う。
 * - 出力先パスやクレデンシャル情報の管理を行う。
 */
class DisplayNodeProcessor extends NodeProcessor {
    public function process($node, $nodeId, $connections) {
        $srcTable = null;
        foreach ($connections as $c) {
            if ($c['to'] === $nodeId) {
                $data = $this->controller->getRuntimeData($c['from']);
                if ($data) {
                    $srcTable = $data;
                    break;
                }
            }
        }

        if (!$srcTable) {
            $this->log("-> Skipped: No source table.");
            return;
        }

        $exportType = $node['exportType'] ?? ($node['data']['exportType'] ?? 'file');

        if ($exportType === 'google_sheet') {
            $this->exportToGoogleSheet($node, $srcTable);
        } elseif ($exportType === 'stdout') {
            $this->exportToStdout($node, $srcTable);
        } else {
            $this->exportToFile($node, $srcTable);
        }
    }

    private function exportToStdout($node, $srcTable) {
        $this->log("-> Exporting to STDOUT");
        // Use php://stdout directly. Note: Logs are also echo-ed by CliController if not redirected.
        $this->dbExecutor->streamToCsv($srcTable, 'php://stdout');

    }

    private function exportToFile($node, $srcTable) {
        $exportPath = $node['exportPath'] ?? ($node['data']['exportPath'] ?? '');
        $exportName = $node['exportName'] ?? ($node['data']['exportName'] ?? 'export.csv');

        if (!$exportPath) {
            $this->log("-> Warning: No export path. Skipping.");
            return;
        }

        $fullDirPath = $this->projectRoot . '/' . trim($exportPath, '/');
        $fullPath = $fullDirPath . '/' . $exportName;
        $this->log("-> Exporting to $fullPath");

        if (!is_dir($fullDirPath)) mkdir($fullDirPath, 0755, true);

        $tmpFile = tempnam(sys_get_temp_dir(), 'cli_export_');
        $this->dbExecutor->streamToCsv($srcTable, $tmpFile);
        
        if (!copy($tmpFile, $fullPath)) {
            throw new Exception("Failed to copy export file to $fullPath");
        }
        unlink($tmpFile);
        $this->log("-> Export Complete.");
    }

    private function exportToGoogleSheet($node, $srcTable) {
        $spreadsheetId = $node['spreadsheetId'] ?? ($node['data']['spreadsheetId'] ?? '');
        $sheetName = $node['sheetName'] ?? ($node['data']['sheetName'] ?? '');
        $credsPathRaw = $node['credentialsPath'] ?? ($node['data']['credentialsPath'] ?? 'config/service_account.json');
        $credsPath = $this->projectRoot . '/' . $credsPathRaw;

        if (!$spreadsheetId || !$sheetName) {
            $this->log("-> Skipped: Missing Sheet ID/Name");
            return;
        }
        if (!file_exists($credsPath)) {
            throw new Exception("Credentials not found: $credsPath");
        }

        $tmpCsv = tempnam(sys_get_temp_dir(), 'export_gs_');
        $this->dbExecutor->streamToCsv($srcTable, $tmpCsv);

        $scriptPath = $this->projectRoot . '/db/upload_to_sheet.py';
        $cmd = "python3 " . escapeshellarg($scriptPath) . 
               " --csv " . escapeshellarg($tmpCsv) .
               " --creds " . escapeshellarg($credsPath) .
               " --id " . escapeshellarg($spreadsheetId) .
               " --sheet " . escapeshellarg($sheetName) . 
               " 2>&1";
        
        $this->log("-> Uploading to Google Sheet...");
        exec($cmd, $output, $ret);
        unlink($tmpCsv);

        if ($ret !== 0) throw new Exception("Python Error: " . implode("\n", $output));
        $this->log("-> Upload Complete.");
    }
}
