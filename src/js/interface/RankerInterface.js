// JavaScript Document

var InterfaceMaster = (function () {
    var instance;

    function createInstance() {


        var object = new interfaceObject();

		function interfaceObject(){

			var battle;
			var ranker = RankerMaster.getInstance();
			var gm = GameMaster.getInstance();
			var pokeSelectors = [];
			var animating = false;
			var self = this;

			this.init = function(){

				$(".format-select").on("change", selectFormat);
				$(".simulate").on("click", startRanker);

				battle = new Battle();

				// Load initial overrides
				gm.loadRankingOverrides("all", 1500, function(data){
					if(ranker.setMoveOverrides){
						ranker.setMoveOverrides(1500, "all", data);
						console.log("Ranking overrides loaded [" + data.length + "]");
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

				gm.loadRankingOverrides(battle.getCup().name, battle.getCP(), function(data){
					if(ranker.setMoveOverrides){
						ranker.setMoveOverrides(battle.getCP(), battle.getCup().name, data);
						console.log("Ranking overrides loaded [" + data.length + "]");
					}
				});
			}

			// Run simulation

			function startRanker(){
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
