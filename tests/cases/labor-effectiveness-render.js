/* Labor Effectiveness's render behavior: computed columns (Worked/
   Standard/Var (h)/Var (%)/OT) always show, from the exact same
   _weekPositionTotals Weekly Pace uses below it — Scheduled/Projected only
   appear once that week's PDF is uploaded, and a mismatch between our own
   Worked/Standard and the uploaded report's gets flagged rather than
   silently shown side by side.

   Reuses the real, already-verified Turndown Aug 1-3 2026 fixture from
   unifocus-turndown-shift-truncation.js (rooms 154/114/201, paid
   30.11/18.36/23.05) — under Unifocus mode this position's own weekly
   Worked/Standard are known-good numbers (71.52h / 90.00h), so the
   mismatch test below has a real, previously-verified baseline to diverge
   from rather than an invented one. */
const { loadApp, fakeSession } = require('../_harness');

function seedTurndownWeek() {
  return {
    'hk_rooms_migrated_v2': '1',
    'hk_month_2026-08': {
      days: {
        '2026-08-01': { totalPaid: 30.11, byPosition: { 'Turndown Attendant': { paid: 30.11, ot1: 0 } } },
        '2026-08-02': { totalPaid: 18.36, byPosition: { 'Turndown Attendant': { paid: 18.36, ot1: 1.5 } } },
        '2026-08-03': { totalPaid: 23.05, byPosition: { 'Turndown Attendant': { paid: 23.05, ot1: 0 } } }
      },
      rooms: { '2026-07-31': 124, '2026-08-01': 154, '2026-08-02': 114, '2026-08-03': 201 }
    }
  };
}

