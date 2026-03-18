#!/usr/bin/env node
/* eslint-disable no-console */

const { chromium } = require("playwright");

const DEFAULT_CUP = "all";
const DEFAULT_TEAM_SIZE = 6;
const DEFAULT_TOP_N = 3;
const DEFAULT_TIMEOUT_MINUTES = 45;
const DEFAULT_SEARCH_DEPTH = "deep";
const DEFAULT_DUPLICATE_POLICY = "type-diverse";
const DEFAULT_LIKELY_THREAT_WEIGHT = 2.0;
const NAV_TIMEOUT_MS = 120000;

const SEARCH_PROFILES = {
	fast: {
		seedCount: 6,
		beamWidth: 4,
		branchWidth: 4,
	},
	medium: {
		seedCount: 12,
		beamWidth: 8,
		branchWidth: 6,
	},
	deep: {
		seedCount: 20,
		beamWidth: 14,
		branchWidth: 10,
	},
};

const DUPLICATE_POLICIES = new Set(["type-diverse", "strict", "any"]);

function toPositiveInt(value, fallback) {
	if (value === undefined || value === null || value === "") {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function parseOptionalInt(value) {
	if (value === undefined || value === null || value === "") {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return null;
	}

	return parsed;
}

function parsePositiveFloat(value, fallback, label) {
	if (value === undefined || value === null || value === "") {
		return fallback;
	}

	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive number.`);
	}

	return parsed;
}

function parseSpeciesIdCsv(value) {
	if (!value) {
		return [];
	}

	const ids = String(value)
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);

	return Array.from(new Set(ids));
}

function normalizeBaseUrl(inputUrl) {
	if (!inputUrl) {
		return "http://127.0.0.1/pvpoke/src";
	}

	return inputUrl.replace(/\/+$/, "");
}

function normalizeSearchDepth(input) {
	if (!input) {
		return DEFAULT_SEARCH_DEPTH;
	}

	const value = String(input).toLowerCase();
	if (!Object.prototype.hasOwnProperty.call(SEARCH_PROFILES, value)) {
		throw new Error(`Invalid --search-depth value: ${input}. Allowed: fast, medium, deep`);
	}

	return value;
}

function normalizeDuplicatePolicy(input) {
	if (!input) {
		return DEFAULT_DUPLICATE_POLICY;
	}

	const value = String(input).toLowerCase();
	if (!DUPLICATE_POLICIES.has(value)) {
		throw new Error(`Invalid --duplicate-policy value: ${input}. Allowed: type-diverse, strict, any`);
	}

	return value;
}

function parseConfigFromEnv() {
	const cup = process.env.CUP || DEFAULT_CUP;
	const cp = parseOptionalInt(process.env.CP);
	const format = (process.env.FORMAT || "").trim();
	const teamSize = toPositiveInt(process.env.TEAM_SIZE, DEFAULT_TEAM_SIZE);
	const topN = toPositiveInt(process.env.TOP_N, DEFAULT_TOP_N);
	const timeoutMinutes = toPositiveInt(process.env.TIMEOUT_MINUTES, DEFAULT_TIMEOUT_MINUTES);
	const searchDepth = normalizeSearchDepth(process.env.SEARCH_DEPTH);
	const duplicatePolicy = normalizeDuplicatePolicy(process.env.DUPLICATE_POLICY);
	const likelyThreats = parseSpeciesIdCsv(process.env.LIKELY_THREATS);
	const likelyThreatWeight = parsePositiveFloat(process.env.LIKELY_THREAT_WEIGHT, DEFAULT_LIKELY_THREAT_WEIGHT, "LIKELY_THREAT_WEIGHT");
	const buildAround = parseSpeciesIdCsv(process.env.BUILD_AROUND);
	const excludeSpecies = parseSpeciesIdCsv(process.env.EXCLUDE_SPECIES);
	const jsonOutput = process.env.JSON_OUTPUT === "1";
	const allowShadows = process.env.ALLOW_SHADOWS !== "0";
	const allowXL = process.env.ALLOW_XL !== "0";
	const baseUrl = normalizeBaseUrl(process.env.BASE_URL);

	if (teamSize <= 0) {
		throw new Error("TEAM_SIZE must be a positive integer.");
	}

	if (topN <= 0) {
		throw new Error("TOP_N must be a positive integer.");
	}

	if (!baseUrl) {
		throw new Error("BASE_URL must be non-empty.");
	}

	if (format && process.env.CUP && process.env.CUP !== DEFAULT_CUP) {
		throw new Error("FORMAT cannot be combined with CUP.");
	}

	if (format && process.env.CP && process.env.CP !== "") {
		throw new Error("FORMAT cannot be combined with CP.");
	}

	if (buildAround.length > teamSize) {
		throw new Error("BUILD_AROUND cannot contain more species than TEAM_SIZE.");
	}

	const overlap = buildAround.filter((speciesId) => excludeSpecies.includes(speciesId));
	if (overlap.length > 0) {
		throw new Error(`BUILD_AROUND and EXCLUDE_SPECIES overlap: ${overlap.join(", ")}`);
	}

	return {
		cup,
		cp,
		format,
		teamSize,
		topN,
		timeoutMinutes,
		searchDepth,
		searchProfile: SEARCH_PROFILES[searchDepth],
		duplicatePolicy,
		likelyThreats,
		likelyThreatWeight,
		buildAround,
		excludeSpecies,
		allowShadows,
		allowXL,
		baseUrl,
		jsonOutput,
	};
}

function printHumanReadable(result) {
	const config = result.config;
	const resolved = result.resolved;

	console.log(`[config] baseUrl=${config.baseUrl}`);
	console.log(`[config] cup=${resolved.cup} cp=${resolved.cp} format=${resolved.formatTitle || "(none)"}`);
	console.log(`[config] cpSource=${resolved.cpSource} metaGroup=${resolved.metaGroup}`);
	console.log(`[config] teamSize=${config.teamSize} topN=${config.topN} searchDepth=${config.searchDepth}`);
	console.log(`[config] timeoutMinutes=${config.timeoutMinutes}`);
	console.log(`[config] searchProfile seed=${config.searchProfile.seedCount} beam=${config.searchProfile.beamWidth} branch=${config.searchProfile.branchWidth}`);
	console.log(`[config] duplicatePolicy=${config.duplicatePolicy} allowShadows=${config.allowShadows ? "1" : "0"} allowXL=${config.allowXL ? "1" : "0"}`);
	console.log(`[config] likelyThreats=${config.likelyThreats.length > 0 ? config.likelyThreats.join(",") : "(none)"} likelyThreatWeight=${config.likelyThreatWeight}`);
	console.log(`[config] buildAround=${config.buildAround.length > 0 ? config.buildAround.join(",") : "(none)"} excludeSpecies=${config.excludeSpecies.length > 0 ? config.excludeSpecies.join(",") : "(none)"}`);
	console.log(`[result] evaluated=${result.stats.evaluatedTeamCount} returned=${result.teams.length} elapsedMs=${result.stats.elapsedMs}`);

	result.teams.forEach((team, index) => {
		const labels = team.members.map((member) => member.speciesName).join(", ");
		console.log(`\n#${index + 1} score=${team.balancedScore.toFixed(4)} team=${labels}`);
		console.log(`  grades: coverage=${team.grades.coverage} bulk=${team.grades.bulk} safety=${team.grades.safety} consistency=${team.grades.consistency}`);
		console.log(`  normalized: coverage=${team.normalized.coverage.toFixed(4)} bulk=${team.normalized.bulk.toFixed(4)} safety=${team.normalized.safety.toFixed(4)} consistency=${team.normalized.consistency.toFixed(4)}`);
		const likelyThreatScoreStr = team.raw.likelyAvgThreatScore === null ? "n/a" : team.raw.likelyAvgThreatScore.toFixed(2);
		console.log(`  raw: coverageMetric=${team.raw.coverageMetric.toFixed(2)} avgThreatScore=${team.raw.avgThreatScore.toFixed(2)} metaAvgThreatScore=${team.raw.metaAvgThreatScore.toFixed(2)} likelyAvgThreatScore=${likelyThreatScoreStr} blendedAvgThreatScore=${team.raw.blendedAvgThreatScore.toFixed(2)} bulk=${team.raw.averageBulk.toFixed(2)} safety=${team.raw.averageSafety.toFixed(2)} consistency=${team.raw.averageConsistency.toFixed(2)}`);
		console.log(`  speciesIds: ${team.members.map((member) => member.speciesId).join(",")}`);
	});
}

