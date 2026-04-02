# Local Ranking Variant Overlays

These files define optional, predefined ranking variants without editing upstream
`src/data/overrides/*` or gamemaster files.

## Path format

`src/data/local/variants/<cup>/<cp>.json`

Examples:

- `src/data/local/variants/all/10000.json`
- `src/data/local/variants/all/2500.json`
- `src/data/local/variants/battlefrontiermaster/10000.json`

## JSON shape

```json
[
  {
    "speciesId": "groudon",
    "variants": [
      {
        "id": "mud_shot_fp_pb",
        "label": "Mud Shot / Fire Punch / Precipice Blades",
        "fastMove": "MUD_SHOT",
        "chargedMoves": ["FIRE_PUNCH", "PRECIPICE_BLADES"],
        "weight": 6
      }
    ]
  }
]
```

Notes:

- `id` and `label` are used to build ranking row identity and display text.
- `weight` is optional and behaves like existing override weighting.
- You only need to define extra variants here; canonical/default rows still come
  from normal ranking data and overrides.
