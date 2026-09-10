/* Carlos's ask, 2026-09-10: "¿Cómo el horario manejaría los nuevos
   asociados contratados?" — the "+ Add someone to this crew" picker
   listed only people ALREADY on the schedule, so a newly hired
   associate could not be picked at all. She had to be typed into
   "Someone else…" from memory, which is how a spelling drifts in the
   first place (the "Sandra S" / "Sandra S." saga).

   schedNewHireOptions offers everyone the labor roster knows about who
   isn't on the schedule this week. The two name worlds differ on
   purpose — the roster carries full legal names, the grid carries the
   short working names Carlos writes — so the match is "every word of
   the schedule name appears in the roster name", and picking one opens
   a prompt pre-filled with the first name rather than dropping a legal
   name into a column a few characters wide. */
const { loadApp, fakeSession } = require('../_harness');

const WEEK = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

module.exports = {
  name: 'New hires: the crew picker offers people the labor roster knows but the schedule does not, matching short grid names to full legal ones (Carlos\'s 2026-09-10 ask)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // The schedule carries short working names; the roster carries full
    // legal ones. Same people, written two different ways.
    const days = {};
    WEEK.forEach((ds) => {
      days[ds] = {
        sheet: 'test', occ: '', dep: '', tdOcc: '',
        laundry: [['Olga A', '1']],
        gra: [['Sandy', '1'], ['Paty', '1'], ['Heidy Ajsoc', '1']],
      };
    });
    const SCH = { days, count: WEEK.length };
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify(SCH));
    win.schedViewWeekStart = new Date(2026, 8, 12);

    win.getProjectEmployeeOptions = () => [
      { id: '1', name: 'Sandy Baran Canil', pos: 'Room Attendant' },      // on the grid as "Sandy"
      { id: '2', name: 'Yohana Paty Cano', pos: 'Turndown Attendant' },   // on the grid as "Paty"
      { id: '3', name: 'Heidy Ajsoc', pos: 'Room Attendant' },            // exact match
      { id: '4', name: 'Marisol Nueva Perez', pos: 'Room Attendant' },    // genuinely new
      { id: '5', name: 'Olga Ajpacaja', pos: 'Laundry Attendant' },       // on the grid as "Olga A"? no — see below
    ];

    const names = win.schedNewHireOptions(win.dlLoadSchedule()).map((n) => n.name);

    t.assert(names.includes('Marisol Nueva Perez'), 'the genuinely new hire is offered');
    t.assert(!names.includes('Sandy Baran Canil'), '"Sandy" on the grid is recognized as Sandy Baran Canil, not offered again');
    t.assert(!names.includes('Yohana Paty Cano'), '"Paty" is matched even though it is her MIDDLE name, not the first');
    t.assert(!names.includes('Heidy Ajsoc'), 'an exact match is obviously not a new hire');
    // "Olga A" -> tokens ["olga","a"]; "a" is not a word in "Olga Ajpacaja",
    // so she is still offered. Conservative in the safe direction: the worst
    // case is one extra name in a list, not a duplicate row on a crew.
    t.assert(names.includes('Olga Ajpacaja'), 'an initial-only surname does not silently match, so nobody is hidden by accident');

    // The position rides along so he can tell two similar names apart.
    const marisol = win.schedNewHireOptions(win.dlLoadSchedule()).find((n) => n.name === 'Marisol Nueva Perez');
    t.eq(marisol.pos, 'Room Attendant', 'the position is carried for the dropdown label');

    // Picking one asks how she should appear, pre-filled with the first
    // name — the roster's legal name never lands in the grid unedited.
    let asked = null;
    win.prompt = (msg, dflt) => { asked = { msg, dflt }; return 'Marisol'; };
    win.showPage('schedule');
    win.renderSchedule();
    win.schedPickPerson('gra', { value: '__new__|Marisol Nueva Perez', selectedIndex: 0 });

    t.assert(asked && asked.dflt === 'Marisol', 'the prompt is pre-filled with the first name, not the full legal one');
    t.assert(/Marisol Nueva Perez/.test(asked.msg), 'and the full name is shown so he knows exactly who he picked');

    const gra = win.dlLoadSchedule().days[WEEK[0]].gra;
    t.assert(gra.some((p) => p[0] === 'Marisol'), 'she is added under the name he confirmed');
    t.assert(!gra.some((p) => p[0] === 'Marisol Nueva Perez'), 'and never under the legal name he did not confirm');

    // Added to every day of the week with no days set, same as any
    // other pick — the crew total must not move until she gets a day.
    WEEK.forEach((ds) => {
      const row = win.dlLoadSchedule().days[ds].gra.filter((p) => p[0] === 'Marisol')[0];
      t.assert(row, 'present on ' + ds);
      t.eq(row[1], '', 'with no day set on ' + ds);
    });

    // Now that she IS on the schedule, she stops being offered.
    t.assert(!win.schedNewHireOptions(win.dlLoadSchedule()).map((n) => n.name).includes('Marisol Nueva Perez'),
      'once added, she drops off the new-hire list instead of being offered twice');

    // A person whose row Carlos HID in the workbook is not a new hire —
    // hiding is how he takes someone off the team. Offering her back
    // here would undo that with one click.
    const withHidden = win.dlLoadSchedule();
    withHidden.hiddenPeople = { 'jecelyn ramos': 'Jecelyn Ramos' };
    win.getProjectEmployeeOptions = () => [
      { id: '6', name: 'Jecelyn Ramos', pos: 'Overnight Attendant' },
      { id: '7', name: 'Otra Persona Nueva', pos: 'Room Attendant' },
    ];
    const afterHidden = win.schedNewHireOptions(withHidden).map((n) => n.name);
    t.assert(!afterHidden.includes('Jecelyn Ramos'), 'the hidden person is never offered back as a new hire');
    t.assert(afterHidden.includes('Otra Persona Nueva'), 'but a genuine new hire alongside her still is');

    // No roster data at all is a quiet no-op, not a crash.
    win.getProjectEmployeeOptions = () => { throw new Error('no roster'); };
    t.eq(win.schedNewHireOptions(win.dlLoadSchedule()).length, 0, 'a roster that throws leaves the picker exactly as it was');

    win.localStorage.removeItem('hk_dl_schedule');
  },
};
