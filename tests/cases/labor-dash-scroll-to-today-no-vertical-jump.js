/* Carlos's real report, 2026-11-12: expanding an Overtime row's weekly
   detail — while scrolled well down the page reviewing Day Analysis —
   yanked the whole page back up to the day strip at the top.

   Root cause: dashScrollToToday used todayCard.scrollIntoView({inline:
   'center', block:'nearest'}). scrollIntoView's block option scrolls
   the page's own vertical scroll whenever the container isn't already
   "nearest"/visible on that axis — true any time you've scrolled past
   it — and renderLaborDash() rebuilds the day strip (calling this)
   unconditionally on EVERY render, including ones triggered by an
   unrelated toggle deep in the page (expand/collapse an Overtime row,
   a position group, anything that calls renderLaborDash()). Fixed by
   setting the container's own horizontal scrollLeft directly instead of
   scrollIntoView, so there is nothing left that can ever move the
   document's vertical scroll position from this function, on any screen
   width, triggered by any render. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'dashScrollToToday only adjusts the day strip\'s own horizontal scroll, never scrollIntoView (which could move the page vertically)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    let scrollIntoViewCalls = 0;
    win.Element.prototype.scrollIntoView = function () { scrollIntoViewCalls++; };

    // ── Desktop case: no horizontal overflow (scrollWidth === clientWidth,
    // jsdom's real default with no layout engine) — must be a true no-op,
    // scrollLeft untouched, scrollIntoView never called. ──
    const container = win.document.createElement('div');
    const todayCard = win.document.createElement('div');
    todayCard.setAttribute('data-today', '1');
    container.appendChild(todayCard);
    win.document.body.appendChild(container);

    container.scrollLeft = 0;
    win.dashScrollToToday(container);
    t.eq(scrollIntoViewCalls, 0, 'scrollIntoView is never called (desktop/no-overflow case)');
    t.eq(container.scrollLeft, 0, 'scrollLeft left untouched when nothing actually overflows');

    // ── Mobile case: the strip genuinely overflows horizontally — the
    // today card is centered via the container's OWN scrollLeft, still
    // never via scrollIntoView. ──
    Object.defineProperty(container, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(container, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(todayCard, 'offsetLeft', { value: 250, configurable: true });
    Object.defineProperty(todayCard, 'offsetWidth', { value: 72, configurable: true });

    win.dashScrollToToday(container);
    t.eq(scrollIntoViewCalls, 0, 'still never scrollIntoView, even when the strip does overflow');
    t.eq(container.scrollLeft, 250 - (300 - 72) / 2, 'scrollLeft is set directly to center the today card in the visible strip');
  },
};
