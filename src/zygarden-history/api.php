<?php
declare(strict_types=1);

// Same-origin, allowlisted relay for Zygarden's public history endpoints.
const ZYGARDEN_API = 'https://api.zygarden.gg';
const CACHE_DIR = __DIR__ . '/cache';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');

function fail(int $status, string $message): never {
    http_response_code($status);
    echo json_encode(array('error' => $message));
    exit;
}

function value(string $key): string {
    return isset($_GET[$key]) && is_string($_GET[$key]) ? trim($_GET[$key]) : '';
}

function uuid(string $key): string {
    $id = value($key);
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
        fail(400, "Invalid {$key}.");
    }
    return $id;
}

function cacheFile(string $path): string {
    return CACHE_DIR . '/' . hash('sha256', $path) . '.json';
}

function cachedResponse(string $path): ?string {
    $file = cacheFile($path);
    if (!is_file($file) || !is_readable($file)) return null;
    $body = @file_get_contents($file);
    return $body === false ? null : $body;
}

function storeResponse(string $path, string $body): void {
    if (!is_dir(CACHE_DIR) && !@mkdir(CACHE_DIR, 0750, true)) return;
    $target = cacheFile($path);
    $temporary = $target . '.' . uniqid('', true) . '.tmp';
    if (@file_put_contents($temporary, $body, LOCK_EX) !== false) @rename($temporary, $target);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Only GET is supported.');
}

$action = value('action');
$path = '';
switch ($action) {
    case 'search':
        $name = value('name');
        if ($name === '' || strlen($name) > 320) fail(400, 'A trainer name up to 80 characters is required.');
        $path = '/api/v2/trainers?filter=' . rawurlencode($name) . '&page=1&count=50';
        break;
    case 'directory':
        $page = filter_var(value('page'), FILTER_VALIDATE_INT, array('options' => array('min_range' => 1, 'max_range' => 200)));
        if ($page === false) fail(400, 'Invalid directory page.');
        $path = '/api/v2/trainers?page=' . $page . '&count=50';
        break;
    case 'tournaments':
        $trainer = uuid('trainerId');
        $page = filter_var(value('page'), FILTER_VALIDATE_INT, array('options' => array('min_range' => 1, 'max_range' => 100)));
        if ($page === false) fail(400, 'Invalid tournament page.');
        $path = '/api/v2/trainer/' . rawurlencode($trainer) . '/tournaments?page=' . $page . '&count=100';
        break;
    case 'brackets':
        $type = value('tenantType');
        if (!in_array($type, array('community', 'player'), true)) fail(400, 'Invalid tenant type.');
        $path = '/api/v2/' . $type . '/' . rawurlencode(uuid('tenantId')) . '/tournament/' . rawurlencode(uuid('tournamentId')) . '/brackets';
        break;
    default:
        fail(400, 'Unknown action.');
}

$url = ZYGARDEN_API . $path;
$refresh = value('refresh') === '1';
if (!$refresh && ($cached = cachedResponse($path)) !== null) {
    header('X-Zygarden-Cache: HIT');
    echo $cached;
    exit;
}

$headers = array('Accept: application/json', 'Accept-Language: en-US', 'User-Agent: PvPoke-Zygarden-History/1.0');
if (function_exists('curl_init')) {
    $curl = curl_init($url);
    curl_setopt_array($curl, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 20));
    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);
} else {
    $context = stream_context_create(array('http' => array('method' => 'GET', 'header' => implode("\r\n", $headers), 'timeout' => 20)));
    $body = @file_get_contents($url, false, $context);
    $status = 502;
    $error = $body === false ? 'Unable to reach Zygarden.' : '';
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) $status = (int)$matches[1];
}

if ($body === false || $body === null) fail(502, $error ?: 'Unable to reach Zygarden.');
if ($status >= 200 && $status < 300 && json_decode($body) !== null) storeResponse($path, $body);
header('X-Zygarden-Cache: ' . ($refresh ? 'REFRESH' : 'MISS'));
http_response_code($status >= 200 && $status < 600 ? $status : 502);
echo $body;
