# 0.19.0 test findings (collected, not yet fixed)

0.19.0 is frozen (commit `5d251c8`) until Josh's "done with 0.19.0" email. Everything
below is filed for the next build. Numbers (1.2, 10.16, ...) are Josh's test-plan
numbers; his session logs and raw logger data use the same numbers.

Source: Josh's email "0.19 phase 1 testing", 2026-11-03 00:06 Central, with
`Raw data for phase 1 report, 2026-11-02.zip` attached (ten rounds on f2,
Sparkbang, 2026-11-02; plus the 0.18.0 logs from Ser on f1, 2026-11-01).

## Decisions Josh wants from Tobias (not from the code side)

| # | Question | Where the code stands |
|---|----------|-----------------------|
| 1.2 | Must a skill/save/check command be identical on every character? | **Our email promised yes, the code does not deliver it.** `CommandTiers.js` makes core codes with `generateAbbreviation(item.label)`, not from the system key, and its header comment claims otherwise. A renamed or custom skill, or a different Knowledge, can get a different code. |
| 3.6 | How to speak a range/duration the book gives as "see text"? Options: a linked buff's real duration, "see description", or omit. | `SpellDetail.js` passes unknown units through verbatim, so PF1's `seeText` is spoken as "seetext" (Utility Shot range, Potion of True Strike duration). |
| 8.36 | Should Tobias's custom consumables (Green cha, Phase Spider Jerky, Whack Juice, Whisper Courage Whiskey, Soothe, Deer Shit) switch their effects on like buff potions? Josh is reading the Auto Buff module first. | `BuffOn.js buffNameFor` matches only Potion/Elixir/Oil/Draught "of X" and switches on one buff. Green cha would need two (grease + light). |
| 8.38 | House rule: a Wisdom boost raises a gunslinger's current grit as well as the cap. Automatic or by hand? | Sheet matter. Owl's Wisdom took Grit max 3 to 5, value stayed 2. Not a Quick Menu bug. |
| 10.11 | One rule for who a consumable is for: plain use = me (apply + speak); one trailing word in chat (`/pclw roll`) or a Slash entry in the menu = roll in chat for someone else, apply nothing. Cover wands and custom consumables; never assume "me" for oils/alchemist's fire; always post a card. | Today buff potions apply to the user, healing potions only roll (three CLW, a CMW and a CSW moved HP not at all). The trailing word is Tobias's to pick. |
| 10.12 | Play the accept blip for every roll, not just attacks/spells/items. | `ActionExecutor.js` plays the ack earcon only for the types in `ACKNOWLEDGED`. Add skill, save, ability, initiative, concentration, caster_level, stabilize. |
| 10.16 | Replace "Card posted." with the item's name; order = name and what happened, then range/duration (when the detail level gives them), count last. "Grit. 2 of 3 left." / "Mage Armor cast." / "Shield on." or "Potion of Shield used." when the buff did not switch on / "Wand of Cure Light Wounds, no charges." / "Perception, no result." (try in play first). Skill/save cards arrive in <200 ms, so "no result" need not wait 20 s. | `TTSManager.announceAttackResult` speaks "Card posted." when `quietIfNone` and no total; `spellDetailLine` rides on it; buff line (`switchBuffOn`) and count (`_useItem`) are separate later lines. Josh suggests speaking the use line when PF1's `use()` resolves rather than waiting for the card, and checking whether PF1's roll promise resolves after the card is made. |
| 10.18 | Later: per-player on/off for blips by group (skills/saves/checks, attacks, spells, items). All on by default. | Not started. Only after 10.12 is in and proven. |
| 10.21 | Give potions, wands and scrolls spell-style codes: p/w/s prefix, one-word name = first four letters, longer = initials. `/pdisp`, `/pshie`, `/pcmw`. One announced changeover between games. | `AbbreviationGenerator.spellAbbreviation` already does the four-letter form behind `isLevelledSpell`; consumables use initials-with-extend, so a one-word potion gets one letter (`/pd`, `/ps`, Potion of Spiders came out `/psp`). Remembered codes would have to be rewritten once, each move announced. |

## Bugs confirmed on 0.19.0

### Still there from 0.18.0

- **6.1 Empty stack counts as one.** `CharacterDataExtractor.js` reads `quantity || 1` (lines ~447 and ~525). Potion of Displacement at quantity 0 shows 1; `mergeStacks` adds the phantom. Fix: `quantity ?? 1`, treat 0 as 0.
- **6.2 Landing on a potion in the menu speaks no count.** "2. Potion of Bear's Endurance", nothing else.
- **6.8 "Card posted."** before "Regained. 1 of 3.", before "That was the last one.", and before every buff potion's line (carrying range and duration ahead of "Shield on."). Fix is 10.16.

