// JavaScript Document

var InterfaceMaster = (function () {
    var instance;

    function createInstance() {


        var object = new interfaceObject();

		function interfaceObject(){

			var battle;
			var ranker = RankerMaster.getInstance();
			var pokeSelectors = [];
			var animating = false;
			var self = this;
			var overridesLoaded = false;
			var overridesLoading = false;
			var overridesKey = "";
			var pendingRun = false;

			this.init = function(){

				var data = GameMaster.getInstance().data;

				$(".format-select").on("change", selectFormat);
				$(".simulate").on("click", startRanker);

				battle = new Battle();

				// Load initial overrides
				$.ajax({
					dataType: "json",
					url: webRoot + "data/overrides/all/1500.json?v=" + siteVersion,
					mimeType: "application/json",
					success: function(data) {
						if (ranker.setMoveOverrides) {
							ranker.setMoveOverrides(1500, "all", data);
							console.log("Ranking overrides loaded [" + data.length + "]");
						}
					},
					error: function(request, error) {
						console.log("Request: " + JSON.stringify(request));
						console.log(error);
					}
				});

				self.loadGetData();

				if(get && get.autorun){
					setTimeout(function(){
						startRanker();
					}, 750);
				}

			};

			// Given JSON of get parameters, load these settings

			this.loadGetData = function(){

				if(! get){
					return false;
				}

				$(".format-select option[cup='"+get["cup"]+"'][value="+get["cp"]+"]").prop("selected", "selected");

				$(".format-select").trigger("change");
			}

			// Event handler for changing the league select

			function selectFormat(e){
				var cp = $(".format-select option:selected").val();
				var cup = $(".format-select option:selected").attr("cup");

				battle.setCP(cp);
				battle.setCup(cup);

				if(! battle.getCup().levelCap){
					battle.setLevelCap(50);
				}

				loadOverrides();

				$("a.rankersandbox-link").attr("href", webRoot+"rankersandbox.php?cup="+cup+"&cp="+cp);
				$("a.rankings-link").attr("href", webRoot+"rankings/"+cup+"/"+cp+"/overall/");
			}

			// Load overrides for the currently selected league and cup

			function loadOverrides(){
				var cp = battle.getCP();
				var cupName = battle.getCup().name;
				var loadKey = cupName + "-" + cp;
				var file = webRoot+"data/overrides/"+cupName+"/"+cp+".json?v="+siteVersion;

				overridesLoaded = false;
				overridesLoading = true;
				overridesKey = loadKey;

				$.getJSON(file, function(data){
					if(overridesKey != loadKey){
						return;
					}

					if(ranker.setMoveOverrides){
						ranker.setMoveOverrides(cp, cupName, data);
						console.log("Ranking overrides loaded [" + data.length + "]");
					}
				}).fail(function(){
					if(overridesKey != loadKey){
						return;
					}

					if(ranker.setMoveOverrides){
						ranker.setMoveOverrides(cp, cupName, []);
						console.log("Ranking overrides missing [0]");
					}
				}).always(function(){
					if(overridesKey != loadKey){
						return;
					}

					overridesLoaded = true;
					overridesLoading = false;

					if(pendingRun){
						pendingRun = false;
						startRanker();
					}
				});

			}

			// Run simulation

			function startRanker(){
				var runKey = battle.getCup().name + "-" + battle.getCP();

				if((! overridesLoaded) || (overridesKey != runKey)){
					pendingRun = true;

					if((! overridesLoading) || (overridesKey != runKey)){
						loadOverrides();
					}

					return;
				}

				var cp = battle.getCP();
				var cup = battle.getCup();
				if(! ranker.setMoveSelectMode){
					ranker.rankLoop(cp, cup);
					return;
				}

				var overallFile = webRoot+"data/rankings/"+cup.name+"/overall/rankings-"+cp+".json?v="+siteVersion;

				function runForce(data){
					if(ranker.setScenarioOverrides){
						ranker.setScenarioOverrides(GameMaster.getInstance().data.rankingScenarios.slice());
					}
					if(ranker.setMoveSelectMode){
						ranker.setMoveSelectMode("force");
					}

					ranker.rankLoop(cp, cup, null, data);
				}

				function runAutoThenForce(){
					if(ranker.setScenarioOverrides){
						ranker.setScenarioOverrides(GameMaster.getInstance().data.rankingScenarios.slice());
					}
					if(ranker.setMoveSelectMode){
						ranker.setMoveSelectMode("auto");
					}

					ranker.rankLoop(cp, cup, function(autoResults){
						if(autoResults && autoResults.length > 0){
							runForce(autoResults[0]);
						} else{
							runForce();
						}
					});
				}

				// If no overall rankings exist yet, generate movesets first then run full categories
				$.ajax({
					url: overallFile,
					type: "HEAD",
					success: function(){
						runForce();
					},
					error: function(){
						runAutoThenForce();
					}
				});
			}
		};

        return object;
    }

    return {
        getInstance: function () {
            if (!instance) {
                instance = createInstance();
            }
            return instance;
        }
    };
})();
