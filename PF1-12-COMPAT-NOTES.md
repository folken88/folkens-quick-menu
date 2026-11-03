# Quick Menu on Foundry 14 + PF1 12 (master): live findings

Tested 2026-11-03 on f4: Foundry 14.370, PF1 master @ ad38c8aa (plus our conditional-damage patch),
Quick Menu 0.19.0 unchanged, Shackles copy, GM user with Bujon's token selected. Nothing here ships
while the 0.19.0 freeze holds; this is the input for the compatibility build.

## Works unchanged
- Module loads, menu opens, entries are read, type-ahead answers ("Nothing starts with p, e."), Escape closes.
- Chat commands for attacks, saves, abilities, spells, items, `/list`, `/find`, `/scan`, `/fqm list`.
- Attack card read as "17 to hit, 14 damage." (RollTotals already reads `message.system.rolls.attacks`; crit `natural` present).
- Save card read as the total (`message.type === "check"`, `rolls[0].total`).
- Spell card: "Card posted. Range 60 feet. Area cone-shaped emanation. Duration concentration, up to 1 min./level."
- Scroll of Magic Missile: "hits, 7 damage. Range medium. Duration instantaneous." then "8 left."
- Buffs still carry `system.active`; the old `pf1ToggleActorBuff` hook is still fired (deprecated, new name `pf1.item.toggle`).
- `staticRoll` (Take 10/20) still exists on D20RollPF (`options.staticRoll`).
- The two 0.19.0 action hooks we wrap (`alterRollData`, `pf1CreateActionUse`) were not exercised; see the audit.

## Breaks
1. **Skills: only "Fly" registers (1 of 31).** PF1 12 makes skills Items. `actor.system.skills` is keyed by the
   skill item's camel-case identifier (`perception`, `disableDevice`, `knowledgeArcana`), values are `SkillModel`
   (`fullName`, `mod`, `rt`, `ability`, `subSkills` for grouped skills). `pf1.config.skills` is gone.
   `CharacterDataExtractor.getPF1Skills` walks a fixed map of 3-letter keys, so only `fly` matches.
   Fix: iterate `Object.entries(actor.system.skills)`, label from `fullName ?? name`, `skillKey = identifier`
   (sub-skills: `grouping.subSkills.identifier`, which `_getSkill` accepts), and keep deriving the spoken code from
   the label so `/per` stays `/per`. `rollSkill("per")` still works through `pf1.utils.compat.getSkillId` but logs
   a deprecation; pass the new identifier.
2. **Unknown slash commands now throw.** Foundry 14 validates commands against `CONFIG.ui.chat.CHAT_COMMANDS`
   after the `chatMessage` hook; a code the Quick Menu does not claim (today `/per`) ends in
   `"/per is not a valid chat message command."` as a UI error with nothing spoken. The interceptor should claim
   every `/word` that `ChatLog.parse` calls `invalid` and say "No command." itself, as it does for malformed text.
   PF1 registers its own commands in `CHAT_COMMANDS` now (`damage` and the core set), so the pass-through list is
   just those keys.
3. **Containers.** `item.items` is gone; contents live in `item.system.items` (a Collection built by
   `ContainerModel`). `system.contents` no longer exists. `MenuItems.containerContents` and
   `CharacterDataExtractor._containerEntries` must read `item.system.items`.
4. **Roll return values.** `rollSkill`, `rollSavingThrow`, `rollAbilityTest`, `rollInitiative` return
   `{ roll, message }` (`pf1.dice.d20Roll`), not a ChatMessage. `item.use()` still returns an ActionUse.
   Anything reading the return as a message must use `.message`; the createChatMessage announcer is unaffected.
5. **Message layout.** `flags.pf1` is empty. Cards are typed (`check`, `action`, `damage`, `item`) with data in
   `message.system`: `subject`, `notes`, `dc`/`save`, `rolls.attacks[]` with `attack`/`damage` roll JSON. RollTotals
   already falls back to `system.rolls`; `flags.pf1.metadata` readers are dead code on 12.

## Not a code problem, but worth knowing
- The favorites loader runs at `init` before `game.user` exists and logs a warning on every load (pre-existing).
- On this PC Chrome's speech engine never ends an utterance, so queued result lines back up behind the first one
  and only drain on `speechSynthesis.cancel()`. Every result above was found in the backlog, not lost. The
  queue's stuck detection did not clear a line that *started* and never ended; Josh's voice-death logs may have
  the same shape and deserve a look once the freeze lifts.

## Still to run on f4
Take 10/20 from the menu once skills register; the Normal-attack single-swing wrap (`alterRollData`); a potion
with a buff (switchBuffOn against 12's compendium packs); pool reads; favorites; F9 detail levels by ear.
