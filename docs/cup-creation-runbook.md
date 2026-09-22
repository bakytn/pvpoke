# Cup Creation Runbook

How to add a new cup (e.g. "BF ML", 10000 CP, megas + shadows allowed, species ban list).
Verified against `GameMaster.js` + `custom-cup-save.php` + fork cups (`ml_pgr`, `ul_pgr`, `battlefrontiermaster`).
Intended to be folded into `AGENTS.md` (see the "Working Rules for Agents" section).

## Step 1 — Create the cup JSON

- New file: `src/data/gamemaster/cups/<slug>.json`
  - `name` = slug (lowercase `[a-z0-9_]+`, must match the filename), `title` = display name ("BF ML").
  - Same-shape reference: `cups/ml_pgr.json` (fork custom cup, no tier points).
- Schema:
  ```json
  {
    "name": "bf_ml",
    "title": "BF ML",
    "include": [],
    "exclude": [
      { "filterType": "id", "name": "Species", "values": ["mewtwo_mega_x", "..."] }
    ],
    "overrides": [],
    "league": 10000,
    "useDefaultMovesets": 1,
    "levelCap": 50,
    "excludeLowPokemon": 1,
    "custom": true
  }
  ```
  - `include`/`exclude`: arrays of filters. Multiple filter objects within one list are OR'd; the `include` list vs the `exclude` list are the two halves of the eligibility test (see Step 2).
  - `league`: CP cap (500/1500/2500/10000). Used by the custom-rankings UI; harmless for other consumers.
  - `useDefaultMovesets`: 1 = keep the gamemaster's per-species `defaultIVs`/movesets.
  - `levelCap`: 50 for 10000 CP.
  - `excludeLowPokemon`: 1 — standard flag on all league cups.
  - `custom`: true — marks it as a fork/custom cup.
  - Omit `tierRules` for point-free cups. Upstream tiered cups (e.g. `battlefrontiermaster.json`) use
    `"tierRules": {"max": 11, "floor": 0, "tiers": [{"points": N, "pokemon": [...]}...]}`
    — `PokeMultiSelect.js` / `GameMaster.js` enforce the point budget in team builder.
  - Optional: `restrictedPicks` + `restrictedPokemon` (at most N picks from the listed species; used by `TrainingAI.js`).
  - **Never** put `greatLeagueIneligible` or other global gate lists in a cup JSON — they live in `gamemaster/base.json`.

## Step 2 — Pool filter semantics (`GameMaster.js` → `generateFilteredPokemonList`)

A species is in the pool iff it passes the global gates, then the cup filters:

**Global gates**
- `released` must be true.
- Stat-product floor: 500→0, 1500→1370, 2500→2800, other (10000)→4900. Bypassed by tags `include1500` / `include2500` / `include10000` or `mega` (megas are always in).
- `greatLeagueIneligible` list bans those species below 2500 CP.
- `duplicate`-tag species only appear where a matching `overrides` entry exists (league+cup).
- `duplicate1500` species only at 1500 CP, and only in cups `all` / `retro` / `halloween`.
- Shadow species below level 8 are banned at 500 CP only.

**Filters**
- `filterType` ∈ `id`, `tag`, `type`, `dex` (paired lo/hi ranges), `cost`, `distance`, `evolution`, `move`, `moveType`.
- `tag` values come from `base.json` `pokemonTags`: `mega`, `supermega`, `shadow`, `shadoweligible`, `legendary`, `mythical`, `ultrabeast`, `starter`, `regional`, ... (full list in `base.json`).
- `include` list: species must match all include filters (an `id` match short-circuits the rest of the include filters). Empty `include` = no include restriction.
- `exclude` list: a species matching ANY exclude filter is removed. With an empty `include`, everything else stays — so a pure ban-list cup is just `include: []` + one `id` exclude filter.
- **Shadow/XL wildcards in `id` filters**: when an `id` filter is used as an EXCLUDE, `GameMaster.js` strips `_shadow` and `_xs` suffixes before matching — banning `mewtwo` auto-bans `mewtwo_shadow` and `mewtwo_xs`. Add `"includeShadows": true` to the filter object to opt out (ban only the exact id). For INCLUDE filters the suffix is never stripped — list `*_shadow` ids explicitly if you want exactly the shadow forms.
- League gating: a filter may carry `"leagues": [1500]` to apply only at that CP (see `cups/mega.json`).
- **Consequence for "megas/shadows permitted" cups**: the 10000 CP pool already contains every `*_mega` species (megas bypass the stat-product floor) and every `*_shadow` entry meeting the floor — no include filter is needed to permit them. Verified: 0 `_shadow` entries carry the `mega` tag, so a mega-ban list cannot leak via shadow twins.

## Step 3 — Wire the cup into `src/data/gamemaster/formats.json`

Append a tab-indented entry (match existing style):

```json
{
    "title": "BF ML",
    "cup": "bf_ml",
    "cp": 10000,
    "meta": "master",
    "showCup": true,
    "showFormat": true,
    "showMeta": true,
    "rules": [
        "Mega Evolutions are eligible.",
        "Shadow Pokémon are eligible."
    ]
}
```

