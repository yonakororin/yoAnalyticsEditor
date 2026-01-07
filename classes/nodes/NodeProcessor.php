<?php
// webroot/database/classes/nodes/NodeProcessor.php

/**
 * ノード処理の基底クラス
 * 
 * すべてのノードプロセッサ（Table, File, Query, Displayなど）の親クラス。
 * コントローラーやDB実行クラスへの参照を保持し、共通のログ出力機能などを提供する。
 */
abstract class NodeProcessor {
    protected $controller; // CliController reference for overrides/logs
    protected $dbExecutor;
    protected $projectRoot;

    public function __construct($controller, $dbExecutor, $projectRoot) {
        $this->controller = $controller;
        $this->dbExecutor = $dbExecutor;
        $this->projectRoot = $projectRoot;
    }

    abstract public function process($node, $nodeId, $connections);

    protected function log($msg) {
        $this->controller->log($msg);
    }
}
