/* Minimal test runner (no framework) — runs each case, prints PASS/FAIL,
   exits non-zero if anything fails so CI can block a bad version. */
const cases = [
  require('./cases/pages-open'),
  require('./cases/data-not-lost'),
  require('./cases/deletes-stay-deleted'),
  require('./cases/training-hours'),
  require('./cases/labor-pace-projects'),
  require('./cases/presence'),
  require('./cases/r106-backfill'),
  require('./cases/r106-backfill-refresh'),
  require('./cases/resume-session-sync'),
  require('./cases/month-sync-conflict'),
  require('./cases/realtime-reconnect'),
  require('./cases/resume-foreground-sync'),
  require('./cases/adjusted-pace-by-position'),
  require('./cases/training-view-switcher'),
  require('./cases/forgot-password'),
  require('./cases/push-merge-protects-remote-days'),
  require('./cases/occupancy-mismatch-manual-confirm'),
  require('./cases/pnl-calendar-date-rooms'),
  require('./cases/roster-seniority'),
  require('./cases/position-check-month'),
  require('./cases/wtc-otherdept-hours'),
  require('./cases/overtime-redesign'),
  require('./cases/break-compliance-redesign'),
  require('./cases/break-compliance-wtc-nonworked'),
  require('./cases/break-compliance-multirow-day'),
  require('./cases/section-pin-gate'),
  require('./cases/add-employee-modal'),
  require('./cases/auto-logout-timeout'),
  require('./cases/no-self-signup'),
  require('./cases/training-autofill-refresh'),
  require('./cases/pdf-name-orphan-digit'),
];

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'not equal') + ' (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
const t = { assert, eq };

(async () => {
  let pass = 0, fail = 0;
  const started = Date.now();
  for (const c of cases) {
    try {
      await c.run(t);
      console.log('  ✓ ' + c.name);
      pass++;
    } catch (e) {
      console.log('  ✗ ' + c.name + '\n      ' + (e && e.message));
      fail++;
    }
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${pass} passed, ${fail} failed  (${secs}s)`);
  process.exit(fail ? 1 : 0);
})();
