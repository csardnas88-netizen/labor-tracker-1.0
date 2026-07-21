/* Loads index.html inside a simulated browser (jsdom) so tests can call the
   app's REAL functions. External network (Supabase) is stubbed out — tests
   run fully offline and never touch real data. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadApp(opts) {
  opts = opts || {};
  const consoleErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => consoleErrors.push('jsdomError: ' + (e && e.message)));
  vc.on('error', (...a) => consoleErrors.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(HTML, {
    url: 'https://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // Pre-seed localStorage BEFORE the app's scripts run, so its load handlers
      // read the fixture (mirrors a real signed-in device with data).
      try {
        const s = opts.seed || {};
        Object.keys(s).forEach((k) => window.localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k])));
      } catch (e) {}
      // Network stub. Tests may pass a custom fetch to simulate remote cloud rows.
      window.fetch = opts.fetchImpl || (() => Promise.resolve({
        ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]')
      }));
      // Service worker / misc browser bits the load path may touch.
      if (!window.navigator.serviceWorker) {
        Object.defineProperty(window.navigator, 'serviceWorker', {
          value: { register: () => Promise.resolve({ addEventListener() {} }), ready: Promise.resolve({}) },
          configurable: true
        });
      }
      window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, addListener() {} }; };
      // Force-override (jsdom ships stubs that throw "Not implemented").
      window.scrollTo = function () {};
      window.print = function () {};
      window.open = window.open || function () { return { document: { write() {}, close() {} }, print() {}, focus() {} }; };
      window.alert = function () {}; window.confirm = function () { return true; };
      // External libs (loaded via <script src> in real browsers) — stub so
      // top-level references at load don't throw in the test environment.
      window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error('stub')) }) };
      window.XLSX = { utils: { book_new() { return {}; }, aoa_to_sheet() { return {}; }, book_append_sheet() {}, json_to_sheet() { return {}; } }, writeFile() {}, write() { return ''; } };
      window.Chart = function () { return { destroy() {}, update() {} }; };
    }
  });

  return new Promise((resolve) => {
    const win = dom.window;
    const done = () => resolve({ dom, win, consoleErrors });
    if (win.document.readyState === 'complete') return done();
    win.addEventListener('load', () => setTimeout(done, 30));
  });
}

/* Seed a signed-in session + a fixture dataset into localStorage, then let the
   app re-read it. Returns nothing; call app functions after. */
function seed(win, data) {
  const ls = win.localStorage;
  Object.keys(data || {}).forEach((k) => ls.setItem(k, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k])));
}

/* A structurally-valid (unsigned) session token so the app treats us as signed
   in. It is never sent anywhere real — network is stubbed. */
function fakeSession() {
  const payload = Buffer.from(JSON.stringify({ email: 'tester@example.com' })).toString('base64').replace(/=/g, '');
  return {
    hk_sa_tok: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.sig',
    hk_sa_exp: String(Date.now() + 3600000)
  };
}

module.exports = { loadApp, seed, fakeSession, HTML };
