# Quick Menu: Help System + Navigation Efficiency Proposal (2026-08-27)

Grounded in a full code audit (line refs below are real). Governing rule
(Tobias): **the audio channel is contended** — Josh hears 5-6 humans on
Discord over the TTS; every spoken syllable is budget. Second rule:
**minimum keystrokes; 3 letters preferred.**

## A. The three worst findings (fix before anything else)

1. **Interrupt is broken on non-browser voices.** TTSManager.stop() only
   cancels speechSynthesis; ElevenLabs plays via a detached `new Audio()`
   with no handle and Talking Actors is fire-and-forget (TTSManager.js
   151, 210-212, 267-273). With those providers, rapid arrow-keys STACK
   OVERLAPPING AUDIO — the exact opposite of a contended-channel design.
   Worse, menu navigation fires a **full ElevenLabs HTTPS POST per arrow
   key** (165-201): network round trip before any sound, uncancellable.
   **Fix:** menu/system speech ALWAYS uses the local browser voice
   (instant, cancellable); ElevenLabs/Talking Actors reserved for
   character flavor (spell announcements by Olbryn etc.), each played
   through a retained, killable Audio handle.

2. **The 50 ms guard drops speech instead of deferring** (TTSManager.js
   99-106): two fast arrow presses = cursor moved but second item never
   spoken — silent cursor/speech desync. **Fix:** trailing-edge debounce
   — intermediate names drop, the FINAL resting position always speaks.

3. **Digit entry can execute the wrong action** (QuickMenuManager.js
   373-428 + KeyboardHandler.js 309-328): digits are treated as a path;
   in a flat list the first digit executes immediately — typing "27" for
   Perception ROLLS APPRAISE and closes the menu. Also every number key
   waits a hardcoded 500 ms. **Fix:** proper numeric entry — digits
   accumulate visually+silently, `Enter` (or 400 ms idle when
   unambiguous) commits; two digits reach items >9; never auto-execute
   on the first digit of a possible two-digit number.

## B. Help system (new)

- **`/h` — the "what do I type?" command** (2 letters; help is
  high-frequency while learning).
  - `/h haste` → "3 h a s t" (alias for a name, spelled)
  - `/h per` → "p e r. Perception." (name for an alias)
  - `/h` → one-breath orientation: "62 commands. Say slash h and a name.
    Saves f o r, r e f, w i l."
- **Did-you-mean on unknown commands.** Today `/xyz` silently passes to
  Foundry, whose error is VISUAL ONLY (ChatCommandInterceptor.js
  147-148) — Josh gets nothing. Fix: nearest-match against the resolver
  (list is already in memory, AbbreviationResolver.js 194-201):
  → "No. p e r, Perception?" — five syllables, question intonation.
- **In-menu `H` key** on any item speaks its chat alias: "p e r." So the
  menu doubles as alias discovery. (In-menu help today: literally none.)
- **`?` in menu** speaks the key map in one breath, expandable by
  pressing `?` again (tiered verbosity).
- **Bind the orphaned read-whole-menu function** (announceMenuContents,
  QuickMenuManager.js 982-987, exists but no key) to `L` — "list all".

## C. Navigation efficiency

Keystrokes to roll Perception via Skills today: **30** (or 12 with
PageDown). Every submenu resets the cursor to 0; menu always opens at
root. Fixes, in impact order:

