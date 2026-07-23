/* Training page view switcher (Large ring cards / Small icon grid / compact
   Details list) — the choice must persist per device (hk_training_view) and
   each mode must actually render distinct, correct markup for the same
   training, not just relabel the same HTML. Also guards the pure helpers
   (_trRing math, _trUrgentDeadline picking the sooner of two dates) used by
   all three views. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "Training view switcher: persists choice and renders each mode correctly",
  async run(t) {
    const seed = Object.assign(fixture.build(), {
      hk_trainings: [{
        id: 't1', title: 'Safety', scope: 'all', created: '2026-07-01',
        dlHK: '2026-07-10', dlHR: '2026-08-01',
        prog: { N1: { st: 'complete', at: 1, date: '2026-07-02' } },
      }],
    });
    const { win } = await loadApp({ seed });
    const content = win.document.getElementById('trainingContent');

    // Defaults to 'large' when nothing is stored yet.
    t.eq(win.getTrainingView(), 'large', 'default view should be large');

    // Switching persists to localStorage and re-renders immediately.
    win.setTrainingView('small');
    t.eq(win.localStorage.getItem('hk_training_view'), 'small', 'view choice should be saved');
    t.assert(/tr-grid/.test(content.innerHTML), 'small view should render the icon grid');
    t.assert(/tr-tile-name">Safety/.test(content.innerHTML), 'small view should show the training name');
    t.assert(!/tr-list|tr-card"/.test(content.innerHTML), 'small view should not also render the other two layouts');

    win.setTrainingView('details');
    t.eq(win.getTrainingView(), 'details', 'getTrainingView should reflect the new choice');
    t.assert(/tr-list/.test(content.innerHTML), 'details view should render the compact list');
    t.assert(/tr-row-title">Safety/.test(content.innerHTML), 'details view should show the training title');
    t.assert(/68 pending/.test(content.innerHTML), 'details view should show the pending count');
    t.assert(/overdue by 13d/.test(content.innerHTML), 'details view should show the more urgent (overdue) deadline');
    t.assert(!/tr-grid|tr-card"/.test(content.innerHTML), 'details view should not also render the other two layouts');

    win.setTrainingView('large');
    t.assert(/tr-card"/.test(content.innerHTML), 'large view should render the full card');
    t.assert(/tr-ring-wrap/.test(content.innerHTML), 'large view should use a progress ring, not the old thin bar');
    t.assert(!/tr-fill|tr-track/.test(content.innerHTML), 'large view should not use the retired thin progress bar classes');
    t.assert(!/tr-list|tr-grid/.test(content.innerHTML), 'large view should not also render the other two layouts');

    // The toolbar's active button must match whichever view is current.
    const activeBtnMatch = content.innerHTML.match(/tr-view-btn active" onclick="setTrainingView\('([a-z]+)'\)/);
    t.assert(activeBtnMatch, 'exactly one view button should be marked active');
    t.eq(activeBtnMatch[1], 'large', 'the active toolbar button should match the current view');

    // Ring math: at 50% the dash offset should be exactly half the circumference.
    const ring50 = win._trRing(50, 84, 8, 'red');
    const circMatch = ring50.match(/stroke-dasharray="([0-9.]+)"/);
    const offMatch = ring50.match(/stroke-dashoffset="([0-9.]+)"/);
    t.assert(circMatch && offMatch, 'ring svg should have dasharray/dashoffset');
    t.assert(Math.abs(parseFloat(offMatch[1]) - parseFloat(circMatch[1]) / 2) < 0.01, '50% ring should offset exactly half the circumference');
    // At 100%, no offset (a full ring).
    const ring100 = win._trRing(100, 84, 8, 'green');
    t.assert(/stroke-dashoffset="0(\.0+)?"/.test(ring100), '100% ring should have zero dashoffset (a full circle)');

    // _trUrgentDeadline: overdue/sooner date wins; empty when neither is set.
    t.eq(win._trUrgentDeadline({ dlHK: '2026-07-10', dlHR: '2026-08-01' }), '2026-07-10', 'should pick the sooner deadline');
    t.eq(win._trUrgentDeadline({ dlHK: '', dlHR: '' }), null, 'should return null when neither deadline is set');
  }
};