### New in 0.19.0

- **1.9 `/fqm reset` does not restore pre-alias codes.** Root cause confirmed in `CommandTiers.assignCodes` line ~118: `assigned` records the code of every tier 2/3 item that ended up in `reverse`, including items placed by an alias (step A) and items displaced by one. After `/fqm rename pd ps`, Displacement's remembered code becomes `ps` and Shield's `psh`; `clearAliases` does rebuild (`AbbreviationResolver.js` ~181) but step C restores those remembered codes, so nothing moves back and nothing is spoken. Fix: never write an alias's code (or a code displaced by an alias) into `assigned`; keep each item's generated code as the remembered one; on reset, rebuild and speak whatever moves.
- **3.6 "seetext"** (see table). Also "Duration caster level minutes" wording for a minute/level.
- **3.7 Emergency Worms' result lives in its effect notes** ("22 vs CMD" inline roll) and is never spoken; `extractRollTotals` does not look in notes, so the card falls to `quietIfNone` + "Plus notes". Fix: read inline roll results in effect notes when the card has no other total.
- **4.3 First potion of the session speaks its count 4 s late.** `_useItem` awaits `switchBuffOn`, which awaits `pack.getIndex()` on every Item pack before the count is read; the first time the indexes load. Fix: speak the count first, or skip the buff search for a healing action.
- **8.37 Entering an empty Items category (Equipment) says nothing.** ArrowRight logged no speech; eleven presses silent; only ArrowDown then said "Empty. Left to go back." The "..., empty." guard in `QuickMenuManager` does not run on the Items-category path. Expected: say it's empty and stay put.

### Correction from Josh (6.11)

A Chrome `end` with no `start` does not prove silence: a line ended in 0 ms with no start and Josh heard it. Only "Josh didn't hear it" counts as a lost line now. The 0.18.0 "probably skipped" Acrobatics 22 / Knowledge (Geography) 13 are unproven.

## What works on 0.19.0 (phase 1)

- Code rule: Sparkbang's 70 commands held across first load and a tab reload; only Perception moved, back from `/perce` to `/per` as intended. Ten clashing test items extended (`/pera`), spoken once and whispered, moved nothing; delete/re-add returned the old code; two clashing items added together got the same codes both times. All built-in commands (`/st /hp /ac /cmd /cond /bf /bfo /sr /list /find /scan`) correct; `/find` matches inside words.
- Rolls: 57 chat commands spoke; 47 skills/saves/checks/Stabilize said exactly the card total. Natural 20 line correct ("natural 20, hits, threat, confirms 43, 21 damage, 77 on a crit."). "Regained. 1 of 3." right. Utility Shot no longer says "That was the last one." `/pod` spends none of Pair O Deez's 6/7 uses.
- Buff potions: Shield used the sheet's buff; Invisibility fetched from PF1 packs, True Strike from ckl-roll-bonuses; every buff really took effect on the sheet (Haste, Fly, Shield, Bear's Endurance, Owl's Wisdom, Invisibility, True Strike auto-off). Expeditious Retreat correctly did not stack on Haste.
- Menu sounds: blip 1200 Hz, errors 2x400 Hz, falling close tone. Timing from 33 keys: 4-18 ms key-to-speech when idle, 150-200 ms when cutting a playing line, ~505 ms after a digit (two-digit wait). None of 7 cut-offs landed early.
- Voice: no death, no early cancel in any round. 0.18.0 on Ser: 538 lines all started, 216 nav cancels none early, Option stopped only the current line.

## Not yet tested (phase 2)

0.18.0 leftovers: containers (Liar's Dice Set "Empty"), last favorite, failed command text left in chat box, `/d` and `/h` silent, "threat" on an always-hit spell (Magic Missile), the one remaining `noteReset` cancel on an unstarted line, fast arrowing. By ear: F9 on a MacBook, detail levels, type-ahead, Shift jobs, Slash on skills/attacks. Olbryn on f1 (Iron Gods). Normal Pair O Deez full-attack retest (8.6).

Waiting on a world: Ser's Shackles tests on a 0.19.0 server (f1 now runs Iron Gods).
Waiting on Tobias: bullets for Sparkbang (8.8), Maura's Wayfinder use (8.34), 150 ms gap, wand stacks (total charges, emptier wand first), Signature Deed, TWF -4 single shot, Haste shot in the full attack, Pair O Deez 6/7 uses, shop from weightless coins.
Waiting on Josh's OK: idle test, voice-down alarm live.
