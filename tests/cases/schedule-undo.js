/* Carlos's ask, 2026-09-17: a fat-finger — a number typed into the wrong
   day, or a wrong week entirely — needs a way back without hand-retyping
   every box. Scoped to the SPECIFIC day(s) an action touches rather than
   a snapshot of the whole schedule: dlSaveSchedule merges with whatever's
   on the server at push time, so restoring a whole-blob snapshot would
   also silently roll back any OTHER day another device legitimately
   edited in between — the exact cross-device clobber this app has
   already been bitten by more than once (Karla Varela, Guadalupe Cruz).
   One level only, matching what he actually asked for ("el contenido
   anterior") — a second Undo with nothing pending says so plainly. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

module.exports = {
  name: "Schedule Undo: reverts only the day(s) an action actually touched, is single-level, and a no-op action never eats the slot for a real prior edit (Carlos's 2026-09-17 ask)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));
    win.confirm = () => true;

    const days = {};
    DATES.forEach((ds) => { days[ds] = { sheet: 'test', occ: '100', dep: '20', tdOcc: '', gra: [['Mayra', '1']] }; });
    win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
    win.schedViewWeekStart = new Date(2026, 8, 12);
    win.renderSchedule();

    t.assert(win.document.getElementById('schedUndoBtn').disabled, 'Undo starts disabled — nothing has happened yet');

    // ── A single OCC edit is undoable ──
    win.schedSetNum('2026-09-14', 'occ', '250');
    t.eq(win.dlLoadSchedule().days['2026-09-14'].occ, '250', 'sanity: the edit landed');
    t.assert(!win.document.getElementById('schedUndoBtn').disabled, 'Undo lights up right after the edit, without needing a full re-render');

    win.schedUndo();
    t.eq(win.dlLoadSchedule().days['2026-09-14'].occ, '100', 'Undo restores the OCC box to its value from before the edit');
    t.assert(win.document.getElementById('schedUndoBtn').disabled, 'and the button goes back to disabled — one level only');

    // ── A second Undo click with nothing pending is a no-op, not an error ──
    win.schedUndo();
    t.assert(/Nothing to undo/.test(win.document.getElementById('toastMsg').textContent),
      'clicking Undo again says plainly there is nothing left to undo');

    // ── Undo never touches a day it didn't stash, even if that OTHER day
    // changed in the meantime — the whole reason this is scoped per-day
    // instead of a whole-blob snapshot. ──
    win.schedSetNum('2026-09-15', 'dep', '77');
    const midway = win.dlLoadSchedule();
    midway.days['2026-09-16'].occ = '999'; // simulates another device's unrelated concurrent edit landing
    win.dlSaveSchedule(midway);
    win.schedUndo();
    const afterScoped = win.dlLoadSchedule();
    t.eq(afterScoped.days['2026-09-15'].dep, '20', 'the day actually edited (09-15) reverts');
    t.eq(afterScoped.days['2026-09-16'].occ, '999', 'an unrelated day another device touched in the meantime (09-16) is left completely alone');

    // ── schedSetCell edits are undoable too ──
    win.schedSetCell('gra', 0, 'Mayra', '2026-09-17', 'OFF', null);
    t.eq(win.dlLoadSchedule().days['2026-09-17'].gra[0][1], 'OFF', 'sanity: the cell edit landed');
    win.schedUndo();
    t.eq(win.dlLoadSchedule().days['2026-09-17'].gra[0][1], '1', "Undo restores Mayra's cell to its value from before the edit");

    // ── Refresh OCC from R106 finding nothing new must NOT eat the undo
    // slot for a real edit made just before it. ──
    win.schedSetNum('2026-09-18', 'occ', '333');
    win.localStorage.setItem('hk_r106_2026-09', JSON.stringify({})); // nothing for R106 to offer
    win.schedRefreshOccFromR106Click();
    t.assert(!win.document.getElementById('schedUndoBtn').disabled,
      'a no-op Refresh (nothing new in R106) leaves the real prior edit still undoable');
    win.schedUndo();
    t.eq(win.dlLoadSchedule().days['2026-09-18'].occ, '100', 'and undoing it still reverts the OCC edit that was actually pending, not the refresh');
  },
};
