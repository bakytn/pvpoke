// JavaScript Document

function Main(){

	var interface;
	var gm;

	init();

	function init(){
		gm = GameMaster.getInstance();
	}

	this.getGM = function(){
		return gm;
	}
}

var main = new Main();
