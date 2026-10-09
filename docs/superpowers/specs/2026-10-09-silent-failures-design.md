# Silent failures — audit and proposed feedback

**Status:** proposal, for Tobias and Josh to review before anything is built.
**Date:** 2026-10-09
**Scope:** every way a command, sent from the menu or typed in chat, can fail without
the player hearing that it failed. Found by reading the code paths, plus PF1's source
and the Poker Dungeon's blind mode for comparison.

## The rule

> A failure is heard **instantly**. Words follow **only when the reason changes what
> the player does next.**

Three kinds of fix come out of that:

| Kind | When | Count |
|---|---|---|
| **Sound only** | The reason is obvious from what he just did | 4 |
| **Sound, then a short phrase** | He needs the reason to decide what to do next | 10 |
| **Fix the cause** | Nothing actually failed, or the failure is ours to remove; a sound would be the wrong answer | 10 |

That is 23 items from the original audit plus one new one (item 24) that turned up in
the Poker Dungeon's code.

## The sound: reuse the Poker Dungeon's, exactly

The Poker Dungeon already does this. Its blind mode plays `earcon('error')` and then
speaks a short reason, eight times over:

```js
earcon('error'); speak("Didn't catch the amount. Say again.", 'urgent');
```

Josh hears that sound every session, so **Quick Menu should play the same one, not a
new one**: same pitch, same rhythm, generated the same way. One more sound to learn
is a cost; the same sound meaning the same thing in poker, the dungeon and Foundry is
free.

Poker's definition (WebAudio, no sound files):

| Earcon | Sound | Use in Quick Menu |
|---|---|---|
| `error` | two low pulses, 220 Hz, 0.10 s each, 0.13 s apart | every failure below |
| `ack` | one high blip, 1200 Hz, 0.08 s | optional — see open questions |

Quick Menu also ships four sound files that nothing uses (`bong`, `boop`, `pop`,
`bajinger`). Recommend leaving them out of this; matching poker matters more.

### Why a sound rather than more speech

The sound uses WebAudio, which is separate from the speech engine. That makes it the
one feedback channel that still works when speech is broken — and items 18, 19, 20 and
24 below are all ways speech breaks. It also cannot be dropped by the speech rate
limiter or cleared by an interrupting line (items 14 and 15).

### Rules for the sound

- Plays immediately, before any speech, and does not wait in the speech queue.
- Follows the live volume setting (`-` / `=`).
- Goes through the duplicate-key guard, so a doubled keypress does not buzz twice.
- Has its own setting, **Error sound**, on by default — so it still works with speech
  switched off.
- Browsers only allow WebAudio after a key or click. The first keypress unlocks it,
  and every command arrives by keypress, so in practice this is never a problem. The
  poker code already handles it the same way.

---

## 1. Sound only — the reason is obvious

He just did the thing. The buzz tells him it did not take, and he knows why.

| # | Situation | What he hears now | Proposed | Where |
|---|---|---|---|---|
| 1 | **Typo or unknown command** (`/6dix`) | nothing — Foundry shows "not a valid command" on screen | **error** | `ChatCommandInterceptor.js:165`, the final `return true`. Buzz only when Foundry would also reject it (`parse` returned `invalid` and we do not recognise it), never on real Foundry commands like `/roll` or `/w`. |
| 11 | **Number past the end of a list** (45 in a 38-item list) | nothing | **error** | `QuickMenuManager.navigateToNumber`, the out-of-range case |
| 12 | **A menu key on the wrong kind of item** — F on a submenu, P or U on a non-spell, `/` on a non-action | nothing | **error** | `QuickMenuManager.js:423, 468, 550, 621, 660` |
| 13 | **Unknown action type** — a bug on our side | nothing (console only) | **error**, and keep the console line | `ActionExecutor.js:82` |

## 2. Sound, then a short phrase — he needs the reason

Phrases are kept as short as they can be and still tell him what to do.