async function runGeneration(config) {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({ serviceWorkers: "block" });
	const page = await context.newPage();
	const maxRunMs = config.timeoutMinutes * 60 * 1000;
	const dataTimeoutMs = Math.max(5000, Math.min(maxRunMs, 120000));

	try {
		const url = `${config.baseUrl}/team-builder/?headless=1&t=${Date.now()}`;
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

		await page.waitForFunction(() => {
			if (typeof GameMaster === "undefined") {
				return false;
			}

			const gm = GameMaster.getInstance();
			return Array.isArray(gm?.data?.pokemon) && gm.data.pokemon.length > 0;
		}, { timeout: NAV_TIMEOUT_MS });

		const evaluatePromise = page.evaluate(async (input) => {
			const SCORECARD_COUNT = 20;
			const likelyThreatIds = Array.isArray(input.likelyThreats) ? input.likelyThreats : [];
			const buildAroundIds = Array.isArray(input.buildAround) ? input.buildAround : [];
			const excludeSpeciesIds = Array.isArray(input.excludeSpecies) ? input.excludeSpecies : [];
			const likelyThreatWeight = Number.isFinite(input.likelyThreatWeight) ? input.likelyThreatWeight : 2;

			function slugify(value) {
				return String(value || "")
					.toLowerCase()
					.trim()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-+|-+$/g, "");
			}

			function clamp01(value) {
				if (value < 0) {
					return 0;
				}

				if (value > 1) {
					return 1;
				}

				return value;
			}

			function normalizeTypeSignature(pokemon) {
				const primary = pokemon?.types?.[0] || "none";
				const secondary = pokemon?.types?.[1] || "none";
				const normalized = [primary || "none", secondary || "none"].sort();
				return `${normalized[0]}/${normalized[1]}`;
			}

			function calculateLetterGrade(value, goal) {
				const gradeScale = [
					{ letter: "A", value: 0.9 },
					{ letter: "B", value: 0.8 },
					{ letter: "C", value: 0.7 },
					{ letter: "D", value: 0.6 },
				];

				const percentage = value / goal;
				let letter = "F";

				for (let i = gradeScale.length - 1; i >= 0; i -= 1) {
					if (percentage >= gradeScale[i].value) {
						letter = gradeScale[i].letter;
					}
				}

				return letter;
			}

			function teamKey(team) {
				return team
					.map((pokemon) => pokemon.speciesId)
					.sort()
					.join("|");
			}

			function chooseMetaFallback(cp) {
				if (cp === 500) {
					return "littlegeneral";
				}

				if (cp === 1500) {
					return "great";
				}

				if (cp === 2500) {
					return "ultra";
				}

				if (cp === 10000) {
					return "master";
				}

				return "master";
			}

			function resolveTarget(gm, query) {
				const formats = Array.isArray(gm.data.formats) ? gm.data.formats : [];
				const cups = Array.isArray(gm.data.cups) ? gm.data.cups : [];

				if (query.format) {
					const formatQuery = String(query.format).toLowerCase();
					const matches = formats.filter((format) => {
						const candidates = [
							format.slug,
							format.id,
							format.cup,
							format.title,
							slugify(format.title),
							`${format.cup}-${format.cp}`,
							slugify(`${format.title}-${format.cp}`),
						].filter(Boolean);

						return candidates.some((candidate) => {
							const lowered = String(candidate).toLowerCase();
							return lowered === formatQuery || slugify(lowered) === formatQuery;
						});
					});

					if (matches.length === 0) {
						throw new Error(`No format matched "${query.format}".`);
					}

					if (matches.length > 1) {
						const labels = matches.map((match) => `${match.title} (${match.cup}/${match.cp})`).join(", ");
						throw new Error(`Format "${query.format}" is ambiguous. Matches: ${labels}`);
					}

					const selectedFormat = matches[0];
					return {
						cup: selectedFormat.cup,
						cp: Number.parseInt(selectedFormat.cp, 10),
						formatTitle: selectedFormat.title || selectedFormat.cup,
						metaGroup: selectedFormat.meta || chooseMetaFallback(Number.parseInt(selectedFormat.cp, 10)),
						cpSource: "format",
					};
				}

				const cup = query.cup || "all";
				const cupExists = cups.some((entry) => entry.name === cup);
				if (!cupExists) {
					throw new Error(`Cup "${cup}" does not exist in current gamemaster.`);
				}

				let cp = Number.isFinite(query.cp) ? query.cp : null;
				let cpSource = "input";

				if (!cp) {
					const cupFormats = formats.filter((format) => format.cup === cup);
					const uniqueCps = Array.from(new Set(
						cupFormats
							.map((format) => Number.parseInt(format.cp, 10))
							.filter((value) => Number.isFinite(value)),
					));

					if (uniqueCps.length === 1) {
						cp = uniqueCps[0];
						cpSource = "format";
					}
				}

				if (!cp) {
					const cupObj = cups.find((entry) => entry.name === cup);
					const league = Number.parseInt(cupObj?.league, 10);
					if (Number.isFinite(league) && league > 0) {
						cp = league;
						cpSource = "cup.league";
					}
				}

				if (!cp) {
					cp = 10000;
					cpSource = "fallback";
				}

				const selectedFormat = formats.find((format) => format.cup === cup && Number.parseInt(format.cp, 10) === cp);
				const metaGroup = selectedFormat?.meta || chooseMetaFallback(cp);

				return {
					cup,
					cp,
					formatTitle: selectedFormat?.title || cup,
					metaGroup,
					cpSource,
				};
			}

			function ensureRanking(gm, cup, cp, timeoutMs) {
				return new Promise((resolve, reject) => {
					const key = `${cup}overall${cp}`;
					if (gm.rankings[key]) {
						resolve(gm.rankings[key]);
						return;
					}

					let completed = false;
					const timer = setTimeout(() => {
						if (completed) {
							return;
						}
						completed = true;
						reject(new Error(`Timed out loading overall rankings for ${cup}/${cp}.`));
					}, timeoutMs);

					gm.loadRankingData({
						displayRankingData: (data) => {
							if (completed) {
								return;
							}
							completed = true;
							clearTimeout(timer);
							resolve(data);
						},
					}, "overall", cp, cup);
				});
			}

			function ensureGroup(gm, group, timeoutMs) {
				return new Promise((resolve, reject) => {
					if (!group) {
						resolve([]);
						return;
					}

					if (gm.groups[group]) {
						resolve(gm.groups[group]);
						return;
					}

					let completed = false;
					const timer = setTimeout(() => {
						if (completed) {
							return;
						}
						completed = true;
						reject(new Error(`Timed out loading meta group ${group}.`));
					}, timeoutMs);

					gm.loadGroupData({
						displayRankingData: (data) => {
							if (completed) {
								return;
							}
							completed = true;
							clearTimeout(timer);
							resolve(data);
						},
					}, group);
				});
			}

			function buildSafetyMap(overallRankings) {
				const map = {};

				overallRankings.forEach((entry) => {
					if (Array.isArray(entry?.scores) && entry.scores.length > 2) {
						map[entry.speciesId] = entry.scores[2];
					}
				});

				return map;
			}

			const gm = GameMaster.getInstance();
			const resolved = resolveTarget(gm, input);

			const battle = new Battle();
			battle.setCP(resolved.cp);
			battle.setCup(resolved.cup);

			const cup = battle.getCup();
			if (!cup || cup.name !== resolved.cup) {
				throw new Error(`Unable to set cup "${resolved.cup}".`);
			}

			const overallRankings = await ensureRanking(gm, resolved.cup, resolved.cp, input.dataTimeoutMs);
			const metaGroup = await ensureGroup(gm, resolved.metaGroup, input.dataTimeoutMs);
			const safetyMap = buildSafetyMap(overallRankings);
			const knownSpeciesSet = new Set((Array.isArray(gm.data.pokemon) ? gm.data.pokemon : []).map((pokemon) => pokemon.speciesId));
			const eligibleSpeciesSet = new Set(overallRankings.map((entry) => entry.speciesId));

			function assertKnownSpeciesIds(ids, label) {
				const unknown = ids.filter((speciesId) => !knownSpeciesSet.has(speciesId));
				if (unknown.length > 0) {
					throw new Error(`Unknown species ID(s) in ${label}: ${unknown.join(", ")}`);
				}
			}

			function assertSpeciesInContext(ids, label) {
				const unavailable = ids.filter((speciesId) => !eligibleSpeciesSet.has(speciesId));
				if (unavailable.length > 0) {
					throw new Error(`Species in ${label} are not available for ${resolved.cup}/${resolved.cp}: ${unavailable.join(", ")}`);
				}
			}

			if (!Number.isFinite(likelyThreatWeight) || likelyThreatWeight <= 0) {
				throw new Error("LIKELY_THREAT_WEIGHT must be a positive number.");
			}

			if (buildAroundIds.length > input.teamSize) {
				throw new Error("BUILD_AROUND cannot contain more species than TEAM_SIZE.");
			}

			assertKnownSpeciesIds(likelyThreatIds, "LIKELY_THREATS");
			assertKnownSpeciesIds(buildAroundIds, "BUILD_AROUND");
			assertKnownSpeciesIds(excludeSpeciesIds, "EXCLUDE_SPECIES");
			assertSpeciesInContext(likelyThreatIds, "LIKELY_THREATS");
			assertSpeciesInContext(buildAroundIds, "BUILD_AROUND");
			assertSpeciesInContext(excludeSpeciesIds, "EXCLUDE_SPECIES");

			const overlapSpecies = buildAroundIds.filter((speciesId) => excludeSpeciesIds.includes(speciesId));
			if (overlapSpecies.length > 0) {
				throw new Error(`BUILD_AROUND and EXCLUDE_SPECIES overlap: ${overlapSpecies.join(", ")}`);
			}

			const excludedSpeciesSet = new Set(excludeSpeciesIds);

			const ranker = RankerMaster.getInstance();
			ranker.setShieldMode("average");
			ranker.setRecommendMoveUsage(true);
			ranker.setPrioritizeMeta(true);

			const teamSettings = getDefaultMultiBattleSettings();
			const opponentSettings = getDefaultMultiBattleSettings();
			teamSettings.shields = 1;
			opponentSettings.shields = 1;
			teamSettings.bait = 1;
			opponentSettings.bait = 1;
			ranker.applySettings(teamSettings, 0);
			ranker.applySettings(opponentSettings, 1);
			ranker.setMetaGroup(Array.isArray(metaGroup) ? metaGroup : []);

			function createPokemon(speciesId) {
				const pokemon = new Pokemon(speciesId, 0, battle);
				pokemon.initialize(resolved.cp);
				pokemon.selectRecommendedMoveset();
				return pokemon;
			}

			function calculateUsedSlots(team) {
				const usedSlots = [];
				if (!battle.getCup().slots) {
					return usedSlots;
				}

				for (let n = 0; n < team.length; n += 1) {
					const slots = team[n].getSlotNumbers(battle.getCup(), false);
					if (slots.length === 1) {
						usedSlots.push(slots[0]);
					} else if (slots.length > 1) {
						for (let j = 0; j < slots.length; j += 1) {
							if (!usedSlots.includes(slots[j])) {
								usedSlots.push(slots[j]);
								break;
							}
						}
					}
				}

				return usedSlots;
			}

			function buildAlternativeExclusionList(team) {
				const exclusionList = team.map((pokemon) => pokemon.speciesId);

				if (battle.getCup().tierRules) {
					const cliffObj = {
						max: battle.getCup().tierRules.max,
						floor: battle.getCup().tierRules.floor,
						tiers: battle.getCup().tierRules.tiers,
					};

					let points = 0;
					for (let i = 0; i < team.length; i += 1) {
						points += gm.getPokemonTier(team[i].speciesId, battle.getCup());
					}

					let remainingPoints = cliffObj.max - points;
					const remainingPicks = input.teamSize - team.length;
					remainingPoints -= (remainingPicks - 1) * cliffObj.floor;

					for (let i = 0; i < cliffObj.tiers.length; i += 1) {
						if (remainingPoints < cliffObj.tiers[i].points) {
							for (let n = 0; n < cliffObj.tiers[i].pokemon.length; n += 1) {
								exclusionList.push(cliffObj.tiers[i].pokemon[n]);
								exclusionList.push(`${cliffObj.tiers[i].pokemon[n]}_shadow`);
								exclusionList.push(`${cliffObj.tiers[i].pokemon[n]}_xl`);
							}
						}
					}
				}

				if (battle.getCup().restrictedPokemon) {
					let restrictedPicks = 0;
					for (let i = 0; i < team.length; i += 1) {
						let restrictedId = team[i].aliasId ? team[i].aliasId : team[i].speciesId;
						restrictedId = restrictedId.replace("_shadow", "");
						restrictedId = restrictedId.replace("_xl", "");

						if (battle.getCup().restrictedPokemon.indexOf(restrictedId) > -1) {
							restrictedPicks += 1;
						}
					}

					if (restrictedPicks >= battle.getCup().restrictedPicks) {
						for (let n = 0; n < battle.getCup().restrictedPokemon.length; n += 1) {
							exclusionList.push(battle.getCup().restrictedPokemon[n]);
						}
					}
				}

				return exclusionList;
			}

			function violatesDuplicatePolicy(team, candidatePokemon) {
				if (input.duplicatePolicy === "any") {
					return false;
				}

				if (input.duplicatePolicy === "strict") {
					return team.some((teamPokemon) => teamPokemon.dex === candidatePokemon.dex);
				}

				const candidateSignature = normalizeTypeSignature(candidatePokemon);
				return team.some((teamPokemon) => {
					if (teamPokemon.dex !== candidatePokemon.dex) {
						return false;
					}

					return normalizeTypeSignature(teamPokemon) === candidateSignature;
				});
			}

			function isPokemonInExclusionList(pokemon, exclusionList) {
				const candidateId = pokemon.speciesId;
				const canonicalId = pokemon.aliasId ? pokemon.aliasId : candidateId;
				const canonicalNoShadow = canonicalId.replace("_shadow", "");

				return exclusionList.includes(candidateId)
					|| exclusionList.includes(canonicalId)
					|| exclusionList.includes(canonicalNoShadow);
			}

			function canAddCandidateToTeam(team, pokemon, progressionExclusionList = null) {
				const speciesId = pokemon.speciesId;
				const usedSlots = calculateUsedSlots(team);

				if (excludedSpeciesSet.has(speciesId)) {
					return false;
				}

				if ((speciesId.indexOf("_shadow") > -1) && (!input.allowShadows)) {
					return false;
				}

				if ((speciesId.indexOf("_xs") > -1) && (input.allowXL)) {
					return false;
				}

				if (pokemon.needsXLCandy() && (!input.allowXL)) {
					return false;
				}

				if (pokemon.hasTag("mega") && team.some((teamPokemon) => teamPokemon.hasTag("mega"))) {
					return false;
				}

				if (violatesDuplicatePolicy(team, pokemon)) {
					return false;
				}

				if (battle.getCup().name === "labyrinth") {
					const excludedTypes = [];
					for (let n = 0; n < team.length; n += 1) {
						excludedTypes.push(team[n].types[0]);
						if (team[n].types[1] !== "none") {
							excludedTypes.push(team[n].types[1]);
						}
					}

					if ((excludedTypes.indexOf(pokemon.types[0]) > -1) || (excludedTypes.indexOf(pokemon.types[1]) > -1)) {
						return false;
					}
				}

				if (battle.getCup().slots && team.length < input.teamSize) {
					const slots = pokemon.getSlotNumbers(battle.getCup(), false);
					if (slots.every((slot) => usedSlots.includes(slot))) {
						return false;
					}
				}

				if (progressionExclusionList && isPokemonInExclusionList(pokemon, progressionExclusionList)) {
					return false;
				}

				return true;
			}

			function validateBuildAroundCore(coreTeam) {
				let workingTeam = [];

				for (let i = 0; i < coreTeam.length; i += 1) {
					const pokemon = coreTeam[i];
					const progressionExclusionList = buildAlternativeExclusionList(workingTeam);

					if (!canAddCandidateToTeam(workingTeam, pokemon, progressionExclusionList)) {
						throw new Error(`BUILD_AROUND species "${pokemon.speciesId}" is not valid with current constraints.`);
					}

					workingTeam = workingTeam.concat([pokemon]);
				}
			}

			function filterAlternativeCandidates(team, altRankings) {
				const filtered = [];
				const progressionExclusionList = buildAlternativeExclusionList(team);

				for (let i = 0; i < altRankings.length; i += 1) {
					const ranking = altRankings[i];
					const pokemon = ranking.pokemon;

					if (!pokemon) {
						continue;
					}

					if (canAddCandidateToTeam(team, pokemon, progressionExclusionList)) {
						filtered.push(ranking);
					}
				}

				return filtered;
			}

			const evalCache = new Map();

			function evaluateTeam(team) {
				const key = teamKey(team);
				if (evalCache.has(key)) {
					return evalCache.get(key);
				}

				const data = ranker.rank(team, resolved.cp, battle.getCup(), [], "team-counters");
				const counterRankings = data.rankings;

				let metaThreatScoreTotal = 0;
				let count = 0;
				let i = 0;
				const counterTeam = [];

				while (((count < SCORECARD_COUNT) || (counterTeam.length < 6)) && (i < counterRankings.length)) {
					const ranking = counterRankings[i];

					if ((ranking.speciesId.indexOf("_shadow") > -1) && (!input.allowShadows)) {
						i += 1;
						continue;
					}

					if (ranking.speciesId.indexOf("_xs") > -1) {
						i += 1;
						continue;
					}

					if (ranking.pokemon.hasTag("teambuilderexclude")) {
						i += 1;
						continue;
					}

					if (counterTeam.length < 6) {
						const similarCounterExists = counterTeam.some((counter) => {
							const similarityScore = counter.calculateSimilarity(ranking.pokemon, ranking.pokemon?.traits, false);
							return similarityScore === -1 || similarityScore >= 1000;
						});

						if (!similarCounterExists) {
							counterTeam.push(ranking.pokemon);
							metaThreatScoreTotal += ranking.rating;
						}
					}

					count += 1;
					i += 1;
				}

				const metaAvgThreatScore = Math.round(metaThreatScoreTotal / 6);

				let likelyAvgThreatScore = null;
				if (likelyThreatIds.length > 0) {
					const rankingMap = {};

					for (let n = 0; n < counterRankings.length; n += 1) {
						rankingMap[counterRankings[n].speciesId] = counterRankings[n].rating;
					}

					const missingLikelyThreats = likelyThreatIds.filter((speciesId) => !Object.prototype.hasOwnProperty.call(rankingMap, speciesId));
					if (missingLikelyThreats.length > 0) {
						throw new Error(`Likely threats are unavailable for ${resolved.cup}/${resolved.cp}: ${missingLikelyThreats.join(", ")}`);
					}

					const likelyThreatScoreTotal = likelyThreatIds.reduce((sum, speciesId) => sum + rankingMap[speciesId], 0);
					likelyAvgThreatScore = likelyThreatScoreTotal / likelyThreatIds.length;
				}

				let blendedAvgThreatScore = metaAvgThreatScore;
				if (likelyAvgThreatScore !== null) {
					blendedAvgThreatScore = (metaAvgThreatScore + (likelyThreatWeight * likelyAvgThreatScore)) / (1 + likelyThreatWeight);
				}

				const coverageMetric = 1200 - Math.round(blendedAvgThreatScore);

				const exclusionList = buildAlternativeExclusionList(team);
				const altResult = ranker.rank(counterTeam, resolved.cp, battle.getCup(), exclusionList, "team-alternatives");
				const altRankings = altResult.rankings;
				altRankings.sort((a, b) => (a.matchupAltScore > b.matchupAltScore ? -1 : (b.matchupAltScore > a.matchupAltScore ? 1 : 0)));

				let averageBulk = 0;
				const leagueAverageBulk = [22000, 35000, 35000, 10000];
				let goalBulk = leagueAverageBulk[0];

				for (let n = 0; n < team.length; n += 1) {
					team[n].fullReset();
					averageBulk += team[n].getEffectiveStat(1) * team[n].stats.hp;
				}

				averageBulk /= team.length;

				if (battle.getCP() === 2500) {
					goalBulk = leagueAverageBulk[1];
					if (battle.getCup().name === "premier") {
						goalBulk = 33000;
					}
				} else if (battle.getCP() === 10000) {
					goalBulk = leagueAverageBulk[2];
				} else if (battle.getCP() === 500) {
					goalBulk = leagueAverageBulk[3];
				}

				let averageSafety = 0;
				for (let n = 0; n < team.length; n += 1) {
					const safety = Object.prototype.hasOwnProperty.call(safetyMap, team[n].speciesId) ? safetyMap[team[n].speciesId] : 60;
					averageSafety += safety;
				}
				averageSafety /= team.length;

				let averageConsistency = 0;
				for (let n = 0; n < team.length; n += 1) {
					averageConsistency += team[n].calculateConsistency();
				}
				averageConsistency /= team.length;

				const normalized = {
					coverage: clamp01(coverageMetric / 680),
					bulk: clamp01(averageBulk / goalBulk),
					safety: clamp01(averageSafety / 98),
					consistency: clamp01(averageConsistency / 98),
				};

				const balancedScore = (normalized.coverage + normalized.bulk + normalized.safety + normalized.consistency) / 4;

				const evaluated = {
					team,
					teamKey: key,
					altRankings,
					counterTeam,
					balancedScore,
					normalized,
					raw: {
						coverageMetric,
						avgThreatScore: blendedAvgThreatScore,
						metaAvgThreatScore,
						likelyAvgThreatScore,
						blendedAvgThreatScore,
						averageBulk,
						averageSafety,
						averageConsistency,
						goalBulk,
					},
					grades: {
						coverage: calculateLetterGrade(coverageMetric, 680),
						bulk: calculateLetterGrade(averageBulk, goalBulk),
						safety: calculateLetterGrade(averageSafety, 98),
						consistency: calculateLetterGrade(averageConsistency, 98),
					},
				};

				evalCache.set(key, evaluated);
				return evaluated;
			}

			function makeHeuristic(parentEvaluation, candidateRanking) {
				const altNorm = clamp01(candidateRanking.matchupAltScore / 1000);
				return (parentEvaluation.balancedScore * 0.55) + (altNorm * 0.45);
			}

			function extractTeamMembers(team) {
				return team.map((pokemon) => ({
					speciesId: pokemon.speciesId,
					speciesName: pokemon.speciesName,
					dex: pokemon.dex,
					types: [pokemon.types[0], pokemon.types[1]],
				}));
			}

			function buildAroundTeam() {
				const coreTeam = buildAroundIds.map((speciesId) => createPokemon(speciesId));
				validateBuildAroundCore(coreTeam);
				return coreTeam;
			}

			function buildInitialSeedTeams() {
				const seeds = [];
				let index = 0;
				const coreTeam = buildAroundTeam();
				const coreProgressionExclusionList = buildAlternativeExclusionList(coreTeam);

				if (coreTeam.length === input.teamSize) {
					return [{
						team: coreTeam,
						heuristic: 0,
					}];
				}

				if (coreTeam.length > 0) {
					while (seeds.length < input.searchProfile.seedCount && index < overallRankings.length) {
						const candidate = overallRankings[index];
						index += 1;

						if (!candidate?.speciesId) {
							continue;
						}

						const pokemon = createPokemon(candidate.speciesId);
						if (!canAddCandidateToTeam(coreTeam, pokemon, coreProgressionExclusionList)) {
							continue;
						}

						seeds.push({
							team: coreTeam.concat([pokemon]),
							heuristic: 0,
						});
					}

					if (seeds.length === 0) {
						throw new Error("No valid teams could be generated from BUILD_AROUND with current constraints.");
					}

					return seeds;
				}

				const initialProgressionExclusionList = buildAlternativeExclusionList([]);
				while (seeds.length < input.searchProfile.seedCount && index < overallRankings.length) {
					const candidate = overallRankings[index];
					index += 1;

					if (!candidate?.speciesId) {
						continue;
					}

					const pokemon = createPokemon(candidate.speciesId);
					if (!canAddCandidateToTeam([], pokemon, initialProgressionExclusionList)) {
						continue;
					}

					seeds.push({
						team: [pokemon],
						heuristic: 0,
					});
				}

				if (seeds.length === 0) {
					throw new Error("No valid seed teams could be generated for this configuration.");
				}

				return seeds;
			}

			const startTime = performance.now();
			let beam = buildInitialSeedTeams();
			const initialTeamSize = beam.length > 0 ? beam[0].team.length : 0;

			for (let depth = initialTeamSize; depth < input.teamSize; depth += 1) {
				const nextBeam = [];
				const seenAtDepth = new Set();

				for (let i = 0; i < beam.length; i += 1) {
					const parent = beam[i];
					const parentEvaluation = evaluateTeam(parent.team);
					const candidates = filterAlternativeCandidates(parent.team, parentEvaluation.altRankings)
						.slice(0, input.searchProfile.branchWidth);

					for (let n = 0; n < candidates.length; n += 1) {
						const candidate = candidates[n];
						const candidatePokemon = createPokemon(candidate.pokemon.speciesId);
						const childTeam = parent.team.concat([candidatePokemon]);
						const childKey = teamKey(childTeam);

						if (seenAtDepth.has(childKey)) {
							continue;
						}

						seenAtDepth.add(childKey);
						nextBeam.push({
							team: childTeam,
							heuristic: makeHeuristic(parentEvaluation, candidate),
						});
					}
				}

				nextBeam.sort((a, b) => (a.heuristic > b.heuristic ? -1 : (b.heuristic > a.heuristic ? 1 : 0)));
				beam = nextBeam.slice(0, input.searchProfile.beamWidth);

				if (beam.length === 0) {
					break;
				}
			}

			const uniqueFinalTeams = new Map();
			for (let i = 0; i < beam.length; i += 1) {
				const evaluated = evaluateTeam(beam[i].team);
				if (!uniqueFinalTeams.has(evaluated.teamKey)) {
					uniqueFinalTeams.set(evaluated.teamKey, evaluated);
				}
			}

			const finalTeams = Array.from(uniqueFinalTeams.values())
				.sort((a, b) => (a.balancedScore > b.balancedScore ? -1 : (b.balancedScore > a.balancedScore ? 1 : 0)))
				.slice(0, input.topN)
				.map((entry) => ({
					members: extractTeamMembers(entry.team),
					balancedScore: entry.balancedScore,
					normalized: entry.normalized,
					raw: entry.raw,
					grades: entry.grades,
				}));

			const elapsedMs = Math.round(performance.now() - startTime);

			return {
				resolved: {
					cup: resolved.cup,
					cp: resolved.cp,
					formatTitle: resolved.formatTitle,
					metaGroup: resolved.metaGroup,
					cpSource: resolved.cpSource,
				},
				teams: finalTeams,
				stats: {
					elapsedMs,
					evaluatedTeamCount: uniqueFinalTeams.size,
					cacheSize: evalCache.size,
				},
			};
		}, {
			cup: config.cup,
			cp: config.cp,
			format: config.format,
			teamSize: config.teamSize,
			topN: config.topN,
			searchProfile: config.searchProfile,
			duplicatePolicy: config.duplicatePolicy,
			likelyThreats: config.likelyThreats,
			likelyThreatWeight: config.likelyThreatWeight,
			buildAround: config.buildAround,
			excludeSpecies: config.excludeSpecies,
			allowShadows: config.allowShadows,
			allowXL: config.allowXL,
			dataTimeoutMs,
		});
		let timeoutId;
		const timeoutPromise = new Promise((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(`Team generation timed out after ${config.timeoutMinutes} minute(s).`));
			}, maxRunMs);
		});
		const payload = await Promise.race([evaluatePromise, timeoutPromise]);
		clearTimeout(timeoutId);

		return {
			config: {
				baseUrl: config.baseUrl,
				teamSize: config.teamSize,
				topN: config.topN,
				searchDepth: config.searchDepth,
				searchProfile: config.searchProfile,
				duplicatePolicy: config.duplicatePolicy,
				likelyThreats: config.likelyThreats,
				likelyThreatWeight: config.likelyThreatWeight,
				buildAround: config.buildAround,
				excludeSpecies: config.excludeSpecies,
				allowShadows: config.allowShadows,
				allowXL: config.allowXL,
				timeoutMinutes: config.timeoutMinutes,
			},
			resolved: payload.resolved,
			teams: payload.teams,
			stats: payload.stats,
		};
	} finally {
		await context.close();
		await browser.close();
	}
}

async function run() {
	const config = parseConfigFromEnv();
	const result = await runGeneration(config);

	if (config.jsonOutput) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	printHumanReadable(result);
}

run().catch((error) => {
	console.error("[error]", error.message || error);
	process.exit(1);
});
