/* Bug report from Carlos: new hires kept showing up with a stray digit
   glued onto their name ("Lascuc Garcia, 8", "Ocheita, Sindi 8", "Martinez,
   Diana 8"). Root cause: the Paychex PDF sometimes tokenizes a decimal hours
   value like "8.13" as two separate text items ("8" and ".13"), so the
   whole-number half survives cleanName()'s decimal-stripping regex and
   sticks to the end of the name. Confirmed against the real corrupted
   records pulled from labor_data's projects_data key. */
const { loadApp } = require('../_harness');

module.exports = {
  name: "cleanName() drops an orphaned trailing digit left by a split decimal, without mangling real names",
  async run(t) {
    const { win } = await loadApp({ seed: {} });

    t.eq(win.cleanName('26100360 Lascuc Garcia, 8'), 'Lascuc Garcia', 'real case: comma before the orphan digit');
    t.eq(win.cleanName('26100357 Ocheita, Sindi 8'), 'Ocheita, Sindi', 'real case: space before the orphan digit');
    t.eq(win.cleanName('26100353 Martinez, Diana 8'), 'Martinez, Diana', 'real case: another employee, same artifact');

    // A fully-formed decimal (the common case) is still stripped normally.
    t.eq(win.cleanName('26100359 Martinez, Mayra 8.08 8.08 8.08'), 'Martinez, Mayra', 'whole decimal values still strip cleanly');

    // Must not eat a legitimate part of a name — only a *trailing* bare
    // 1-3 digit number counts as the artifact.
    t.eq(win.cleanName('26100002 Aguilar Ambrocio, Susan'), 'Aguilar Ambrocio, Susan', 'a normal name is untouched');
  }
};
