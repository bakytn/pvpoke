<?php

/*
* Given JSON data, write to a file.
*/

// Validate that data exists and falls within the allowed parameters

if( (! isset($_POST['data'])) || (! isset($_POST['league'])) || (! isset($_POST['category'])) || (! isset($_POST['cup']))){
	exit("Data does not have valid keys.");
}

// If only there was some universal source for this info, like some kind of master file??
// But nah let's scratch our head for 20 minutes when we can't figure out why the write function doesn't work after we change a name

$leagues = [500,1500,2500,10000];
$categories = ["closers","attackers","defenders","leads","switches","chargers","consistency","overall","beaminess"];

if( (! in_array($_POST['league'], $leagues)) || (! in_array($_POST['category'], $categories)) ){
	exit("League or category is not valid");
}

if(! preg_match('/^[a-z0-9_]+$/', $_POST['cup'])){
	exit("Cup is not valid");
}

$json = json_decode($_POST['data']);

if($json === null){
	exit("JSON cannot be decoded.");
}

$filepath = 'rankings/' . $_POST['cup'] . '/' . $_POST['category'] . '/rankings-' . $_POST['league'] . '.json';

// Ensure the target directory exists
$dir = dirname($filepath);
if(! is_dir($dir)){
	if(! mkdir($dir, 0755, true) && ! is_dir($dir)){
		exit("Could not create directory");
	}
}

if(file_put_contents($filepath, $_POST['data']) !== false){
	echo '{ "status": "Success" }';
} else{
	echo '{ "status": "Fail" }';
}

?>
