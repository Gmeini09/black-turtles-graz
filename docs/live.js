(() => {
  'use strict';
  const data = window.TURTLES_DATA;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const REPORT_BASE = 'https://api.nhl-graz.com/data/ebel/GetGameReport?gameId=';
  const LIVE_FEED = 'https://www.nhl-graz.com/clips-data/live.json';
  const HLS_URL = 'https://live.nhl-graz.com/hls/abr.m3u8';
  const MEDIA_URL = 'https://live.nhl-graz.com/hls/stream_480p.m3u8';
  const MINUTE = 60000;
  const state = {fixture:null,isLive:false,isFinal:false,streamAvailable:false,score:null,phase:'',report:null,reportFetchedAt:null,hasError:false};
  window.TURTLES_LIVE = {state};
  let timer, hls, loadingLibrary, streamPlaying = false, polling = false, streamLoading = false;

  const dateLabel = fixture => new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',weekday:'short',day:'2-digit',month:'long',year:'numeric'}).format(window.TURTLES_UTILS.fixtureInstant(fixture));
  const timeLabel = value => new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(value);
  const sameDay = (a,b) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna'}).format(a) === new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna'}).format(b);
  const validScore = value => value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0;
  function freshFeed(feed,now) {
    const age = now - Number(feed?.as_of_ms);
    return feed?.live === true && Number.isFinite(age) && age >= -30000 && age <= 120000;
  }
  function gameWindow(fixture,now) {
    if (!window.TURTLES_UTILS.fixtureReady(fixture)) return false;
    const age = now - window.TURTLES_UTILS.fixtureInstant(fixture).getTime();
    return age >= -45 * MINUTE && age <= 6 * 60 * MINUTE;
  }
  function selectFixture(feed,now) {
    if (freshFeed(feed,now)) {
      const live = data.fixtures.find(fixture => fixture.gameId === feed.game_id && window.TURTLES_UTILS.fixtureReady(fixture));
      if (live) return live;
    }
    return data.fixtures.find(fixture => gameWindow(fixture,now))
      || data.fixtures.find(fixture => window.TURTLES_UTILS.fixtureReady(fixture) && window.TURTLES_UTILS.fixtureInstant(fixture).getTime() >= now)
      || data.fixtures.filter(fixture => window.TURTLES_UTILS.fixtureReady(fixture)).at(-1);
  }
  function deriveState(fixture,report,feed,now = Date.now()) {
    const game = report?.gameData;
    const status = game ? Number(game.gameStatus) : null;
    const extended = Number(game?.gameExtendedStatus);
    const cancelled = !!fixture?.cancelled || !!fixture?.dateTbd || !!fixture?.timeTbd || [10,11,20,21,30,31].includes(extended);
    const streamMatches = freshFeed(feed,now) && fixture?.gameId === feed.game_id;
    const isLive = !cancelled && (status === 1 && gameWindow(fixture,now) || streamMatches && (status === 0 || status === 1 || status === null));
    const isFinal = game && status >= 2;
    const score = (isLive || isFinal) && validScore(game?.homeTeamScore) && validScore(game?.awayTeamScore) ? {home:Number(game.homeTeamScore),away:Number(game.awayTeamScore)} : null;
    const period = game?.liveTimePeriodBar?.find(part => part.isActive);
    let phase = period?.longName || period?.shortName || '';
    if (streamMatches && feed.live_time !== null && feed.live_time !== undefined && feed.live_time !== '') {
      const seconds = Number(feed.live_time);
      const clock = Number.isFinite(seconds) && seconds >= 0 ? String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(Math.floor(seconds % 60)).padStart(2,'0') : typeof feed.live_time === 'string' && /^\d{1,3}:\d{2}$/.test(feed.live_time) ? feed.live_time : '';
      if (clock) phase = [phase,clock].filter(Boolean).join(' · ');
    }
    if (streamMatches && feed.pause) phase = [phase,'Pause'].filter(Boolean).join(' · ');
    else if (streamMatches && feed.clock_running === false && phase) phase += ' · Uhr angehalten';
    return {fixture,isLive,isFinal:!!isFinal,cancelled,streamAvailable:isLive && streamMatches,score,phase,report};
  }
  window.TURTLES_LIVE.helpers = {freshFeed,selectFixture,deriveState,gameWindow};

  async function request(url,asText = false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),8000);
    try {
      const response = await fetch(url,{mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('Quelle nicht verfügbar');
      return asText ? await response.text() : await response.json();
    } finally { clearTimeout(timeout); }
  }
  function goalsHtml(report) {
    const goals = [
      ...(Array.isArray(report?.homeGoals) ? report.homeGoals.map(goal => ({...goal,side:'home'})) : []),
      ...(Array.isArray(report?.awayGoals) ? report.awayGoals.map(goal => ({...goal,side:'away'})) : [])
    ].sort((a,b) => Number(b.gameTime) - Number(a.gameTime)).slice(0,6);
    if (!goals.length) return state.isLive ? '<p class="live-empty-goals">Noch keine Tore im offiziellen Spielbericht erfasst.</p>' : '';
    return '<h4>LETZTE TORE</h4>' + goals.map(goal => {
      const scorer = [goal.scoredBy?.playerFirstname,goal.scoredBy?.playerLastname].filter(Boolean).join(' ') || 'Torschütze noch nicht erfasst';
      const team = data.teams[state.fixture[goal.side]];
      const assists = [goal.assistBy,goal.assist2By].filter(Boolean).map(player => [player.playerFirstname,player.playerLastname].filter(Boolean).join(' ')).filter(Boolean);
      return '<div class="live-goal"><span class="goal-time">' + escape(goal.gameTimeFormatted || '') + '</span><strong class="goal-score">' + escape(goal.newScore || '') + '</strong><div class="goal-name"><strong>' + escape(scorer) + '</strong><span>' + escape(team.short) + (assists.length ? ' · Assist: ' + escape(assists.join(', ')) : '') + '</span></div></div>';
    }).join('');
  }
  function render() {
    const fixture = state.fixture;
    if (!fixture) return;
    const home = data.teams[fixture.home], away = data.teams[fixture.away];
    const upcoming = window.TURTLES_UTILS.fixtureInstant(fixture).getTime() >= Date.now();
    const badge = state.isLive ? '● LIVE' : state.cancelled ? 'STATUS GEÄNDERT' : state.isFinal ? 'BEENDET' : upcoming ? 'NÄCHSTES SPIEL' : 'VERGANGENER TERMIN';
    $('#live-status-badge').textContent = badge;
    $('#live-status-badge').classList.toggle('is-live',state.isLive);
    $('#live').classList.toggle('is-live',state.isLive);
    $('#live-nav').classList.toggle('is-live',state.isLive);
    $('#live-fixture-meta').textContent = dateLabel(fixture) + ' · ' + fixture.time + ' Uhr · Eishalle Hart bei Graz';
    $('#live-scoreboard').innerHTML = '<div class="live-team"><img src="' + home.logo + '" width="64" height="64" alt="Wappen ' + escape(home.name) + '"><strong>' + escape(home.short) + '</strong><span>HEIM</span></div><div class="live-score-number"><strong>' + (state.score ? state.score.home : '–') + '<span class="live-score-separator">:</span>' + (state.score ? state.score.away : '–') + '</strong></div><div class="live-team"><img src="' + away.logo + '" width="64" height="64" alt="Wappen ' + escape(away.name) + '"><strong>' + escape(away.short) + '</strong><span>GAST</span></div>';
    $('#live-clock').textContent = state.isLive ? state.phase || 'Das Spiel läuft.' : state.cancelled ? 'Bitte den aktuellen Spielstatus im offiziellen Gamecenter prüfen.' : state.isFinal ? 'Offizieller Endstand' : upcoming ? 'Der Live-Ticker startet, sobald das Spiel läuft.' : 'Für diesen Termin ist aktuell kein laufendes Spiel bestätigt.';
    $('#live-update-status').textContent = state.hasError ? 'Spieldaten gerade nicht erreichbar. Bitte den offiziellen Ticker öffnen.' : state.reportFetchedAt ? 'Spieldaten abgerufen um ' + timeLabel(state.reportFetchedAt) : 'Aktuelle Spieldaten werden geladen.';
    $('#live-goals').innerHTML = state.isLive || state.isFinal ? goalsHtml(state.report) : '';
    $('#live-gamecenter').href = fixture.url;
    $('#stream-gamecenter').href = fixture.url;
    $('#load-stream').disabled = !state.streamAvailable || streamLoading;
    if (!streamPlaying && !streamLoading) {
      $('#stream-status').textContent = state.streamAvailable ? 'Die NHL meldet dieses Turtles-Spiel live. Starte hier die Originalübertragung.' : state.isLive ? 'Das Spiel läuft. Ein aktueller Stream ist derzeit nicht bestätigt. Prüfe auch das offizielle Gamecenter.' : 'Der Stream wird zum laufenden Turtles-Spiel freigeschaltet, sobald die Übertragung bestätigt ist.';
    }
    window.TURTLES_UI?.renderNextMatch();
  }

  function stopStream(message) {
    if (hls) { hls.destroy(); hls = null; }
    const video = $('#live-video');
    video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
    $('#stream-poster').hidden = false;
    streamPlaying = false;
    if (message) $('#stream-status').textContent = message;
    $('#load-stream').disabled = !state.streamAvailable;
    $('#load-stream').innerHTML = 'Livestream starten <span aria-hidden="true">▶</span>';
  }
  async function verifyStreamFresh() {
    const text = await request(MEDIA_URL,true);
    const dates = [...text.matchAll(/#EXT-X-PROGRAM-DATE-TIME:([^\r\n]+)/g)];
    const last = dates[dates.length - 1]?.[1]?.trim().replace(/([+-]\d{2})(\d{2})$/,'$1:$2');
    const timestamp = last ? Date.parse(last) : NaN;
    const age = Date.now() - timestamp;
    if (!Number.isFinite(age) || age < -30000 || age > 180000) throw new Error('Die Kamera liefert gerade kein aktuelles Livebild.');
  }
  function loadHlsLibrary() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!loadingLibrary) loadingLibrary = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = 'assets/hls.min.js';
      script.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error('Player nicht verfügbar'));
      script.onerror = () => { loadingLibrary = null; reject(new Error('Player nicht verfügbar')); };
      document.head.append(script);
    });
    return loadingLibrary;
  }
  $('#load-stream').addEventListener('click',async () => {
    if (!state.streamAvailable || streamLoading) return;
    if (streamPlaying) stopStream();
    streamLoading = true; $('#load-stream').disabled = true; $('#stream-status').textContent = 'Die Liveübertragung wird geprüft und geladen …';
    try {
      await verifyStreamFresh();
      if (!state.streamAvailable) throw new Error('Die Übertragung ist derzeit nicht verfügbar.');
      const video = $('#live-video');
      video.hidden = false; $('#stream-poster').hidden = true;
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = HLS_URL;
      } else {
        const Hls = await loadHlsLibrary();
        if (!Hls.isSupported()) throw new Error('Bitte den Stream im offiziellen Gamecenter öffnen.');
        hls = new Hls({enableWorker:true,liveSyncDurationCount:3,maxBufferLength:20});
        hls.on(Hls.Events.ERROR,(_event,details) => { if (details.fatal) stopStream('Der Stream ist gerade unterbrochen. Versuche es erneut oder öffne das offizielle Gamecenter.'); });
        hls.loadSource(HLS_URL); hls.attachMedia(video);
      }
      streamPlaying = true;
      await video.play().catch(() => { /* Der native Play-Button bleibt verfügbar. */ });
      $('#stream-status').textContent = 'Originalübertragung der NHL Graz. Bei Unterbrechungen kannst du den Stream im offiziellen Gamecenter öffnen.';
      $('#load-stream').innerHTML = 'Stream neu laden <span aria-hidden="true">↻</span>';
    } catch (error) {
      stopStream(error.message || 'Der Stream ist derzeit nicht verfügbar. Bitte das offizielle Gamecenter öffnen.');
    } finally { streamLoading = false; $('#load-stream').disabled = !state.streamAvailable; }
  });
  async function poll() {
    if (polling) return;
    polling = true; clearTimeout(timer); $('#refresh-live').disabled = true;
    try {
      const feed = await request(LIVE_FEED).catch(() => null);
      const fixture = selectFixture(feed,Date.now());
      if (!fixture) return;
      const response = await request(REPORT_BASE + encodeURIComponent(fixture.gameId)).catch(() => null);
      const report = response?.data?.gameData ? response.data : null;
      const oldFixture = state.fixture?.gameId;
      Object.assign(state,deriveState(fixture,report,feed),{hasError:!report,reportFetchedAt:report ? new Date() : null});
      if (streamPlaying && (!state.streamAvailable || oldFixture !== fixture.gameId)) stopStream('Die bestätigte Übertragung ist beendet oder derzeit nicht verfügbar.');
      render();
      if (streamPlaying) await verifyStreamFresh().catch(() => stopStream('Die Kamera liefert gerade kein aktuelles Livebild. Bitte versuche es später erneut.'));
    } finally {
      polling = false; $('#refresh-live').disabled = false;
      timer = setTimeout(poll,state.isLive || data.fixtures.some(fixture => gameWindow(fixture,Date.now())) ? 30000 : 120000);
    }
  }
  $('#refresh-live').addEventListener('click',poll);
  window.addEventListener('turtles:schedule-updated',poll);
  $('#live-video').addEventListener('error',() => { if (streamPlaying) stopStream('Die Übertragung konnte nicht abgespielt werden. Bitte erneut versuchen oder den Stream bei NHL Graz öffnen.'); });
  document.addEventListener('visibilitychange',() => { if (!document.hidden) poll(); });
  state.fixture = selectFixture(null,Date.now());
  render(); poll();
})();
