'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname,'..');
const countdownContext = {
  window: {},
  document: {addEventListener() {},querySelectorAll() { return []; }},
  setInterval() {}
};
vm.runInNewContext(fs.readFileSync(path.join(root,'docs/countdown.js'),'utf8'),countdownContext);
const {selectMatch,remainingParts} = countdownContext.window.TURTLES_COUNTDOWN;

test('an early interval tick safely waits for app.js to provide its time utilities',() => {
  let intervalTick;
  const earlyContext = {
    window:{TURTLES_DATA:{fixtures:[]}},
    document:{hidden:false,addEventListener() {},querySelectorAll() { return []; }},
    setInterval(callback) { intervalTick = callback; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'docs/countdown.js'),'utf8'),earlyContext);
  assert.equal(typeof intervalTick,'function');
  assert.doesNotThrow(() => intervalTick(),'A slow app.js download must not break the countdown tick.');
});

// Use the production Vienna/UTC conversion without starting the website's DOM code.
const appSource = fs.readFileSync(path.join(root,'docs/app.js'),'utf8');
const instantSource = appSource.match(/  function fixtureInstant\(fixture\) \{[\s\S]*?(?=  const stamp =)/)?.[0];
assert.ok(instantSource,'Production fixtureInstant must be available for timezone checks.');
const fixtureInstant = vm.runInNewContext(`(${instantSource.trim()})`);

const NOW = Date.parse('2026-11-01T10:00:00Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const utils = {
  fixtureInstant: fixture => new Date(fixture.utcTimestamp),
  fixtureReady: fixture => !fixture.cancelled && !fixture.dateTbd && !fixture.timeTbd
    && Number.isFinite(fixture.utcTimestamp)
};
const game = (id,utcTimestamp,extra = {}) => ({id,gameId:`game-${id}`,utcTimestamp,gameStatus:0,...extra});
const choose = (fixtures,live = null,now = NOW) => selectMatch(fixtures,live,now,utils);
const parts = (timestamp,now = NOW) => ({...remainingParts(timestamp,now)});

test('remaining time splits days, hours, minutes and seconds without losing full days',() => {
  assert.deepEqual(parts(NOW + 2 * DAY + 3 * HOUR + 4 * MINUTE + 5000),{
    days:2,hours:3,minutes:4,seconds:5
  });
  assert.deepEqual(parts(NOW + DAY),{days:1,hours:0,minutes:0,seconds:0});
});

test('positive fractions remain one second; kickoff and elapsed times never go negative',() => {
  assert.deepEqual(parts(NOW + 1000),{days:0,hours:0,minutes:0,seconds:1});
  assert.deepEqual(parts(NOW + 1),{days:0,hours:0,minutes:0,seconds:1});
  assert.deepEqual(parts(NOW),{days:0,hours:0,minutes:0,seconds:0});
  assert.deepEqual(parts(NOW - DAY),{days:0,hours:0,minutes:0,seconds:0});
});

test('selection sorts confirmed upcoming fixtures while rejecting cancelled, TBD and final games',() => {
  const earliest = game('earliest',NOW + HOUR);
  const fixtures = [
    game('later',NOW + 2 * HOUR),
    game('cancelled',NOW + MINUTE,{cancelled:true}),
    game('date-tbd',NOW + MINUTE,{dateTbd:true}),
    game('time-tbd',NOW + MINUTE,{timeTbd:true}),
    game('bad-time',NaN),
    game('final-flag',NOW + MINUTE,{final:true}),
    game('final-status',NOW + MINUTE,{gameStatus:2}),
    earliest
  ];
  const inputOrder = fixtures.map(fixture => fixture.id);
  const result = choose(fixtures);
  assert.equal(result.mode,'countdown');
  assert.equal(result.fixture,earliest);
  assert.deepEqual(fixtures.map(fixture => fixture.id),inputOrder,'Selection must not reorder the schedule.');
});

test('kickoff waits for official status instead of falsely declaring a live game',() => {
  const started = game('started',NOW);
  const later = game('later',NOW + DAY);
  assert.equal(choose([later,started],null,NOW - 1).mode,'countdown');
  for (const now of [NOW,NOW + 1,NOW + 6 * HOUR]) {
    const result = choose([later,started],null,now);
    assert.equal(result.mode,'waiting');
    assert.equal(result.fixture,started);
  }
  const result = choose([later,started],null,NOW + 6 * HOUR + 1);
  assert.equal(result.mode,'countdown');
  assert.equal(result.fixture,later);
});

test('a confirmed live report takes priority and carries its score and phase',() => {
  const liveFixture = game('live',NOW - HOUR);
  const olderPending = game('pending',NOW - 2 * HOUR);
  const report = {
    fixture:{...liveFixture,id:'different-local-id'},
    isLive:true,
    score:{home:2,away:1},
    phase:'2. Drittel'
  };
  const result = choose([game('next',NOW + DAY),olderPending,liveFixture],report);
  assert.equal(result.mode,'live');
  assert.equal(result.fixture,liveFixture,'The official game ID must identify the match.');
  assert.equal(result.score,report.score);
  assert.equal(result.phase,'2. Drittel');
});

test('a final or cancelled report excludes the matching stale schedule fixture',() => {
  const oldFixture = game('old',NOW - HOUR);
  const next = game('next',NOW + HOUR);
  for (const report of [
    {fixture:oldFixture,isFinal:true},
    {fixture:oldFixture,cancelled:true,isLive:true}
  ]) {
    const result = choose([oldFixture,next],report);
    assert.equal(result.mode,'countdown');
    assert.equal(result.fixture,next);
  }
  const cancelled = game('cancelled',NOW - HOUR,{cancelled:true});
  assert.equal(choose([cancelled],{fixture:cancelled,isLive:true}).mode,'none');
});

test('schedule-confirmed live status is honored only inside the existing match window',() => {
  for (const extra of [{gameStatus:1},{live:true}]) {
    const fixture = game('live',NOW - HOUR,{score:{home:3,away:2},...extra});
    const result = choose([game('next',NOW + DAY),fixture]);
    assert.equal(result.mode,'live');
    assert.equal(result.fixture,fixture);
    assert.equal(result.score,fixture.score);
  }
  for (const timestamp of [NOW - 6 * HOUR - 1,NOW + 45 * MINUTE + 1]) {
    assert.equal(choose([game('stale-live',timestamp,{gameStatus:1})]).mode,'none');
  }
  assert.equal(choose([game('live-window-end',NOW - 6 * HOUR,{gameStatus:1})]).mode,'live');
  assert.equal(choose([game('live-window-start',NOW + 45 * MINUTE,{gameStatus:1})]).mode,'live');
});

test('a changed schedule immediately changes the chosen match and countdown deadline',() => {
  const original = game('moved',NOW + HOUR);
  const other = game('other',NOW + 2 * HOUR);
  assert.equal(choose([original,other]).fixture,original);
  const moved = {...original,utcTimestamp:NOW + 3 * HOUR};
  assert.equal(choose([moved,other]).fixture,other);
  const result = choose([moved]);
  assert.equal(result.fixture,moved);
  assert.deepEqual(parts(utils.fixtureInstant(result.fixture).getTime()),{days:0,hours:3,minutes:0,seconds:0});
  assert.equal(original.utcTimestamp,NOW + HOUR,'The previous snapshot remains unchanged.');
});

test('empty and exhausted schedules produce no countdown',() => {
  for (const fixtures of [
    [],
    [game('old',NOW - 6 * HOUR - 1)],
    [game('done',NOW - HOUR,{gameStatus:2})],
    [game('cancelled',NOW + HOUR,{cancelled:true})],
    [game('unknown',NOW + HOUR,{timeTbd:true})]
  ]) {
    const result = choose(fixtures);
    assert.equal(result.mode,'none');
    assert.equal(result.fixture,null);
  }
});

test('production Vienna conversion uses summer and winter offsets independently of local machine time',() => {
  for (const [date,time,expected] of [
    ['2026-10-24','12:00','2026-10-24T10:00:00.000Z'],
    ['2026-10-25','12:00','2026-10-25T11:00:00.000Z'],
    ['2026-11-01','12:00','2026-11-01T11:00:00.000Z'],
    ['2027-03-27','12:00','2027-03-27T11:00:00.000Z'],
    ['2027-03-28','12:00','2027-03-28T10:00:00.000Z']
  ]) {
    assert.equal(fixtureInstant({date,time}).toISOString(),expected);
  }
  assert.equal(fixtureInstant({date:'2026-11-01',time:'12:00',utcTimestamp:NOW}).getTime(),NOW,
    'Official UTC timestamps override the displayed local date/time.');
  assert.equal(Number.isNaN(fixtureInstant({date:'',time:''}).getTime()),true);
  const viennaKickoff = fixtureInstant({date:'2026-11-01',time:'12:00'}).getTime();
  assert.deepEqual(parts(viennaKickoff,NOW),{days:0,hours:1,minutes:0,seconds:0});
});
