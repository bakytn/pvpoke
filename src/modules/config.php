<?php
$WEB_ROOT = '/pvpoke/src/';
$WEB_HOST = 'http://' . $_SERVER['HTTP_HOST'] . $WEB_ROOT;
$UA = '';
$GOOGLE_AD_CLIENT = '';

$DB_NAME = 'pvpoke_training';
$DB_HOST = 'localhost';
$DB_USER = 'root';
$DB_PASS = '';

// Admin credentials for write endpoints (override via env vars).
$ADMIN_USER = getenv('PVPOKE_ADMIN_USER');
if(($ADMIN_USER === false) || ($ADMIN_USER === '')){
	$ADMIN_USER = 'admin';
}

$ADMIN_PASS = getenv('PVPOKE_ADMIN_PASS');
if(($ADMIN_PASS === false) || ($ADMIN_PASS === '')){
	$ADMIN_PASS = 'changeme';
}
?>
