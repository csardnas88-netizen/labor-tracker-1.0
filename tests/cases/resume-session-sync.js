/* Resuming an already-saved session (the normal case — not typing a password
   every time) must pull fresh data from the cloud on open, not just render
   from local cache. Otherwise a device can sit on stale data indefinitely
   until realtime happens to reconnect or someone taps "Sync now" — this is
   what caused a manager to see outdated numbers after another device synced.
   Guards that the pull actually fires (a GET to labor_data) on app load with
   a valid saved session. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Resuming a saved session pulls fresh data from the cloud on open",
  async run(t) {
    let pulledLaborData = false;
    const fetchImpl = (url) => {
      if (typeof url === 'string' && url.indexOf('/rest/v1/labor_data') !== -1) {
        pulledLaborData = true;
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    await loadApp({ seed: fakeSession(), fetchImpl });
    // syncFromSheets on resume fires via setTimeout(400ms); give it room to run.
    await new Promise((r) => setTimeout(r, 700));

    t.assert(pulledLaborData, 'resuming a saved session should pull labor_data from the cloud, not just render local cache');
  }
};