- `cp` is the league `RankerInterface`/`PokeMultiSelect` actually use; `meta` maps league → `little`/`great`/`ultra`/`master` (see the metaMap in `src/data/custom-cup-save.php`).
- Formats entries power the rankings-page links (`GameMaster.js` `updateFormatSelect`) and the team-builder selectors. The custom-rankings UI additionally lists every cup whose `include` or `exclude` is non-empty.
- `hideRankings: true` hides the nav link while keeping the cup usable.

## Step 4 — Recompile (only if the user asks)

- No host PHP on this machine; use Docker (repo root):
  ```
  docker run --rm -v "$(pwd)/src/data:/data" -w /data php:8.1-cli php compile.php
  ```
- Regenerates `gamemaster.json`, `gamemaster.min.json`, `formats.php`. Compile auto-discovers every `*.json` in `gamemaster/cups/`, so all fork cups survive a recompile.
- When shipping to the live site, bump `SITE_VERSION` in `src/header.php` to bust the 30-day browser gamemaster cache (or have the user open the page with `?refreshData=1`).

## Step 5 — Generate rankings (MANDATORY for every new cup)

A new cup has no `src/data/rankings/<slug>/` tree, so the rankings page 404s on
`/rankings/<slug>/<category>/rankings-<cp>.json` until this step runs. **Always** run it for a new cup (and whenever a cup's pool/ban list changes).

- From repo root:
  ```
  ./src/scripts/regenerate-rankings-cli.sh --cup <slug> --cp <cp>
  ```
  - It auto-starts the Docker web server (`docker/docker-compose.yml`) if nothing is serving `http://127.0.0.1:80/pvpoke/src`, drives `ranker.php`/`rankersandbox.php` headlessly via Playwright, and writes all categories to `src/data/rankings/<slug>/<category>/rankings-<cp>.json`.
  - Pass `--no-server` if the site is already up; `--base-url` / `--timeout-min` to override.
  - Node must be on PATH and working (a stale Homebrew node cell with a missing `libsimdjson` dylib crashes it — use a working node; the script uses `node` from PATH).
- Expected output: one `rankings-<cp>.json` per category — `overall`, `leads`, `closers`, `switches`, `chargers`, `attackers`, `consistency` (defenders/beaminess if the config adds them).
- A successful run (all categories written, clean exit) is the verification. Do NOT re-verify the output (e.g. re-listing species to check bans) after a successful run — go straight to committing.
- After generating, commit the new `src/data/rankings/<slug>/` tree with the cup (it is not generated by `compile.php`).

## Shipping checklist (in order)
1. `cups/<slug>.json` created (Step 1)
2. `formats.json` entry added (Step 3)
3. Recompile → `gamemaster.json` / `.min.json` / `formats.php` (Step 4)
4. `./src/scripts/regenerate-rankings-cli.sh --cup <slug> --cp <cp>` (Step 5) — **required**
5. Bump `SITE_VERSION` in `src/header.php` (cache bust)
6. `git add` cup + formats + generated `gamemaster*` + `formats.php` + `src/data/rankings/<slug>/` → commit → push

## Pitfalls

- Every `*.json` in `cups/` is compiled in — move retired cups to `cups/archive/` instead of deleting.
- `speciesId` values must be exact; verify against `src/data/gamemaster.json` (1742 entries incl. shadow forms). A wrong id silently bans nothing — no error is raised.
- Don't hand-edit `gamemaster.json` / `gamemaster.min.json` / `formats.php` — they are generated.
- Shadow forms are separate `pokemon.json` entries tagged `shadow` (474 of them); base forms carry `shadoweligible`. They are NOT auto-excluded from 10000 CP pools.
- For a one-off ban check, read the cup JSON + species ids only; do not rebuild rankings to test a ban list.

## De-listing an existing cup

"De-list" = remove the cup from the site's cup list **without** deleting its data or rankings. The cup keeps working (battles, team builder, custom-rankings UI) and can be re-listed later. De-listing is a `formats.json`-only change.

Steps (in order):
1. Remove the cup's entry from `src/data/gamemaster/formats.json` (the one with its `cup` + `cp`). Multiple formats rows can share a `cup` (e.g. `mega` ×3) — only remove the row(s) for the cup you're de-listing.
   - To hide it from the nav but keep it usable instead, set `"hideRankings": true` on the entry rather than deleting it.
2. Recompile (Docker, repo root):
   - `docker run --rm -v "$(pwd)/src/data:/data" -w /data php:8.1-cli php compile.php`
3. Verify: `python3 -c "import json;[print(f['cup'],f['title']) for f in json.load(open('src/data/gamemaster.json'))['formats']]"` — the cup must be absent from `formats`; its data still lives in the `cups` array.
4. Commit `src/data/gamemaster/formats.json` + regenerated `gamemaster.json` / `.min.json` / `formats.php` → push.
5. Bump `SITE_VERSION` in `src/header.php` to bust the 30-day browser gamemaster cache (or `?refreshData=1`).

Do **not** delete the cup JSON, its rankings, or move it to `cups/archive/` unless the user explicitly asks to fully retire it. Re-listing = re-adding the `formats.json` entry + recompile.
