<?php
// webroot/database/classes/CliController.php

require_once __DIR__ . '/DatabaseExecutor.php';
require_once __DIR__ . '/Logger.php';

// Processors
require_once __DIR__ . '/nodes/TableNodeProcessor.php';
require_once __DIR__ . '/nodes/FileNodeProcessor.php';
require_once __DIR__ . '/nodes/QueryNodeProcessor.php';
require_once __DIR__ . '/nodes/DisplayNodeProcessor.php';

/**
 * CLI コントローラー
 * 
 * 役割:
 * - コマンドライン実行時のエントリーポイントとして機能する。
 * - JSON形式のプロセスグラフ（ノード定義と接続）を読み込み、実行順序（トポロジカルソート）を決定する。
 * - CLI引数を解析し、実行時のオーバーライド設定（ファイルパスやテーブル名の変更）を管理する。
 * - 各ノードの処理を適切なプロセッサ（TableNodeProcessorなど）に委譲して順次実行する。
 */
class CliController {
    private $dbExecutor;
    private $projectRoot;
    private $config;
    
    private $overrides = [];
    private $vars = [];
    private $runtimeData = [];
    
    // State counters for overrides
    private $fileOverrideIdx = 0;
    private $tableOverrideIdx = 0;

    // Processors
    private $processors = [];

    public function __construct() {
        $this->projectRoot = realpath(__DIR__ . '/../../../');
        $this->loadConfig();
        $this->initProcessors();
    }

    private function loadConfig() {
        $configPath = $this->projectRoot . '/config/config.json';
        if (!file_exists($configPath)) {
            die("Config not found\n");
        }
        $this->config = json_decode(file_get_contents($configPath), true);
        $this->dbExecutor = new DatabaseExecutor($this->config['db']);
    }

    private function initProcessors() {
        $this->processors['TableNode'] = new TableNodeProcessor($this, $this->dbExecutor, $this->projectRoot);
        $this->processors['FileNode'] = new FileNodeProcessor($this, $this->dbExecutor, $this->projectRoot);
        $this->processors['QueryNode'] = new QueryNodeProcessor($this, $this->dbExecutor, $this->projectRoot);
        $this->processors['DisplayNode'] = new DisplayNodeProcessor($this, $this->dbExecutor, $this->projectRoot);
    }

    public function run($argv) {
        if (count($argv) < 2) {
            die("Usage: php cli.php <graph_file.json> [options]\nOptions:\n  --file=<path>       Override FileNode source\n  --table=<name>      Override TableNode table\n  --db=<name>         Override TableNode db\n  --var-<name>=<val>  Set variable for QueryNode\n");
        }

        $graphFile = $argv[1];
        if (!file_exists($graphFile)) die("File not found: $graphFile\n");

        $graph = json_decode(file_get_contents($graphFile), true);
        if (!$graph) die("Invalid JSON\n");

        $this->parseOptions($argv);
        $executionOrder = $this->buildExecutionOrder($graph);

        $this->log("Graph loaded. Nodes: " . count($executionOrder));

        foreach ($executionOrder as $nodeId) {
            $this->executeNode($graph, $nodeId);
        }

        $this->log("Done.");
    }

    private function parseOptions($argv) {
        for ($i = 2; $i < count($argv); $i++) {
            $arg = $argv[$i];
            if (strpos($arg, '--file=') === 0) {
                $this->overrides['files'][] = substr($arg, 7);
            } elseif (strpos($arg, '--table=') === 0) {
                $this->overrides['tables'][] = substr($arg, 8);
            } elseif (strpos($arg, '--db=') === 0) {
                $this->overrides['dbs'][] = substr($arg, 5);
            } elseif (preg_match('/^--var-([^=]+)=(.*)$/', $arg, $matches)) {
                $this->vars[$matches[1]] = $matches[2];
            }
        }
    }

    private function buildExecutionOrder($graph) {
        $nodes = [];
        $adj = [];
        $inDegree = [];

        foreach ($graph['nodes'] as $n) {
            $nodes[$n['id']] = $n;
            $inDegree[$n['id']] = 0;
            $adj[$n['id']] = [];
        }

        foreach ($graph['connections'] as $c) {
            $adj[$c['from']][] = $c['to'];
            if(isset($inDegree[$c['to']])) {
                $inDegree[$c['to']]++;
            }
        }

        $queue = [];
        foreach ($nodes as $id => $n) {
            if ($inDegree[$id] === 0) $queue[] = $id;
        }

        $order = [];
        while (!empty($queue)) {
            $u = array_shift($queue);
            $order[] = $u;
            
            if (isset($adj[$u])) {
                foreach ($adj[$u] as $v) {
                    $inDegree[$v]--;
                    if ($inDegree[$v] === 0) $queue[] = $v;
                }
            }
        }

        if (count($order) !== count($nodes)) {
            die("Error: Cycle detected or disconnected graph.\n");
        }

        return $order;
    }

    private function executeNode($graph, $nodeId) {
        $node = null;
        foreach ($graph['nodes'] as $n) {
            if ($n['id'] === $nodeId) {
                $node = $n;
                break;
            }
        }
        if (!$node) return;

        $type = $node['type'] ?? 'Unknown';
        $label = $node['label'] ?? $nodeId;
        $this->log("Running node: $type [$label]");
        
        $startTime = microtime(true);
        try {
            if (isset($this->processors[$type])) {
                $this->processors[$type]->process($node, $nodeId, $graph['connections']);
            } else {
                $this->log("Skipping unknown/unsupported node type: $type");
            }
        } catch (Exception $e) {
            $this->log("ERROR: " . $e->getMessage());
        }
        $duration = microtime(true) - $startTime;
        $this->log("Finished in " . number_format($duration, 4) . "s");
    }

    // --- Public Methods for Processors ---

    public function log($msg) {
        $ts = date('Y-m-d H:i:s');
        echo "[$ts] $msg\n";
    }

    public function setRuntimeData($nodeId, $data) {
        $this->runtimeData[$nodeId] = $data;
    }

    public function getRuntimeData($nodeId) {
        return $this->runtimeData[$nodeId] ?? null;
    }

    public function getVars() {
        return $this->vars;
    }

    // Override Getters/Setters
    public function getNextDbOverride() {
        return $this->overrides['dbs'][$this->tableOverrideIdx] ?? ($this->overrides['dbs'][0] ?? null);
    }
    
    public function getNextTableOverride() {
        return $this->overrides['tables'][$this->tableOverrideIdx] ?? null;
    }

    public function incrementTableOverride() {
        $this->tableOverrideIdx++;
    }

    public function getNextFileOverride() {
        return $this->overrides['files'][$this->fileOverrideIdx] ?? null;
    }

    public function incrementFileOverride() {
        $this->fileOverrideIdx++;
    }
}
