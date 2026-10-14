/* Carlos's ask, 2026-10-14, on the Labor day view's Overtime card:

   (1) Organize it by POSITION (a group header per crew) instead of one
   flat list sorted only by severity — _laborGroupRowsByPos/_laborPosCardHTML
   (index.html, right before renderDashDayAnalysis) now drive both this
   list and (2) below.

   (2) Add a mirror-image "Under Hours" list, side by side with Overtime,
   for anyone projected to come up SHORT of 40h this week — same
   hoursSoFar + remainingDays×shiftHours projection laborProjectedWeekHours
   already computes, just filtered the other direction (<40 instead of
   >40). Turndown and the three known part-time IDs (PART_TIME_15MIN_IDS)
   are excluded on purpose: their short shifts never reaching 40h is by
   design, not something to flag.

   (3) Remove the empty gap that used to sit in the middle of every OT row
   on a wide screen — Overtime and Under Hours now share a 2-column grid
   (.ot-under-grid) instead of each stretching across the full dashboard
   width on its own. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Labor day view: Overtime grouped by position + a mirror "Under Hours" list, side by side, excluding Turndown/part-time from Under Hours',
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({
        days: {
          // Olga: 1 real remaining working day (Wed) — a genuine forward
          // projection that still won't reach 40h.
          '2026-10-06': { gra: [['Olga Ramirez', 'OFF'], ['Diana Flores', 'OFF']] },
          '2026-10-07': { gra: [['Olga Ramirez', '1'], ['Diana Flores', '1']] },
          '2026-10-08': { gra: [['Olga Ramirez', 'OFF'], ['Diana Flores', '1']] },
          '2026-10-09': { gra: [['Olga Ramirez', 'OFF'], ['Diana Flores', '1']] },
          // Juan Lopez (Laundry), Rosa Diaz (Turndown) and Yesenia Pineda
          // (House Attendant, but one of the 3 known part-time IDs) have
          // no row anywhere this week — no remaining scheduled days,
          // same as Petronila's real report in labor-break-ot-projection.js.
        },
        count: 4, savedAt: new Date().toISOString(),
      }),
      'hk_month_2026-10': {
        days: {
          '2026-10-03': { emps: [
            { id: '80001', name: 'Olga Ramirez', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '80002', name: 'Juan Lopez', pos: 'Laundry Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '80003', name: 'Rosa Diaz', pos: 'Turndown Attendant', paid: 6, ot1: 0, unpaid: 0.25 },
            { id: '26100119', name: 'Yesenia Pineda', pos: 'House Attendant', paid: 10, ot1: 0, unpaid: 0.5 },
            { id: '80004', name: 'Diana Flores', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
          ]},
          '2026-10-04': { emps: [
            { id: '80001', name: 'Olga Ramirez', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '80002', name: 'Juan Lopez', pos: 'Laundry Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '80004', name: 'Diana Flores', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
          ]},
          '2026-10-05': { emps: [
            { id: '80004', name: 'Diana Flores', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
          ]},
        },
      },
    });
    const { win } = await loadApp({ seed });

    // ── Unit check: the Under Hours candidate math itself, via the same
    // laborProjectedWeekHours projections the render reads. ──
    const projections = win.laborProjectedWeekHours('2026-10-05');
    const olga = projections.find((p) => p.id === '80001');
    const juan = projections.find((p) => p.id === '80002');
    const rosa = projections.find((p) => p.id === '80003');
    t.eq(olga.projected, 24, "Olga: 16 so far + 1 remaining day × 8h = 24, under 40h");
    t.eq(olga.remainingDays, 1, 'Olga has 1 real remaining scheduled day (Wed)');
    t.eq(juan.projected, 16, 'Juan: 16 so far, 0 remaining days — already final');
    t.eq(juan.remainingDays, 0, 'Juan has no remaining scheduled days at all this week');
    t.eq(rosa.projected, 6, "Rosa (Turndown): 6 so far, correctly computed, even though she's excluded from the rendered list");

    win.dashSelectedDate = new Date(2026, 9, 5);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    // ── Side-by-side layout: both cards present → the 2-column grid wraps them ──
    t.assert(/class="ot-under-grid"/.test(html), 'Overtime and Under Hours render inside the shared 2-column grid when both have entries');
    t.assert(/&#128202; Under Hours|📊 Under Hours/.test(html), 'the Under Hours card title shows');

    const underIdx = html.indexOf('Under Hours');
    t.assert(underIdx !== -1, 'Under Hours card exists');
    const underHtml = html.slice(underIdx);

    // ── Turndown and the known part-time ID are excluded, even though
    // their real projected hours are well under 40 ──
    t.assert(!/Rosa Diaz/.test(html), "Turndown (Rosa) never appears in Under Hours — her short shift is by design, not a shortfall");
    t.assert(!/Yesenia Pineda/.test(html), "the known part-time ID (Yesenia) never appears either, even though her position isn't Turndown");

    // ── Olga: genuine forward projection, still under 40h even counting her remaining day ──
    t.assert(/Olga Ramirez/.test(underHtml), 'Olga appears in the Under Hours card');
    const olgaIdx = underHtml.indexOf('Olga Ramirez');
    const olgaRow = underHtml.slice(olgaIdx, olgaIdx + 400);
    t.assert(/16h 0m so far \+ 1 more day scheduled \(~8h each\)/.test(olgaRow), "Olga's row shows the real math behind the estimate");
    t.assert(/~24h 0m projected \(960m under\)/.test(olgaRow), 'and her projected total with the exact minutes-under figure');

    // ── Juan: no remaining days, so this is his final number, not an estimate ──
    t.assert(/Juan Lopez/.test(underHtml), 'Juan appears in the Under Hours card');
    const juanIdx = underHtml.indexOf('Juan Lopez');
    const juanRow = underHtml.slice(juanIdx, juanIdx + 400);
    t.assert(/16h 0m worked this week, no more scheduled days/.test(juanRow), "Juan's row explains there are no days left to change the outcome");
    t.assert(/1440m under 40h/.test(juanRow), 'and shows exactly how far under 40h he finished');

    // ── Position grouping: Under Hours groups Olga/Diana's position
    // ("Room Attendant") separately from Juan's ("Laundry Attendant") ──
    t.assert(/Room Attendant/.test(underHtml), "Olga's position group header shows inside Under Hours");
    t.assert(/Laundry Attendant/.test(underHtml), "Juan's position group header shows inside Under Hours");

    // ── Overtime side still works, now also grouped by position — Diana
    // (24 so far + 3 more days × 8h = 48h, over 40h) shows before the
    // Under Hours card, under her own "Room Attendant" group header. ──
    const otHtml = html.slice(0, underIdx);
    t.assert(/Diana Flores/.test(otHtml), 'Diana (projected 48h) is flagged as approaching OT, on the Overtime side');
    t.assert(/Room Attendant/.test(otHtml), "Diana's position group header shows on the Overtime side too");
    t.assert(!/Diana Flores/.test(underHtml), "Diana never leaks into the Under Hours card — she's over 40h, not under");
  },
};
