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
  require('./cases/call-off-employee-list'),
  require('./cases/r106-departures-parse'),
  require('./cases/unifocus-houseperson'),
  require('./cases/unifocus-supervisor'),
  require('./cases/unifocus-laundry-turndown'),
  require('./cases/unifocus-public-area'),
  require('./cases/unifocus-weekly-pace'),
  require('./cases/project-hours-manual-edit-protected'),
  require('./cases/labor-standard-toggle'),
  require('./cases/labor-pace-projects-multiproject'),
  require('./cases/variance-notes'),
  require('./cases/month-sync-preserves-departures-and-notes'),
  require('./cases/unifocus-room-attendant'),
  require('./cases/dnd-delete-pushes-clear'),
  require('./cases/unifocus-turndown-shift-truncation'),
  require('./cases/weekly-pace-notes-per-day'),
  require('./cases/weekly-pace-variance-percent'),
  require('./cases/sync-refresh-storm'),
  require('./cases/sync-401-retry'),
  require('./cases/labor-model-unifocus-reference'),
  require('./cases/labor-effectiveness-parse'),
  require('./cases/labor-effectiveness-render'),
  require('./cases/labor-effectiveness-sync'),
  require('./cases/labor-effectiveness-notes'),
  require('./cases/labor-effectiveness-notes-sync'),
  require('./cases/call-off-filter-by-name'),
  require('./cases/offline-event-debounce'),
  require('./cases/sync-status-error-distinct'),
  require('./cases/dnd-analysis'),
  require('./cases/occupancy-pickup'),
  require('./cases/occupancy-forecast'),
  require('./cases/daily-lineup'),
  require('./cases/schedule-page'),
  require('./cases/req-notebook'),
  require('./cases/toast-entities'),
  require('./cases/dl-sections-sync'),
  require('./cases/dl-schedule-snapshot-decouple'),
  require('./cases/late-departures'),
  require('./cases/realtime-retry-cap'),
  require('./cases/daily-lineup-label-drift'),
  require('./cases/sched-remove-person-future-not-past'),
  require('./cases/schedule-week-merge'),
  require('./cases/req-notebook-trends'),
  require('./cases/schedule-resync-request-off'),
  require('./cases/training-sync-clobber'),
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
