<?php
// webroot/database/classes/ApiController.php

require_once __DIR__ . '/controllers/DatabaseController.php';
require_once __DIR__ . '/controllers/FileController.php';
require_once __DIR__ . '/controllers/DataController.php';

class ApiController {
    private $dbExecutor;
    private $projectRoot;
    private $config;

    private $controllers = [];

    public function __construct() {
        $this->projectRoot = realpath(__DIR__ . '/../../../');
        $this->loadConfig();

        // コントローラーを初期化
        $this->controllers['database'] = new DatabaseController($this->dbExecutor, $this->projectRoot, $this->config);
        $this->controllers['file'] = new FileController($this->dbExecutor, $this->projectRoot, $this->config);
        $this->controllers['data'] = new DataController($this->dbExecutor, $this->projectRoot, $this->config);
    }

    private function loadConfig() {
        $configPath = $this->projectRoot . '/config/config.json';
        if (!file_exists($configPath)) {
            $this->sendError('Config not found', 500);
        }
        $this->config = json_decode(file_get_contents($configPath), true);
        $this->dbExecutor = new DatabaseExecutor($this->config['db']);
    }

    public function handleRequest() {
        try {
            $action = $_GET['action'] ?? '';
            if (empty($action)) {
                throw new Exception('No action provided');
            }

            $methodName = str_replace(' ', '', ucwords(str_replace('_', ' ', $action)));
            $method = 'action' . $methodName;

            // アクション名に基づいて適切なコントローラーへディスパッチ
            $controller = $this->resolveController($method);
            
            if ($controller) {
                $response = $controller->$method();
                if ($response !== null) {
                    echo json_encode($response);
                }
            } else {
                throw new Exception('Invalid action: ' . $action);
            }
        } catch (Exception $e) {
            $this->sendError($e->getMessage(), 400);
        }
    }

    private function resolveController($method) {
        // コントローラーへのマッピングを試行
        foreach ($this->controllers as $ctrl) {
            if (method_exists($ctrl, $method)) {
                return $ctrl;
            }
        }
        return null;
    }

    private function sendError($message, $code = 400) {
        http_response_code($code);
        echo json_encode(['error' => $message]);
        exit;
    }
}
