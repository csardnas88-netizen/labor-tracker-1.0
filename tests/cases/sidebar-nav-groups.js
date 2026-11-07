/* v7.110.0 collapsed the sidebar's 24 destinations into 6 accordion
   groups (Carlos: the app felt overwhelming on first open). Two real
   defects shipped with it, both found only once Carlos sent a
   screenshot of the live app:

   1. The group titles were the ONLY way into the pages inside them, but
      kept the styling of the decorative caption the class started life
      as — 9px at 30% white, no icon, against 13px/65% nav items. The
      five collapsed sections were the least visible thing in the menu
      while being the only entrance. Fixed by giving a CLOSED group the
      same size/weight/brightness as a real row (plus an icon and a
      count of what's hidden), and reserving the small uppercase caption
      styling for a group that is already OPEN, where it correctly reads
      as a heading over its children.

   2. .nav-group-body is a flex child of the flex-column .sidebar, and
      with overflow:hidden it SHRANK instead of letting the sidebar
      scroll. On a short window the open group was crushed to ~43px (one
      row) while reporting a 277px scrollHeight. Fixed with
      flex-shrink:0. jsdom does no layout, so that one can only be
      guarded by asserting the declaration survives in the stylesheet.

   Everything else here pins the behaviour: defaults, persistence, and
   auto-revealing the group a cross-link navigates into. */
const { loadApp, fakeSession } = require('../_harness');

function groups(win) {
  return Array.from(win.document.querySelectorAll('.nav-section-label.collapsible'));
}
function stateOf(win) {
  const out = {};
  groups(win).forEach(l => { out[l.getAttribute('data-group')] = l.getAttribute('data-open'); });
  return out;
}
/* A group's body is the element right after its label — the same
   relationship toggleNavGroup/_revealNavGroupFor rely on. */
function bodyOf(win, g) {
  return win.document.querySelector('.nav-section-label[data-group="' + g + '"]').nextElementSibling;
}

module.exports = {
  name: 'Sidebar nav groups: only Main opens by default, a closed group is styled as a real row (not the 9px caption that shipped in 7.110.0), choices persist, and navigating into a closed group reveals it',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Structure: every group label owns a body, and every one of the
    // 24 destinations lives inside exactly one of them. A page left
    // outside a group would render but be unreachable once collapsed. ──
    const gs = groups(win);
    t.eq(gs.length, 6, 'six collapsible groups');
    gs.forEach(l => {
      const b = l.nextElementSibling;
      t.assert(b && b.classList.contains('nav-group-body'),
        'group "' + l.getAttribute('data-group') + '" is followed by its nav-group-body');
    });
    const inGroups = win.document.querySelectorAll('.nav-group-body .nav-item').length;
    const allItems = win.document.querySelectorAll('.nav-item').length;
    t.eq(inGroups, allItems, 'every nav item sits inside a group body — none stranded outside a collapsible section');

    // ── Default on a device that has never touched the menu: Main open,
    // everything else closed. This is the whole point of the change. ──
    win.localStorage.removeItem('hk_navgroups_open');
    win.initNavGroups();
    t.eq(JSON.stringify(stateOf(win)),
      JSON.stringify({ main: 'true', reports: 'false', finance: 'false', operations: 'false', management: 'false', system: 'false' }),
      'first visit opens Main only');
    t.eq(bodyOf(win, 'main').getAttribute('data-open'), 'true', "Main's body is open too, not just its label");
    t.eq(bodyOf(win, 'reports').getAttribute('data-open'), 'false', "a closed group's body is closed in step with its label");

    // ── A CLOSED group must carry an icon and a count: with the pages
    // hidden, these are the only cues about what is behind the row. ──
    const mgmt = win.document.querySelector('.nav-section-label[data-group="management"]');
    t.assert(mgmt.querySelector('.nav-group-icon'), 'a group row has an icon to anchor the eye, like every nav item does');
    t.eq(mgmt.querySelector('.nav-group-count').textContent, '5', "Management's count matches the 5 pages hidden inside it");
    t.eq(bodyOf(win, 'management').querySelectorAll('.nav-item').length, 5,
      'and that count is not a stale literal — it equals the real number of items in the body');

    // ── Toggling persists, so the menu reopens the way it was left. ──
    win.toggleNavGroup(mgmt);
    t.eq(mgmt.getAttribute('data-open'), 'true', 'clicking a closed group opens it');
    t.eq(bodyOf(win, 'management').getAttribute('data-open'), 'true', 'and opens its body');
    t.eq(JSON.parse(win.localStorage.getItem('hk_navgroups_open')).management, true, 'the choice is saved for this device');

    win.toggleNavGroup(mgmt);
    t.eq(mgmt.getAttribute('data-open'), 'false', 'clicking again closes it');
    t.eq(JSON.parse(win.localStorage.getItem('hk_navgroups_open')).management, false, 'and the close is saved too');

    // Saved state must actually be re-applied, not just written.
    win.localStorage.setItem('hk_navgroups_open', JSON.stringify({ main: false, finance: true }));
    win.initNavGroups();
    t.eq(stateOf(win).main, 'false', 'a saved closed Main stays closed on reload — the default does not override a real choice');
    t.eq(stateOf(win).finance, 'true', 'a saved open Finance reopens');
    t.eq(stateOf(win).reports, 'false', 'a group missing from the saved blob falls back to its authored default');

    // ── Cross-link into a collapsed group: showPage() must reveal it,
    // otherwise the active item is highlighted inside a hidden body and
    // the user sees no indication of where they landed. ──
    win.localStorage.removeItem('hk_navgroups_open');
    win.initNavGroups();
    t.eq(stateOf(win).finance, 'false', 'Finance starts closed');
    win.showPage('pnl');
    t.eq(stateOf(win).finance, 'true', 'navigating to P&L opens the Finance group that holds it');
    t.eq(bodyOf(win, 'finance').getAttribute('data-open'), 'true', "and opens Finance's body so the item is actually visible");
    t.assert(win.document.getElementById('nav-pnl').classList.contains('active'), 'P&L is marked active');
    t.eq(JSON.parse(win.localStorage.getItem('hk_navgroups_open')).finance, true, 'the reveal is persisted, so returning later does not re-hide it');

    // Navigating inside an already-open group must not disturb anything.
    const before = JSON.stringify(stateOf(win));
    win.showPage('labor');
    t.eq(JSON.stringify(stateOf(win)), before, 'navigating within an open group leaves every group untouched');

    // ── Regression guard for the flex-shrink crush. jsdom performs no
    // layout, so the rendered height cannot be measured here; assert the
    // declaration itself survives any future edit to this block. ──
    const css = win.document.documentElement.innerHTML;
    t.assert(/\.nav-group-body\{[^}]*flex-shrink:0/.test(css),
      '.nav-group-body keeps flex-shrink:0 — without it the open group is crushed to one row on a short window instead of the sidebar scrolling');
  },
};
