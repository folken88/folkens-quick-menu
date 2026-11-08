# 0.19.0 test findings (collected, not yet fixed)

0.19.0 is frozen (commit `5d251c8`) until Josh's "done with 0.19.0" email. Everything
below is filed for the next build. Numbers (1.2, 10.16, ...) are Josh's test-plan
numbers; his session logs and raw logger data use the same numbers.

Sources:
- Phase 1: Josh's email "0.19 phase 1 testing", 2026-11-03 00:06 Central, with
  `Raw data for phase 1 report, 2026-11-02.zip` (ten rounds on f2, Sparkbang,
  2026-11-02; plus the 0.18.0 logs from Ser on f1, 2026-11-01).
- Phase 2: Josh's email "0.19 phase 2 testing", 2026-11-07 13:52 Central, with
  `Raw data for phase 2 report, 2026-11-07.zip` (rounds 11-22: Ser on f1 in
  Shackles 11-03 and 11-05; Sparkbang on f2 in Goblin Deez and Olbryn on f1 in
  Iron Gods 11-07). Phase 2 closed every reachable item left from earlier
  versions. The new 0.19.0 features are still under test, so the freeze holds.

Tobias ruled on the phase 1 decisions on 2026-11-04 (reply drafted, not yet sent);
his rulings are noted in the table. Phase 2 decisions are still with him.

## Decisions Josh wants from Tobias (not from the code side)

### From phase 1 (ruled 2026-11-04 unless marked open)

| # | Question | Where the code stands | Ruling |
|---|----------|-----------------------|--------|
| 1.2 | Must a skill/save/check command be identical on every character? | `CommandTiers.js` makes core codes with `generateAbbreviation(item.label)`, not from the system key, and its header comment claims otherwise. A renamed or custom skill, or a different Knowledge, can get a different code. | **Yes.** Fixed keys, identical everywhere, so anyone can guess on a new character. |
| 3.6 | How to speak a range/duration the book gives as "see text"? | `SpellDetail.js` passes unknown units through verbatim, so PF1's `seeText` is spoken as "seetext". | Linked buff's real duration when there is one, else "see description". |
| 8.36 | Should Tobias's custom consumables switch their effects on like buff potions? | `BuffOn.js buffNameFor` matches only Potion/Elixir/Oil/Draught "of X" and switches on one buff. | **Yes**, when the character has the buff; the item names it by a link. Phase 2 widens this question, see below. |
| 8.38 | House rule: a Wisdom boost raises a gunslinger's current grit as well as the cap. | Sheet matter; Owl's Wisdom took Grit max 3 to 5, value stayed 2. | **Yes**, instantly, like anything else that rides on a stat. |
| 10.11 | One rule for who a consumable is for. | Buff potions apply to the user, healing potions only roll. | No extra word = Josh, apply and speak. `o` or `other` = card to chat only, apply nothing, Josh says aloud who gets it. |
| 10.12 | Play the accept blip for every roll. | `ActionExecutor.js` plays the ack earcon only for the types in `ACKNOWLEDGED`. | **Yes**: a blip whenever nothing else confirms; every command ends in confirmation or failure. |
| 10.16 | Replace "Card posted." with the item's name; order = name, result, range/duration, count. | `TTSManager.announceAttackResult` speaks "Card posted." when `quietIfNone` and no total. | **Yes**, if it makes sense to Josh. |
| 10.18 | Per-player on/off for blips by group. | Not started. | Later: a sounds sub-panel in the Quick Menu settings, all on/off plus per-group and per-sound toggles. After 10.12. |
| 10.21 | Spell-style codes for potions, wands and scrolls (p/w/s prefix). | `AbbreviationGenerator.spellAbbreviation` already does the four-letter form behind `isLevelledSpell`; consumables use initials-with-extend. | Whatever is most consistent for Josh; one announced changeover. |

### From phase 2 (open, 2026-11-07)

