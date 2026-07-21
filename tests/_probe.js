const { loadApp } = require('./_harness');
loadApp().then(({ win, consoleErrors }) => {
  const fns = ['loadProjects','saveProjects','getTrainingSummary','createTrainee','toggleTraineeDayOff',
    'getProjectHoursForWeek','_paceExtraStrip','safeSetItem','syncFromSheets','buildWeeklyPaceHTML',
    'showPage','renderTrainingHours','addDeletedId','getDeletedIds','autofillAllPendingProjectEntries'];
  const missing = fns.filter(f => typeof win[f] !== 'function');
  console.log('load: OK');
  console.log('PAGES defined:', Array.isArray(win.PAGES), win.PAGES ? win.PAGES.length : 0);
  console.log('missing functions:', missing.length ? missing.join(', ') : 'none');
  console.log('load-time console errors:', consoleErrors.length);
  if (consoleErrors.length) console.log(consoleErrors.slice(0,5).join('\n'));
  process.exit(missing.length ? 1 : 0);
}).catch(e => { console.log('LOAD FAILED:', e.message); process.exit(2); });
