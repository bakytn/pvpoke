<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$gmPath = __DIR__ . '/gamemaster.min.json';
$response = [
	'gamemasterTimestamp' => null,
	'gamemasterMtime' => null
];

if(is_file($gmPath)){
	$response['gamemasterMtime'] = filemtime($gmPath);

	// Fast path: the timestamp field is near the top of the JSON.
	$head = '';
	$fh = @fopen($gmPath, 'r');

	if($fh){
		$head = fread($fh, 4096);
		fclose($fh);
	}

	if($head && preg_match('/"timestamp"\s*:\s*"([^"]+)"/', $head, $matches)){
		$response['gamemasterTimestamp'] = $matches[1];
	} else{
		// Fallback parse if format changes.
		$json = @file_get_contents($gmPath);
		$data = json_decode($json, true);

		if(is_array($data) && isset($data['timestamp'])){
			$response['gamemasterTimestamp'] = $data['timestamp'];
		}
	}
}

echo json_encode($response);
