/* Carlos's real ask, 2026-11-17: moving Sandra Silva onto Lobby as a real
   member always landed her on Lobby AM, with no way to say PM except the
   Lobby PM sub-card's own dedicated "+ Add someone" picker at add-time.
   A single per-person "Move to Lobby AM/PM" menu option now lets him fix
   an already-placed person's side at any time.

   Code review, 2026-11-17, caught two real bugs in the first version of
   this feature before it shipped:
   1. schedSetLobbyShift only wrote to localStorage, never to Supabase —
      a shift set on one device would never reach any other (same "fixed
      here, still broken there" class this app has hit repeatedly).
   2. The toggle was offered even on a 'cover' row (someone from another
      crew borrowed onto Lobby for ONE day) — clicking it would have set
      her PERMANENT shift preference off a single day's borrowed coverage,
      then silently misjudged every later, unrelated day she covers
      Lobby again. The toggle is now only offered for a real Lobby member
      (schedAddPerson's row, tag 'added' or a plain crew-list row), never
      for a 'cover' row. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];

function seedWeek(extra) {
  const days = {};
  DATES.forEach((ds) => { days[ds] = Object.assign({}, extra ? extra(ds) : {}); });
  return { days, count: 7, savedAt: new Date().toISOString() };
}

module.exports = {
  name: 'Lobby crew: a per-person menu moves a real member between Lobby AM/PM (and pushes it to Supabase), but never offers it for a one-day cover row',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    win.schedViewWeekStart = new Date(2026, 10, 21);

    // ── A real Lobby member (added via the normal picker, tag 'added')
    // defaults to AM and the toggle is offered. ──
    win.dlSaveSchedule(seedWeek());
    win.schedAddPerson('lobby', 'Sandra Silva', 'am');
    win.renderSchedule();
    t.eq(win.schedLobbyShift('Sandra Silva'), 'am', 'a real member with no override defaults to AM');

    win.schedTogglePersonMenu('lobby', 'Sandra Silva');
    let html = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(/Move to Lobby PM/.test(html), 'the open menu offers to move a real member to PM while she\'s on AM');
    t.assert(!/Move to Lobby AM/.test(html), 'not the reverse label while she\'s on AM');

    // ── Toggling moves her to PM, persists it, pushes to Supabase, and
    // the menu label flips to match (schedToggleLobbyShiftFor only
    // re-renders — the menu is still open from above). ──
    let pushedKeys = [];
    win.supaPut = function (key, value) { pushedKeys.push(key); return Promise.resolve(); };
    win.schedToggleLobbyShiftFor('Sandra Silva');
    t.eq(win.schedLobbyShift('Sandra Silva'), 'pm', 'now recorded as PM');
    t.assert(pushedKeys.indexOf('hk_dl_lobby_shift') !== -1, 'the new shift is pushed to Supabase, not just saved locally');

    html = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(/Move to Lobby AM/.test(html), 'the menu now offers to move her back to AM');
    t.assert(!/Move to Lobby PM/.test(html), 'not the stale PM label');

    // ── Her real row is still intact (not dropped) after moving sub-cards. ──
    const SCH = win.dlLoadSchedule();
    t.assert(
      (SCH.days['2026-11-21'].lobby || []).some((r) => r[0] === 'Sandra Silva'),
      'moving between AM/PM is presentation only — her real Lobby row survives the move'
    );

    win.schedToggleLobbyShiftFor('Sandra Silva');
    t.eq(win.schedLobbyShift('Sandra Silva'), 'am', 'toggles back to AM');
    win.schedTogglePersonMenu('lobby', 'Sandra Silva'); // close before the next scenario

    // ── A different person landed on Lobby via a 'cover' row (borrowed
    // for one day from another crew, the auto-cover path) must NEVER be
    // offered the toggle — flipping it would wrongly set a permanent
    // preference off a single day's borrowed coverage. ──
    win.dlSaveSchedule(seedWeek((ds) => ({ gra: [['Vanesa', 'LOBBY']] })));
    win.renderSchedule();
    const SCH2 = win.dlLoadSchedule();
    t.assert(
      (SCH2.days['2026-11-21'].lobby || []).some((r) => r[0] === 'Vanesa' && r[2] === 'cover'),
      'the self-heal created her Lobby row tagged \'cover\', from the LOBBY mark on her own crew'
    );
    win.schedTogglePersonMenu('lobby', 'Vanesa');
    html = win.document.getElementById('scheduleContent').innerHTML;
    // Her name alone appears many times on the page (warnings card,
    // "+ Add someone" option lists, day-off tooltips elsewhere) — anchor
    // on her row's own kebab button instead, which is unique to her.
    const vanesaIdx = html.indexOf('More options for Vanesa');
    const vanesaMenu = html.slice(vanesaIdx, vanesaIdx + 4000);
    t.assert(/Remove from crew/.test(vanesaMenu), 'sanity check: her menu is actually open');
    t.assert(!/Move to Lobby/.test(vanesaMenu), 'no AM/PM toggle offered for a one-day cover row');

    // ── Never offered on a non-Lobby crew (Laundry has no AM/PM split). ──
    win.dlSaveSchedule(seedWeek((ds) => ({ laundry: [['Some Laundry Person', '1', 'added']] })));
    win.renderSchedule();
    win.schedTogglePersonMenu('laundry', 'Some Laundry Person');
    html = win.document.getElementById('scheduleContent').innerHTML;
    // Schedule Checks' own warnings card mentions everyone by name near the
    // TOP of the page, including a "<b>Laundry</b>" crew label that itself
    // contains the literal text ">Laundry<" — search for the actual Laundry
    // CARD's own navy header instead, the only place this longer prefix appears.
    const laundryCardIdx = html.indexOf('letter-spacing:.5px;">Laundry<');
    const lpIdx = html.indexOf('Some Laundry Person', laundryCardIdx);
    const lpMenu = html.slice(lpIdx, lpIdx + 4000);
    t.assert(/Remove from crew/.test(lpMenu), 'sanity check: her own menu is actually open');
    t.assert(!/Move to Lobby/.test(lpMenu), 'the Lobby-only menu option never appears on another crew\'s menu');
  },
};
