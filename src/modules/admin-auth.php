<?php
require_once __DIR__ . '/config.php';

function pvpoke_get_basic_auth_credentials(){
	$user = '';
	$pass = '';

	if(isset($_SERVER['PHP_AUTH_USER'])){
		$user = $_SERVER['PHP_AUTH_USER'];
		$pass = $_SERVER['PHP_AUTH_PW'] ?? '';
		return [$user, $pass];
	}

	$authHeader = '';
	if(isset($_SERVER['HTTP_AUTHORIZATION'])){
		$authHeader = $_SERVER['HTTP_AUTHORIZATION'];
	} elseif(isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])){
		$authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
	}

	if($authHeader && stripos($authHeader, 'basic ') === 0){
		$decoded = base64_decode(substr($authHeader, 6));
		if($decoded !== false){
			$parts = explode(':', $decoded, 2);
			$user = $parts[0] ?? '';
			$pass = $parts[1] ?? '';
		}
	}

	return [$user, $pass];
}

function require_admin_auth(){
	global $ADMIN_USER, $ADMIN_PASS;

	[$user, $pass] = pvpoke_get_basic_auth_credentials();

	$validUser = is_string($ADMIN_USER) ? $ADMIN_USER : '';
	$validPass = is_string($ADMIN_PASS) ? $ADMIN_PASS : '';

	if((! hash_equals($validUser, $user)) || (! hash_equals($validPass, $pass))){
		header('WWW-Authenticate: Basic realm="PvPoke Admin"');
		header('HTTP/1.0 401 Unauthorized');
		echo 'Unauthorized';
		exit;
	}
}
?>