module.exports = {
  name: "Labor Effectiveness shows computed columns always, Scheduled/Projected once a week's PDF is uploaded, and flags a mismatch",
  async run(t) {
    const seed = Object.assign(fakeSession(), seedTurndownWeek());
    const { win } = await loadApp({ seed });
    win.setLaborStandardMode('unifocus');
    const week = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 7) };

    // ── No upload yet: computed columns only. ──
    let html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    t.assert(/Labor Effectiveness/.test(html), 'the section renders');
    t.assert(!/Sched\./.test(html), 'no Scheduled column before a PDF is uploaded');
    t.assert(!/Proj\./.test(html), 'no Projected column either');
    t.assert(!/Uploaded/.test(html), 'no "Uploaded" badge yet');
    t.assert(/Upload this week's Labor Effectiveness PDF/.test(html), 'prompts to upload');

    const tdIdx = html.indexOf('>Turndown');
    t.assert(tdIdx !== -1, 'Turndown row found');
    const tdRow = html.slice(tdIdx, tdIdx + 1200);
    t.assert(/71\.52/.test(tdRow), "Turndown's computed Worked (71.52h, sum of the three real days) shows");
    t.assert(/90\.00/.test(tdRow), "and its computed Standard (90.00h — 30+24+36, matching Unifocus's own truncated bands)");
    t.assert(/1\.50/.test(tdRow), 'and its weekly OT (1.50h, summed across the three days)');
    t.assert(!/&#9888;/.test(tdRow), 'no mismatch warning when there is nothing to compare against yet');

    // ── Upload a report where Turndown's figures MATCH what we compute —
    // Scheduled/Projected appear, no mismatch flag. ──
    win.saveLaborEffForWeek('2026-08-01', {
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 90.00, scheduled: 126.00, projected: 216.00, hoursVariance: -18.48, variancePct: -21, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: new Date().toISOString()
    });
    html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    t.assert(/Sched\./.test(html) && /Proj\./.test(html), 'Scheduled/Projected columns appear once a week is uploaded');
    t.assert(/Uploaded/.test(html), 'the "Uploaded" badge shows');
    let tdBlock = html.slice(html.indexOf('>Turndown'), html.indexOf('>Turndown') + 1500);
    t.assert(/126\.00/.test(tdBlock), "Turndown's Scheduled hours (126.00h, from the PDF) show — this app has no other way to know it");
    t.assert(/216\.00/.test(tdBlock), 'and Projected (216.00h)');
    t.assert(!/&#9888;/.test(tdBlock), 'no mismatch warning when our own numbers agree with the report');

    // ── Re-upload with Turndown's Standard now off by 9h — the mismatch
    // must be flagged, not silently shown next to our own 90.00h. ──
    win.saveLaborEffForWeek('2026-08-01', {
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 99.00, scheduled: 126.00, projected: 216.00, hoursVariance: -27.48, variancePct: -28, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: new Date().toISOString()
    });
    html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    tdBlock = html.slice(html.indexOf('>Turndown'), html.indexOf('>Turndown') + 1500);
    t.assert(/&#9888;/.test(tdBlock), "a 9h Standard disagreement (our 90.00h vs the report's 99.00h) is flagged");
    t.assert(/90\.00/.test(tdBlock), "our own computed Standard (90.00h) is still what's shown as Standard — the report's figure informs the flag, it doesn't silently overwrite ours");
    t.assert(!/UF \d/.test(tdBlock), "the Standard mismatch alone doesn't show a Worked-hours discrepancy line — Worked itself (71.52) still agrees with the report");

    // ── Carlos's ask: when Paychex and Unifocus's OWN Worked hours for
    // the position genuinely disagree, he needs the exact gap (not just
    // the ⚠) to explain an over/under in a report. Re-upload with Worked
    // now off by ~6.5h too. ──
    win.saveLaborEffForWeek('2026-08-01', {
      positions: { 'Turndown Attendant': { worked: 65.00, standard: 90.00, scheduled: 126.00, projected: 216.00, hoursVariance: -25.00, variancePct: -28, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: new Date().toISOString()
    });
    html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    tdBlock = html.slice(html.indexOf('>Turndown'), html.indexOf('>Turndown') + 1500);
    t.assert(/UF 65\.00 \(\+6\.52\)/.test(tdBlock), "the exact Paychex-vs-Unifocus Worked gap (our 71.52 minus their 65.00 = +6.52) shows right under Worked");

    // ── And the reverse sign renders with its own minus, not a double
    // negative or an unsigned drop. ──
    win.saveLaborEffForWeek('2026-08-01', {
      positions: { 'Turndown Attendant': { worked: 80.00, standard: 90.00, scheduled: 126.00, projected: 216.00, hoursVariance: -10.00, variancePct: -11, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: new Date().toISOString()
    });
    html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    tdBlock = html.slice(html.indexOf('>Turndown'), html.indexOf('>Turndown') + 1500);
    t.assert(/UF 80\.00 \(-8\.48\)/.test(tdBlock), "and when Unifocus's own figure is higher than ours, the gap shows with a minus (71.52 - 80.00 = -8.48)");

    // ── A trivial gap under the ⚠ tolerance (0.5h) stays silent — this
    // line is for a genuine discrepancy worth explaining, not float noise
    // from rounding. ──
    win.saveLaborEffForWeek('2026-08-01', {
      positions: { 'Turndown Attendant': { worked: 71.72, standard: 90.00, scheduled: 126.00, projected: 216.00, hoursVariance: -18.28, variancePct: -20, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: new Date().toISOString()
    });
    html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    tdBlock = html.slice(html.indexOf('>Turndown'), html.indexOf('>Turndown') + 1500);
    t.assert(!/UF \d/.test(tdBlock), 'a 0.20h gap (within the same 0.5h tolerance the ⚠ already uses) stays silent — not worth flagging');

    // ── The week key comes from the report's OWN date range, not "the
    // current week" — uploading late or early must still land on the
    // right week. weekKey uses getHotelWeekStart on the range's start. ──
    const stored = win.getLaborEffForWeek('2026-08-01');
    t.assert(stored && stored.positions['Turndown Attendant'], 'stored under the week key derived from the report range, readable back directly');

    // ── Placement, Carlos's explicit ask: "inmediatamente debajo de
    // Ocupacion y encima del Weekly pace". Checked on the real rendered
    // Labor page, not just by construction order in the source.
    // renderDashDayAnalysis is called directly with an explicit week
    // rather than via showPage('labor') — that route re-derives its week
    // from getDashWeek(), which floats with the system clock (see the
    // fuller note in unifocus-weekly-pace.js), and by the time this runs
    // "today" may already have drifted past Aug 1-7 into the next hotel
    // week, silently emptying every section that depends on it. ──
    win.dashSelectedDate = new Date(2026, 7, 1);
    win.renderDashDayAnalysis(win.loadMonthData('2026-08').days, 200, new Date(), week);
    const pageHtml = win.document.getElementById('dashDayAnalysis').innerHTML;
    const occIdx = pageHtml.indexOf('Occupancy');
    const leIdx = pageHtml.indexOf('Labor Effectiveness');
    const wpIdx = pageHtml.indexOf('Weekly Labor Pace');
    t.assert(occIdx !== -1 && leIdx !== -1 && wpIdx !== -1, 'all three sections render on the page');
    t.assert(occIdx < leIdx && leIdx < wpIdx, 'Labor Effectiveness sits between Occupancy and Weekly Labor Pace, in that order');
  }
};
