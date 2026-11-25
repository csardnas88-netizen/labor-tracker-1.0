/* Carlos's real report, 2026-11-25: the very first time two new Room
   Attendants (Ana Casia Chavez and Fatima Ramirez Gonzalez) showed up in a
   Labor Distribution Report, the app only picked up their two surnames —
   the first name was missing. Confirmed against the actual PDF row
   (screenshot Carlos sent): the name wraps onto a second line that has no
   ID and no numbers of its own, with the ID row itself carrying the
   numbers plus (sometimes) the first word of the name. Two real shapes,
   both from the same screenshot:
     - "Casia Chavez, Ana" / "Leticia" — ID row keeps part of the first
       name, only the back half of it wraps.
     - "Ramirez Gonzalez," / "Fatima del C" — nothing at all follows the
       comma on the ID row; the ENTIRE first name wraps, which is the
       worse case Carlos actually saw (just two surnames, no first name).
   Before this fix, parsePaychex never looked at that trailing line at
   all — it only ever looked BACKWARD (pendingLines) for a name that
   wrapped before its ID row, never forward for one that overflows after
   it. Fixed by checking exactly one row past wherever the numbers were
   found, claiming it as a name continuation when it carries no ID/numbers
   of its own and isn't a total/header/dept-continuation line. */
const { loadApp } = require('../_harness');

function row(str, x, y) { return { str, x, y, page: 1 }; }

module.exports = {
  name: "parsePaychex picks up a name that wraps onto the line AFTER the ID+numbers row, not just before it (Carlos's real Ramirez Gonzalez / Casia Chavez report)",
  async run(t) {
    const { win } = await loadApp({ seed: {} });

    const items = [
      row('2560-Room Attendant', 10, 100),
      row('Work', 278, 120), row('Meal', 326, 120), row('Regular', 372, 120),
      row('OT1', 429, 120), row('Paid', 479, 120), row('Unpaid', 530, 120),

      // Control: a normal single-line name, must still parse untouched.
      row('26100386', 150, 132), row('Castro Ramirez, Maritza', 220, 132),
      row('8.42', 278, 132), row('8.42', 372, 132), row('8.42', 479, 132), row('0.50', 530, 132),

      // Real case 1: part of the first name survives on the ID row, the
      // rest wraps.
      row('26100391', 150, 144), row('Casia Chavez, Ana', 220, 144),
      row('8.35', 278, 144), row('8.35', 372, 144), row('8.35', 479, 144), row('0.50', 530, 144),
      row('Leticia', 220, 156),

      // Real case 2 (the worse one, matching Carlos's exact complaint):
      // nothing at all follows the comma on the ID row — the whole first
      // name wraps.
      row('26100394', 150, 168), row('Ramirez Gonzalez,', 220, 168),
      row('8.70', 278, 168), row('8.70', 372, 168), row('8.70', 479, 168), row('0.48', 530, 168),
      row('Fatima del C', 220, 180),

      row('Totals:', 10, 200), row('83.37', 278, 200), row('0.00', 326, 200),
      row('91.37', 372, 200), row('0.00', 429, 200), row('83.37', 479, 200), row('4.94', 530, 200),
    ];

    const result = win.parsePaychex(items);
    const byId = {};
    result.emps.forEach((e) => { byId[e.id] = e.name; });

    t.eq(byId['26100386'], 'Castro Ramirez, Maritza', 'a normal single-line name is unaffected by the new trailing-wrap check');
    t.eq(byId['26100391'], 'Casia Chavez, Ana Leticia', 'a name that only partly wraps (first name split across the ID row and the next line) is joined back together');
    t.eq(byId['26100394'], 'Ramirez Gonzalez, Fatima del C', "a name whose ENTIRE first name wraps to the next line — nothing follows the comma on the ID row — no longer shows up as just the two surnames");
  }
};
