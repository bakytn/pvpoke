# AGENTS.md

## Purpose
This document gives coding agents a fast, accurate map of how this site is structured so changes can be made safely.

## Tech Stack
- Server-rendered PHP pages (`src/*.php`) with Apache rewrite routing.
- Frontend is plain JavaScript + jQuery (no SPA framework).
- Core data is JSON in `src/data/` (especially `gamemaster*.json`).
- Styling is CSS/SCSS in `src/css/`.

## High-Level Architecture
1. Apache routes friendly URLs to PHP entry points via `src/.htaccess`.
2. `src/header.php` injects shared globals (`host`, `webRoot`, `siteVersion`, `settings`, `get`).
3. Page-specific PHP includes script bundles.
4. `GameMaster.js` loads game data and builds in-memory lookup maps.
5. Interface classes in `src/js/interface/` bind UI and call battle/ranking engines.
6. Engines in `src/js/battle/` compute outcomes and return display data.

## Routing
- Rewrite rules live in `src/.htaccess`.
- Route examples:
  - `/rankings/...` -> `rankings.php`
  - `/battle/...` -> `battle.php`
  - `/team-builder/` -> `team-builder.php`
  - `/train/...` -> `train/*`
  - `/gm-editor/...` -> `gm-editor/*`
- Legacy `/tera/*` now redirects to home (`index.php`) and Tera code has been removed.

## Core Runtime Components
- `src/js/GameMaster.js`
  - Singleton model loader.
  - Loads `data/gamemaster.min.json` by default (non-localhost).
  - Builds:
    - `pokemonMap` (`speciesId` -> pokemon)
    - `moveMap` (`moveId` -> move)
    - `pokeSelectList` for search/select UI
  - Loads rankings/group/team JSON on demand.
- `src/js/pokemon/Pokemon.js`
  - Battle-ready Pokemon class using GameMaster data.
- `src/js/interface/*`
  - Page-level orchestration and UI event handling.
- `src/js/battle/*`
  - Simulation/ranking logic (`Battle`, `TeamRanker`, `Ranker`, etc.).

## Data Layout
- `src/data/gamemaster.min.json`: main model payload used at runtime.
- `src/data/gamemaster/`: source fragments (`pokemon.json`, `moves.json`, etc.).
- `src/data/rankings/`: precomputed rankings JSON.
- `src/data/groups/`: per-meta simulation / team-builder opponent pools (served directly, NOT compiled — see "Meta Groups").
- `src/data/training/`, `src/data/overrides/`: feature-specific datasets.
- `src/data/version.php`: lightweight metadata endpoint for periodic gamemaster update checks.

## Caching and Performance
- Transport-level compression/caching:
  - `.htaccess` enables Brotli/gzip and long-lived cache headers for static assets.
  - Docker image enables required Apache modules in `docker/Dockerfile`.
- Browser-side gamemaster cache:
  - Stored in `localStorage` by `GameMaster.js`.
  - Hard max age is 30 days.
  - Refresh controls:
    - Menu action: “Refresh game data”
    - URL flag: `?refreshData=1`
  - Periodic update check:
    - Polls `src/data/version.php` roughly every 12 hours and on tab visibility return.
    - Shows a dismissible “new game data available” banner when timestamp differs.

## Versioning and Cache Busting
- `SITE_VERSION` is defined in `src/header.php`.
- In local/dev (`webRoot` contains `src`), `SITE_VERSION` is randomized to disable cache.
- In production, bump `SITE_VERSION` when shipping data/script changes to force fresh fetches.

## Key Files to Know
- Routing:
  - `src/.htaccess`
- Global bootstrapping:
  - `src/header.php`
  - `src/footer.php`
- Main model + loaders:
  - `src/js/GameMaster.js`
- Core domain logic:
  - `src/js/pokemon/Pokemon.js`
  - `src/js/battle/**/*`
- UI logic:
  - `src/js/interface/**/*`
- Data build/helpers:
  - `src/data/compile.php`
  - `src/scripts/*`

## Working Rules for Agents
- Preserve the existing PHP + jQuery architecture; avoid framework migrations.
- Keep changes scoped and backward-compatible with URL formats and data shape.
- Do not remove `siteVersion` querying on assets/data.
- If changing gamemaster schema or cache format, bump cache schema/version logic in `GameMaster.js`.
- If changing routes, update `.htaccess` and verify legacy links still behave correctly.
- Do **not** run `src/data/compile.php` automatically after edits.
- If you find originalpvpoke in the root folder, you should completely ignore it unless explicitly asked

