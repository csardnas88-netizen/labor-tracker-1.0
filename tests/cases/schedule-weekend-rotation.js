/* Carlos's ask, 2026-11-19: a panoramic view of who's actually had
   Saturday and/or Sunday off, by crew, across several weeks at once —
   without flipping week to week on the Schedule tab to piece it
   together. Confirmed via a mockup first:
   - Reads the SAVED SCHEDULE (schedIsOff/schedCellFor), not Request
     Off's logged requests — his own explicit distinction between what
     was asked for and what the schedule says actually happened.
   - Individual Saturday/Sunday, not just the full-weekend-only version
     the first mockup showed — his follow-up ask.
   - A quiet marker for whoever's gone longest without a full weekend,
     answering "whose turn is it" at a glance.
   Anchored on the REAL current week (getHotelWeekStart(new Date())),
   not whichever week the Schedule tab's own Prev/Next arrows have
   navigated to — computed the same way here as in the real function,
   so this test holds on whatever day it actually runs. */
const { loadApp, fakeSession } = require('../_harness');

function buildWeekStarts(win, n) {
  const anchor = win.getHotelWeekStart(new Date());
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const w = new Date(anchor);
    w.setDate(w.getDate() - 7 * i);
    out.push(w);
  }
  return out; // oldest first, matching the real function
}

function fillWeek(win, SCH, weekStart, entries, bk) {
  // entries: { name: [sun..sat values for the 7 days] } keyed 0=Sat..6=Fri
  bk = bk || 'gra';
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(win.dateStr(d));
  }
  dates.forEach((ds, i) => {
    if (!SCH.days[ds]) SCH.days[ds] = {};
    if (!SCH.days[ds][bk]) SCH.days[ds][bk] = [];
    Object.keys(entries).forEach((name) => {
      const v = entries[name][i];
      if (v === undefined) return; // deliberately no row this day (feeds 'none')
      SCH.days[ds][bk].push([name, v]);
    });
  });
}

