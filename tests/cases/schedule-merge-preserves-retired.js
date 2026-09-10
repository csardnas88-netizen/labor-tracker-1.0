/* Carlos's real report, 2026-09-10: he removed Karla Varela from
   Laundry ("Remove from crew, this week onward"), confirmed she was
   gone, and she came back anyway — while running the Schedule on more
   than one device/tab at once.

   Root cause, found by reading _schedMergeRecord: 'retired' (and
   'hiddenPeople') were simply missing from the list of fields it
   merges. Every dlSaveSchedule call fetches the remote record and
   merges it back over local — and that merge silently dropped the
   retired map entirely, on every single save, on every device. Even a
   completely single-device Carlos would have lost the flag the moment
   his own save round-tripped through the merge; a second stale device
   pushing an older day array (still containing her row, picked by the
   per-day _at comparison) made it worse, but the flag was never going
   to survive even one sync either way.

   Two-part fix: 'retired'/'hiddenPeople' join the union-merge every
   other person-level mark (checkExempt, weekendPref, dayOffPref)
   already gets, AND — since a stale device's day array can still win
   the per-day comparison on its own — the merged retired map is applied
   as a final filter over every day, the same schedIsRetired check
   dlUploadSchedule and schedCreateWeek already use elsewhere. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: '_schedMergeRecord no longer drops the retired/hiddenPeople maps, and a stale device\'s day array can no longer resurrect a retired person (Carlos\'s real Karla Varela cross-device report, 2026-09-10)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── 1) The flag itself must survive a merge even with no day
    // conflict at all — this was broken on every single save, one
    // device or ten. ──
    const local1 = {
      days: { '2026-09-12': { laundry: [['Olga A', '1']] } },
      retired: { 'laundry|karla varela': true },
      savedAt: '2026-09-10T12:00:00.000Z',
    };
    const remote1 = {
      days: { '2026-09-12': { laundry: [['Olga A', '1']] } },
      savedAt: '2026-09-10T11:00:00.000Z',
    };
    const m1 = win._schedMergeRecord(local1, remote1);
    t.assert(win.schedIsRetired(m1.rec, 'laundry', 'Karla Varela'),
      'the retired flag survives a merge with an older remote that never had it at all');

    // ── 2) The real cross-device shape: a STALE device (Device B, open
    // since before the removal) pushes an older day array that still
    // has Karla's row, with a _at that happens to be LATER in wall-clock
    // time than the removal's own _at — the exact race that made this
    // look like "she comes back" instead of "the flag never stuck". ──
    const local2 = {
      days: { '2026-09-12': { laundry: [['Olga A', '1']], _at: 1000 } },
      retired: { 'laundry|karla varela': true },
      savedAt: '2026-09-10T12:00:00.000Z',
    };
    const remote2 = {
      days: { '2026-09-12': { laundry: [['Olga A', '1'], ['Karla Varela', '', 'added']], _at: 2000 } },
      savedAt: '2026-09-10T11:00:00.000Z',
    };
    const m2 = win._schedMergeRecord(local2, remote2);
    t.assert(win.schedIsRetired(m2.rec, 'laundry', 'Karla Varela'),
      'still retired after a stale device\'s later-timestamped push');
    t.assert(!m2.rec.days['2026-09-12'].laundry.some((p) => p[0] === 'Karla Varela'),
      'and her row from that stale push is filtered right back out — the actual bug: it used to survive this exact merge');
    t.assert(m2.rec.days['2026-09-12'].laundry.some((p) => p[0] === 'Olga A'),
      'someone else on the same stale row is untouched — only the retired name is filtered');

    // ── 3) The flag also has to flow the OTHER direction: a remote
    // record where SOMEONE ELSE already retired her (a manager's
    // device) must reach this device too, not just survive locally. ──
    const local3 = { days: { '2026-09-12': { laundry: [['Karla Varela', '1']] } }, savedAt: '2026-09-10T10:00:00.000Z' };
    const remote3 = {
      days: { '2026-09-12': { laundry: [['Karla Varela', '1']] } },
      retired: { 'laundry|karla varela': true },
      savedAt: '2026-09-10T13:00:00.000Z',
    };
    const m3 = win._schedMergeRecord(local3, remote3);
    t.assert(win.schedIsRetired(m3.rec, 'laundry', 'Karla Varela'),
      'a retirement made on another device reaches this one through the merge');

    // ── 4) hiddenPeople (the Jecelyn-style "hidden in Excel" names)
    // survives the same way, same bug class. ──
    const local4 = { days: {}, hiddenPeople: { 'jecelyn ramos': 'Jecelyn Ramos' }, savedAt: '2026-09-10T12:00:00.000Z' };
    const remote4 = { days: {}, savedAt: '2026-09-10T11:00:00.000Z' };
    const m4 = win._schedMergeRecord(local4, remote4);
    t.assert(m4.rec.hiddenPeople && m4.rec.hiddenPeople['jecelyn ramos'], 'hiddenPeople survives the merge too');

    // ── 5) checkExempt/weekendPref/dayOffPref — the marks that were
    // already correctly merged before this fix — must still work
    // exactly as before; this change only ADDS fields to the list. ──
    const local5 = { days: {}, checkExempt: { 'paty': true }, savedAt: '2026-09-10T12:00:00.000Z' };
    const remote5 = { days: {}, weekendPref: { 'jorge gonzalez': 'preferWork' }, savedAt: '2026-09-10T11:00:00.000Z' };
    const m5 = win._schedMergeRecord(local5, remote5);
    t.assert(m5.rec.checkExempt && m5.rec.checkExempt['paty'], 'checkExempt still merges correctly');
    t.assert(m5.rec.weekendPref && m5.rec.weekendPref['jorge gonzalez'] === 'preferWork', 'weekendPref still merges correctly');
  },
};