| # | Question | Where the code stands |
|---|----------|-----------------------|
| 1.2 again | A leftover alias beats the fixed core. Ser kept `/int2` for Intimidate (an old clash alias from when Intimidate and the Int check collided) while Sparkbang had `/itm`; `/fqm reset` fixed it. Josh asks that the fixed core cannot be overridden by an alias, or that old clash aliases are cleared when the core takes over. | `CommandTiers.assignCodes` step A places aliases before the core tier (Ser's aliases flag held `stat_int: int`, `skill_int: int2`). Follows from the 1.2 ruling: core codes win. |
| 2.6 | Should Shift+P / Shift+U (prepare/unprepare) do anything on a spontaneous caster? On Olbryn they really changed Magic Missile's data ("Magic Missile unprepared", "1 prepared"). Possible cheat; untested whether it blocks or adds casts. Josh's Claude suggests "Olbryn casts spontaneously" and no change. | The Shift jobs act on any spellbook. Decide before that code is touched. |
| 8.8 | Confirm yes/no: Sparkbang has no bullets because Goblin Deez was a loose one-shot, and in a full campaign a gun spends ammunition and Josh tracks it (as Ser's bow does with `/arro`). Pair O Deez's attack is set to spend none and there is no ammunition item. | The Quick Menu only makes an ammo read command when an ammunition item exists. Also waiting since 11-01. |
| 8.32 | Scorching Ray: Olbryn gets 5 rays (extra attacks = CL/4 rounded up). Book says 3 max (1, +1 at 7th, +1 at 11th). Is 5 the ruling? | Sheet data. Waiting since 10-09. |
| 8.33 | Olbryn's 0-level spell-likes: which are at will, which per day? Dancing Lights and Detect Magic are 1/1 per day and never count down (round 20 confirmed). Twin Message and Storm Sight are 0 of 0, maybe uncastable. | Sheet data. Waiting since 10-09. |
| 8.34 | Maura's Wayfinder: tell Josh when its use is built so it gets a command. | Not built. |
| 8.35 | Rolls that live in a card's notes (Spell Prism d20: on a 20 the slot comes back). Josh wants "Spell Prism, slot back." Also asks whether the Optimus Prime nat-20 voice and the nat-1 sound are triggered server-side, and whether they'd fire for the Prism's d20. | `extractRollTotals` does not read effect notes (same root as 3.7, 8.30, 8.31). The nat-20/nat-1 sounds are not Quick Menu code. |
| 8.36 wider | Do buff spells switch on when cast, like buff potions? Nine of Olbryn's spells carry Auto Buff links (Haste, Shield, Invisibility, Greater Invisibility, See Invisibility, Displacement, True Seeing, Overland Flight, Grease). Round 21: casting Haste switched its buff on, but the Quick Menu said only "Card posted. Range close." and the duration. False Life has no link, no buff, and is built as healing, so it gives no temp HP. Josh asks: should every buff spell and custom consumable be linked the same way, with the Quick Menu announcing the switch-on, and `/bf` staying a status check? And: are they reading Auto Buff 1.3.0 right (a buff linked on an item's action switches on whenever the item is used; 73 Shackles items use it)? Greenchaw (real one from the compendium, now on Ser) would need Grease and Light buffs on her sheet. | Buff-on announce exists only for potions (`switchBuffOn` in `_useItem`); nothing listens for Auto Buff's own switch-on from a spell cast. |
| 8.39 | Ser's Magic Missile scroll stack has 1 of 10 HP, so PF1 treats it as broken and takes 2 off every missile (1d4+1-2; zero-damage casts said only "hits"). Real damage or not? | Tobias said 11-04: not intentional, durability is unused, cause unknown (suspect the hardness migration). Josh may restore to full. Scrolls live in Shackles on f1, which currently runs Iron Gods. |
| 8.41 | Greenchaw's card shows 23 untyped damage and a Fort DC 14 save; its description says light and lubrication for 1d6 minutes (Grease + Light). Looks copied from another item. Is that intended? | Compendium data, not Quick Menu code. The Quick Menu will read out whatever the action carries. |
| Data audit | Behind 8.41, 8.32, 8.33, 8.39 and 8.43: are the items' data, notes and descriptions right, or are there copy-over mistakes (e.g. a +1 item made into a +2)? Josh's Claude is checking item by item and wants to know they read attributes the way Tobias built them. | Compendium hygiene question for Tobias. |
| 10.2 | Lower the 150 ms gap the speech queue waits between lines, in steps: 100, test; 50, test; 20, test. Fixed in code, not a setting (a setting could kill the voice). Each step a build after 0.19.0. Measured: idle key-to-speech median 10 ms; interrupting key 153-157 ms, nearly all the 150 gap; the 0.18.0 "+20 ms" adds nothing audible. | `SpeechQueue.js` gap constant. Waiting since 11-01. |
| 10.24 | Drop the item numbers in the menu ("27. Perception") now that type-ahead works (P, then P-E-R reaches Perception)? Or make numbers a per-player option. Dropping them also drops the ~505 ms wait after a digit. | Numbers are spoken by `announceCurrentSelection`; the two-digit wait is in `KeyboardHandler`. Blind-UI call, so Josh's preference carries weight; Tobias decides whether sighted players need numbers. |

**Rulings 2026-11-07 (Tobias, same day):** 1.2 core codes win; clear leftover
clash aliases when the core takes over. 2.6 hide the prepare/unprepare keys on an
actor with no prepared spellbook (functions that don't apply to the caster type
don't exist for them). 8.8 correct, no ammo tracking in one-shots; Sparkbang may
return, so his sheet matters. 8.32 normal PF1 ray count unless metamagic; the 5 is
a sheet error. 8.33 0-level spells never expend; the 1/1 and 0/0 spell-likes are
data bugs, refresh from the PF1 compendium. 8.34 Tobias will look up the item.
8.36 Auto Buff links are hand-made and sometimes break, so never assume one; rule:
if the blind player needs to know it, the Quick Menu says it, so announce a buff
spell's switch-on like a potion's, `/bf` stays a status check. 8.39 restore the
scrolls. 8.41 Greenchaw's copy is bugged; compendiums need a mass cleanup, keep
reporting. 10.2 lower the gap however Josh wants, in steps. 10.24 Josh decides;
drop the numbers if he thinks they can go. 8.7 disable advanced-macros in Iron
Gods (oversight; not needed with the Quick Menu). f2 stays on Lastwall; Goblin
Deez is finished and nothing from it carries forward.

## Bugs confirmed on 0.19.0

Each one checked against the 0.19.0 source on 2026-11-07; the code note is ours.

### Still there from 0.18.0 or earlier

- **2.12 Doubled keydowns still get past the guard.** Rounds 13-14: of 57 Slash presses, 8 arrived doubled within 15 ms (4 with different timestamps); round 13 logged 13 doubles on Backquote, Backslash, NumpadSubtract, Equal, Escape, Tab and Slash. Code: `MenuKeys.isDuplicateKeydown` already uses a 10 ms window on `timeStamp` (`DUPLICATE_WINDOW_MS`), not exact matching as Josh believed, so doubles 10-15 ms apart pass. Fix: widen the window (Josh suggests ~10 ms, data says 15), and check the `_lastConsumed` bookkeeping covers keys the chat box path consumes.
- **6.1 Empty stack counts as one.** Now on Ser too: empty CLW stack makes `/pclw` read 2 when she has 1; `/pcmw` offered at quantity 1 with none. The use itself is right ("That was the last one."). `CharacterDataExtractor.js` `quantity || 1`. Fix: `quantity ?? 1`, 0 stays 0.
- **6.2 Landing on a potion in the menu speaks no count.**
- **6.3 Container opens to "Empty" when it isn't.** Liar's Dice Set (die + dice cup) said "Empty. Left to go back." six times. `_containerEntries` keeps only ammo, consumables and items with an action. Suggest listing everything inside, read-only, with quantities. Chat side: `/lds` logs "ActionExecutor: unknown action type: submenu" with the error tones, because a container resolves to a submenu action and the executor has no case for it from chat. What a container should do from chat is a design question Josh will raise later.
- **6.5 Removing the last favorite does nothing and says nothing** (worse than 0.18.0, which said "removed" and left it). Ten Shift+R on Ser's only favorite, Perception: silent. Slash on it also dead, though Slash on Perception in Skills offers Take 10/20. Code: `QuickMenuManager.unfavoriteCurrentItem` returns silently unless `selectedItem.type === 'action'`; the stored favorite is `{type: skill, id: per}` with no `skillKey`, so the match fails. Fix: build favorites entries the same way as Skills entries; never return in silence.
- **6.7 `/d` and `/h` never reach the Quick Menu.** PF1's `handleChatInput` is first on `Hooks.events.chatMessage` and returns false for `/d` and `/h`, which stops the chain; `ChatCommandInterceptor` is fourth and never sees them. `/r` works. Fix: catch PF1's own Damage/Healing cards in `createChatMessage` (player's own, flavor or content starting Damage/Healing, read `rolls[0].total`), or register ahead of PF1's hook.
- **6.8 "Card posted."** before counts and buff lines. Fix is 10.16.
- **6.9 Natural 20 on an always-hit spell says "threat".** Ser's Scroll of Magic Missile: "natural 20, hits, threat, 3 damage." three times in round 11. Code: `RollTotals.renderAttackTotals` pushes `threat` whenever the flag is set; `toHit` already knows attack >= 100 is PF1's always-hit. Fix: no "threat" (and no confirm) when attack >= 100.
- **6.10 The watchdog's last risky cancel, seen live.** Round 18, voice already dead: `SpeechQueue.noteReset` cancelled "No command.", a line Chrome never started; logger marked DANGER. Harmless there, but that cancel is the pattern that kills a live voice. Fix: never cancel a line that never started. Also: the voice-down alarm fires on the stuck shape, but not when a dead Chrome ends each line at once without starting it.
- **8.7 Advanced Macros error in Iron Gods only.** Every slash command logs "Error thrown in hooked function for hook chatMessage. chatLog._processMacroCommand is not a function" from advanced-macros 2.3.0. Commands still work. Not a Quick Menu bug: that world's module list (f1 serves Shackles and Iron Gods from the same modules folder, so the world enables it and the others don't). Tobias's call whether to disable or update it there.
- **8.28 Detect Magic listed twice in the cantrip menu** (sorcerer spells + spell-likes). `getSpellsForLevel` lists every spell item of that level regardless of spellbook. Suggest "Detect Magic, spell-like" or grouping spell-likes apart.
- **8.30 / 8.31 Mirror Image's count and spell penetration never spoken.** Both are on the card in effect notes ("8 Images", "Greater Spell Penetration Check 36"); the Quick Menu says only "Plus notes". Same root as 3.7 and 8.35: read effect notes, at least at full detail.

### New in 0.19.0

- **1.9 / 1.15 `/fqm reset` neither restores pre-alias codes nor says what moved.** Clearing Ser's aliases moved Intimidate `/int2` to `/itm` in silence; the never-spoken whisper said "Type /scan to rebuild." though the list had rebuilt. Round 14 rerun: `/fqm rename sk skn` spoke both lines; `/fqm reset` said only "All aliases cleared." and Knock stayed `/skn`, `/sk` gone (phase 1's 1.9 on a second character). Root cause (phase 1): `CommandTiers.assignCodes` writes alias-placed and alias-displaced codes into `assigned`, so step C restores them. Fix: never remember an alias's code; on reset, rebuild and speak each code that moved; drop the `/scan` advice when nothing needs it.
- **2.17 Left at the top level closes the menu in silence.** Three times in round 13; next keys went to the chat box. Code: `QuickMenuManager.navigateBack` calls `closeMenu()` when `menuStack` is empty, and `closeMenu` only announces with `announce: true`. Josh's preference: Left never closes the menu; only Escape does.
- **3.6 "seetext"**, also "Duration caster level minutes" wording.
- **3.7 Emergency Worms' result lives in its effect notes** and is never spoken.
- **4.3 First potion of the session speaks its count 4 s late** (`switchBuffOn` awaits every Item pack's `getIndex()` before the count).
- **7.5 Numpad minus does not lower the volume.** The `ttsQuieterKey` setting holds one code, `Minus` (`KeyboardHandler.js` ~240); `NumpadSubtract` is ignored. Four presses, nothing.
- **8.37 Entering an empty Items category says nothing.** Cause found: Right on an Items category goes to `QuickMenuManager.enterItemCategory`, which has no empty-list check; `enterSubmenu` (top-level categories) has one, which is why Spells says "Spells, empty." and Equipment is silent. Fix: same check there.
- **8.40 `/scan` moves a code without saying so, and identifying an item does not refresh its command.** Greenchaw arrived unidentified as "glowing green paste" (`/ggp`); after identification the list kept `/ggp` until a manual `/scan` renamed it to `/gree` and said only "Scan complete. 80 commands ready." Fix: rebuild on an item's name change; speak each code that moved (with 1.15).
- **8.42 A spell with no save is read with "Save DC".** Acid Splash: "33 to hit, 2 damage. Save DC 20."; Magic Missile "17 damage. Save DC 21." PF1 puts the caster's spell DC on every spell card as `message.system.save = {dc}` with no type. Code: `RollTotals.saveOf` returns `type: ''` and `saveName('')` gives "Save", so `renderAttackTotals` speaks it. Fix: speak a DC only when `save.type` is set. Lightning Bolt ("Ref DC 23") is right.
- **8.43 False Life is read as healing** ("11 healing."). Its action is built as a heal with positive energy, so the Quick Menu calls it healing; nothing is applied. Fix: say temporary hit points for a spell that grants them; applying them is 8.36.

### Correction from Josh (6.11)

A Chrome `end` with no `start` does not prove silence: a line ended in 0 ms with no start and Josh heard it. Only "Josh didn't hear it" counts as a lost line now. The 0.18.0 "probably skipped" Acrobatics 22 / Knowledge (Geography) 13 are unproven.

## What works on 0.19.0

### Phase 1 (Sparkbang, f2)

- Code rule: Sparkbang's 70 commands held across first load and a tab reload; only Perception moved, back from `/perce` to `/per` as intended. Ten clashing test items extended (`/pera`), spoken once and whispered, moved nothing; delete/re-add returned the old code; two clashing items added together got the same codes both times. All built-in commands (`/st /hp /ac /cmd /cond /bf /bfo /sr /list /find /scan`) correct; `/find` matches inside words.
- Rolls: 57 chat commands spoke; 47 skills/saves/checks/Stabilize said exactly the card total. Natural 20 line correct. "Regained. 1 of 3." right. Utility Shot no longer says "That was the last one." `/pod` spends none of Pair O Deez's 6/7 uses.
- Buff potions: Shield used the sheet's buff; Invisibility fetched from PF1 packs, True Strike from ckl-roll-bonuses; every buff really took effect on the sheet. Expeditious Retreat correctly did not stack on Haste.
- Menu sounds: blip 1200 Hz, errors 2x400 Hz, falling close tone. 4-18 ms key-to-speech when idle, 150-200 ms when cutting a playing line, ~505 ms after a digit. None of 7 cut-offs landed early.
- Voice: no death, no early cancel in any round.

### Phase 2 (Ser f1, Sparkbang f2, Olbryn f1)

- **1.13** Pair O Deez's uses stayed 6 of 7 across two single shots, two full attacks and two `/pod`, so nothing the Quick Menu does spends one. What spent one on 10-31 is still Tobias's question.
- **2.10, 2.11, 2.15** Menu by keys (Ser, round 13): Backspace, Page Up/Down, numbers, backtick, Escape all right; menu survives Cmd+Tab away and back; three quick Enters use a skill once.
- **7.2, 7.3** Voice after 2 and 5 minutes idle and on a reopened Chrome: first line started at once. With the voice deliberately killed, the voice-down alarm played 17 s after the command and every 20 s after.
- **7.5, 7.7** Results follow the volume keys; no sound covered a number.
- **7.6** Results wait their turn: `/cmb`, `/ini`, `/ki` each heard in order (closes phase 1's open item).
- **8.2** Empty top-level category: Spells on Ser says "Spells, empty." and stays put.
- **8.6** Single Pair O Deez shot (the 10-31 failure case): Slash offers Normal and Full Attack; Normal rolls one shot, read once. Still carries the TWF -4 (Tobias's open sheet question).
- **8.9, 8.11, 8.19, 8.22, 8.23, 8.25, 8.26** Olbryn (round 20): nine consumables that never had a command now each have one and say their result with counts matching the sheet; typed up-casts work (`/6cl7` casts from a 7th slot and says so; `/6cl6`, `/6cl8`, `/6cl9` refused with tones and a reason, spending nothing); `/0as1` refused with "Cantrips do not use slots."; `/sr` gives spell-like uses and "Spell-likes, none." for an empty level; `/clc` and `/conc` log no warning; a scroll says its real quantity; Ctrl/Option/Cmd pass through the open menu.
- **8.10, 8.13-8.17** By ear (round 21): blip before a chat spell's and a wand's result; wand says healing and charges ("33 of 50 left."); Lightning Bolt gives damage then "Ref DC 23"; commands typed during a long report wait their turn and cut nothing; Rod of Metamagic Quicken and Guards of the Silent People say daily uses down to "That was the last one."
- **8.12, 8.18, 8.21, 8.24** Up-cast offer (round 22, 3rd-level slots emptied): "Out of 3rd. Cast Lightning Bolt with a 4th?"; Y casts from a 4th and says so; N says "Cancelled." and spends nothing; Y after 30 s says "Offer expired."; another command during the offer says "Offer withdrawn."; an offer during a long report waits its turn; a wand's last charge says "That was the last one."; with PF1's quick-roll template on, an area wand answers at once with no template left waiting.
- **Timing (7.8, for 10.2):** 419 menu key presses in rounds 11-22. Idle (263): line start a median of 10 ms after keydown, 90% within 271 ms (slow ones are number keys waiting ~505 ms for a second digit). Cutting a playing line (156): 153-157 ms, median 154, one at 654. No early cancel in any round except round 18's deliberate kill.

## Not yet tested

- Waiting on Tobias: Scorching Ray's rays (8.32), spell-likes' daily uses (8.33), Maura's Wayfinder's use (8.34).
- Waiting on a character with a container: Olbryn has none, so 8.27 (his containers in the menu) could not run.
- Waiting on luck: the Spell Prism's d20 never came up 20 in six casts, so whether the nat-20 voice fires for it (8.35) is unknown.
- Still under test: the new 0.19.0 features themselves (type-ahead, Shift jobs, F9 detail levels, pools in the menu, buff potions by ear). Josh will report when done.
- Waiting on Tobias from phase 1, still: bullets for Sparkbang (8.8), wand stacks (total charges, emptier wand first), Signature Deed, TWF -4 single shot, Haste shot in the full attack, Pair O Deez 6/7 uses, shop from weightless coins.
