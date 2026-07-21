/* The "Japan Team" bug: a deleted project must never come back when the app
   re-syncs with the cloud, even if a stale copy still lives in the cloud.
   Also proves a genuinely-new cloud project DOES merge in (so the guard isn't
   just dropping everything). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Deleted projects stay deleted after a cloud sync",
  async run(t) {
    // Cloud (remote) still holds a deleted project (999) AND a new one (888).
    const remoteRows = [
      { key: 'projects_data', value: JSON.stringify([
        { id: 999, name: 'Japan Team', startDate: '2026-06-26', endDate: '2026-06-29', log: [] },
        { id: 888, name: 'Fresh Project', startDate: '2026-07-20', endDate: '2026-07-30', log: [] }
      ]) },
      { key: 'projects_deleted_ids', value: JSON.stringify([999]) }
    ];
    const fetchImpl = (url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'GET' && /labor_data\?select=key,value/.test(url)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(remoteRows) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('') });
    };

    const seed = Object.assign(fakeSession(), {
      projects_data: [],                 // locally deleted
      projects_deleted_ids: [999]        // tombstone
    });
    const { win } = await loadApp({ seed, fetchImpl });

    win.syncFromSheets();
    await new Promise((r) => setTimeout(r, 150)); // let the pull + merge settle

    const ids = win.loadProjects().map((p) => p.id);
    t.assert(ids.indexOf(999) === -1, 'DELETED project 999 came back after sync — tombstone failed');
    t.assert(ids.indexOf(888) !== -1, 'a new cloud project should have merged in (id 888 missing)');
  }
};
