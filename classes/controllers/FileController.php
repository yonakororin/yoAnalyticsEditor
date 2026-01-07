<?php
// webroot/database/classes/controllers/FileController.php

require_once __DIR__ . '/BaseController.php';

class FileController extends BaseController {

    /**
     * ファイル一覧を取得する
     * GETパラメータ 'path' で指定されたディレクトリ内のファイルとディレクトリを返す
     */
    public function actionListFiles() {
        $path = $_GET['path'] ?? '';
        $baseDir = $this->projectRoot;
        
        // セキュリティチェック、無効ならルートへ
        $realPath = realpath($baseDir . '/' . $path);
        if ($realPath === false || strpos($realPath, $baseDir) !== 0) {
            $realPath = $baseDir;
            $path = '';
        }
        
        $files = [];
        $dirs = [];
        
        foreach (scandir($realPath) as $item) {
            if ($item === '.' || $item === '..') continue;
            $fullPath = $realPath . '/' . $item;
            $relPath = ($path ? $path . '/' : '') . $item;
            
            if (is_dir($fullPath)) {
                $dirs[] = ['name' => $item, 'path' => $relPath, 'type' => 'dir'];
            } else {
                $ext = pathinfo($item, PATHINFO_EXTENSION);
                if (in_array(strtolower($ext), ['csv', 'tsv', 'txt', 'log', 'json'])) {
                    $files[] = ['name' => $item, 'path' => $relPath, 'type' => 'file'];
                }
            }
        }
        
        return ['items' => array_merge($dirs, $files), 'current' => $path];
    }

    /**
     * ファイルを保存する
     * POSTパラメータ 'path', 'content' を使用
     */
    public function actionSaveFile() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Method not allowed');
        $input = $this->getInputJson();
        $path = $input['path'] ?? '';
        $content = $input['content'] ?? '';
        
        if (empty($path)) throw new Exception('Path required');
        $fullPath = $this->validatePath($path);
        
        if (file_put_contents($fullPath, $content) === false) {
            throw new Exception('Failed to save file');
        }
        return ['success' => true];
    }

    /**
     * ファイル内容を読み込む
     * GETパラメータ 'path' を使用
     */
    public function actionLoadFile() {
        $path = $_GET['path'] ?? '';
        if (empty($path)) throw new Exception('Path required');
        $fullPath = $this->validatePath($path, true);
        return ['content' => file_get_contents($fullPath)];
    }

    /**
     * README.mdの内容を取得する
     */
    public function actionGetReadme() {
        $readmePath = $this->projectRoot . '/README.md';
        if (!file_exists($readmePath)) {
            throw new Exception('README not found');
        }
        return ['content' => file_get_contents($readmePath)];
    }
}
