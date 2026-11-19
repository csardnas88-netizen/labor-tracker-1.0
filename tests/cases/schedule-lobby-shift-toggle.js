/* Carlos's real ask, 2026-11-17: moving Sandra Silva onto Lobby as a real
   member always landed her on Lobby AM, with no way to say PM except the
   Lobby PM sub-card's own dedicated "+ Add someone" picker at add-time.
   A single per-person "Move to Lobby AM/PM" menu option now lets him fix
   an already-placed person's side at any time.

   Code review, 2026-11-17, caught a real bug in the first version before
   it shipped: schedSetLobbyShift only wrote to localStorage, never to
   Supabase — a shift set on one device would never reach any other (same
   "fixed here, still broken there" class this app has hit repeatedly).
   Fixed by pushing/pulling it through the normal supaPut/_syncFromSheetsPull
   plumbing, same as hk_section_pin.

   The SAME review also flagged, and this file originally excluded, 'cover'
   rows (someone marked onto Lobby from another crew's cell, rather than
   through the AM/PM picker) — worried that flipping the shift there would
   wrongly set a "permanent" preference off what might be a single day's
   borrowed coverage. Reverted the same day: Carlos's actual real-world
   report (Sandra S) IS a 'cover' row — she has no dedicated/"added" row at
   all, the exact same shape plain Sandra has on Laundry (see
   schedSyncLaundryCoverRow's own history) — so excluding 'cover' silently
   hid the menu option for the main case it exists for. A 'cover' row that
   spans days or weeks is functionally no different from a permanent one;
   the tag only ever meant "no dedicated row exists yet," never "temporary." */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];

function seedWeek(extra) {
  const days = {};
  DATES.forEach((ds) => { days[ds] = Object.assign({}, extra ? extra(ds) : {}); });
  return { days, count: 7, savedAt: new Date().toISOString() };
}

module.exports = {
  name: 'Lobby crew: a per-person menu moves anyone on the crew between Lobby AM/PM — a real member or a \'cover\' row alike — and pushes it to Supabase',
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

    // ── Sandra S's real shape: she lands on Lobby via a 'cover' row (her
    // Room Attendant cell reads LOBBY, same as Carlos's actual report) —
    // the toggle must still be offered and must still work. ──
    win.dlSaveSchedule(seedWeek((ds) => ({ gra: [['Sandra S', 'LOBBY']] })));
    win.renderSchedule();
    const SCH2 = win.dlLoadSchedule();
    t.assert(
      (SCH2.days['2026-11-21'].lobby || []).some((r) => r[0] === 'Sandra S' && r[2] === 'cover'),
      'the self-heal created her Lobby row tagged \'cover\' — she has no dedicated row, same as the real case'
    );
    win.schedTogglePersonMenu('lobby', 'Sandra S');
    html = win.document.getElementById('scheduleContent').innerHTML;
    // Her name alone appears many times on the page (warnings card,
    // "+ Add someone" option lists, day-off tooltips elsewhere) — anchor
    // on her row's own kebab button instead, which is unique to her.
    let sandraSIdx = html.indexOf('More options for Sandra S');
    let sandraSMenu = html.slice(sandraSIdx, sandraSIdx + 4000);
    t.assert(/Move to Lobby PM/.test(sandraSMenu), 'the toggle IS offered for a \'cover\' row — this is the real-world case it exists for');

    win.schedToggleLobbyShiftFor('Sandra S');
    t.eq(win.schedLobbyShift('Sandra S'), 'pm', 'toggling a \'cover\' row\'s shift actually works');
    html = win.document.getElementById('scheduleContent').innerHTML;
    sandraSIdx = html.indexOf('More options for Sandra S');
    sandraSMenu = html.slice(sandraSIdx, sandraSIdx + 4000);
    t.assert(/Move to Lobby AM/.test(sandraSMenu), 'and the menu label flips to match, same as a real member');

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