| # | Situation | What he hears now | Proposed | Where |
|---|---|---|---|---|
| 2 | **PF1 refuses**: out of charges, out of potions, out of ammo, or another module blocked it | **"activated" / "consumed" / "cast" — it says it worked**, or nothing for attacks | **error**, then the reason from PF1's code: "No charges." / "None left." / "No ammo." / "Blocked." | PF1's `use()` **returns** `INSUFFICIENT_CHARGES`, `_QUANTITY` or `_AMMO` instead of throwing, and shows an on-screen notice. Check the return value of every `use()` before speaking success: `ActionExecutor.js` spell, item, activate, consume, attack, maneuver. **Highest priority — this is the only case where he is told the opposite of what happened.** |
| 5 | **A roll throws an error** — skill, attack, save, ability check, initiative, stabilize, caster level, concentration | nothing (console only) | **error**, then "Perception failed." (the thing's name + failed) | the `catch` blocks at `ActionExecutor.js:179, 202, 379, 397, 416, 428, 447, 466` |
| 6 | **No character assigned and no token selected** | nothing — on-screen message only | **error**, then "No character assigned." | `QuickMenuManager.js:97`, `ActionExecutor.js:24` |
| 7 | **A menu action throws** | nothing — on-screen "Failed to execute" | **error**, then "Perception failed." | `QuickMenuManager.js:794` |
| 8 | **`/fqm rename` or `/fqm reset` fails** — wrong usage, no character, unknown command | nothing — chat whisper only | **error**, then the reason: "Say fqm rename, old, new." / "No command slash x." | `_fqmRename`, `_fqmReset` in `ChatCommandInterceptor.js` |
| 9 | **Chat commands switched off in settings** | nothing — Foundry's on-screen "invalid command" | **error**, then "Chat commands are off." — once per session, not on every command | `ChatCommandInterceptor.js:55` |
| 10 | **Command for an item deleted or renamed since the last `/scan`** | nothing (attack, item, spell, activate, consume); "Item not found" for equip / unequip / inspect | **error**, then "Not found. Type slash scan." — the same for every action type | `ActionExecutor.js:194, 212, 356, 611, 627` |
| 17 | **Rolled, but no card arrived within 20 seconds** | nothing | **error**, then "No result." | the timeout in `Announcer.js` |
| 21 | **Answering an up-cast offer after it expired** | nothing — his "Y" is posted to chat as a message | **error**, then "Offer expired." Keep catching a bare Y or N for a short grace period after expiry so it never goes to chat. | `ActionExecutor` up-cast timer |
| 22 | **Initiative while a combat runs but he is not in it** | probably nothing — **not yet confirmed** | **error**, then "Not in this combat." | `executeInitiativeRoll` — check `game.combat.getCombatantByActor` first |

## 3. Fix the cause — a sound would be the wrong answer

Either nothing actually failed (the action worked and only the announcement was lost),
or the failure is something we should simply remove.

| # | Situation | What goes wrong | Proposed fix |
|---|---|---|---|
| 3 | **Two commands close together** | Only one result can be waiting, so the second cancels the first. Attack cards take 3–6 s, so `/punch` then `/per` loses the punch. Introduced in 0.13.2. | Let results queue. Tie each to its own roll by actor and item, and announce each one when its own card arrives. |
| 4 | **The up-cast offer outlives other commands** | `/6dis` → `/per` → `Y` within 30 s spends a 7th and casts Disintegrate. **The README, changelog and release notes wrongly say the next command replaces the offer.** | Cancel the offer on any other command, and correct the three documents. |
| 14 | **Two lines within 50 ms** | The second is dropped by the rate limiter in `TTSManager.speak`. A spell's result and its "cast" line can collide. | Drop only an *identical* line repeated within 50 ms. Never drop a different one. |
| 15 | **A navigation line right after a roll** | Speech interrupts by default, which cancels the queue, so the roll result never plays. | Separate priorities, as poker does: navigation may interrupt navigation; results are never cleared by it. |
| 16 | **Card posted under another account** (the GM or an automation acting for him) | The rule that stops him hearing *other players'* rolls also skips it. | Also accept a card whose **speaker** is his own actor, not only one he authored. |
| 18 | **Talking Actors fails** | If his actor has a voice set there, the line is handed over and counted as spoken. f1's console is currently showing Talking Actors' ElevenLabs connection errors. Nothing falls back. | Fall back to the browser voice whenever Talking Actors errors, and stop routing to it once it has failed this session. |
| 19 | **ElevenLabs fails** (bad key, quota, network) | Sent and never awaited; failure goes to the console only. | Await it, and on failure speak that same line with the browser voice. |
| 20 | **Long readouts cut off** (`/st`, `/list`) | **Now confirmed, not suspected:** poker's code documents Chrome's speech auto-pause after about 15 s. | Port poker's fix: split long text into sentences, and call `resume()` periodically. |
| 23 | **Blind GM rolls** | Not silent, but found in this audit: the result may be read out when he is not meant to know it. **Not yet confirmed.** | When the roll mode is blind, say "Rolled blind." and no number. |
| **24** | **The speech queue can stop working altogether** *(new)* | Quick Menu keeps its own queue and a `speaking` flag, and advances only when the browser fires `onend`. Poker found that Chrome fires `onend` unreliably — under load, after a cancel, or after the auto-pause — so the flag sticks on and nothing queued ever plays. Poker rewrote theirs for exactly this; ours has the old design. | Port poker's approach: hand every line straight to the browser's own queue, and do not depend on `onend`. |

---

## Suggested order

1. **Item 2** — PF1 refusals. The only case that tells him the opposite of the truth.
2. **The `error` earcon itself**, matched to poker. Everything in sections 1 and 2
   depends on it, and it is small.
3. **Items 1, 10, 5, 6** — the most common silent cases.
4. **Items 3, 4** — both my regressions from the last few releases. Item 4 also needs
   the documentation corrected.
5. **Items 24, 15, 14, 20** — the speech engine. Port poker's design rather than patch
   ours.
6. Everything else.

## Open questions

1. **One sound or two?** This proposal uses `error` for everything. One option is a
   gentler second sound for "that key does nothing here" (items 11 and 12), so it does
   not sound like something broke. That is one more sound to learn. Recommend starting
   with one and adding the second only if he finds the single buzz too harsh for those
   two cases.
2. **Should success ever beep?** Poker has `ack` (one high blip). Most successful
   commands already produce a spoken result or a roll, so this would only matter for
   the few silent successes — equip and unequip, for instance. Not proposed now.
3. **Item 23** needs testing before any change: does his client actually receive the
   total of a blind roll?
4. **Item 22** needs testing: does initiative produce no card when he is outside the
   combat?
