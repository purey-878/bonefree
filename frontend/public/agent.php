<?php
/** Public, read-only Hostinger bridge. No database, sessions, secrets or mutations. */
declare(strict_types=1);
ini_set('display_errors', '0');

function send_json(array $value, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function rpc_error(mixed $id, int $code, string $message, int $status = 200): never {
    send_json(['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]], $status);
}
function quality(string $accept, string $target): float {
    $best = -1; $quality = 0.0;
    foreach (explode(',', strtolower($accept)) as $entry) {
        $parts = array_map('trim', explode(';', $entry));
        $type = array_shift($parts); $q = 1.0;
        foreach ($parts as $part) {
            if (preg_match('/^q\s*=\s*(.+)$/', $part, $match)) {
                $q = is_numeric($match[1]) ? (float)$match[1] : 0.0;
                if ($q < 0 || $q > 1) $q = 0.0;
            }
        }
        $specificity = $type === $target ? 2 : ($type === explode('/', $target)[0] . '/*' ? 1 : ($type === '*/*' ? 0 : -1));
        if ($specificity > $best) { $best = $specificity; $quality = $q; }
        elseif ($specificity >= 0 && $specificity === $best) $quality = max($quality, $q);
    }
    return $quality;
}

$manifestJson = (string)@file_get_contents(__DIR__ . '/agent-manifest.json');
$manifest = json_decode($manifestJson, true);
// Preserve empty JSON Schema objects (properties: {}), not PHP's empty arrays.
$toolDefinitions = json_decode($manifestJson)->tools ?? [];
if (!is_array($manifest)) send_json(['error' => 'agent_build_missing', 'message' => 'The public guide is unavailable.'], 503);
$representation = $_GET['representation'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($representation === 'markdown') {
    if (!in_array($method, ['GET', 'HEAD'], true)) { header('Allow: GET, HEAD'); http_response_code(405); exit; }
    $page = $_GET['page'] ?? '';
    if (!is_string($page) || !isset($manifest['pages'][$page])) { http_response_code(404); exit; }
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '*/*';
    $md = quality($accept, 'text/markdown'); $html = quality($accept, 'text/html');
    $force = ($_GET['force'] ?? '') === '1';
    if (!$force && max($md, $html) <= 0) { http_response_code(406); exit; }
    $markdown = $force || ($md > 0 && $md >= $html);
    $file = $markdown ? $manifest['pages'][$page]['file'] : ($page === '/' ? 'index.html' : substr($page, 1) . '/index.html');
    $body = @file_get_contents(__DIR__ . '/' . $file);
    if ($body === false) { http_response_code(404); exit; }
    header('Content-Type: ' . ($markdown ? 'text/markdown' : 'text/html') . '; charset=utf-8');
    header('Vary: Accept');
    header('Cache-Control: public, max-age=300');
    header('Link: <https://bonefree.pt' . $page . '>; rel="canonical", <https://bonefree.pt/llms.txt>; rel="describedby"; type="text/plain"');
    $etag = '"' . hash('sha256', $body) . '"';
    header('ETag: ' . $etag);
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    if ($method !== 'HEAD') echo $body;
    exit;
}

if ($representation !== 'mcp') { http_response_code(404); exit; }
header('Cache-Control: no-store, private, max-age=0');
$origin = $_SERVER['HTTP_ORIGIN'] ?? null;
if ($origin !== null && !in_array($origin, ['https://bonefree.pt', 'https://www.bonefree.pt'], true)) rpc_error(null, -32600, 'Origin is not allowed.', 403);
if ($method !== 'POST') { header('Allow: POST'); rpc_error(null, -32600, 'This endpoint supports JSON POST requests, not an SSE stream.', 405); }
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') rpc_error(null, -32600, 'Content-Type must be application/json.', 415);
if (quality($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') <= 0) rpc_error(null, -32600, 'Accept must allow application/json.', 406);
$versions = ['2025-11-25', '2025-06-18'];
$versionHeader = $_SERVER['HTTP_MCP_PROTOCOL_VERSION'] ?? null;
if ($versionHeader !== null && !in_array($versionHeader, $versions, true)) rpc_error(null, -32600, 'Unsupported MCP protocol version.', 400);
$body = file_get_contents('php://input', false, null, 0, 8193);
if ($body === false || strlen($body) > 8192) rpc_error(null, -32600, 'Request body exceeds 8192 bytes.', 413);
try { $message = json_decode($body, false, 32, JSON_THROW_ON_ERROR); }
catch (JsonException) { rpc_error(null, -32700, 'Invalid JSON.', 400); }
if (!is_object($message) || ($message->jsonrpc ?? '') !== '2.0') rpc_error(null, -32600, 'Expected one JSON-RPC 2.0 object.', 400);
$hasId = property_exists($message, 'id');
$id = $hasId ? $message->id : null;
if ($hasId && !is_int($id) && !is_string($id)) rpc_error(null, -32600, 'Request ID must be a string or integer.', 400);
if (!$hasId || (!isset($message->method) && (isset($message->result) || isset($message->error)))) {
    if (!$hasId && (!isset($message->method) || !is_string($message->method))) rpc_error(null, -32600, 'Invalid notification.', 400);
    http_response_code(202); exit;
}
if (!isset($message->method) || !is_string($message->method)) rpc_error($id, -32600, 'Method must be a string.', 400);
$params = $message->params ?? new stdClass();
if (!is_object($params)) rpc_error($id, -32602, 'Parameters must be an object.');
$result = null;
switch ($message->method) {
    case 'initialize':
        if (!is_string($params->protocolVersion ?? null) || !is_object($params->capabilities ?? null) || !is_object($params->clientInfo ?? null) || !is_string($params->clientInfo->name ?? null) || !is_string($params->clientInfo->version ?? null)) rpc_error($id, -32602, 'Initialize requires protocolVersion, capabilities and clientInfo.');
        $version = in_array($params->protocolVersion, $versions, true) ? $params->protocolVersion : $manifest['protocol_version'];
        $result = ['protocolVersion' => $version, 'serverInfo' => $manifest['server_info'], 'capabilities' => ['tools' => ['listChanged' => false]], 'instructions' => 'Read-only build-time restaurant guide. Check live pages for current menu, events and reservation availability.'];
        break;
    case 'ping': $result = new stdClass(); break;
    case 'tools/list':
        if (array_diff(array_keys(get_object_vars($params)), ['_meta'])) rpc_error($id, -32602, 'Tool pagination is not required.');
        $result = ['tools' => $toolDefinitions]; break;
    case 'tools/call':
        $name = $params->name ?? '';
        $args = $params->arguments ?? new stdClass();
        if (!is_string($name) || !is_object($args) || array_diff(array_keys(get_object_vars($params)), ['name', 'arguments', '_meta'])) rpc_error($id, -32602, 'Invalid tool parameters.');
        if ($name === 'get_restaurant_info') {
            if (count(get_object_vars($args))) rpc_error($id, -32602, 'This tool takes no arguments.');
            $text = json_encode($manifest['business'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        } elseif ($name === 'get_public_page') {
            if (count(get_object_vars($args)) !== 1 || !is_string($args->page ?? null) || !isset($manifest['pages'][$args->page])) rpc_error($id, -32602, 'Choose a supported public page.');
            $text = @file_get_contents(__DIR__ . '/' . $manifest['pages'][$args->page]['file'], false, null, 0, 32769);
            if ($text === false || strlen($text) > 32768) {
                $result = ['content' => [['type' => 'text', 'text' => 'The public guide is unavailable.']], 'isError' => true]; break;
            }
        } else rpc_error($id, -32602, 'Unknown tool.');
        $result = ['content' => [['type' => 'text', 'text' => $text]], 'isError' => false]; break;
    default: rpc_error($id, -32601, 'Method not found.');
}
send_json(['jsonrpc' => '2.0', 'id' => $id, 'result' => $result]);
