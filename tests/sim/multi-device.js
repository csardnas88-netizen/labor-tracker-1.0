/* ─────────────────────────────────────────────────────────────────────────
   MULTI-DEVICE SYNC SIMULATION (adversarial)

   Loads the REAL app (real saveMonthData / syncFromSheets / _pushMonthDataMerged)
   as THREE independent devices — Alejandro (iPhone), Rebeca (laptop),
   Ingrid (PC) — all sharing ONE simulated Supabase `labor_data` table.

   It does NOT test hand-picked scenarios. It:
     1. runs a deterministic worst-case concurrent-write interleaving, and
     2. fuzzes hundreds of random interleavings of uploads / edits / syncs,
   then checks ONE hard invariant after everything settles:

     THE GOLDEN RULE: every day-report that was ever acknowledged into the
     cloud must still be present — in the cloud AND on every device — with
     its last-write-wins content. A report that was successfully saved must
     never silently disappear.

   The cloud can be put in "paused writes" mode so two devices can both read
   the current cloud BEFORE either's write lands — the exact read-modify-write
   race a single shared JSON blob is prone to. That models near-simultaneous
   saves from two phones better than any sequential test could.
   ───────────────────────────────────────────────────────────────────────── */
const { loadApp } = require('../_harness');

/* ---- shared cloud (emulates the labor_data table: key -> value string) ---- */
function makeCloud() {
  const table = {};            // key -> value (JSON string), like Supabase
  const pendingWrites = [];     // queued upserts when paused
  let paused = false;
  // Models labor_upsert_many(): atomic, timestamp-conditional upsert — only
  // overwrite when the incoming ts is >= the stored ts (the real Postgres
  // function does exactly this under a row lock).
  const tsOf = (val) => { try { return JSON.parse(val).ts || ''; } catch (e) { return ''; } };
  const applyRow = (row) => {
    const cur = table[row.key];
    if (cur === undefined || tsOf(cur) <= tsOf(row.value)) table[row.key] = row.value;
  };
  return {
    table,
    pause() { paused = true; },
    flush() { while (pendingWrites.length) applyRow(pendingWrites.shift()); paused = false; },
    fetchFor() {
      return (url, opts) => {
        opts = opts || {};
        const method = (opts.method || 'GET').toUpperCase();
        const u = String(url);
        if (u.indexOf('/auth/v1/') !== -1) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u' } }) });
        }
        // Per-day-row bulk upsert via the RPC.
        if (u.indexOf('/rest/v1/rpc/labor_upsert_many') !== -1 && method === 'POST') {
          const rows = (JSON.parse(opts.body).p_rows) || [];
          rows.forEach((row) => { if (paused) pendingWrites.push(row); else applyRow(row); });
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows.length) });
        }
        if (u.indexOf('/rest/v1/labor_data') !== -1) {
          if (method === 'GET') {
            const m = u.match(/key=eq\.([^&]+)/);
            if (m) {
              const key = decodeURIComponent(m[1]);
              const rows = table[key] !== undefined ? [{ key, value: table[key] }] : [];
              return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
            }
            const rows = Object.keys(table).map((k) => ({ key: k, value: table[k] }));
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
          }
          if (method === 'POST') {   // legacy blob path (should no longer be used for months)
            const body = JSON.parse(opts.body);
            const list = Array.isArray(body) ? body : [body];
            list.forEach((row) => { if (paused) pendingWrites.push(row); else applyRow(row); });
            return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) });
          }
          if (method === 'DELETE') return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
      };
    },
  };
}

/* A signed-in session for a given manager email, valid far into the future so
   no token-refresh path fires during the sim. */
function session(email) {
  const payload = Buffer.from(JSON.stringify({ email })).toString('base64').replace(/=/g, '');
  return {
    hk_sa_tok: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.sig',
    hk_sa_exp: String(Date.now() + 24 * 3600 * 1000),
  };
}

const MK = '2026-07';
let _clock = 0;
function nextTs() { _clock += 1; return new Date(Date.UTC(2026, 6, 1) + _clock * 60000).toISOString(); }

const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); };

