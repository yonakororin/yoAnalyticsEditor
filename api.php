<?php
// webroot/database/api.php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

require_once __DIR__ . '/classes/Logger.php';
require_once __DIR__ . '/classes/DatabaseExecutor.php';
require_once __DIR__ . '/classes/ApiController.php';

$controller = new ApiController();
$controller->handleRequest();
