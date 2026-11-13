const API = 'api.php';
const state = { history: null, selected: 0, view: 'tournament', refreshing: false };
let dexById = null;
let formSpriteIds = null;
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

async function loadDexMap() {
    if (dexById && formSpriteIds) return dexById;
    try {
        const responses = await Promise.all([fetch('sprites/dex-map.json?v=1'), fetch('sprites/forms/index.json?v=3')]);
        dexById = responses[0].ok ? await responses[0].json() : {};
        formSpriteIds = responses[1].ok ? await responses[1].json() : {};
    } catch (_) { dexById = {}; formSpriteIds = {}; }
    return dexById;
}

async function api(action, params = {}) {
    const query = new URLSearchParams(Object.assign({ action }, state.refreshing ? { refresh: '1' } : {}, params));
    const response = await fetch(`${API}?${query}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Zygarden request failed (${response.status})`);
    return body;
}

async function exactTrainer(name) {
    try {
        const result = await api('search', { name });
        const trainer = (result.items || []).find((item) => item && item.name && item.name.toLowerCase() === name.toLowerCase());
        if (trainer) return trainer;
    } catch (_) {
        // Zygarden's filtered endpoint can intermittently return 500. Its
        // unfiltered directory remains public and alphabetically ordered.
    }
    const first = await api('directory', { page: 1 });
    let low = 1, high = first.totalPages;
    const needle = name.toLowerCase();
    while (low <= high) {
        const middle = low + Math.floor((high - low) / 2);
        const page = middle === 1 ? first : await api('directory', { page: middle });
        const items = page.items || [];
        const found = items.find((item) => item && item.name && item.name.toLowerCase() === needle);
        if (found) return found;
        if (!items.length) break;
        const firstName = items[0] && items[0].name ? items[0].name.toLowerCase() : '';
        const lastItem = items[items.length - 1];
        const lastName = lastItem && lastItem.name ? lastItem.name.toLowerCase() : '';
        if (!firstName || !lastName) break;
        if (needle < firstName) high = middle - 1;
        else if (needle > lastName) low = middle + 1;
        else break;
    }
    throw new Error(`No trainer exactly named “${name}” was found.`);
}

async function tournaments(trainerId) {
    const result = [];
    for (let page = 1; ; page += 1) {
        const payload = await api('tournaments', { trainerId, page });
        (payload.items || []).forEach((item) => result.push(item));
        if (!payload.totalPages || page >= payload.totalPages) return result;
    }
}

