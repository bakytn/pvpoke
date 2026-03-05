/*
* Interface functionality for move list and explorer
*/

const InterfaceMaster = (function () {

	let instance;

	class InterfaceMaster {
		constructor() {
			this.gm = GameMaster.getInstance();
		}
	}

	return {
		getInstance: () => {
			instance = instance || new InterfaceMaster();
			return instance;
		}
	}
})();
