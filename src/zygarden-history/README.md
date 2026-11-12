# Zygarden history

Open `/pvpoke/src/zygarden-history/` to use the browser-only interface. Its JavaScript calls the local `api.php` relay, which is deliberately limited to public Zygarden trainer search, tournament history, and bracket reads. This keeps the Zygarden CORS restriction out of the browser without introducing a separate service.

The relay persists successful JSON responses in `cache/` indefinitely. Web access to that directory is denied and generated JSON is ignored by Git. The interface's **Refresh data** button bypasses the cache and replaces the relevant cached responses.

The 1,026 numbered sprites in `sprites/` are local assets copied from the PokeAPI sprites project. Mega, regional, and other distinct form sprites are stored locally in `sprites/forms/` and selected from Zygarden's Pokémon form ID; an unavailable form falls back to its base sprite. See the source repository's licence and Pokémon trademark notice before redistributing them outside this project.
