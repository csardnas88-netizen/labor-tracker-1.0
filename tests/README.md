# Automated safety checks

These run automatically on GitHub on every push (see the green ✓ / red ✗ next to
each commit), and can be run by hand with:

```bash
npm install   # first time only
npm test
```

They load the real `index.html` inside a simulated browser (jsdom) with the
network stubbed, so nothing touches the live Supabase data.

## What each check guards

| Check | Protects against |
|-------|------------------|
| `pages-open` | A change breaking any of the app's screens (regressions). Opens all 20 pages, expects content and no errors. |
| `data-not-lost` | The "silent save failure" bug — the app claiming it saved when the device was out of storage. |
| `deletes-stay-deleted` | The "Japan Team" bug — a deleted project reappearing after a cloud sync. |
| `training-hours` | Training Hours: daily auto-fill from the report, days-off not counting as pending, and the weekly by-position/name summary adding up. |

## Adding a check when a new bug is found

Create `tests/cases/<name>.js` exporting `{ name, async run(t) }` (use `t.assert`
/ `t.eq`), then add `require('./cases/<name>')` to the list in `tests/run.js`.
The load helper is `tests/_harness.js`; a realistic dataset is `tests/_fixture.js`.