function detail(pokemon = {}) {
    const id = String(pokemon.id || '');
    const suppliedDex = Number(pokemon.dexNumber || pokemon.dexEntry || 0);
    const dex = suppliedDex > 0 ? suppliedDex : Number((dexById || {})[id] || 0);
    return { id, name: `${pokemon.isShadow ? 'Shadow ' : ''}${pokemon.name || 'Unknown'}`, dex_number: dex, is_shadow: Boolean(pokemon.isShadow) };
}
function names(team) { return (team || []).map(detail); }
function score(one, two) { return Number.isFinite(one) && Number.isFinite(two) ? `${one}-${two}` : ''; }
function collect(matchup, round, trainerId, parties, battles, seen) {
    const selfIsOne = matchup.participant1 && matchup.participant1.id === trainerId;
    const selfIsTwo = matchup.participant2 && matchup.participant2.id === trainerId;
    if (matchup.status === 'completed' && (selfIsOne || selfIsTwo) && !seen.has(matchup.matchupId)) {
        const self = selfIsOne ? matchup.participant1 : matchup.participant2;
        const opponent = selfIsOne ? matchup.participant2 : matchup.participant1;
        // Completed bye and malformed bracket records can have only one side.
        // They are not battles, but nested matchups still need to be checked.
        if (self && opponent) {
            const selfTeam = names(self.roster && self.roster.length ? self.roster : parties.get(round) || []);
            battles.push({ round, matchup_id: matchup.matchupId, status: matchup.status, trainer_team_details: selfTeam, opponent: opponent.name, opponent_team_details: names(opponent.roster), score: score(selfIsOne ? matchup.score1 : matchup.score2, selfIsOne ? matchup.score2 : matchup.score1) });
            seen.add(matchup.matchupId);
        }
    }
    (matchup.subMatchups || []).forEach((child) => collect(child, round, trainerId, parties, battles, seen));
}
async function historyFor(name) {
    await loadDexMap();
    const trainer = await exactTrainer(name);
    const entries = await tournaments(trainer.id);
    entries.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    const tournamentsOut = [];
    for (let index = 0; index < entries.length; index += 1) {
        $('#status').textContent = `Loading tournament ${index + 1} of ${entries.length}…`;
        const tournament = entries[index];
        const payload = await api('brackets', { tenantType: tournament.tenantType, tenantId: tournament.tenantId, tournamentId: tournament.id });
        const parties = new Map((tournament.battleParties || []).map((party) => [party.round, party.battleParty]));
        const battles = [], seen = new Set();
        (payload.rounds || []).concat(payload.topCutRounds || []).forEach((round) => (round.matchups || []).forEach((matchup) => collect(matchup, round.round, trainer.id, parties, battles, seen)));
        battles.sort((a, b) => b.round - a.round);
        tournamentsOut.push({ name: tournament.tournamentName, date: String(tournament.startDate || '').slice(0, 10), start_date: tournament.startDate, battles });
    }
    return { trainer: trainer.name, generated_at: new Date().toISOString(), tournaments: tournamentsOut };
}
function baseSprite(pokemon) { return 'sprites/' + (Number(pokemon.dex_number) || 0) + '.png'; }
function spritePath(pokemon) { return formSpriteIds && formSpriteIds[pokemon.id] ? 'sprites/forms/' + pokemon.id + '.png' : baseSprite(pokemon); }
function spriteFallback(pokemon, dimParent = false) { return "this.onerror=null;this.src='" + baseSprite(pokemon) + "'" + (dimParent ? ";this.parentElement.style.opacity='.35'" : ''); }
function sprite(pokemon) { return `<span class="sprite ${pokemon.is_shadow ? 'shadow' : ''}" data-name="${escapeHTML(pokemon.name)}"><img loading="lazy" src="${spritePath(pokemon)}" alt="${escapeHTML(pokemon.name)}" onerror="${spriteFallback(pokemon, true)}"></span>`; }
function card(battle, context = '') { return `<article class="battle"><div class="round">Round<b>${battle.round}</b>${context ? `<div class="context">${escapeHTML(context)}</div>` : ''}</div><div class="team"><div class="name">${escapeHTML(state.history.trainer)}</div><div class="sprites">${battle.trainer_team_details.map(sprite).join('')}</div></div><div class="score">${escapeHTML(battle.score || '—')}<small>final score</small></div><div class="team right"><div class="name">${escapeHTML(battle.opponent || 'Unknown opponent')}</div><div class="sprites">${battle.opponent_team_details.map(sprite).join('')}</div></div></article>`; }
function silphCard(battle) { const parts = String(battle.score || '—-—').split('-'); const wins = parts[0] || '—'; const losses = parts[1] || '—'; return `<article class="silph-bout"><div class="silph-header"><div class="silph-mark">ZG</div><div><p class="silph-kind">Zygarden</p><h3 class="silph-title">Bout ${battle.round}: ${escapeHTML(battle.source || '')}</h3><p class="silph-subtitle">vs ${escapeHTML(battle.opponent || 'Unknown opponent')}</p></div><div class="silph-toggle">—</div></div><div class="silph-body"><div class="silph-sprites">${battle.trainer_team_details.map((pokemon) => `<span class="silph-sprite ${pokemon.is_shadow ? 'shadow' : ''}"><img loading="lazy" src="${spritePath(pokemon)}" alt="${escapeHTML(pokemon.name)}" onerror="${spriteFallback(pokemon)}"></span>`).join('')}</div><div class="silph-score"><div><small>Wins</small><b>${escapeHTML(wins)}</b></div><div><small>Losses</small><b>${escapeHTML(losses)}</b></div></div></div></article>`; }
function favorites(tournamentsList) { const counts = new Map(); tournamentsList.forEach((tournament) => tournament.battles.forEach((battle) => battle.trainer_team_details.forEach((pokemon) => { const key = `${pokemon.dex_number}:${pokemon.name}`; const value = counts.get(key) || { id: pokemon.id, name: pokemon.name, dex_number: pokemon.dex_number, is_shadow: pokemon.is_shadow, count: 0 }; value.count += 1; counts.set(key, value); }))); return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)); }
function chart(items) { if (!items.length) return '<div class="empty">No roster data available.</div>'; const top = items[0].count; return `<div class="insight"><h3>Most-used picks</h3>${items.slice(0, 8).map((pokemon) => `<div class="pick"><img src="${spritePath(pokemon)}" alt="" onerror="${spriteFallback(pokemon)}"><span class="pick-name">${escapeHTML(pokemon.name)}</span><span class="bar"><i style="width:${Math.round(pokemon.count / top * 100)}%"></i></span><b class="count">${pokemon.count}</b></div>`).join('')}</div>`; }
function render() {
    const tournamentsList = state.history.tournaments || [];
    const all = tournamentsList.reduce((list, tournament) => list.concat(tournament.battles.map((battle) => Object.assign({}, battle, { source: `${tournament.date} · ${tournament.name}` }))), []);
    const picks = favorites(tournamentsList);
    $('#title').textContent = `${state.history.trainer}’s history`;
    $('#summary').textContent = `${tournamentsList.length} tournaments · ${all.length} completed battles · newest tournament first`;
    $('#favorite-note').innerHTML = picks.length ? `<b>Top pick:</b> ${escapeHTML(picks[0].name)} · ${picks[0].count} appearances` : '';
    document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
    const nav = $('#tournaments'); nav.hidden = state.view !== 'tournament'; nav.innerHTML = tournamentsList.map((tournament, index) => `<button class="tournament ${index === state.selected ? 'active' : ''}" data-tournament="${index}"><strong>${escapeHTML(tournament.name)}</strong><span>${escapeHTML(tournament.date)} · ${tournament.battles.length} battles</span></button>`).join('');
    document.querySelectorAll('[data-tournament]').forEach((button) => { button.onclick = () => { state.selected = Number(button.dataset.tournament); render(); }; });
    if (state.view === 'all') { $('#content').innerHTML = `<div class="tournament-title"><h2>All completed battles</h2><span class="date">${all.length} battles</span></div><div class="insights">${chart(picks)}<div class="insight"><h3>Archive overview</h3><p class="lede">One continuous, newest-first feed across every tournament. Pick counts are roster appearances, not wins.</p></div></div><div class="battles">${all.map((battle) => card(battle, battle.source)).join('')}</div>`; return; }
    if (state.view === 'silph') { $('#content').innerHTML = `<div class="tournament-title"><h2>All Battles – Silph Style</h2><span class="date">${all.length} bouts</span></div><div class="silph-feed">${all.map(silphCard).join('')}</div>`; return; }
    const tournament = tournamentsList[state.selected]; $('#content').innerHTML = `<div class="tournament-title"><h2>${escapeHTML(tournament.name)}</h2><span class="date">${escapeHTML(tournament.date)}</span></div><div class="battles">${tournament.battles.length ? tournament.battles.map((battle) => card(battle)).join('') : '<div class="empty">No completed battles were recorded for this tournament.</div>'}</div>`;
}
function cacheKey(name) { return `zygarden-history:v4:${name.trim().toLowerCase()}`; }
function cachedHistory(name) { try { return JSON.parse(localStorage.getItem(cacheKey(name)) || 'null'); } catch (_) { return null; } }
function saveHistory(name, history) { try { localStorage.setItem(cacheKey(name), JSON.stringify(history)); } catch (_) { /* The viewer still works if storage is unavailable. */ } }
async function loadHistory(forceRefresh) {
    const name = $('#trainer-name').value.trim();
    if (!name) return;
    const submit = $('#search button'); const refresh = $('#refresh'); submit.disabled = true; refresh.disabled = true;
    try {
        const cached = forceRefresh ? null : cachedHistory(name);
        if (cached && Array.isArray(cached.tournaments)) {
            state.history = cached; state.selected = 0; state.view = 'tournament'; $('#app').hidden = false; $('#status').textContent = 'Loaded from this browser’s cache. Use Refresh data to fetch the latest results.'; render(); return;
        }
        $('#status').textContent = forceRefresh ? 'Refreshing from Zygarden…' : 'Finding trainer…';
        state.refreshing = forceRefresh;
        state.history = await historyFor(name); saveHistory(name, state.history); state.selected = 0; state.view = 'tournament'; $('#app').hidden = false; $('#status').textContent = forceRefresh ? 'Fresh history loaded and cached.' : 'History loaded and cached.'; render();
    } catch (error) { $('#app').hidden = true; $('#status').textContent = error.message; }
    finally { state.refreshing = false; submit.disabled = false; refresh.disabled = false; }
}
$('#search').onsubmit = (event) => { event.preventDefault(); loadHistory(false); };
document.querySelectorAll('[data-view]').forEach((button) => { button.onclick = () => { state.view = button.dataset.view; render(); }; });
$('#refresh').onclick = () => loadHistory(true);
$('#download').onclick = () => { const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.history.trainer}-zygarden-history.json`; link.click(); URL.revokeObjectURL(link.href); };
