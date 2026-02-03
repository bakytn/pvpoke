<?php

header('Content-Type: application/json');

function respond_json($status, $payload){
	http_response_code($status);
	echo json_encode($payload);
	exit;
}

$rawCup = $_POST['cup'] ?? '';
$name = strtolower(trim($_POST['name'] ?? ''));
$title = trim($_POST['title'] ?? '');
$cp = intval($_POST['cp'] ?? 0);
$levelCap = isset($_POST['levelCap']) ? intval($_POST['levelCap']) : 0;

$allowedLeagues = [500,1500,2500,10000];

if($rawCup === '' || $name === '' || $title === '' || $cp === 0){
	respond_json(400, ['status' => 'error', 'message' => 'Missing required fields.']);
}

if(! in_array($cp, $allowedLeagues, true)){
	respond_json(400, ['status' => 'error', 'message' => 'Invalid league.']);
}

if(! preg_match('/^[a-z0-9_]+$/', $name)){
	respond_json(400, ['status' => 'error', 'message' => 'Invalid cup slug.']);
}

$cupData = json_decode($rawCup, true);
if(! is_array($cupData)){
	respond_json(400, ['status' => 'error', 'message' => 'Cup JSON is invalid.']);
}

// Normalize cup data
$cupData['name'] = $name;
$cupData['title'] = $title;
$cupData['league'] = $cp;
$cupData['custom'] = true;
if($levelCap > 0){
	$cupData['levelCap'] = $levelCap;
}

if(! isset($cupData['include']) || ! is_array($cupData['include'])){
	$cupData['include'] = [];
}

if(! isset($cupData['exclude']) || ! is_array($cupData['exclude'])){
	$cupData['exclude'] = [];
}

if(! isset($cupData['overrides']) || ! is_array($cupData['overrides'])){
	$cupData['overrides'] = [];
}

$dataDir = __DIR__;
$cupsDir = $dataDir . '/gamemaster/cups';
$cupPath = $cupsDir . '/' . $name . '.json';

if(! is_dir($cupsDir)){
	respond_json(500, ['status' => 'error', 'message' => 'Cups directory missing.']);
}

if(file_put_contents($cupPath, json_encode($cupData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false){
	respond_json(500, ['status' => 'error', 'message' => 'Failed to write cup file.']);
}

// Update formats.json
$formatsPath = $dataDir . '/gamemaster/formats.json';
$formatsRaw = file_get_contents($formatsPath);
if($formatsRaw === false){
	respond_json(500, ['status' => 'error', 'message' => 'Failed to read formats.json.']);
}

$formats = json_decode($formatsRaw, true);
if(! is_array($formats)){
	respond_json(500, ['status' => 'error', 'message' => 'formats.json is invalid.']);
}

$metaMap = [
	500 => 'little',
	1500 => 'great',
	2500 => 'ultra',
	10000 => 'master'
];
$meta = $metaMap[$cp] ?? 'great';

$formatEntry = [
	'title' => $title,
	'cup' => $name,
	'cp' => $cp,
	'meta' => $meta,
	'showCup' => true,
	'showFormat' => true,
	'showMeta' => true
];

$found = false;
for($i = 0; $i < count($formats); $i++){
	$format = $formats[$i];
	if(($format['cup'] ?? '') === $name && intval($format['cp'] ?? 0) === $cp){
		$formats[$i] = array_merge($format, $formatEntry);
		$found = true;
		break;
	}
}

if(! $found){
	$formats[] = $formatEntry;
}

if(file_put_contents($formatsPath, json_encode($formats, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false){
	respond_json(500, ['status' => 'error', 'message' => 'Failed to write formats.json.']);
}

// Ensure rankings directories exist
$categories = ["closers","attackers","defenders","leads","switches","chargers","consistency","overall","beaminess"];
$rankingsCupDir = $dataDir . '/rankings/' . $name;
foreach($categories as $category){
	$dir = $rankingsCupDir . '/' . $category;
	if(! is_dir($dir)){
		if(! mkdir($dir, 0755, true) && ! is_dir($dir)){
			respond_json(500, ['status' => 'error', 'message' => 'Failed to create rankings directory.']);
		}
	}
}

// Rebuild gamemaster.json, gamemaster.min.json, and formats.php
$base = json_decode(file_get_contents($dataDir . '/gamemaster/base.json'), true);
$pokemon = json_decode(file_get_contents($dataDir . '/gamemaster/pokemon.json'), true);
$moves = json_decode(file_get_contents($dataDir . '/gamemaster/moves.json'), true);

if(! is_array($base) || ! is_array($pokemon) || ! is_array($moves)){
	respond_json(500, ['status' => 'error', 'message' => 'Gamemaster source files are invalid.']);
}

$base['timestamp'] = date('Y-m-d H:i:s', time());
$base['pokemon'] = $pokemon;
$base['moves'] = $moves;
$base['formats'] = $formats;
$base['cups'] = [];

$dir = new DirectoryIterator($cupsDir);
foreach ($dir as $file) {
	if ($file->getExtension() === 'json') {
		$cup = json_decode(file_get_contents($cupsDir . '/' . $file->getFilename()), true);
		if(! is_null($cup)){
			$base['cups'][] = $cup;
		}
	}
}

$gmJson = json_encode($base, JSON_UNESCAPED_SLASHES);
if($gmJson === false){
	respond_json(500, ['status' => 'error', 'message' => 'Failed to encode gamemaster.json.']);
}

if(file_put_contents($dataDir . '/gamemaster.json', $gmJson) === false){
	respond_json(500, ['status' => 'error', 'message' => 'Failed to write gamemaster.json.']);
}

if(file_put_contents($dataDir . '/gamemaster.min.json', $gmJson) === false){
	respond_json(500, ['status' => 'error', 'message' => 'Failed to write gamemaster.min.json.']);
}

$formatContent = '<?php' . "\n";
$formatContent .= '// This file is generated by custom-cup-save.php. Do not edit directly.' . "\n";
$formatContent .= '$formats = ' . var_export($formats, true) . ';' . "\n";
$formatContent .= '?>';

if(file_put_contents($dataDir . '/formats.php', $formatContent) === false){
	respond_json(500, ['status' => 'error', 'message' => 'Failed to write formats.php.']);
}

respond_json(200, [
	'status' => 'success',
	'cup' => $name,
	'title' => $title,
	'cp' => $cp
]);
