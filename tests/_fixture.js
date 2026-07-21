/* A realistic dataset covering every data type, so tests exercise real code
   paths the way a signed-in device with data would. */
const { fakeSession } = require('./_harness');

function emp(id, name, pos, paid) {
  return { id, name, pos, code: '2560', isHK: true, ot1: paid > 8 ? paid - 8 : 0, meal: 0, paid, work: paid, unpaid: 0.4, regular: Math.min(paid, 8) };
}
function month(y, m, ndays) {
  const days = {};
  for (let d = 1; d <= ndays; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const list = [emp('E1', 'Ana Lopez', 'Room Attendant', 8), emp('E2', 'Beto Cruz', 'House Attendant', 8.2),
      emp('E3', 'Carla Diaz', 'Laundry Attendant', 7.5), emp('E4', 'Susan Aguilar', 'Housekeeping Supervisor', 8),
      emp('E5', 'Luis Ordonez', 'Public Area Attendant', 8), emp('E6', 'Paty Cano', 'Turndown Attendant', 6)];
    const byPosition = {};
    list.forEach((e) => { byPosition[e.pos] = byPosition[e.pos] || { paid: 0, ot1: 0 }; byPosition[e.pos].paid += e.paid; });
    days[ds] = { rooms: 190 + (d % 20), totalPaid: list.reduce((s, e) => s + e.paid, 0), totalOT: 0, emps: list, byPosition };
  }
  return { days, rooms: {} };
}

function build() {
  const r106 = {};
  for (let d = 1; d <= 21; d++) r106[`2026-07-${String(d).padStart(2, '0')}`] = 190 + (d % 20);
  return Object.assign({}, fakeSession(), {
    'hk_month_2026-06': month(2026, 6, 30),
    'hk_month_2026-07': month(2026, 7, 21),
    'hk_r106_2026-07': r106,
    'hk_manager_name': 'Carlos',
    'hk_roster_overrides': {
      N1: { name: 'Nuevo Uno', pos: 'Room Attendant', code: '2560', status: 'active', updated: new Date().toISOString() }
    },
    'hk_labor_model': { positions: {
      'Room Attendant': { driver: 'percent', value: 56.2, rate: 13.84 },
      'House Attendant': { driver: 'percent', value: 17.5, rate: 13.84 },
      'Housekeeping Supervisor': { driver: 'percent', value: 15.5, rate: 17.42 },
      'Laundry Attendant': { driver: 'percent', value: 18, rate: 13.64 },
      'Turndown Attendant': { driver: 'fixed', value: 21, rate: 13.84 },
      'Public Area Attendant': { driver: 'fixed', value: 32, rate: 13.84 } } },
    'projects_data': [
      { id: 9001, name: '812 Building Prep', startDate: '2026-07-01', endDate: '2026-07-31', notes: 'Reno', created: 'x', log: [
        { date: '2026-07-14', empId: 'E2', empName: 'Beto Cruz', pos: 'House Attendant', hours: 8, pending: false, added: 'x', note: 'Moved furniture and bagged linens on floor 14' },
        { date: '2026-07-15', empId: 'E1', empName: 'Ana Lopez', pos: 'Room Attendant', hours: 9, pending: false, added: 'x', note: 'Deep cleaned rooms 1401-1410' } ] },
      { id: 9002, kind: 'training', name: 'Nuevo Uno', empId: 'N1', pos: 'Room Attendant', startDate: '2026-07-13', endDate: '2026-07-17', notes: '', created: 'x', log: [
        { date: '2026-07-13', empId: 'N1', empName: 'Nuevo Uno', pos: 'Room Attendant', hours: 8, pending: false, added: 'x' },
        { date: '2026-07-14', empId: 'N1', empName: 'Nuevo Uno', pos: 'Room Attendant', hours: 7.5, pending: false, added: 'x' },
        { date: '2026-07-15', empId: 'N1', empName: 'Nuevo Uno', pos: 'Room Attendant', hours: null, pending: false, off: true, added: 'x' },
        { date: '2026-07-16', empId: 'N1', empName: 'Nuevo Uno', pos: 'Room Attendant', hours: null, pending: true, added: 'x' } ] }
    ],
    'calloffs_data': [{ id: 7001, empId: 'E1', empName: 'Ana Lopez', pos: 'Room Attendant', date: '2026-07-10', reason: 'Sick', note: 'x' }],
    'hk_trainings': [{ id: 5001, title: 'Safety', scope: 'all', created: '2026-07-01', prog: { E1: { st: 'complete', at: Date.now(), date: '2026-07-05' } }, done: { E1: '2026-07-05' } }]
  });
}

module.exports = { build, emp, month };