1. **Type-ahead letter jump** — press `p` repeatedly cycles P-items
   (screen-reader listbox behavior). The BLIND_PLAYER_GUIDE.txt ALREADY
   ADVERTISES THIS (lines 24, 47) — it was never built. Command letters
   (F/P/U/R) move to Shift+letter to free the alphabet.
   Perception: ` s p p Enter ≈ **5 keystrokes**.
2. **Wrap-around** at list ends + boundary earcon (see D3).
3. **Numeric entry fixed** (A3) — two-digit reach, no dwell for
   unambiguous single digits in short lists.
4. **Category hotkeys from closed state** via the never-used
   game.keybindings: e.g. Alt+S = open directly in Skills, Alt+V =
   Saves, Alt+C = Combat. One chord replaces open+navigate+enter.
5. **Reopen where you left off** (setting, default on): menu remembers
   last category+position; ` ` twice returns to root.
6. **`.` = repeat last action** ("again"): re-rolls the last thing
   executed from menu OR chat command. Costs 2 keystrokes total.
7. **Favorites**: fix the type guard that blocks PF2e items and silent
   unfavorite failures (QuickMenuManager.js 564, 631-645); `Shift+Up/
   Down` reorders; favorites announce position-free ("Perception" not
   "1. Perception" — it's a short list Josh curated himself).

## D. Speech pipeline (the contended-channel work)

1. **Name-first, terse-by-default.** Announcement becomes just
   "Perception" — not "27. Perception" (payload first; the number is
   noise Josh never asked for). `I` key speaks details on demand:
   "plus 12. 27 of 37." Metadata (modifier/quantity/prepared count) is
   ALREADY extracted but never spoken (CharacterDataExtractor.js 85,
   255, 360) — it goes behind `I`, not into every announcement.
2. **Knowledge-skill cleanup actually applied** — cleanupSkillName
   exists but runs only on dead code paths (TTSManager.js 316-343):
   "Knowledge Arcana" → "K Arcana" on the live path.
3. **Earcons replace words** where a sound is faster than speech: the
   module SHIPS four never-referenced audio cue mp3s (audio/, referenced
   only by the stale guide). 80-120 ms cues: tick = moved, thud = list
   end, rising = entered submenu, falling = back. A tick is cheaper than
   any syllable — this is the purest expression of the audio-budget
   rule.
4. **Spoken-cost table:** every new/changed string ships with its
   syllable count in the PR description; nothing over ~8 syllables on
   the navigation hot path, ~15 for results, orientation strings exempt
   but tiered.

## E. Performance (felt latency per keystroke)

Per arrow key today: double render (QuickMenuManager.js 160-161 + 973),
full innerHTML rebuild of the whole list (1089-1106), canvas token scan
in positionUI (1008-1013), two forced layouts in scrollToSelectedItem
(1115-1143), settings reads ×6+ incl. debugLog's per-call
game.settings.get (module.js 290-294), and possibly an ElevenLabs POST.
Fixes: single render per event; incremental DOM (move a `selected`
class, rebuild only on list change); cache anchor position per open;
cache extractor results per menu-open (every submenu entry currently
re-extracts from the actor — CharacterDataExtractor calls at 249-256,
284, 312); cache settings in memory (invalidate onChange); throttle the
wheel handler; instant (non-smooth) scroll.

## F. Bug list discovered by the audit (fix as part of the above)

- ElevenLabs/TA audio stacking + per-move network POST (A1)
- 50 ms drop-guard desync (A2)
- Digit-path misfire executes wrong action (A3)
- PF2e items unfavoritable; unfavorite fails silently (C7)
- PF2e potion = 3 levels deep (flatten: consume is the default Enter
  action on a consumable; submenu only via `/`)
- BLIND_PLAYER_GUIDE.txt advertises type-ahead, Ctrl+R/Ctrl+F chords,
  X-to-unfavorite, and audio cues that don't exist — docs rewritten to
  match reality as each feature lands (guide is the spec, code catches
  up).

## G. Build order (each its own release, Josh re-tests)

1. **Speech pipeline**: browser-voice-only nav + interrupt fix +
   trailing debounce + name-first terse strings + K-skill cleanup (A1,
   A2, D1, D2) — biggest felt improvement, no relearning.
2. **Help**: /h + did-you-mean + in-menu H/?/L (B).
3. **Navigation**: type-ahead, wrap, numeric fix, earcons (C1-3, D3).
4. **Flow**: category hotkeys, reopen-position, repeat-last, favorites
   fixes/reorder (C4-7).
5. **Performance pass** (E) — mostly invisible, do throughout.
Then the Josh-feedback batch-1 items (3-letter saves etc.) ride release
1 since they touch the same files.