/* ---- device operations, all through the REAL app functions ---- */
function uploadDay(dev, day, paid, ts) {
  const md = dev.win.loadMonthData(MK);
  md.days = md.days || {}; md.daysUpdatedAt = md.daysUpdatedAt || {};
  md.days[day] = { date: day, totalPaid: paid, totalEmps: 1, emps: [{ id: 'E', name: 'x', pos: 'Room Attendant', paid, unpaid: 0.5 }], byPosition: {} };
  md.daysUpdatedAt[day] = ts || nextTs();
  dev.win.saveMonthData(md, MK);        // real path -> _pushMonthDataMerged
}
function editRoom(dev, day, n, ts) {
  const md = dev.win.loadMonthData(MK);
  md.rooms = md.rooms || {}; md.roomsSource = md.roomsSource || {}; md.roomsUpdatedAt = md.roomsUpdatedAt || {};
  md.rooms[day] = n; md.roomsSource[day] = 'manual'; md.roomsUpdatedAt[day] = ts || nextTs();
  dev.win.saveMonthData(md, MK);
}
function sync(dev) { try { dev.win.syncFromSheets(); } catch (e) {} }

// Reconstruct the cloud's day map from the authoritative per-day rows
// (mday_<mk>_<ds>), the new source of truth — plus any legacy month_ blob.
function cloudDays(cloud) {
  const out = {};
  Object.keys(cloud.table).forEach((k) => {
    if (k.indexOf('mday_' + MK + '_') === 0) {
      const ds = k.slice(('mday_' + MK + '_').length);
      try { out[ds] = JSON.parse(cloud.table[k]).v; } catch (e) {}
    }
  });
  const blob = cloud.table['month_' + MK];
  if (blob) { try { const d = JSON.parse(blob).days || {}; Object.keys(d).forEach((ds) => { if (!out[ds]) out[ds] = d[ds]; }); } catch (e) {} }
  return out;
}
function localDays(dev) {
  const md = dev.win.loadMonthData(MK);
  return md.days || {};
}

async function makeDevices(cloud) {
  const emails = ['alejandro5555@yahoo.com', 'g.rebeca88@yahoo.com', 'ingrid@example.com'];
  const names = ['Alejandro (iPhone)', 'Rebeca (laptop)', 'Ingrid (PC)'];
  const devs = [];
  for (let i = 0; i < emails.length; i++) {
    const { win } = await loadApp({ seed: session(emails[i]), fetchImpl: cloud.fetchFor() });
    devs.push({ win, name: names[i] });
  }
  await settle();
  return devs;
}
function teardown(devs) { devs.forEach((d) => { try { d.win.close(); } catch (e) {} }); }

/* ═══════════════ Scenario 1 — deterministic concurrent-write race ═══════════════
   The classic read-modify-write hazard on a single shared blob: two devices
   both read the cloud BEFORE either's write lands, each adds its own new day,
   then both writes flush in order. Does the second writer clobber the first
   writer's day? */
async function scenarioConcurrentBlob() {
  const cloud = makeCloud();
  const devs = await makeDevices(cloud);
  const [ale, reb] = devs;

  // Seed the cloud with an existing day 20 that everyone has pulled.
  uploadDay(ale, '2026-07-20', 100, nextTs());
  await settle();
  sync(reb); await settle();

  // Now: pause writes so both devices read the SAME pre-write cloud, then
  // each uploads a DIFFERENT new day, then both writes land back-to-back.
  cloud.pause();
  uploadDay(ale, '2026-07-21', 111, nextTs());   // Alejandro's iPhone report
  uploadDay(reb, '2026-07-22', 222, nextTs());   // Rebeca's laptop report, same moment
  await settle();
  cloud.flush();
  await settle();

  // Let everyone converge.
  devs.forEach(sync); await settle(); devs.forEach(sync); await settle();

  const cd = cloudDays(cloud);
  const problems = [];
  ['2026-07-20', '2026-07-21', '2026-07-22'].forEach((d) => {
    if (!cd[d]) problems.push('CLOUD lost ' + d);
    devs.forEach((dev) => { if (!localDays(dev)[d]) problems.push(dev.name + ' lost ' + d); });
  });
  const result = { name: 'Deterministic concurrent-write (two devices, same moment)', problems, cloudDays: Object.keys(cd).sort() };
  teardown(devs);
  return result;
}

/* ═══════════════ Scenario 2 — randomized fuzz ═══════════════
   Hundreds of random interleavings of uploads / room edits / syncs across the
   three devices, with occasional paused concurrent bursts. Oracle tracks the
   last-write-wins winner per day; every winner must survive in cloud + all
   devices at the end. */
