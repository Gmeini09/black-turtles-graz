/* Countdown zum bestätigten Spieltermin, mit derselben Spielauswahl für Start und Live. */
(() => {
  'use strict';
  const GAME_WINDOW = 6 * 60 * 60 * 1000;
  const escape = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sameGame = (a,b) => !!a && !!b && (a.gameId && b.gameId ? a.gameId === b.gameId : a.id === b.id);

  function selectMatch(fixtures,live,now,utils = window.TURTLES_UTILS) {
    const available = fixtures.filter(fixture => utils.fixtureReady(fixture)
      && !fixture.final && !(Number(fixture.gameStatus) >= 2)
      && !(sameGame(fixture,live?.fixture) && (live.isFinal || live.cancelled)));
    const reportedLive = available.find(fixture => sameGame(fixture,live?.fixture));
    if (live?.isLive && reportedLive) return {mode:'live',fixture:reportedLive,score:live.score,phase:live.phase};
    const scheduledLive = available.find(fixture => (fixture.live || Number(fixture.gameStatus) === 1)
      && now - utils.fixtureInstant(fixture).getTime() >= -45 * 60000
      && now - utils.fixtureInstant(fixture).getTime() <= GAME_WINDOW);
    if (scheduledLive) return {mode:'live',fixture:scheduledLive,score:scheduledLive.score,phase:''};
    const next = available.filter(fixture => !fixture.live && Number(fixture.gameStatus) !== 1
      && utils.fixtureInstant(fixture).getTime() >= now - GAME_WINDOW)
      .sort((a,b) => utils.fixtureInstant(a).getTime() - utils.fixtureInstant(b).getTime())[0];
    if (!next) return {mode:'none',fixture:null};
    return {mode:utils.fixtureInstant(next).getTime() > now ? 'countdown' : 'waiting',fixture:next};
  }

  function remainingParts(timestamp,now) {
    const total = Math.max(0,Math.ceil((timestamp - now) / 1000));
    return {days:Math.floor(total / 86400),hours:Math.floor(total / 3600) % 24,minutes:Math.floor(total / 60) % 60,seconds:total % 60};
  }
  const getMatch = () => selectMatch(window.TURTLES_DATA.fixtures,window.TURTLES_LIVE?.state,Date.now());
  const keyFor = match => [match.mode,match.fixture?.gameId || match.fixture?.id,match.fixture ? window.TURTLES_UTILS.fixtureInstant(match.fixture).getTime() : ''].join(':');
  let currentKey = '';

  function render(match = getMatch()) {
    currentKey = keyFor(match);
    document.querySelectorAll('[data-match-countdown]').forEach(box => {
      box.hidden = match.mode === 'none' || match.mode === 'live';
      if (box.hidden) return;
      const fixture = match.fixture;
      const teams = window.TURTLES_DATA.teams;
      const opponent = `${teams[fixture.home].short} gegen ${teams[fixture.away].short}`;
      if (box.dataset.countdownKey !== currentKey) {
        const date = new Intl.DateTimeFormat('de-AT',{timeZone:'Europe/Vienna',weekday:'short',day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'}).format(window.TURTLES_UTILS.fixtureInstant(fixture));
        const title = match.mode === 'waiting' ? 'GEPLANTER SPIELBEGINN ERREICHT' : 'BIS ZUM ERSTEN BULLY';
        box.innerHTML = `<div class="countdown-copy"><p class="countdown-title">${title}</p><p class="countdown-fixture">${escape(opponent)}<span>${escape(date)} Uhr</span></p></div><div class="countdown-units" aria-hidden="true">${[['days','Tage'],['hours','Stunden'],['minutes','Minuten'],['seconds','Sekunden']].map(([key,label]) => `<div><strong data-countdown-unit="${key}">00</strong><span>${label}</span></div>`).join('')}</div><p class="countdown-note">${match.mode === 'waiting' ? 'Der Live-Status wird geprüft.' : 'Zeit bis zum geplanten Spielbeginn.'}</p>`;
        box.dataset.countdownKey = currentKey;
      }
      const parts = remainingParts(window.TURTLES_UTILS.fixtureInstant(fixture).getTime(),Date.now());
      for (const [key,value] of Object.entries(parts)) {
        const digit = box.querySelector(`[data-countdown-unit="${key}"]`);
        const text = String(value).padStart(2,'0');
        if (digit.textContent !== text) digit.textContent = text;
      }
      box.setAttribute('aria-label',match.mode === 'waiting' ? `${opponent}: Geplanter Spielbeginn erreicht. Der Live-Status wird geprüft.` : `${opponent}: noch ${parts.days} Tage, ${parts.hours} Stunden, ${parts.minutes} Minuten und ${parts.seconds} Sekunden bis zum geplanten Spielbeginn.`);
    });
  }

  function tick() {
    if (document.hidden || !window.TURTLES_UTILS) return;
    const match = getMatch();
    if (keyFor(match) !== currentKey) window.TURTLES_UI?.renderNextMatch();
    render(match);
  }
  window.TURTLES_COUNTDOWN = {getMatch,render,selectMatch,remainingParts};
  document.addEventListener('DOMContentLoaded',tick,{once:true});
  document.addEventListener('visibilitychange',tick);
  setInterval(tick,1000);
})();
