#!/usr/bin/env node
/* eslint-disable no-console */

const { chromium } = require("playwright");

const DEFAULT_CUP = "all";
const DEFAULT_CP = "10000";
const DEFAULT_TIMEOUT_MINUTES = 45;
const NAV_TIMEOUT_MS = 120000;
const POLL_INTERVAL_MS = 1500;
const DISCOVERY_STABILIZE_MS = 1500;

function toPositiveInt(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function normalizeBaseUrl(inputUrl) {
	if (!inputUrl) {
		return "http://127.0.0.1/pvpoke/src";
	}

	return inputUrl.replace(/\/+$/, "");
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPairLabel(pair) {
	const title = pair.title ? `${pair.title} ` : "";
	return `${title}(${pair.cup}/${pair.cp})`;
}

function makeCollector(page, stageName, cup, cp) {
	const seen = new Set();
	let stageError = null;

	const onResponse = async (response) => {
		try {
			if (!response.url().includes("/data/write.php")) {
				return;
			}

			const request = response.request();
			if (request.method() !== "POST") {
				return;
			}

			const postData = request.postData() || "";
			const params = new URLSearchParams(postData);

			if (params.get("cup") !== cup || params.get("league") !== cp) {
				return;
			}

			const category = params.get("category");
			if (!category) {
				return;
			}

			if (!response.ok()) {
				stageError = new Error(`[${stageName}] write.php failed for category "${category}"`);
				return;
			}

			if (!seen.has(category)) {
				seen.add(category);
				console.log(`[${stageName}] wrote ${category}`);
			}
		} catch (error) {
			stageError = error;
		}
	};

	page.on("response", onResponse);

	return {
		getSeen: () => seen,
		getError: () => stageError,
		dispose: () => page.off("response", onResponse),
	};
}

async function waitForRankerCategories(page) {
	await page.waitForFunction(() => {
		if (typeof GameMaster === "undefined") {
			return false;
		}

		const gm = GameMaster.getInstance();
		return Array.isArray(gm?.data?.rankingScenarios) && gm.data.rankingScenarios.length > 0;
	}, { timeout: NAV_TIMEOUT_MS });

	return page.evaluate(() => GameMaster.getInstance().data.rankingScenarios.map((scenario) => scenario.slug));
}

async function discoverFormatPairs(context, baseUrl) {
	const page = await context.newPage();
	const discoveryUrl = `${baseUrl}/ranker.php?t=${Date.now()}`;

	console.log(`[discover] opening ${discoveryUrl}`);
	await page.goto(discoveryUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

	await page.waitForFunction(() => {
		if (typeof GameMaster === "undefined") {
			return false;
		}

		const gm = GameMaster.getInstance();
		if (!Array.isArray(gm?.data?.formats)) {
			return false;
		}

		const optionCount = document.querySelectorAll(".format-select option").length;
		return optionCount > 0;
	}, { timeout: NAV_TIMEOUT_MS });

	// Let the format list finish appending dynamic options.
	await sleep(DISCOVERY_STABILIZE_MS);

	const optionList = await page.evaluate(() => {
		return Array.from(document.querySelectorAll(".format-select option")).map((option) => ({
			cup: option.getAttribute("cup") || "",
			cp: String(option.value || "").trim(),
			title: String(option.textContent || "").trim(),
		}));
	});

	await page.close();

	const seen = new Set();
	const pairs = [];

	optionList.forEach((option) => {
		if (!option.cup || !option.cp) {
			return;
		}

		// Skip custom pseudo-format entry if present.
		if (option.cup === "custom") {
			return;
		}

		if (!/^\d+$/.test(option.cp)) {
			return;
		}

		const key = `${option.cup}|${option.cp}`;
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		pairs.push({
			cup: option.cup,
			cp: option.cp,
			title: option.title,
		});
	});

	if (pairs.length === 0) {
		throw new Error("[discover] no valid cup/league combinations found.");
	}

	console.log(`[discover] found ${pairs.length} format(s).`);
	pairs.forEach((pair, index) => {
		console.log(`[discover] ${index + 1}/${pairs.length} ${buildPairLabel(pair)}`);
	});

	return pairs;
}

async function waitForExpectedCategories(collector, expectedCategories, stageName, timeoutMs) {
	const expectedSet = new Set(expectedCategories);
	const startTime = Date.now();

	while (true) {
		const error = collector.getError();
		if (error) {
			throw error;
		}

		const seen = collector.getSeen();
		const missing = Array.from(expectedSet).filter((category) => !seen.has(category));

		if (missing.length === 0) {
			return;
		}

		if ((Date.now() - startTime) >= timeoutMs) {
			const seenList = Array.from(seen).join(", ") || "(none)";
			throw new Error(`[${stageName}] timed out waiting for categories: ${missing.join(", ")}. Seen: ${seenList}`);
		}

		await sleep(POLL_INTERVAL_MS);
	}
}

async function runSinglePair(context, baseUrl, pair, stageTimeoutMs, runIndex, runTotal) {
	const cup = pair.cup;
	const cp = pair.cp;
	const encodedCup = encodeURIComponent(cup);
	const encodedCp = encodeURIComponent(cp);
	const nonce = Date.now() + runIndex;
	const progressPrefix = `[run ${runIndex}/${runTotal}]`;

	console.log(`${progressPrefix} starting ${buildPairLabel(pair)}`);

	const rankerPage = await context.newPage();
	const rankerCollector = makeCollector(rankerPage, "ranker", cup, cp);
	const rankerUrl = `${baseUrl}/ranker.php?cup=${encodedCup}&cp=${encodedCp}&autorun=1&headless=1&t=${nonce}`;

	console.log(`${progressPrefix} [ranker] opening ${rankerUrl}`);
	await rankerPage.goto(rankerUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

	const rankerCategories = await waitForRankerCategories(rankerPage);
	console.log(`${progressPrefix} [ranker] expecting categories: ${rankerCategories.join(", ")}`);

	await waitForExpectedCategories(rankerCollector, rankerCategories, "ranker", stageTimeoutMs);
	rankerCollector.dispose();
	await rankerPage.close();

	const overallPage = await context.newPage();
	const overallCollector = makeCollector(overallPage, "overall", cup, cp);
	const overallCategories = ["overall", "consistency"];
	if (cup === "beam") {
		overallCategories.push("beaminess");
	}

	const sandboxUrl = `${baseUrl}/rankersandbox.php?cup=${encodedCup}&cp=${encodedCp}&autorun=1&headless=1&t=${nonce + 1}`;

	console.log(`${progressPrefix} [overall] opening ${sandboxUrl}`);
	await overallPage.goto(sandboxUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
	console.log(`${progressPrefix} [overall] expecting categories: ${overallCategories.join(", ")}`);

	await waitForExpectedCategories(overallCollector, overallCategories, "overall", stageTimeoutMs);
	overallCollector.dispose();
	await overallPage.close();

	console.log(`${progressPrefix} completed ${buildPairLabel(pair)}`);
}

async function run() {
	const cup = process.env.CUP || DEFAULT_CUP;
	const cp = process.env.CP || DEFAULT_CP;
	const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
	const timeoutMinutes = toPositiveInt(process.env.TIMEOUT_MINUTES, DEFAULT_TIMEOUT_MINUTES);
	const generateAll = process.env.GENERATE_ALL === "1";
	const stageTimeoutMs = timeoutMinutes * 60 * 1000;

	console.log(`[config] baseUrl=${baseUrl}`);
	if (generateAll) {
		console.log("[config] mode=all");
	} else {
		console.log(`[config] mode=single cup=${cup} cp=${cp}`);
	}
	console.log(`[config] stageTimeoutMinutes=${timeoutMinutes}`);

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext();

	try {
		let pairs = [];

		if (generateAll) {
			pairs = await discoverFormatPairs(context, baseUrl);
		} else {
			pairs = [{ cup, cp }];
		}

		for (let i = 0; i < pairs.length; i += 1) {
			await runSinglePair(context, baseUrl, pairs[i], stageTimeoutMs, i + 1, pairs.length);
		}

		console.log(`[done] ranking regeneration completed for ${pairs.length} format(s).`);
	} finally {
		await context.close();
		await browser.close();
	}
}

run().catch((error) => {
	console.error("[error]", error.message || error);
	process.exit(1);
});
