/* Returning to the app after it was backgrounded (phone app-switch, laptop
   tab alt-tab) used to only check the inactivity timer — nothing pulled
   fresh data or re-checked realtime. Mobile OSes commonly suspend a
   backgrounded tab's WebSocket, so a manager could switch back to a stale
   screen with no signal anything was wrong. Guards that going hidden→visible
   (visibilitychange) triggers a fresh pull, and that going hidden alone does
   NOT (only the return should fire it). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Resume from background (visibilitychange) triggers a fresh sync pull",
  async run(t) {
    let pulls = 0;
    const fetchImpl = (url) => {
      if (typeof url === 'string' && url.indexOf('/rest/v1/labor_data?select=key,value') !== -1) pulls++;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    const { win } = await loadApp({ seed: fakeSession(), fetchImpl });
    // Let the app's own on-load pulls (resume-pull + the generic 1s one) settle.
    await new Promise((r) => setTimeout(r, 1300));
    const pullsAfterLoad = pulls;
    t.assert(pullsAfterLoad > 0, 'sanity check: app should have pulled at least once on load');

    // Going hidden must NOT trigger a pull.
    Object.defineProperty(win.document, 'hidden', { value: true, configurable: true });
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 150));
    t.eq(pulls, pullsAfterLoad, 'backgrounding the tab should not trigger an extra pull');

    // Coming back to visible must trigger a fresh pull.
    Object.defineProperty(win.document, 'hidden', { value: false, configurable: true });
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 150));
    t.assert(pulls > pullsAfterLoad, 'returning from background should trigger a fresh pull, not rely on the connection having stayed alive');
  }
};
