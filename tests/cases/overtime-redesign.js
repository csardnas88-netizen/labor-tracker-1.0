/* Redesigned Overtime page: ranks employees by OT hours/cost this month,
   breaks it down by position, and — the point of the redesign — lets you
   see a person's FULL hotel week (worked, off, and OT days together), not
   just the isolated day OT happened on. Also folds in otherEmps OT hours
   for HK-roster employees (Position Check / Time Card Check had the same
   gap; this is the third place it needed the same fix), while a genuine
   outside contractor with no HK primary position stays excluded. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Overtime: employee/position ranking, otherEmps folding, and the full-week calendar detail",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_labor_model: {
        positions: {
          'Room Attendant': { driver: 'percent', value: 56.2, rate: 10 },
          'Laundry Attendant': { driver: 'percent', value: 18, rate: 12 },
          'Housekeeping Supervisor': { driver: 'percent', value: 15.5, rate: 20 },
        },
      },
      'hk_month_2026-07': {
        days: {
          '2026-07-04': {
            emps: [{ id: '26100006', name: 'Heidy Ajsoc', pos: 'Room Attendant', paid: 8, ot1: 0 }],
          },
          '2026-07-06': {
            emps: [{ id: '26100006', name: 'Heidy Ajsoc', pos: 'Room Attendant', paid: 8, ot1: 0 }],
          },
          '2026-07-07': {
            emps: [
              { id: '26100006', name: 'Heidy Ajsoc', pos: 'Room Attendant', paid: 9.5, ot1: 1.5 },
              { id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', paid: 6, ot1: 2 },
            ],
            otherEmps: [
              { id: '26100002', name: 'Susan Karina Aguilar Ambrocio', pos: 'Banquet', paid: 8, ot1: 3 },
              { id: '99999903', name: 'Totally External Contractor', pos: 'Banquet', paid: 5, ot1: 5 },
            ],
          },
          '2026-07-08': {
            emps: [{ id: '26100006', name: 'Heidy Ajsoc', pos: 'Room Attendant', paid: 8, ot1: 0 }],
          },
        },
      },
    });
    const { win } = await loadApp({ seed });

    const data = win.getMonthOvertimeData('2026-07');

    t.assert(!data.byEmp['99999903'], 'the outside contractor (no HK primary position) is excluded entirely');
    t.eq(Object.keys(data.byEmp).length, 3, 'exactly the three real HK-roster employees are counted');

    const susan = data.byEmp['26100002'];
    t.eq(susan.pos, 'Housekeeping Supervisor', 'Susan\'s OT is credited to her real HK position, not "Banquet"');
    t.eq(susan.hours, 3, 'her otherEmps OT hours are folded in');
    t.assert(Math.abs(susan.cost - 90) < 0.001, `her cost uses her position's rate x1.5 (3 x 20 x 1.5 = 90), got ${susan.cost}`);

    const heidy = data.byEmp['26100006'];
    t.eq(heidy.hours, 1.5, 'Heidy\'s OT is only the 1.5h from Jul 7 — her two non-OT days add nothing');
    t.assert(Math.abs(heidy.cost - 22.5) < 0.001, `1.5 x 10 x 1.5 = 22.5, got ${heidy.cost}`);

    const olga = data.byEmp['26100005'];
    t.eq(olga.hours, 2, 'Olga\'s 2h OT counted');
    t.assert(Math.abs(olga.cost - 36) < 0.001, `2 x 12 x 1.5 = 36, got ${olga.cost}`);

    t.assert(Math.abs(data.totalHours - 6.5) < 0.001, 'total OT hours: 1.5 + 2 + 3 = 6.5');
    t.assert(Math.abs(data.totalCost - 148.5) < 0.001, 'total OT cost: 22.5 + 36 + 90 = 148.5');

    t.eq(data.byPos['Housekeeping Supervisor'].hours, 3, 'position rollup: HK Supervisor gets Susan\'s folded-in hours');
    t.assert(data.byPos['Housekeeping Supervisor'].hours > data.byPos['Laundry Attendant'].hours
      && data.byPos['Laundry Attendant'].hours > data.byPos['Room Attendant'].hours,
      'positions rank HK Supervisor (3h) > Laundry (2h) > Room Attendant (1.5h)');

    /* ── full-week calendar detail — not just the OT day ── */
    const weeks = win.getEmployeeOvertimeWeeks('2026-07', '26100006');
    t.eq(weeks.length, 1, 'Heidy only touches one hotel week this month');
    const wk = weeks[0];
    t.assert(wk.label.indexOf('Jul 4') > -1 && wk.label.indexOf('Jul 10') > -1, `week label should span Jul 4 - Jul 10, got "${wk.label}"`);
    t.eq(wk.cells.length, 7, 'a full 7-day week, Sat through Fri');
    t.eq(wk.cells[0].paid, 8, 'Sat (worked, no OT) shows its actual hours');
    t.assert(wk.cells[1].off === true, 'Sun (no entry that day) is off');
    t.eq(wk.cells[3].paid, 9.5, 'Tue (Jul 7) shows the full day total, not just the OT slice');
    t.eq(wk.cells[3].ot, 1.5, 'Tue also carries the OT amount separately');
    t.eq(wk.cells[4].paid, 8, 'Wed (worked, no OT) also shows up — the whole week, not just the OT day');
    t.assert(wk.cells[5].off === true && wk.cells[6].off === true, 'Thu and Fri (not loaded) render the same as off');

    /* Susan's week must be findable through her otherEmps entry too. */
    const susanWeeks = win.getEmployeeOvertimeWeeks('2026-07', '26100002');
    t.eq(susanWeeks.length, 1, 'Susan\'s single OT day still resolves to one week');
    t.eq(susanWeeks[0].cells[3].paid, 8, 'her Tuesday cell reads from otherEmps correctly');
    t.eq(susanWeeks[0].cells[3].ot, 3, 'and carries her 3h OT');

    /* ── rendering ── */
    win.showPage('overtime');
    let html = win.document.getElementById('overtimeContent').innerHTML;
    t.assert(html.indexOf('Susan Karina Aguilar Ambrocio') > -1, 'Susan (top of the ranking) appears');
    t.assert(html.indexOf('Olga Ajpacaja') > -1, 'Olga appears');
    t.assert(html.indexOf('Heidy Ajsoc') > -1, 'Heidy appears');
    t.assert(html.indexOf('Totally External Contractor') === -1, 'the outside contractor never renders');
    t.assert(html.indexOf('$148.50') > -1, 'the MTD cost hero shows the real total');
    t.assert(html.indexOf('Housekeeping Supervisor') > -1, 'top position card names HK Supervisor');
    t.assert(html.indexOf('No rates set') === -1, 'rates are configured, so no "set a rate" nudge shows');

    win.otToggleEmp('26100006');
    html = win.document.getElementById('overtimeContent').innerHTML;
    t.assert(html.indexOf('9.50h') > -1, 'expanding Heidy reveals her Tuesday total');
    t.assert(html.indexOf('off') > -1, 'and her day off that week');
  }
};
