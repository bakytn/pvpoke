# Zygarden history

Open `/pvpoke/src/zygarden-history/` to use the browser-only interface. Its JavaScript calls the local `api.php` relay, which is deliberately limited to public Zygarden trainer search, tournament history, and bracket reads. This keeps the Zygarden CORS restriction out of the browser without introducing a separate service.

The 1,026 numbered sprites in `sprites/` are local assets copied from the PokeAPI sprites project. See the source repository's licence and Pokémon trademark notice before redistributing them outside this project.