async function scenarioFuzz(rounds, opsPerRound) {
  const rng = mulberry32(0xC0FFEE);
  let worst = null;
  for (let r = 0; r < rounds; r++) {
    const cloud = makeCloud();
    const devs = await makeDevices(cloud);
    const oracle = {};   // day -> {paid, ts}  (last-write-wins expectation)
    const commit = (day, paid, ts) => { if (!oracle[day] || ts > oracle[day].ts) oracle[day] = { paid, ts }; };

    const ops = 6 + Math.floor(rng() * opsPerRound);
    for (let o = 0; o < ops; o++) {
      const dev = devs[Math.floor(rng() * devs.length)];
      const roll = rng();
      if (roll < 0.15) {                       // concurrent burst (paused writes)
        cloud.pause();
        const k = 2 + Math.floor(rng() * 2);
        for (let j = 0; j < k; j++) {
          const d2 = devs[Math.floor(rng() * devs.length)];
          const day = '2026-07-' + String(3 + Math.floor(rng() * 26)).padStart(2, '0');
          const paid = 50 + Math.floor(rng() * 100); const ts = nextTs();
          uploadDay(d2, day, paid, ts); commit(day, paid, ts);
        }
        await settle(); cloud.flush(); await settle();
      } else if (roll < 0.65) {                // upload a day
        const day = '2026-07-' + String(3 + Math.floor(rng() * 26)).padStart(2, '0');
        const paid = 50 + Math.floor(rng() * 100); const ts = nextTs();
        uploadDay(dev, day, paid, ts); commit(day, paid, ts);
        await settle();
      } else if (roll < 0.82) {                // unrelated room edit (the "small write")
        const day = '2026-07-' + String(3 + Math.floor(rng() * 26)).padStart(2, '0');
        editRoom(dev, day, 100 + Math.floor(rng() * 150), nextTs());
        await settle();
      } else {                                 // sync
        sync(dev); await settle();
      }
    }
    // Converge everyone.
    for (let s = 0; s < 3; s++) { devs.forEach(sync); await settle(); }

    // Check the golden rule.
    const cd = cloudDays(cloud);
    const problems = [];
    Object.keys(oracle).forEach((day) => {
      if (!cd[day]) problems.push('cloud lost ' + day);
      else if (cd[day].totalPaid !== oracle[day].paid) problems.push('cloud ' + day + ' wrong content (got ' + cd[day].totalPaid + ', expected ' + oracle[day].paid + ')');
      devs.forEach((dev) => {
        const ld = localDays(dev)[day];
        if (!ld) problems.push(dev.name + ' lost ' + day);
        else if (ld.totalPaid !== oracle[day].paid) problems.push(dev.name + ' ' + day + ' wrong content (got ' + ld.totalPaid + ', expected ' + oracle[day].paid + ')');
      });
    });
    if (problems.length) { worst = { round: r, ops, uploaded: Object.keys(oracle).length, problems: problems.slice(0, 8) }; teardown(devs); break; }
    teardown(devs);
    if (global.gc && r % 20 === 0) global.gc();
  }
  return { name: 'Randomized fuzz (' + rounds + ' interleavings)', worst };
}

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

(async () => {
  console.log('Multi-device sync simulation — Alejandro (iPhone) · Rebeca (laptop) · Ingrid (PC)\n');

  const s1 = await scenarioConcurrentBlob();
  console.log('▶ ' + s1.name);
  console.log('  cloud ended with days: ' + JSON.stringify(s1.cloudDays));
  if (s1.problems.length) { console.log('  ✗ DATA LOSS:\n    - ' + s1.problems.join('\n    - ')); }
  else console.log('  ✓ no loss');
  console.log('');

  const s2 = await scenarioFuzz(200, 22);
  console.log('▶ ' + s2.name);
  if (s2.worst) {
    console.log('  ✗ DATA LOSS found on interleaving #' + s2.worst.round + ' (' + s2.worst.ops + ' ops, ' + s2.worst.uploaded + ' reports uploaded):');
    console.log('    - ' + s2.worst.problems.join('\n    - '));
  } else console.log('  ✓ no loss across all interleavings');
  console.log('');

  const anyLoss = s1.problems.length || s2.worst;
  console.log(anyLoss ? '=== RESULT: DATA-LOSS RACE STILL EXISTS ===' : '=== RESULT: no data loss detected ===');
  process.exit(anyLoss ? 1 : 0);
})().catch((e) => { console.error('SIM ERROR', e); process.exit(2); });
