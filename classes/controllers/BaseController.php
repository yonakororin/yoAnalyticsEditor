<?php
// webroot/database/classes/controllers/BaseController.php

abstract class BaseController {
    protected $dbExecutor;
    protected $projectRoot;
    protected $config;

    /**
     * コンストラクタ
     * @param DatabaseExecutor $dbExecutor DB実行インスタンス
     * @param string $projectRoot プロジェクトのルートパス
     * @param array $config 設定配列
     */
    public function __construct($dbExecutor, $projectRoot, $config) {
        $this->dbExecutor = $dbExecutor;
        $this->projectRoot = $projectRoot;
        $this->config = $config;
    }

    /**
     * 入力JSONを取得してデコードする
     * @return array デコードされたJSONデータ
     */
    protected function getInputJson() {
        $input = file_get_contents('php://input');
        if (empty($input) && php_sapi_name() === 'cli') {
            $input = file_get_contents('php://stdin');
        }
        return json_decode($input, true) ?? [];
    }

    /**
     * パスの妥当性を検証する（ディレクトリトラバーサル対策）
     * @param string $path 検証対象パス（プロジェクトルートからの相対パス）
     * @param bool $mustExist ファイルが存在する必要があるか
     * @return string 絶対パス
     * @throws Exception 無効なパスの場合
     */
    protected function validatePath($path, $mustExist = false) {
        $fullPath = $this->projectRoot . '/' . $path;
        $realDir = realpath(dirname($fullPath));
        
        // ディレクトリトラバーサル防止
        if ($realDir === false || strpos($realDir, $this->projectRoot) !== 0) {
            Logger::log("Security: Invalid path blocked: $path");
            throw new Exception('Invalid path');
        }
        
        if ($mustExist && !file_exists($fullPath)) {
             throw new Exception('File not found: ' . $path);
        }
        
        return $fullPath;
    }
}
