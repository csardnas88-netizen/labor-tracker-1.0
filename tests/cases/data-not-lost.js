/* Saving must actually persist — and when the device is out of storage the app
   must NOT silently pretend it saved. Guards the "silent save failure" class. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Saves persist, and storage-full is surfaced (not silent)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // 1) A normal save round-trips.
    win.saveProjects([{ id: 1, name: 'Alpha', startDate: '2026-07-01', endDate: '2026-07-31', log: [] }]);
    const back = win.loadProjects();
    t.eq(back.length, 1, 'project not persisted');
    t.eq(back[0].name, 'Alpha', 'wrong project persisted');

    // 2) safeSetItem reports success truthfully.
    t.eq(win.safeSetItem('qa_k', 'v'), true, 'safeSetItem should return true on success');
    t.eq(win.localStorage.getItem('qa_k'), 'v', 'value not written');

    // 3) When the device is out of storage, safeSetItem must return false AND
    //    raise the storage banner — never claim success. Patch on the Storage
    //    prototype so the app's own localStorage.setItem call hits it.
    const proto = Object.getPrototypeOf(win.localStorage);
    const realSet = proto.setItem;
    proto.setItem = function (k, v) {
      if (k === 'qa_full') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      return realSet.call(this, k, v);
    };
    const ok = win.safeSetItem('qa_full', 'x');
    proto.setItem = realSet;
    t.eq(ok, false, 'safeSetItem must return false when the write fails');
    const banner = win.document.getElementById('storageFailBanner');
    t.assert(banner && banner.style.display !== 'none', 'storage-full banner must be shown on a failed local save');
  }
};