### Cup Point/Ban Updates (Data-Only Rule)
- For requests that only change cup point tiers and/or ban lists, edit only the cup source JSON in `src/data/gamemaster/cups/<cup>.json`.
- Do not change PHP or JS files for these requests (including `src/js/GameMaster.js`, `src/js/interface/*`, `src/header.php`, etc.).
- Do not hand-edit generated outputs (`src/data/gamemaster.json`, `src/data/gamemaster.min.json`, rankings JSON) as part of the point/ban edit itself.
- Regeneration is manual and only when explicitly requested: run compile/ranking commands after the data-only edit.

## Cup Creation Runbook
- Full procedure lives in `docs/cup-creation-runbook.md` — load it before adding or editing a cup.
- A cup is one file: `src/data/gamemaster/cups/<slug>.json` (schema: `name`, `title`, `include`, `exclude`, `overrides`, `league`, `levelCap`, `excludeLowPokemon`, `useDefaultMovesets`, `custom`; optional `tierRules` / `restrictedPicks`).
- Pure ban-list cup (e.g. "BF ML" Master League 10000 CP, megas + shadows permitted): `include: []` + one `id` exclude filter. Megas and shadow forms are already in the 10000 CP pool by default (megas bypass the stat-product floor).
- Shadow wildcard gotcha: `id` EXCLUDE filters auto-strip `_shadow`/`_xs` before matching — banning `mewtwo` also bans `mewtwo_shadow`. Add `"includeShadows": true` to opt out. INCLUDE filters never strip.
- Then wire the cup into `src/data/gamemaster/formats.json` (tab-indented entry: `title`, `cup`, `cp`, `meta`, `showCup`, `showFormat`, `showMeta`, optional `rules`/`hideRankings`).
- Verify `speciesId` values against `src/data/gamemaster.json` — wrong ids fail silently.
- Retired cups go to `cups/archive/`, never deleted (compile auto-discovers every `*.json` in `cups/`).
- De-listing a cup (remove from site cup list, keep data/rankings): remove its `formats.json` entry + recompile + commit. Full procedure: `docs/cup-creation-runbook.md` → "De-listing an existing cup". Don't delete the cup file or rankings unless told to fully retire it.

## Recompile Instructions (Manual Only)
- Only recompile when explicitly requested.
- No host PHP on this machine; run via Docker from repo root:
  - `docker run --rm -v "$(pwd)/src/data:/data" -w /data php:8.1-cli php compile.php`
- This regenerates:
  - `src/data/gamemaster.json`
  - `src/data/gamemaster.min.json`
  - `src/data/formats.php`

## Moveset Overrides (Pin Movesets for a Cup)
Use this whenever asked to change what specific Pokémon should run (fast move, charged moves, or a third move) in a given cup.
- Canonical file: `src/data/overrides/<cup>/<cp>.json` — a JSON array served **directly** (NOT compiled). Shape per entry:
  ```json
  { "speciesId": "mewtwo", "fastMove": "CONFUSION", "chargedMoves": ["PSYCHIC","PSYCHO_CUT"], "extraChargedMoves": ["AURORA_BEAM"], "weight": 1, "editorScore": 90, "editorNotes": "..." }
  ```
  - `fastMove` / `chargedMoves` / `extraChargedMoves` are all optional. Omit a field you are not changing (the ranker then keeps its previous picks for the rest).
  - `chargedMoves` order matters: index 0 = charged slot 0, index 1 = charged slot 1.
  - `weight` only affects rankings where the cup has `filterTargets` (e.g. `bf_ml`); harmless elsewhere — omit it for a pure moveset pin.
  - `editorScore` / `editorNotes` are surfaced on the rankings page (75% weight into the overall score); omit for a pure moveset pin.
- How it's consumed (do NOT edit the rankings JSON directly — a later regeneration clobbers it):
  - `RankerInterface.loadOverrides` (used by both `ranker.php` and `rankersandbox.php`) `$.getJSON`s `data/overrides/<cup>/<cp>.json` and gates the run on the load. If the file is missing it sets `[]` and proceeds.
  - `GameMaster.overrideMoveset` + `Ranker`/`RankerOverall` apply the entries to the battle sim and write the resulting `moveset` into the generated rankings.
