/* Carlos's ask, 2026-08-23: the Daily Lineup must ignore the Schedule
   Draft page's live editing entirely while he's still building/testing
   it there — Auto-fill, cover chains, manual cell edits, Call-Offs
   marking CALL-OFF — none of that should move the Lineup until he
   uploads a fresh Excel. Only dlUploadSchedule (and its test
   equivalent, saving to the snapshot too) should ever change what
   dlBuildPlan reads.

   This is the opposite of how the two used to share one record
   (hk_dl_schedule) — see the SCHEDULE DRAFT header comment in
   index.html for the history. Pinning both halves: a live edit does
   NOT reach the Lineup, and a real re-upload DOES. */
const { loadApp, fakeSession } = require('../_harness');

const SERIAL = (y, m, d) => Date.UTC(y, m, d) / 86400000 + 25569;

function sheet(spec, width = 9) {
  const maxR = Math.max(...Object.keys(spec).map(Number));
  const rows = [];
  for (let r = 1; r <= maxR; r++) {
    const row = new Array(width).fill('');
    (spec[r] || []).forEach(([c, v]) => { row[c - 1] = v; });
    rows.push(row);
  }
  return { _rows: rows };
}

function scheduleWb(hmValue) {
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push([i + 2, SERIAL(2026, 7, 8 + i)]);
  const F = 8; // Friday, Aug 14 2026
  return {
    SheetNames: ['08.08-08.14'],
    Sheets: {
      '08.08-08.14': sheet({
        1: dates,
        7: [[1, 'OCC'], [F, '190']],
        8: [[1, 'Departures'], [F, '130']],
        10: [[1, 'Laundry']],
        13: [[1, 'Total  Linen Att']],
        15: [[1, 'Managers']],
        16: [[1, 'Carlos'], [F, '1']],
        18: [[1, 'Departures']],
        20: [[1, 'Rolando'], [F, '1']],
        21: [[1, 'Missing Supervisor']],
        25: [[1, 'AM lobby']],
        26: [[1, 'Marroquin'], [F, '1']],
        27: [[1, 'Total  Lobby Att']],
        29: [[1, 'PM Turndown /GRA']],
        30: [[1, 'OCC'], [F, '133']],
        31: [[1, 'Aura'], [F, '1']],
        32: [[1, 'Total  TD attd']],
        34: [[1, 'Overnight']],
        35: [[1, 'Melvin'], [F, '1']],
        36: [[1, 'Total  ON Attd']],
        38: [[1, 'AM ROOM ATTENDANT']],
        39: [[1, 'Departures'], [F, '130']],
        40: [[1, 'Karla Varela'], [F, '1']],
        41: [[1, 'Total Room Att']],
        43: [[1, 'Houseman']],
        44: [[1, 'Supervisor'], [F, '1']],
        45: [[1, 'David'], [F, hmValue]],
        46: [[1, 'Total HP']]
      })
    }
  };
}

function sectionsWb() {
  return {
    SheetNames: ['GRA', 'HM & Supervisor'],
    Sheets: {
      GRA: sheet({
        5: [[2, 'Floor'], [4, 'Name']],
        7: [[2, '7th'], [4, 'Karla Varela']]
      }, 10),
      'HM & Supervisor': sheet({
        7: [[1, '14th - 17th'], [2, 'David'], [5, '18th - 22nd'], [6, 'Rolando']]
      }, 8)
    }
  };
}

module.exports = {
  name: "Daily Lineup reads a frozen upload snapshot, not the live Schedule Draft edits, per Carlos's 2026-08-23 ask",
  async run(t) {
    const { win } = await loadApp({ seed: Object.assign(fakeSession(), { 'hk_rooms_migrated_v2': '1' }) });
    await new Promise((r) => setTimeout(r, 60));
    win.XLSX.utils.sheet_to_json = (ws) => ws._rows;

    // ── The real upload path: parse, save live, freeze a snapshot. ──
    const S = win.dlParseSections(sectionsWb());
    win.dlSaveSections(S);
    const SCH = win.dlParseSchedule(scheduleWb('1'), new Date(2026, 7, 13));
    win.dlSaveSchedule(SCH);
    win.dlSaveScheduleSnapshot(JSON.parse(JSON.stringify(SCH)));

    const ds = '2026-08-14';
    let P = win.dlBuildPlan(ds);
    t.assert(P, 'a plan builds for the uploaded day');
    t.assert(P.hm.indexOf('David') !== -1, 'David is on the Houseman lineup, straight from the upload');

    // ── A live edit on the Schedule Draft page (schedSetCell, the exact
    // function every on-screen cell edit, Auto-fill, and Call-Offs all
    // funnel through) must NOT move the Lineup. ──
    const liveIdx = win.dlLoadSchedule().days[ds].hp.findIndex((p) => p[0] === 'David');
    win.schedSetCell('hp', liveIdx, 'David', ds, 'OFF', null);
    t.eq(win.dlLoadSchedule().days[ds].hp[liveIdx][1], 'OFF', 'the live copy really did change');
    P = win.dlBuildPlan(ds);
    t.assert(P.hm.indexOf('David') !== -1, "but the Lineup still shows David — it never looked at the live edit");

    // ── Same for a Call-Off: marking one writes CALL-OFF onto the LIVE
    // schedule (schedApplyCallOff), which must stay invisible here too. ──
    win.schedSetCell('hp', liveIdx, 'David', ds, 'CALL-OFF', null);
    P = win.dlBuildPlan(ds);
    t.assert(P.hm.indexOf('David') !== -1, "a Call-Off marked on the live schedule does not remove David from today's already-frozen Lineup either");

    // ── A genuine re-upload (dlUploadSchedule's real path: parse fresh,
    // save live, THEN refresh the snapshot) DOES change what the Lineup
    // shows — this is a real correction, not stale forever. ──
    const SCH2 = win.dlParseSchedule(scheduleWb('OFF'), new Date(2026, 7, 13));
    win.dlSaveSchedule(SCH2);
    win.dlSaveScheduleSnapshot(JSON.parse(JSON.stringify(SCH2)));
    P = win.dlBuildPlan(ds);
    t.assert(P.hm.indexOf('David') === -1, 'a fresh re-upload with David OFF correctly updates the Lineup — this is not a frozen-forever snapshot, just frozen between uploads');
  }
};