module.exports = {
  name: 'Weekend Rotation: individual Sat/Sun off vs full weekend vs no data, by crew, across several weeks — toggled from the Schedule page',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const weekStarts = buildWeekStarts(win, 8);
    const SCH = { days: {} };

    // Ana: a full weekend off on the OLDEST examined week only — the
    // most overdue by the time the most recent week is reached.
    weekStarts.forEach((w, i) => {
      const working = ['1', '1', '1', '1', '1', '1', '1'];
      if (i === 0) { working[0] = 'OFF'; working[1] = 'OFF'; } // Sat+Sun of the oldest week
      fillWeek(win, SCH, w, { Ana: working });
    });

    // Beatriz: a full weekend off on the MOST RECENT examined week, and
    // a Saturday-only day off (not Sunday) on one earlier week — the
    // exact "individual day, not just full weekend" case Carlos asked for.
    weekStarts.forEach((w, i) => {
      const working = ['1', '1', '1', '1', '1', '1', '1'];
      if (i === weekStarts.length - 1) { working[0] = 'OFF'; working[1] = 'OFF'; }
      if (i === 3) { working[0] = 'OFF'; } // Saturday only
      fillWeek(win, SCH, w, { Beatriz: working });
    });

    // Carla: new to the crew — only appears from the 3rd-from-last week
    // onward, so earlier weeks must read as "no report", not "worked".
    weekStarts.slice(-3).forEach((w) => {
      fillWeek(win, SCH, w, { Carla: ['1', '1', '1', '1', '1', '1', '1'] });
    });

    win.dlSaveSchedule(SCH);
    win.currentPage = 'schedule';
    win.renderSchedule();
    t.eq(win.document.getElementById('schedWeekendBubble').style.display, 'flex', 'the floating bubble shows while on the Schedule page');
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'none', 'closed by default');
    win.schedToggleWeekendRotation();
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'flex', 'opens on click, as an overlay — not by replacing the Schedule page content');
    let html = win.document.getElementById('schedWeekendPanelBody').innerHTML;

    t.assert(/actually had Saturday and\/or Sunday off/.test(html), 'the panoramic view rendered');
    t.assert(/AM Room Attendant/.test(html), 'grouped by crew/department');

    const anaIdx = html.indexOf('>Ana<');
    const anaRow = html.slice(Math.max(0, anaIdx - 300), anaIdx + 6000);
    t.assert(/1565C0/.test(anaRow), 'Ana\'s one full weekend renders with the full-weekend blue fill');
    t.assert(new RegExp('Ana[\\s\\S]{0,6000}1\\s*<span[^>]*>\\s*/\\s*8').test(html), 'Ana\'s Full/8 count reads exactly 1 (only the oldest week qualifies)');

    const beaIdx = html.indexOf('>Beatriz<');
    t.assert(beaIdx !== -1, 'Beatriz renders');
    t.assert(new RegExp('Beatriz[\\s\\S]{0,6000}1\\s*<span[^>]*>\\s*/\\s*8').test(html), 'Beatriz\'s Full/8 count is also 1 — her Saturday-only week does NOT count as full');

    // The amber "most overdue" dot lands on Ana (her only full weekend
    // was 7 weeks before Beatriz's), not Beatriz.
    const anaBlock = html.slice(Math.max(0, anaIdx - 900), anaIdx + 50);
    const beaBlock = html.slice(Math.max(0, beaIdx - 900), beaIdx + 50);
    t.assert(/Longest since her last full weekend off/.test(anaBlock), 'the overdue marker sits on Ana, the one who rested longest ago');
    t.assert(!/Longest since her last full weekend off/.test(beaBlock), 'not on Beatriz, who rested most recently');

    // Carla's earliest shown week (before she joined) reads as "no
    // report" — a dashed, empty cell — not as having worked.
    const carlaIdx = html.indexOf('>Carla<');
    t.assert(carlaIdx !== -1, 'Carla renders (new to the crew, appears partway through the window)');
    const carlaRow = html.slice(carlaIdx, carlaIdx + 6000);
    t.assert(/border-style:dashed/.test(carlaRow), 'her weeks before joining show the dashed "no report" state, not a worked day');

    // ── Clicking the panel's own X (same toggle) collapses it back to
    // just the bubble — Carlos's whole point: it's an overlay he can
    // dismiss, not a page he has to navigate back out of. The Schedule
    // page underneath was never touched, so there's no "normal view" to
    // return to or re-check here. ──
    win.schedToggleWeekendRotation();
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'none', 'collapses back to the bubble');
    t.eq(win.document.getElementById('schedWeekendBubble').style.display, 'flex', 'the bubble itself stays up — still on the Schedule page');

    // ── Changing the weeks-back window re-renders with a new column count. ──
    win.schedToggleWeekendRotation();
    win.schedSetWeekendRotationWeeks(6);
    html = win.document.getElementById('schedWeekendPanelBody').innerHTML;
    t.assert(/>6 wk</.test(html) && /active|var\(--gt\)/.test(html), 'the 6-week option is selectable and renders');
    const anaIdx6 = html.indexOf('>Ana<');
    t.assert(new RegExp('Ana[\\s\\S]{0,6000}0\\s*<span[^>]*>\\s*/\\s*6').test(html), 'with only 6 weeks shown, Ana\'s one full weekend (8 weeks back) has rolled off the window entirely');
    win.schedSetWeekendRotationWeeks(8); // restore default for any later test in the same run

    // (schedWeekendGap's own 10-week default cap vs. a wider 12-week
    // display window is covered directly, more precisely, in
    // schedule-weekend-gap-presence.js — going through the full render
    // here couldn't actually distinguish "found at week 12" from "capped
    // at 10 and fell back to the generic never-found default", since
    // both happened to rank the same person as most overdue either way.)

    // ── Found during code review, 2026-11-19: Managers/Overnight have no
    // days-off rule at all (SCHED_MIN_OFF has no entry for either) — the
    // "longest since" marker must never be invented for them. ──
    const SCHmgr = { days: {} };
    const mgrWeeks = buildWeekStarts(win, 8);
    mgrWeeks.forEach((w, i) => {
      const working1 = ['1', '1', '1', '1', '1', '1', '1'];
      if (i === 0) { working1[0] = 'OFF'; working1[1] = 'OFF'; } // Mgr1's one full weekend, 8 back
      fillWeek(win, SCHmgr, w, { Mgr1: working1, Mgr2: ['1', '1', '1', '1', '1', '1', '1'] }, 'mgr');
    });
    win.dlSaveSchedule(SCHmgr);
    win.renderSchedule(); // panel is still open from above, picks up the new schedule data
    html = win.document.getElementById('schedWeekendPanelBody').innerHTML;
    t.assert(/actually had Saturday and\/or Sunday off/.test(html), 'sanity check: the rotation view is the one actually open');
    const mgrCardIdx = html.indexOf('>Managers<');
    t.assert(mgrCardIdx !== -1, 'the Managers crew card renders');
    t.assert(!/Longest since her last full weekend off/.test(html.slice(mgrCardIdx, mgrCardIdx + 11000)),
      'no "most overdue" marker is invented for Managers — it has no days-off rule to judge against');
    t.assert(!/Suggested for the week of/.test(html.slice(mgrCardIdx, mgrCardIdx + 11000)),
      'no "suggested" marker either — same no-days-off-rule gate covers both');
    win.schedToggleWeekendRotation(); // close again, tidy for the next sub-test

    // ── Carlos's follow-up ask, 2026-11-20: a forward-looking suggestion
    // for whose turn it is on the week he's actually BUILDING right now
    // — distinct from the backward-looking amber dot above, which always
    // looks back from "today" regardless of which week is open on the
    // Schedule tab. Reuses schedWeekendDueOrder, the exact function
    // Auto-fill itself already uses to decide the same question. ──
    const SCHsug = { days: {} };
    const sugWeeks = buildWeekStarts(win, 8);
    sugWeeks.forEach((w, i) => {
      // Elena rested recently (the most recent displayed week); Dolores
      // has never had a day off at all across the whole window — which
      // schedWeekendGap/schedWeekendDueOrder treat as "never", ranking
      // her as more overdue than anyone with even one known rest, by
      // design (see schedWeekendDueOrder's own header comment).
      const workingElena = ['1', '1', '1', '1', '1', '1', '1'];
      if (i === sugWeeks.length - 1) { workingElena[0] = 'OFF'; workingElena[1] = 'OFF'; }
      fillWeek(win, SCHsug, w, { Dolores: ['1', '1', '1', '1', '1', '1', '1'], Elena: workingElena }, 'laundry');
    });
    win.dlSaveSchedule(SCHsug);
    // The week Carlos has open on the Schedule tab right now — a week
    // AFTER the whole displayed 8-week window, exactly the "building a
    // future week" case his real report described.
    const buildingWeek = new Date(sugWeeks[sugWeeks.length - 1]);
    buildingWeek.setDate(buildingWeek.getDate() + 7);
    win.schedViewWeekStart = buildingWeek;
    const expectedSuggested = win.schedWeekendDueOrder(SCHsug, 'laundry', ['Dolores', 'Elena'], win.dateStr(buildingWeek))[0];
    t.eq(expectedSuggested, 'Dolores', 'sanity check on the fixture, via the same function Auto-fill uses: Dolores is the one due');

    win.renderSchedule();
    win.schedToggleWeekendRotation();
    html = win.document.getElementById('schedWeekendPanelBody').innerHTML;
    const dolIdx = html.indexOf('>Dolores<');
    t.assert(dolIdx !== -1, 'Dolores renders');
    const dolBlock = html.slice(Math.max(0, dolIdx - 900), dolIdx + 50);
    t.assert(/Suggested for the week of/.test(dolBlock), 'the green suggestion marker lands on Dolores, for the week Carlos actually has open');
    const eleIdx = html.indexOf('>Elena<');
    t.assert(eleIdx !== -1, 'Elena renders');
    const eleBlock = html.slice(Math.max(0, eleIdx - 900), eleIdx + 50);
    t.assert(!/Suggested for the week of/.test(eleBlock), 'not on Elena');
  },
};
