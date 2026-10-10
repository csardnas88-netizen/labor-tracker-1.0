/* Carlos's real report, 2026-10-10: Abby Puac's roster name and her
   Schedule Draft name ("Abigail Ro...") share zero tokens — a nickname
   plus an entirely different second surname — so schedNameLooselyMatches'
   prefix-matching could never connect them no matter how it's tuned.
   SCHED_NAME_ALIASES already existed for exactly this case ("add an
   entry here, not a code change"), but schedNameLooselyMatches — the
   function Call-Offs, Tardiness, the OT projection, and Request Off all
   use to cross-reference the Schedule Draft — was only ever calling
   dlNorm, never dlNormAlias, so an alias entry silently did nothing for
   any of them. Now wired through dlNormAlias instead. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedNameLooselyMatches respects SCHED_NAME_ALIASES, so a nickname/different-surname Schedule Draft entry can still resolve to the real roster name',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Without an alias, a genuine nickname + different surname never matches ──
    t.assert(!win.schedNameLooselyMatches('Abigail Rodriguez', 'Abby Puac'), 'no shared tokens at all — correctly does not match before any alias exists');

    // ── Register the alias (the real fix: Carlos adds one entry, no code change next time) ──
    win.SCHED_NAME_ALIASES['abigail rodriguez'] = 'abby puac';
    t.assert(win.schedNameLooselyMatches('Abigail Rodriguez', 'Abby Puac'), 'once aliased, the Schedule Draft name resolves to her real roster name');
    t.assert(win.schedNameLooselyMatches('abigail RODRIGUEZ', 'Abby Puac'), 'the alias lookup is still case-insensitive, same as dlNorm always was');

    // ── A shorter alias key still only matches the exact person it was defined for ──
    t.assert(!win.schedNameLooselyMatches('Abigail Rodriguez', 'Someone Else'), "the alias doesn't make her match a totally different person");

    // ── The pre-existing 'sandra s.' alias (trailing-period normalization)
    // still works exactly as before — this change didn't regress it. ──
    t.assert(win.schedNameLooselyMatches('Sandra S.', 'Sandra S'), "the existing real alias ('sandra s.' -> 'sandra s') still resolves");
    // And a genuinely different Sandra is still correctly rejected — the
    // alias layer only ever adds equivalences, it never loosens the
    // token-prefix rule itself.
    t.assert(!win.schedNameLooselyMatches('Sandra T', 'Sandra Reyes'), 'an unrelated Sandra is still correctly rejected');

    // ── End to end: once the alias is registered, the Tardiness scheduled-
    // time lookup actually resolves her real shift, matching Carlos's
    // real workflow (Abby logged as a Tardiness, matched via her
    // Schedule Draft row even though the names don't share a token). ──
    const ds = '2026-10-09';
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: { [ds]: { gra: [['Abigail Rodriguez', '1']] } },
      count: 1, savedAt: new Date().toISOString(),
    }));
    const r = win.schedScheduledStartTimeReason(ds, 'Abby Puac', 'Room Attendant');
    t.assert(!!r.time, "Abby's scheduled time resolves now that the alias bridges the name gap");
    t.eq(r.reason, null, 'and there is no failure reason, since the match succeeded');
  },
};
