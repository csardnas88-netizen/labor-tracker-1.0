/* Every page must open without throwing and render content — the regression
   net that catches "a new change broke an old screen". */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: 'Every page opens without error',
  async run(t) {
    const { win, consoleErrors } = await loadApp({ seed: fixture.build() });
    const pages = win.PAGES;
    t.assert(Array.isArray(pages) && pages.length >= 15, 'PAGES missing');

    const problems = [];
    pages.forEach((p) => {
      let threw = null;
      try { win.showPage(p); } catch (e) { threw = e.message; }
      const el = win.document.getElementById('page-' + p);
      const len = el ? el.innerHTML.length : -1;
      if (threw) problems.push(`${p} threw: ${threw}`);
      else if (len <= 0) problems.push(`${p} rendered empty`);
    });

    t.assert(problems.length === 0, 'page problems:\n      ' + problems.join('\n      '));
    // No errors logged while rendering any page.
    const bad = consoleErrors.filter((e) => !/stub/i.test(e));
    t.assert(bad.length === 0, 'console errors:\n      ' + bad.join('\n      '));
  }
};
