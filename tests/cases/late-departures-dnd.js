/* Carlos's ask, 2026-09-06: on a Room Assignment Analysis attendant card,
   show how many of her Occupied (Stayover) rooms were actually DND that
   day — a reference for how many rooms she really cleaned, since a DND
   sign means the guest declined service. Only Stayover rooms can carry a
   DND; a checkout is cleaned regardless of anything on the door.

   Computed LIVE against getDNDRoomsForDay/saveDNDRoomsForDate, not baked
   into the saved Room Assignment Analysis snapshot — DNDs are usually
   logged separately, often after the report is already uploaded. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: '_ldDndCountForRooms: cross-references an attendant\'s Occupied rooms against that day\'s logged DND list, live (Carlos\'s 2026-09-06 ask)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const ds = '2026-09-13';

    // Nothing logged at all for the date — must read "not logged" (null),
    // never a false "zero DNDs".
    t.eq(win._ldDndCountForRooms(ds, ['0205', '0303']), null, 'no DND list logged for this date at all returns null, not 0');

    // A DND list logged, with room numbers typed in different formats
    // (zero-padded, un-padded, mixed with commas and newlines) — same
    // parsing _parseDNDRoomList already relies on elsewhere.
    win.saveDNDRoomsForDate(ds, '205, 0421\n1505');

    t.eq(win._ldDndCountForRooms(ds, ['0205', '0303', '0421', '1505']), 3, 'matches across zero-padded vs un-padded room numbers, 3 of her 4 Stayover rooms are on the DND list');
    t.eq(win._ldDndCountForRooms(ds, ['0303', '0999']), 0, 'a real logged list with none of HER rooms on it is a real 0, not null');
    t.eq(win._ldDndCountForRooms(ds, []), null, 'an attendant with no Stayover rooms at all returns null — there is nothing to cross-reference');
    t.eq(win._ldDndCountForRooms(ds, null), null, 'no room list passed in is a no-op, not a crash');

    // Clearing the list back to '' (the Delete button's behavior) must
    // read as "not logged" again, same as before anything was saved.
    win.saveDNDRoomsForDate(ds, '');
    t.eq(win._ldDndCountForRooms(ds, ['0205']), null, 'clearing the DND list back to blank returns to null, not a stale 0');

    // A DND list logged for a DIFFERENT date must not leak into this one.
    win.saveDNDRoomsForDate('2026-09-14', '0205');
    t.eq(win._ldDndCountForRooms(ds, ['0205']), null, "a DND list logged for a different date doesn't cross-contaminate this one");

    // Carlos's follow-up ask: tag the specific room in the expanded room
    // list, not just a total count in the summary line — _ldDndSetForDate/
    // _ldRoomIsDnd are the shared building blocks both the count and the
    // per-room tag are built from, so they can never disagree.
    win.saveDNDRoomsForDate(ds, '205, 0421');
    const set = win._ldDndSetForDate(ds);
    t.assert(!!set, 'a logged list returns a real set, not null');
    t.eq(win._ldRoomIsDnd(set, '0205'), true, 'zero-padded room matches the un-padded entry logged in the list');
    t.eq(win._ldRoomIsDnd(set, '0421'), true, 'and the other logged room matches too');
    t.eq(win._ldRoomIsDnd(set, '0303'), false, "a room not on the list is plainly false, not undefined/truthy by accident");
    t.eq(win._ldDndSetForDate('2026-09-20'), null, 'a date with nothing logged returns null, not an empty object');
    t.eq(win._ldRoomIsDnd(null, '0205'), false, 'a null set (nothing logged) is handled without throwing, reads as not-DND');
  },
};
