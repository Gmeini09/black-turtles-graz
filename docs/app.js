(() => {
  'use strict';
  const data = window.TURTLES_DATA;
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const external = (url, text, className = '') => `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  const teamLogo = (key, size = 52) => `<img src="${data.teams[key].logo}" width="${size}" height="${size}" alt="Wappen ${escape(data.teams[key].name)}" loading="lazy">`;
  const formatDate = (date, options) => new Intl.DateTimeFormat('de-AT', {timeZone:'Europe/Vienna',...options}).format(new Date(`${date}T12:00:00Z`));
  const month = date => formatDate(date, {month:'short'}).replace(/\.$/, '').toUpperCase();
  function fixtureInstant(fixture) {
    if (Number.isFinite(fixture.utcTimestamp)) return new Date(fixture.utcTimestamp);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fixture.date || '') || !/^\d{2}:\d{2}$/.test(fixture.time || '')) return new Date(NaN);
    const nominal = new Date(`${fixture.date}T${fixture.time}:00Z`);
    const offsetLabel = new Intl.DateTimeFormat('en-US', {timeZone:'Europe/Vienna',timeZoneName:'longOffset'}).formatToParts(nominal).find(part => part.type === 'timeZoneName').value;
    const offset = offsetLabel.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = offset ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1) : 0;
    return new Date(nominal.getTime() - minutes * 60000);
  }
  const stamp = date => date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const calendarEscape = value => String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const fixtureReady = fixture => !fixture.cancelled && !fixture.dateTbd && !fixture.timeTbd && Number.isFinite(fixtureInstant(fixture).getTime());
  // RFC 5545 folds content lines at 75 UTF-8 octets, preserving complete characters.
  function foldCalendarLine(line) {
    let part = '', bytes = 0;
    const parts = [];
    for (const character of line) {
      const size = new TextEncoder().encode(character).length;
      if (bytes + size > 75) { parts.push(part); part = ' '; bytes = 1; }
      part += character; bytes += size;
    }
    parts.push(part);
    return parts.join('\r\n');
  }
  function calendarText(fixtures) {
    const stampNow = stamp(new Date());
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Black Turtles Graz//Spielplan//DE','CALSCALE:GREGORIAN','X-WR-CALNAME:Black Turtles Graz 2026/27','X-WR-TIMEZONE:Europe/Vienna'];
    for (const fixture of Array.isArray(fixtures) ? fixtures : [fixtures]) {
      if (fixture.dateTbd || fixture.timeTbd || !Number.isFinite(fixtureInstant(fixture).getTime())) continue;
      const home = data.teams[fixture.home].name, away = data.teams[fixture.away].name;
      lines.push('BEGIN:VEVENT',`UID:black-turtles-${fixture.gameId || fixture.id}@blackturtles.local`,`DTSTAMP:${stampNow}`,`DTSTART:${stamp(fixtureInstant(fixture))}`,'SUMMARY:' + calendarEscape(home + ' – ' + away),'LOCATION:' + calendarEscape(fixture.venue || 'Eishalle Hart bei Graz, Eisweg 3, 8075 Hart bei Graz'),'DESCRIPTION:' + calendarEscape('NHL Graz 2026/27. Terminänderungen vorbehalten. Nach Änderungen die aktuelle Kalenderdatei erneut importieren. Quelle: ' + fixture.url),`URL:${fixture.url}`,`STATUS:${fixture.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,'END:VEVENT');
    }
    return [...lines,'END:VCALENDAR',''].map(foldCalendarLine).join('\r\n');
  }
  window.TURTLES_UTILS = {fixtureInstant, fixtureReady, calendarText};

  function renderNextMatch() {
    const live = window.TURTLES_LIVE?.state;
    $('.next-match').classList.toggle('is-live',!!live?.isLive);
    if (live?.isLive && live.fixture) {
      const game = live.fixture;
      $('#next-match-title').textContent = 'JETZT LIVE';
      $('#next-match-content').innerHTML = `<p class="next-match-date">${escape(live.phase || 'NHL Graz · Gruppe A')}<span class="live-inline-label">● LIVE</span></p><div class="matchup"><div class="match-team">${teamLogo(game.home,62)}<strong>${escape(data.teams[game.home].short)}</strong></div><strong class="live-hero-score">${live.score ? `${live.score.home}:${live.score.away}` : '–:–'}</strong><div class="match-team">${teamLogo(game.away,62)}<strong>${escape(data.teams[game.away].short)}</strong></div></div><p class="match-meta">Eishalle Hart bei Graz</p><div class="match-actions"><a class="button primary" href="#live">Live ansehen <span aria-hidden="true">▶</span></a>${external(game.url,'Offizieller Ticker ↗')}</div>`;
      return;
    }
    $('#next-match-title').textContent = 'NÄCHSTES SPIEL';
    const next = data.fixtures.find(fixture => fixtureReady(fixture) && fixtureInstant(fixture).getTime() >= Date.now());
    if (!next) {
      $('#next-match-content').innerHTML = `<div class="empty-state"><strong>Neue Termine folgen.</strong><p>Die hinterlegten Spiele sind bereits vergangen. Aktuelle Termine findest du bei der Liga.</p>${external('https://www.nhl-graz.com/teams/turtles','Zum offiziellen Spielplan ↗','text-link')}</div>`;
      return;
    }
    $('#next-match-content').innerHTML = `<p class="next-match-date">${escape(formatDate(next.date,{weekday:'short',day:'2-digit',month:'long',year:'numeric'}))}<span>${next.time} UHR</span></p><div class="matchup"><div class="match-team">${teamLogo(next.home,62)}<strong>${escape(data.teams[next.home].short)}</strong><span>HEIM</span></div><span class="match-vs">VS</span><div class="match-team">${teamLogo(next.away,62)}<strong>${escape(data.teams[next.away].short)}</strong><span>GAST</span></div></div><p class="match-meta"><span aria-hidden="true">⌖</span> Eishalle Hart bei Graz</p><div class="match-actions"><button class="button primary" data-calendar="${next.id}">Im Kalender speichern <span aria-hidden="true">+</span></button><a href="#spielplan" aria-label="Zum gesamten Spielplan">Alle Spiele →</a></div>`;
  }

  let fixtureFilter = 'upcoming';
  function renderFixtures() {
    const now = Date.now();
    const fixtures = data.fixtures.filter(fixture => {
      const upcoming = fixture.dateTbd || fixture.timeTbd || fixtureInstant(fixture).getTime() >= now;
      return (fixtureFilter === 'all' || (fixtureFilter === 'upcoming' && upcoming) || (fixtureFilter === 'past' && !upcoming)) && (!$('#home-only').checked || fixture.home === 'turtles');
    });
    $('#schedule-status').textContent = `${fixtures.length} ${fixtures.length === 1 ? 'Spiel' : 'Spiele'} angezeigt.`;
    $('#fixtures').innerHTML = fixtures.length ? fixtures.map(fixture => {
      const isHome = fixture.home === 'turtles';
      const isPast = fixtureInstant(fixture).getTime() < now;
      const label = fixture.cancelled ? 'ABGESAGT / GEÄNDERT' : fixture.dateTbd || fixture.timeTbd ? 'TERMIN OFFEN' : fixture.gameStatus === 1 ? 'LIVE' : fixture.gameStatus >= 2 ? 'BEENDET' : isPast ? 'VERGANGEN' : isHome ? 'HEIMSPIEL' : 'AUSWÄRTS';
      const result = fixture.gameStatus >= 1 && fixture.score && !fixture.cancelled ? `${fixture.score.home}:${fixture.score.away}` : 'vs';
      const calendar = fixtureReady(fixture) ? `<button class="calendar-button" data-calendar="${fixture.id}" aria-label="${escape(`${data.teams[fixture.home].short} gegen ${data.teams[fixture.away].short} am ${formatDate(fixture.date,{day:'numeric',month:'long',year:'numeric'})} im Kalender speichern`)}" title="Im Kalender speichern"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm7 8v5m-2.5-2.5h5"/></svg></button>` : '';
      return `<article class="fixture-row ${isHome ? 'home-game' : ''}"><div class="fixture-date"><span class="date-day">${fixture.dateTbd ? '–' : fixture.date.slice(-2)}</span><span class="date-month">${fixture.dateTbd ? 'TERMIN OFFEN' : month(fixture.date) + ' ' + fixture.date.slice(0,4)}</span></div><div class="fixture-teams"><div class="fixture-team">${teamLogo(fixture.home,42)}<strong>${escape(data.teams[fixture.home].short)}</strong></div><span class="fixture-versus">${result}</span><div class="fixture-team">${teamLogo(fixture.away,42)}<strong>${escape(data.teams[fixture.away].short)}</strong></div></div><div class="fixture-time"><strong>${fixture.timeTbd || fixture.dateTbd ? 'OFFEN' : fixture.time}</strong><span>${fixture.dateTbd ? 'Datum folgt' : escape(formatDate(fixture.date,{weekday:'long'}))}</span></div><span class="fixture-type">${label}</span><div class="fixture-actions">${calendar}${external(fixture.url,'↗','fixture-source')}</div></article>`;
    }).join('') : `<div class="empty-state"><strong>Hier ist gerade spielfrei.</strong><p>${fixtureFilter === 'past' ? 'Für diesen Filter sind noch keine vergangenen Spiele hinterlegt.' : 'Für diese Auswahl sind keine bevorstehenden Spiele hinterlegt.'}</p><button class="text-link" id="reset-fixtures">Alle Spiele anzeigen →</button></div>`;
    all('.fixture-source').forEach(link => link.setAttribute('aria-label','Offiziellen Ligaspielplan öffnen'));
    $('#reset-fixtures')?.addEventListener('click', () => { fixtureFilter = 'all'; $('#home-only').checked = false; updateFixtureButtons(); renderFixtures(); });
  }
  function updateFixtureButtons() {
    all('[data-fixture-filter]').forEach(button => { const active = button.dataset.fixtureFilter === fixtureFilter; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
  }
  all('[data-fixture-filter]').forEach(button => button.addEventListener('click', () => { fixtureFilter = button.dataset.fixtureFilter; updateFixtureButtons(); renderFixtures(); }));
  $('#home-only').addEventListener('change',renderFixtures);

  let playerFilter = 'Alle';
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function renderPlayers() {
    const search = normalize($('#player-search').value.trim());
    const players = data.players.filter(player => (playerFilter === 'Alle' || player.position === playerFilter) && normalize(player.name + ' ' + (player.jerseyNumber ? '#' + player.jerseyNumber : '')).includes(search));
    $('#players-status').textContent = `${players.length} ${players.length === 1 ? 'Spieler' : 'Spieler'} angezeigt.`;
    $('#players').innerHTML = players.length ? players.map(player => {
      const isJose = player.name === 'Jose Miguel Palomo Museros';
      const first = isJose ? 'Jose Miguel' : player.name.split(' ')[0];
      const last = isJose ? 'Palomo Museros' : player.name.split(' ').slice(1).join(' ');
      const initials = first[0] + last[0];
      const role = {'Tor':'G','Verteidigung':'D','Angriff':'F'}[player.position];
      const jersey = player.jerseyNumber ? `<a class="jersey-source" href="${escape(player.jerseySource)}" target="_blank" rel="noopener noreferrer" aria-label="Rückennummer ${escape(player.jerseyNumber)}, belegt im Spielbericht vom ${escape(formatDate(player.jerseyDate,{day:'numeric',month:'long',year:'numeric'}))}">Nr. ${escape(player.jerseyNumber)} <span>· ${escape(player.jerseySeason)} ↗</span></a>` : '<span class="jersey-source jersey-missing">Nummer offen</span>';
      return `<article class="player-card"><div class="player-visual" aria-hidden="true"><span class="player-initials">${escape(initials)}</span><svg viewBox="0 0 180 200" fill="none"><path d="m58 28-38 17-16 52 31 12 11-27v96h88V82l11 27 31-12-16-52-38-17c-5 14-15 20-32 20S63 42 58 28Z" fill="#202020" stroke="#3b3b3b" stroke-width="2"/><path d="M46 140h88v8H46zM11 81l28 10M141 91l28-10" stroke="#FF691D" stroke-width="3"/><path d="m58 28 32 35 32-35" stroke="#555" stroke-width="2"/><text x="90" y="116" class="jersey-number${player.jerseyNumber ? '' : ' is-unconfirmed'}">${escape(player.jerseyNumber || '–')}</text></svg><span class="player-role">${role}</span></div><div class="player-info"><span class="player-first">${escape(first)}</span><h3 class="player-last">${escape(last)}</h3><p>${escape(player.position)}</p>${jersey}</div></article>`;
    }).join('') : '<div class="empty-state"><strong>Kein Spieler gefunden.</strong><p>Versuche einen anderen Namen oder wähle eine andere Position.</p></div>';
  }
  all('[data-player-filter]').forEach(button => button.addEventListener('click', () => {
    playerFilter = button.dataset.playerFilter;
    all('[data-player-filter]').forEach(item => { const active = item === button; item.classList.toggle('active',active); item.setAttribute('aria-pressed',String(active)); });
    renderPlayers();
  }));
  $('#player-search').addEventListener('input',renderPlayers);

  const score = value => {
    const [forUs, againstUs] = value.split(':').map(Number);
    const type = forUs > againstUs ? 'win' : forUs < againstUs ? 'loss' : 'draw';
    return `<span class="score ${type}">${value.replace(':',' : ')}</span>`;
  };
  $('#results-body').innerHTML = data.results.map(result => `<tr><th scope="row">${escape(result.opponent)}</th><td data-label="Heim">${score(result.home)}</td><td data-label="Auswärts">${score(result.away)}</td></tr>`).join('');
  $('#scorers-body').innerHTML = data.scorers.map((player,index) => `<tr><th scope="row"><span class="scorer-rank">${String(index + 1).padStart(2,'0')}</span>${escape(player.name)}</th><td data-label="Tore">${player.goals}</td><td data-label="Vorlagen">${player.assists}</td><td data-label="Punkte" class="scorer-points">${player.points}</td></tr>`).join('');
  $('#history-body').innerHTML = data.history.map(item => `<tr><th scope="row">${external(item.url,escape(item.season) + ' ↗')}</th><td data-label="Grunddurchgang">${escape(item.group)} · Platz ${escape(item.place.replace(/\.$/,''))}</td><td data-label="Weiterer Verlauf">${escape(item.detail)}</td></tr>`).join('');
  $('#cup-cards').innerHTML = data.cups.map(cup => `<article class="cup-card"><span class="cup-year">${escape(cup.year)}</span><h4>${escape(cup.title)}</h4><p>${escape(cup.detail)}</p>${external(cup.url,escape(cup.linkLabel || 'Turnierbericht') + ' ↗','text-link')}</article>`).join('');
  const honours = data.clubHonours;
  $('#asvoe-title-count').textContent = String(honours.asvoeTitles);
  $('#asvoe-title-years').innerHTML = honours.titleYears.map(year => `<li><strong>${year}</strong><span>${year === 2015 ? 'Premierensieg' : year === 2020 ? 'Gruppe A' : `${year - 2020}. Serientitel`}</span></li>`).join('');

  const dialogs = {
    sources: {title:'Quellen & Bildnachweise',content:`<p>Vereins-, Kader- und Archivdaten: Stand 21. Oktober 2026. Der Spielplan wird bei geöffneter Seite alle fünf Minuten aus dem offiziellen Saisonfeed aktualisiert. Der letzte erfolgreiche Abgleich steht beim Spielplan.</p><ul class="source-list">${data.sources.map(source => `<li>${external(source.url,escape(source.title) + ' ↗')}</li>`).join('')}<li>${external('https://www.hartbeigraz.at/Eisstadion','Hallenfoto: Gemeinde Hart bei Graz ↗')}</li></ul><h3>Bildnachweise</h3><p>Die Aufnahme zeigt die Eishalle Hart bei Graz beim Publikumslauf. Foto: Gemeinde Hart bei Graz. Mannschaftswappen und Liga-Logo: Originaldateien der NHL Graz / hockeydata.net, unverändert verwendet.</p><p>Historische Mannschaftsaufnahme: ASVÖ Steiermark, Bericht zum ASVÖ-Jubiläums-Eishockey-Cup 2024. Die Aufnahme zeigt die Black Turtles nach dem Gruppensieg 2024 und ist kein aktuelles Kaderfoto.</p><h3>Darstellungen der Mannschaft</h3><p>Die neutralen Spielerkarten sind grafische Darstellungen und keine Spielerfotos oder Abbildungen der tatsächlichen Trikots.</p><h3>ASVÖ-Cup</h3><p>Die Vereinschronik nennt sieben ASVÖ-Cupsiege (2015, 2020 sowie 2021 bis 2025) und fünf Titel in Folge. Titelanzahl, Titeljahre und Serie wurden am 23. Oktober 2026 als Vereinsangaben ergänzt. Diese Gesamtdarstellung ist nicht unabhängig bestätigt; die archivierten ASVÖ-Berichte für 2015 und 2021 nennen andere Sieger. Die Siege 2022 und 2023 sind in den verlinkten offiziellen Berichten für Gruppe B dokumentiert. Der Cupsieg 2025 und die Penaltyentscheidung gegen Rattlesnakes beruhen auf Vereinsangaben.</p><h3>Vereinsgeschichte</h3><p>Spielbetrieb ist spätestens seit 2015 dokumentiert. Das Originalwappen trägt „EST. 2015“. Ein gesonderter Gründungsnachweis liegt nicht vor. Die Platzierungen in Playoff AB, BC und CD beziehen sich auf die jeweilige Runde.</p>`},
    imprint: {title:'Impressum · Entwurf',content:'<p><strong>Eishockeyverein EC Black Turtles</strong><br>8010 Graz, Steiermark, Österreich<br>ZVR-Zahl: 324122420</p><p>Obmann laut öffentlichem ASVÖ-Verzeichnis: Karl Kling.</p><p>Dieser Bereich ist zur Vervollständigung vorbereitet. Die vollständige Anbieteranschrift, ein bestätigter Vereinskontakt sowie weitere erforderliche Angaben sind noch zu ergänzen.</p>'},
    privacy: {title:'Datenschutz · Entwurf',content:'<p>Die Vereinsseite enthält keine Kontaktformulare und bindet keine eigenen Analyse- oder Marketingdienste ein. Schriften, Wappen, Hallenfoto und historische Mannschaftsaufnahme werden als Dateien mit der Website ausgeliefert.</p><p>Für den Spielplan und den Live-Ticker ruft die Seite regelmäßig öffentliche Spieldaten der NHL Graz und von hockeydata ab. Dabei erhält der jeweilige Dienst die für die Verbindung erforderlichen Daten, etwa die IP-Adresse. Die Kalenderdateien werden direkt in deinem Browser erstellt; es wird kein Kalenderkonto verbunden. Die Videoübertragung wird erst nach einem Klick auf „Livestream starten“ direkt von der NHL Graz geladen.</p><p>Externe Verbands- und Kartenangebote werden beim Öffnen des jeweiligen Links aufgerufen. Die öffentlich zugängliche Website wird über GitHub Pages von GitHub ausgeliefert.</p><p>Dieser Bereich ist zur Vervollständigung vorbereitet. Angaben zum Verantwortlichen, zu Hosting und eingebundenen Diensten sowie zu den datenschutzrechtlichen Kontaktmöglichkeiten sind noch zu ergänzen.</p>'}
  };
  const dialog = $('#info-dialog');
  all('[data-dialog]').forEach(button => button.addEventListener('click', () => { const item = dialogs[button.dataset.dialog]; $('#dialog-title').textContent = item.title; $('#dialog-content').innerHTML = item.content; dialog.showModal(); }));
  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

  let toastTimer;
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-calendar]');
    if (!button) return;
    const isSeason = button.dataset.calendar === 'season';
    button.disabled = true;
    if (isSeason) await window.TURTLES_SCHEDULE?.refresh();
    const selection = isSeason ? data.fixtures : data.fixtures.find(item => item.id === button.dataset.calendar);
    button.disabled = false;
    if (!selection) return;
    const exportable = (Array.isArray(selection) ? selection : [selection]).filter(fixture => !fixture.dateTbd && !fixture.timeTbd && Number.isFinite(fixtureInstant(fixture).getTime()));
    if (!exportable.length) return;
    const blob = new Blob([calendarText(exportable)],{type:'text/calendar;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = isSeason ? 'black-turtles-saison-2026-27.ics' : `black-turtles-${selection.date}.ics`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    $('#toast').textContent = isSeason ? `${exportable.length} Termine als Kalenderdatei heruntergeladen.` : 'Kalenderdatei zum Öffnen heruntergeladen.';
    $('#toast').classList.add('showtoast'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('showtoast'),3500);
  });

  const menu = $('.menu-toggle');
  function closeMenu() { menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Menü öffnen'); $('#main-navigation').classList.remove('open'); document.body.classList.remove('menu-open'); }
  menu.addEventListener('click', () => { const isOpen = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded',String(isOpen)); menu.setAttribute('aria-label',isOpen ? 'Menü schließen' : 'Menü öffnen'); $('#main-navigation').classList.toggle('open',isOpen); document.body.classList.toggle('menu-open',isOpen); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  window.matchMedia('(min-width: 981px)').addEventListener('change',event => { if (event.matches) closeMenu(); });

  const navigationLinks = all('#main-navigation a');
  const navigationSections = navigationLinks.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
  function setActiveSection(id) {
    navigationLinks.forEach(link => {
      const active = link.hash === '#' + id;
      link.classList.toggle('active',active);
      if (active) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }
  function hashTarget(hash) {
    try { return hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; }
    catch { return null; }
  }
  function activateTarget(target) {
    const section = target?.closest('main section[id]');
    if (section && navigationSections.includes(section)) setActiveSection(section.id);
    else if (target?.id === 'inhalt') setActiveSection('start');
  }
  let navigationFrame = 0;
  let navigationTarget = null;
  let navigationSettleTimer = 0;
  function releaseNavigationTarget() {
    navigationTarget = null;
    clearTimeout(navigationSettleTimer);
    scheduleNavigation();
  }
  function updateNavigation() {
    navigationFrame = 0;
    if (navigationTarget) {
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const maxScroll = Math.max(0,document.documentElement.scrollHeight - window.innerHeight);
      const destination = Math.max(0,Math.min(maxScroll,window.scrollY + navigationTarget.getBoundingClientRect().top - padding));
      if (Math.abs(window.scrollY - destination) > 2) {
        activateTarget(navigationTarget);
        return;
      }
      navigationTarget = null;
      clearTimeout(navigationSettleTimer);
    }
    const marker = $('.site-header').getBoundingClientRect().bottom + 24;
    let current = navigationSections[0];
    for (const section of navigationSections) {
      if (section.getBoundingClientRect().top <= marker) current = section;
      else break;
    }
    if (current) setActiveSection(current.id);
  }
  function scheduleNavigation() {
    // Hold the selected menu item while native smooth scrolling passes other sections.
    // The fallback also releases the target when scrolling is interrupted or never starts.
    if (navigationTarget) {
      clearTimeout(navigationSettleTimer);
      navigationSettleTimer = setTimeout(releaseNavigationTarget,200);
    }
    if (!navigationFrame) navigationFrame = requestAnimationFrame(updateNavigation);
  }
  // Keep native anchors and browser history; one CSS offset accounts for the sticky header.
  document.addEventListener('click',event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = hashTarget(link.hash);
    if (!target) return;
    closeMenu();
    navigationTarget = target;
    activateTarget(target);
    scheduleNavigation();
  });
  ['wheel','touchstart','pointerdown','keydown'].forEach(type => window.addEventListener(type,releaseNavigationTarget,{passive:true}));
  window.addEventListener('scroll',scheduleNavigation,{passive:true});
  window.addEventListener('resize',scheduleNavigation);
  window.addEventListener('hashchange',() => { activateTarget(hashTarget(window.location.hash)); scheduleNavigation(); });
  window.addEventListener('pageshow',scheduleNavigation);

  // Re-align a direct deep link once fonts and the rendered content have settled.
  // Any user interaction cancels this correction so it cannot pull the visitor back.
  const initialHash = window.location.hash;
  let allowInitialAlignment = true;
  const cancelInitialAlignment = () => { allowInitialAlignment = false; };
  const interactionEvents = ['pointerdown','wheel','touchstart','keydown'];
  interactionEvents.forEach(type => window.addEventListener(type,cancelInitialAlignment,{once:true,passive:true}));
  async function finishInitialNavigation() {
    if (document.fonts?.ready) await document.fonts.ready;
    interactionEvents.forEach(type => window.removeEventListener(type,cancelInitialAlignment));
    if (allowInitialAlignment && initialHash && window.location.hash === initialHash) {
      const target = hashTarget(initialHash);
      if (target) { target.scrollIntoView({block:'start',behavior:'instant'}); activateTarget(target); }
    }
    scheduleNavigation();
  }
  if (document.readyState === 'complete') finishInitialNavigation();
  else window.addEventListener('load',finishInitialNavigation,{once:true});
  scheduleNavigation();
  window.TURTLES_UI = {renderNextMatch, renderFixtures};
  renderNextMatch(); renderFixtures(); renderPlayers();
  setInterval(() => { renderNextMatch(); renderFixtures(); },60000);
})();
