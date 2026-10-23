/* Automatischer Abgleich mit dem öffentlichen Saisonspielplan der NHL Graz. */
(() => {
  'use strict';

  const data = window.TURTLES_DATA;
  const source = 'https://api.nhl-graz.com/data/ebel/Schedule?divisionId=22090&widgetOptions=%7B%22semantic%22%3Atrue%2C%22noScorers%22%3Atrue%7D';
  const teamIds = {953:'turtles',931:'ducks',954:'tigers',933:'snakes',73314:'gak',935:'pirates',29299:'heinz'};
  const cancelledStatuses = new Set([10,11,20,21,30,31]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const vienna = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const seasonStart = Date.UTC(2026,6,1);
  const seasonEnd = Date.UTC(2027,6,1);
  const state = {status:'snapshot',updatedAt:null,error:null,fixtureCount:data.fixtures.length,source,verifiedAt:data.verifiedAt};
  let inFlight = null;

  const safeName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120) : '';
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
  const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const scoreValue = value => Number.isInteger(number(value)) && number(value) >= 0 ? number(value) : null;

  function localParts(timestamp) {
    const parts = Object.fromEntries(vienna.formatToParts(new Date(timestamp)).map(part => [part.type,part.value]));
    return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
  }

  function localInstant(date,time) {
    const nominal = Date.parse(`${date}T${time}:00Z`);
    let result = nominal;
    for (let i = 0; i < 3; i += 1) {
      const parts = localParts(result);
      const difference = Date.parse(`${parts.date}T${parts.time}:00Z`) - nominal;
      if (!difference) return result;
      result -= difference;
    }
    const actual = localParts(result);
    return actual.date === date && actual.time === time ? result : null;
  }

  function scheduleTime(row) {
    const dateTbd = row.dateIsToBeDetermined === true;
    const timeTbd = row.timeIsToBeDetermined === true;
    const timestamp = number(row.gameUtcTimestamp);
    const hasTimestamp = timestamp !== null && Number.isInteger(timestamp) && timestamp >= seasonStart && timestamp < seasonEnd;
    let date = '';
    let time = '';
    if (hasTimestamp) ({date,time} = localParts(timestamp));
    else {
      const dateMatch = String(row.scheduledDate?.value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      const isoDate = typeof row.scheduledGameStart === 'string' ? row.scheduledGameStart.slice(0,10) : '';
      date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : isoDate;
      time = typeof row.scheduledTime === 'string' ? row.scheduledTime.slice(0,5) : '';
    }
    if (dateTbd) return {date:'',time:'',utcTimestamp:null,dateTbd,timeTbd:true};
    if (!validDate(date) || Date.parse(date + 'T12:00:00Z') < seasonStart || Date.parse(date + 'T12:00:00Z') >= seasonEnd) throw new Error('Ungültiges Spieldatum im Ligaspielplan.');
    if (timeTbd) return {date,time:'',utcTimestamp:null,dateTbd,timeTbd};
    if (!validTime(time)) throw new Error('Ungültige Spielzeit im Ligaspielplan.');
    const utcTimestamp = hasTimestamp ? timestamp : localInstant(date,time);
    if (utcTimestamp === null) throw new Error('Spielzeit kann nicht eindeutig zugeordnet werden.');
    return {date,time,utcTimestamp,dateTbd,timeTbd};
  }

  /* Returns a fresh snapshot; the current confirmed data changes only after all rows pass validation. */
  function normalizeRows(rows,previousFixtures = data.fixtures,existingTeams = data.teams) {
    if (!Array.isArray(rows)) throw new Error('Der Ligaspielplan enthält keine Spieleliste.');
    const ownRows = rows.filter(row => row && (Number(row.homeTeamId) === 953 || Number(row.awayTeamId) === 953));
    if (ownRows.length < Math.max(12,previousFixtures.length)) throw new Error('Der Ligaspielplan ist unvollständig.');
    const ids = new Set();
    const teams = {...existingTeams};
    const previous = new Map(previousFixtures.map(fixture => [fixture.gameId,fixture]));

    function teamKey(row,side) {
      const id = number(row[side + 'TeamId']);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Ungültige Mannschaft im Ligaspielplan.');
      const key = teamIds[id] || `team-${id}`;
      if (!teams[key]) {
        const name = safeName(row[side + 'TeamLongName']) || safeName(row[side + 'TeamFlavourname']);
        if (!name) throw new Error('Mannschaftsname fehlt im Ligaspielplan.');
        const reportedLogo = row[side + 'TeamLogoUrl'];
        const officialLogo = `https://api.nhl-graz.com/img/icehockey/ebel/team-logos/${id}.png`;
        teams[key] = {name,short:safeName(row[side + 'TeamShortName']) || name,logo:reportedLogo === officialLogo ? officialLogo : 'assets/nhl-graz.png'};
      }
      return key;
    }

    const fixtures = ownRows.map(row => {
      if (typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id)) throw new Error('Ungültige oder doppelte Spielkennung im Ligaspielplan.');
      ids.add(row.id);
      if (Number(row.homeTeamId) === Number(row.awayTeamId)) throw new Error('Ungültige Spielpaarung im Ligaspielplan.');
      if (Number(row.divisionId) !== 22090 && !(Array.isArray(row.assignedDivisionIds) && row.assignedDivisionIds.some(id => Number(id) === 22090))) throw new Error('Spiel gehört nicht zur Saison 2026/27.');
      const gameStatus = number(row.gameStatus);
      if (!Number.isInteger(gameStatus) || gameStatus < 0) throw new Error('Spielstatus fehlt im Ligaspielplan.');
      const extendedStatus = number(row.extendedStatus ?? row.gameExtendedStatus);
      const cancelled = cancelledStatuses.has(extendedStatus);
      const final = !cancelled && (gameStatus >= 2 || row.gameHasEnded === true);
      const live = !cancelled && !final && gameStatus === 1;
      const homeScore = live || final ? scoreValue(row.homeTeamScore) : null;
      const awayScore = live || final ? scoreValue(row.awayTeamScore) : null;
      const old = previous.get(row.id);
      return {
        id:old?.id || row.id,
        ...scheduleTime(row),
        home:teamKey(row,'home'),
        away:teamKey(row,'away'),
        gameId:row.id,
        url:`https://www.nhl-graz.com/gamecenter/${row.id}`,
        gameStatus,extendedStatus,cancelled,final,live,
        homeScore,awayScore,
        score:homeScore !== null && awayScore !== null ? {home:homeScore,away:awayScore} : null,
        updatedAt:typeof row.lastChangeOfGameSetup === 'string' ? row.lastChangeOfGameSetup : null
      };
    });
    if (previousFixtures.some(fixture => fixture.gameId && !ids.has(fixture.gameId))) throw new Error('Bereits bestätigte Spiele fehlen im Ligaspielplan.');
    fixtures.sort((a,b) => (a.utcTimestamp ?? (a.date ? Date.parse(a.date + 'T23:59:00Z') : Infinity)) - (b.utcTimestamp ?? (b.date ? Date.parse(b.date + 'T23:59:00Z') : Infinity)) || a.gameId.localeCompare(b.gameId));
    return {fixtures,teams,totalRows:rows.length};
  }

  function renderStatus() {
    const status = document.querySelector('#schedule-sync-status');
    const button = document.querySelector('#sync-schedule');
    if (button) {
      button.disabled = state.status === 'loading';
      button.setAttribute('aria-busy',String(state.status === 'loading'));
    }
    if (!status) return;
    if (state.status === 'loading') status.textContent = 'Spielplan wird mit der Liga abgeglichen …';
    else if (state.updatedAt) {
      const checked = new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(state.updatedAt));
      status.textContent = state.status === 'fallback' ? `Letzter erfolgreicher Abgleich: ${checked}. Liga gerade nicht erreichbar; bestätigte Termine bleiben sichtbar.` : `Mit der Liga abgeglichen: ${checked} Uhr. Automatische Prüfung alle 5 Minuten.`;
    } else {
      const snapshotDate = validDate(data.verifiedAt) ? new Intl.DateTimeFormat('de-AT',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Vienna'}).format(new Date(data.verifiedAt + 'T12:00:00Z')) : '21. Oktober 2026';
      status.textContent = `Bestätigter Spielplan vom ${snapshotDate}. ${state.status === 'fallback' ? 'Liga gerade nicht erreichbar; Termine bleiben sichtbar.' : 'Automatische Prüfung alle 5 Minuten.'}`;
    }
  }

  function refresh() {
    if (inFlight) return inFlight;
    state.status = 'loading';
    state.error = null;
    renderStatus();
    inFlight = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),15000);
      try {
        const response = await fetch(source,{signal:controller.signal,credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
        if (!response.ok) throw new Error(`Ligaantwort ${response.status}`);
        const payload = await response.json();
        const snapshot = normalizeRows(payload?.data?.rows);
        data.fixtures = snapshot.fixtures;
        data.teams = snapshot.teams;
        state.status = 'updated';
        state.updatedAt = new Date().toISOString();
        state.fixtureCount = snapshot.fixtures.length;
        window.TURTLES_UI?.renderNextMatch();
        window.TURTLES_UI?.renderFixtures();
        const count = document.querySelector('#fixture-count');
        if (count) count.textContent = String(snapshot.fixtures.length).padStart(2,'0');
        window.dispatchEvent(new CustomEvent('turtles:schedule-updated',{detail:{updatedAt:state.updatedAt,fixtureCount:state.fixtureCount}}));
      } catch (error) {
        state.status = 'fallback';
        state.error = error?.name === 'AbortError' ? 'Zeitüberschreitung beim Ligaabgleich.' : String(error?.message || 'Liga gerade nicht erreichbar.');
      } finally {
        clearTimeout(timeout);
        renderStatus();
        inFlight = null;
      }
      return state;
    })();
    return inFlight;
  }

  window.TURTLES_SCHEDULE = {refresh,state,helpers:{normalizeRows}};
  document.querySelector('#sync-schedule')?.addEventListener('click',refresh);
  document.addEventListener('visibilitychange',() => {
    if (document.visibilityState === 'visible' && (!state.updatedAt || Date.now() - Date.parse(state.updatedAt) >= 60000)) refresh();
  });
  setInterval(() => { if (document.visibilityState !== 'hidden') refresh(); },300000);
  refresh();
})();
