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
- `src/data/groups/`, `src/data/training/`, `src/data/overrides/`: feature-specific datasets.
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

## Recompile Instructions (Manual Only)
- Only recompile when explicitly requested.
- From repo root, run:
  - `cd src/data && php compile.php`
- This regenerates:
  - `src/data/gamemaster.json`
  - `src/data/gamemaster.min.json`
  - `src/data/formats.php`