- Steps:
  1. Verify each requested `MOVE_ID` exists in that species' `fastMoves` / `chargedMoves` / `extraChargedMoves` pool in `src/data/gamemaster.json` (move IDs are `UPPER_SNAKE`; names are in `moves`). Wrong ids fail silently.
  2. Add / update the entries in `src/data/overrides/<cup>/<cp>.json` (create the file/dir if absent; keep 4-space indent to match `diluvio/1500.json`).
  3. Regenerate the cup's rankings (`./src/scripts/regenerate-rankings-cli.sh --cup <cup> --cp <cp>` — see "Rankings Regeneration"). The pins get baked in; the runner's clean exit is the verification.
  4. Bump `SITE_VERSION` in `src/header.php` so the browser re-fetches the new `overrides` file and the new rankings (both are `?v=`-cached).
  5. Commit `src/data/overrides/<cup>/<cp>.json` + the regenerated `src/data/rankings/<cup>/` tree (+ `src/header.php`).

## Rankings Regeneration (Always After New Cups / Pool Changes)
- Always regenerate rankings after creating a new cup or changing its pool/ban list — do not skip this step.
- A new cup 404s on `/rankings/<slug>/<category>/rankings-<cp>.json` until rankings exist — `compile.php` does NOT create them.
- After adding a cup (and after any pool/ban-list change that should be reflected), run from repo root:
  - `./src/scripts/regenerate-rankings-cli.sh --cup <slug> --cp <cp>`
- This auto-starts the Docker web server if needed, drives `ranker.php`/`rankersandbox.php` headlessly via Playwright, and writes all categories under `src/data/rankings/<slug>/`. Needs a working `node` on PATH.
- Trust the runner's exit status: it fails loudly if any category times out or `write.php` errors. Do NOT re-verify the generated output (e.g. re-listing species to check bans) after a successful run — go straight to committing.
- Commit the `src/data/rankings/<slug>/` tree with the cup.
- Full ordering: see the shipping checklist in `docs/cup-creation-runbook.md`.

## Meta Groups (Simulation / Team-Builder Opponent Pools)
- The "simulate against the meta" / team-builder threat engine pulls its opponent pool from `src/data/groups/<meta>.json`, where `<meta>` is the format's `meta` field in the compiled `formats` array (`GameMaster.js` `loadGroupData`). Every selector reads `formats[i].meta` — format-select `meta-group`, cup-select `meta-group<cp>`, and the quick-fill "Cups" dropdown — so that field is the single source of truth for which pool a format uses.
- Group file shape: `[{ "speciesId", "fastMove": "MOVE_ID", "chargedMoves": ["ID","ID"] }, ...]` — one entry per base species, moves = most-used in that cup's `rankings/<cup>/overall/rankings-<cp>.json`. Files are served straight from `data/groups/` and are **not** regenerated by `compile.php` (created empty by `src/scripts/cupwizard.ps1`, then populated by hand).
- **Gotcha: Megas-allowing cups must NOT point `meta` at the generic `master`/`great` pool.** Those standard-competition pools contain **zero Megas** (standard leagues ban them). A cup like BF ML (10000 CP, Megas + Shadows allowed) pointed at `master` will simulate against a Megas-free meta even though Megas are legal.
- **Fix: give the cup its own group.** Create `data/groups/<cup>.json` from the cup's own top-~35 `overall` rankings (dedupe by base species — strip `_shadow`/`_xs` for dedup, keep the ranking's actual `speciesId`; the picker re-strips for matching), then set the format's `meta` to `<cup>` and recompile. The `meta` reference lives in the compiled `gamemaster*.json` / `formats.php` (needs recompile), while the group file itself is served as-is.
- A non-standard `meta` value (e.g. `bf_ml`) is fine: the quick-fill dropdown's little/great/ultra/master *type* label is derived from the format's `cp` (a switch), not from the `meta` string.

  Reference (as of Sept 2026): `bf_ml` now uses its own `meta: "bf_ml"` group (35 species, ~10 Megas) instead of the Megas-free `master` pool.
