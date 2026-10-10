# Changelog

All notable changes to the FolkenGames Quick Menu module will be documented in this file.

## [0.15.1] - 2026-10-10

Found by running 0.15.0 live on f1 against Chef Ramsay, with a copy of Olbryn's spells.

### Fixed
- **An item with none left still did not say "None left."** PF1 11.11 hands a
  refusal back wrapped, as `{ err, code: 3 }`, not as the bare number 0.15.0
  looked for, so the refusal was taken for a success. Both forms are read now.
- **A stack of single-use items said "0 of 1 left."** B-Dang, 143 in the stack.
  PF1 gives single-use items a default "1 per single" as well as a quantity, and
  the per-use count was read first. Quantity is read first now: "143 left."

### Verified live on f1 (Chef Ramsay, self-roll)
- Typo `/zzq`: the error sound, then "No command, slash, z, z, q."
- `/sr0`, `/sr1`, `/sr7`: "Cantrips are at will.", "4 of 4 1st-level spells
  left.", "No 7th-level spells."
- `/1mm` "Magic Missile", "22 damage."; `/1sg` "Shocking Grasp", "31 to hit,
  5 damage."; `/1shie` "Shield" and nothing else.
- Up-cast: `/3lb` offered a 4th; `/per` withdrew it; `/3lb` then **Y** spent the
  4th and left the 3rd at 0; `/3lb5` cast from the 5th; `/3lb5` again said "No
  5th slots left."; `/3lb2` said "A 2nd slot is not higher than 3rd." - each
  failure with the error sound.
- A deleted item: the error sound, "Not found. Type slash scan."

- 305 assertions over 13 suites.

## [0.15.0] - 2026-10-09

From Josh's 0.14.0 test report and the silent-failure audit
(`docs/superpowers/specs/2026-10-09-silent-failures-design.md`).

### Added
- **Sounds.** The Poker Dungeon's earcons, copied exactly so they mean the same
  thing in both: two low 220 Hz pulses for an error, a falling tone when the menu
  closes on a choice, a short high blip when speech is stopped. They follow the
  voice volume. A sound cannot be dropped or queued behind other speech the way a
  spoken line can, so every failure starts with one.
- **Stop the voice.** `Control` on its own (the screen-reader convention, and it
  works from inside the chat box), or `S` while the voice is talking and you are
  not typing (as in the Poker Dungeon). `S` is also Foundry's pan-down - and moves
  a selected token - so it is only taken while speech is playing or within 1.5 s
  of it ending.
- **`/sr1` to `/sr9`**: spell slots left at that level. "3 of 5 7th-level spells
  left." Prepared casters hear how many prepared spells at that level are uncast.
- **Typed up-cast, `/6cl7`**: a spell's command plus a slot level casts it from
  that slot with no question asked.
- **Uses left after an item.** "2 of 3 left." for a rod, "37 of 50 left." for a
  wand, "2 left." for potions, "That was the last one." when it is gone.
- **Skip Template Placement** setting (on by default). Josh: `/saf` and `/wcs`
  waited silently for a template to be placed on the map.

### Fixed
- **Out-of-stock items said "sent to chat".** PF1's `use()` returns a refusal
  code rather than throwing. Every use is now checked, and refusals are spoken:
  "None left.", "No charges.", "No ammo.", "Disabled.", "Cancelled."
- **Two attacks from one Punch.** The menu stayed open, silent, until the action
  finished - about 2.5 s - so Josh pressed Enter again. The menu now closes the
  moment a choice is accepted, the name is spoken at once, and a second Enter
  while one is running does nothing. Chat commands get the name at once too.
- **Spell damage was never read.** Spells used the plain roll reader, which never
  looks where PF1 keeps attack and damage rolls. They now use the attack reader,
  and a damage-only card (Fireball) reads "31 damage". Spells with nothing rolled
  stay quiet after their name.
- **The voice could go silent for good.** The speech queue waited on an end event
  Chrome does not always send; once one was lost, everything queued behind it
  (roll results included) never played. Ported the Poker Dungeon's fix: the
  browser's own queue, a periodic `resume()`, and a watchdog for a wedged engine.
- **Roll results ignored the volume key.** They forced full volume.
- **Speed and volume keys were dead with the menu open** if it had been opened
  from the chat box, because focus was still in a text field.
- **A pending up-cast survived other commands.** `/6dis`, then `/per`, then Y
  would still cast Disintegrate. Any command now withdraws the offer.
- **A failed up-cast could leave the slots wrong.** 0.14.0 restored the slot
  counts by reading them after it had already changed them, and treated a PF1
  refusal as a successful cast. The counts are now captured first, and a refusal
  puts both levels back.
- **Unknown commands were silent.** A typo like `/prc` now gets the error sound
  and "No command, slash, p, r, c." It is still passed on, and a macro or another
  module's command of that name is left to run without the error.
- **`/fqm rename` and `/fqm reset` failed in silence**, with only a whisper.
- **Codes read as units.** "2 m i" was read as "2 meters"; codes are now spoken
  with commas between the letters.
- **Passive items with PF1's default `uses.max` of 1** (the workbook, Ring of
  Wizardry, Spell Prism, the Wayfinder) got commands that only posted their card.
  Uses PF1's own `isCharged` now, and loot in containers needs a real use too.
- **Up-casting is the rules as written**, not a house rule; the 0.14.0 notes were
  wrong and are corrected.

- 302 assertions over 13 suites, including the real executor run against a
  stubbed Foundry.

## [0.14.0] - 2026-10-08

### Added
- **Up-casting for spontaneous casters.** Requested by Tobias: when Olbryn is out of
  6th-level slots and `/6dis` is typed, the voice asks "Out of 6th. Cast Disintegrate
  with a 7th?" - **Y** casts it from the 7th-level slot, **N** cancels.

  - Only offered for a spontaneous book, and only when that level is genuinely empty.
    A prepared caster still hears "None prepared".
  - Takes the **lowest** free level above the spell's own, so a 9th-level slot is not
    spent while a 7th is sitting there.
  - **Y** is accepted bare, not just as `/y`, because that is what gets typed. Only a
    clear yes or no is consumed; anything else goes to chat as normal rather than
    being guessed at.
  - The offer expires after 30 seconds. *(This entry originally also said the next
    command replaced the offer; it did not until 0.15.0.)*

  How the slot is actually moved: PF1 always charges the slot at the spell's own
  level and gives no way to redirect it, so one slot is lent at that level and one
  taken from the higher level **in a single update** - the sheet is never half
  changed. PF1 then spends the lent slot as usual. Afterwards the lent level is read
  back, and if PF1 did not deduct it (auto-deduct can be switched off) it is
  corrected, rather than leaving behind a slot that was never earned on a sheet its
  owner cannot see. If the cast throws, both levels are restored.

  *(Correction, 0.15.0: this entry called up-casting a house rule. It is the rules
  as written - the Core Rulebook: "A spellcaster always has the option to fill a
  higher-level spell slot with a lower-level spell.")* The spell is cast exactly as
  written; the larger slot buys the cast and nothing else.

- 243 assertions over 11 suites.

## [0.13.3] - 2026-10-08

### Fixed
- **The announcement helper threw in the browser.** Its default timer plumbing held
  bare `setTimeout` and `clearTimeout` references; called as `timers.set(...)` they
  lose their window receiver and throw "Illegal invocation". Node does not reproduce
  that, so the eleven unit tests passed while the real default path was broken - the
  tests all supply fakes, and nothing exercised the default. Caught by running the
  module in the live client before announcing it fixed, which is the only reason
  0.13.2 did not ship with roll results still silent. Now wrapped, and the suite
  exercises the default path.

## [0.13.2] - 2026-10-08

### Fixed
- **Every spoken roll result was broken in 0.13.1.** Attacks, skills and checks all
  posted to chat and said nothing. My fault, and a bad one: the blanket
  find-and-replace that converted the fourteen call sites from
  `Hooks.off('createChatMessage', hookId)` to `hookId.off()` also rewrote that same
  line **inside the helper it was part of**, where `hookId` is the number `Hooks.on`
  returns. So the hook threw before announcing, and because `Hooks.off` was never
  reached, every roll left its listener registered - worse than the leak 0.13.0 set
  out to fix.

  I verified that change by counting call sites rather than running anything. Josh
  found it from the console in one pass: `hookId.off is not a function`.

  The lifecycle now lives in `scripts/executor/Announcer.js`, which takes its hook
  and timer plumbing as arguments so it can be exercised with fakes. Eleven
  assertions, including one that fails if anything calls `.off()` on the id again.
- **The wait for a chat card was too short.** Attack cards take 3.4 to 6.2 seconds to
  appear, because Dice So Nice animates the dice first and PF1 only creates the card
  once they finish - measured by Josh. The 5-second window would have cut off some
  attack readouts even once the crash was fixed. It is 20 seconds now, which is safe
  because only one announcement is ever pending: arming a new one cancels the last,
  so a roll that produced no card cannot still be waiting when the next command runs.
- **Typing a number used an item instead of moving to it.** Typing 2 then 4 in Skills
  rolled Appraise; 3 then 5 rolled Artistry. The old code read a digit sequence as a
  path - second item, then fourth inside that - and executed whatever it landed on,
  so in any list longer than nine entries most two-digit numbers fired one of the
  first nine. Digits now accumulate into a single position and only move the
  selection: 38 reaches item 38, and Right or Enter remains the only way to use
  anything. `Digit0` is the digit zero rather than a stand-in for ten, which only
  worked by accident before.

### Added
- **A Menu Voice setting**, and a better default. The module was speaking as "Google
  UK English Female" because the old rule took the first English voice with "female"
  in its name. Josh could not make out "Climb" in the Skills list - it reached him as
  "ply" - and only learned what it was by asking. Automatic now prefers a voice
  installed on the computer over an online one, which picks Samantha on his Mac,
  the voice he had switched to by hand. Any installed voice can be chosen instead.
  Deliberately not tied to the system default: he wants the module to sound different
  from VoiceOver so he can tell which is speaking.

### Notes
- 218 assertions over 10 suites.
- Still open, and for Tobias to rule on: replacing the menu's numbers with
  first-letter type-ahead navigation, which is how VoiceOver users move through long
  lists on a Mac. It would need the menu's single-letter shortcuts (F, P, U, R and
  Slash) to move elsewhere first.

## [0.13.1] - 2026-10-08

### Fixed
- **Reads attack cards through `ChatMessagePF.system` instead of the deprecated
  `flags.pf1.metadata`.** Found while testing 0.13.0 in the live client: touching the
  old path logs "deprecated in favor of ChatMessagePF.system - support will be removed
  in Version PF1 v12" on every access, so announcing an attack would have printed a
  warning each time. More to the point, **f4 already runs the PF1 v12-dev build**,
  where that path is due to disappear - attacks would simply have gone quiet again.

  Verified on f1 across all 77 attack cards that `message.system.rolls.attacks` is the
  identical object. The old path is kept as a fallback, and whichever one was used is
  named in the diagnostic.
- 193 assertions over 8 suites.

## [0.13.0] - 2026-10-08

0.12.0 confirmed working: every attack and maneuver announced its total, and the
console line that would have reported an unreadable card never appeared. This
release is a bug Josh found by reading the code, a bug found by finally inspecting
real attack cards, and the first step of an idea from Tobias.

### Fixed
- **An announcement hook could read out another player's roll.** Josh, from the code:
  `executeInitiativeRoll` armed a one-shot `createChatMessage` hook and then called
  `rollInitiative`; with no combat running PF1 makes no message and throws no error,
  so the hook was never removed. It stayed armed and would announce the total of
  whatever chat message arrived next.

  Checking it, the leak was in **all fourteen** call sites, and there was a second
  hole: `Hooks.once` fires on the next message from *anyone*, so even a successful
  roll could announce another player's result if theirs landed first. Confirmed as a
  live risk - the attack cards in Iron Gods are authored by Josh's user id, not the
  GM's, so a leaked hook on one client would have read out the other's numbers.

  Two guards now: only the current user's own messages are ever considered, and the
  hook removes itself after a short wait so it cannot stay armed. The ownership check
  is a tested pure function rather than a method buried in the executor.
- **Initiative with no combat running now says "No combat running"** instead of
  nothing. Silence is indistinguishable from a broken command by ear.
- **A full attack only announced its first attack.** Found by inspecting 77 real
  attack cards: 10 of them carry more than one attack, and the card Josh reported as
  "Punch 30 with 11 damage" had also rolled **20 for 10**. He had no way to know.
  Every attack on the card is now read.

### Added
- **Spoken detail follows combat.** Tobias, 2026-10-08. Auto - the default - is short
  while a combat is running and fuller outside it, and it can be forced either way.
  Keying it to combat rather than to a hotkey means no new key to collide with and
  nothing to remember to press at the busiest moment.

  In combat a full attack reads "30 to hit, 11 damage. 20 to hit, 10 damage."; out of
  combat, "2 attacks. First, 30 to hit, 11 damage. Second, 20 to hit, 10 damage." A
  single attack never gets the counting preamble either way.

### Verified
- **The attack-card shape, at last.** 0.12.0 shipped a reader that tried every shape
  because no attack card existed to check against - the earlier database snapshot was
  taken hours before Josh's test session. There are now 77 in Iron Gods, and the real
  shape is `flags.pf1.metadata.rolls.attacks[]`, each entry `{ attack, damage }` with
  `attack.total` a number and `damage` an array of rolls, while `message.rolls` is an
  empty array. That is the branch the reader was already taking, for the right reason.
- `message.author.id` is the author field on this Foundry version, which is what the
  new ownership check reads first.
- 190 assertions over 8 suites.

## [0.12.0] - 2026-10-08

0.11.0 was confirmed working in a 37-minute, 266-keypress logged session: the
activation fix held, Escape closes in one press, and with the focus setting off the
menu leaves the VoiceOver cursor alone and still receives the arrows. This release
is the remainder of that report, plus Tobias's three rulings.

### Fixed
- **Attack and maneuver rolls were silent.** `announceAttackResult` only read
  `message.rolls`, which PF1 leaves empty on an attack card. Josh found it through
  `/cmb` because that command was new, but **every weapon attack rolled from the menu
  had the same defect**.

  I could not establish the attack-card shape with confidence: PF1's source
  initialises `flags.pf1.metadata.rolls.attacks`, and reading 330 real messages out of
  the Iron Gods world found 122 carrying `message.rolls` (the ordinary d20 rolls,
  which is why those always worked) and not one attack card to confirm against.

  So rather than guess at one shape and ship a third wrong fix, `RollTotals.js` tries
  every shape it could be - a bare roll, a `{attack, damage}` wrapper, serialized JSON
  - and reports which one matched. When none does, the voice says "Rolled. Result is
  in chat." and the card's shape is logged to the console. Announcing a wrong number
  to someone who cannot see the card would be worse than announcing none.
- **The duplicate-key guard now covers every key the module consumes**, not just the
  activation key. Josh's log: 22 of 266 presses arrived doubled, across seven
  different keys. A doubled Escape closed the menu with copy one and reached Foundry's
  locked Dismiss with copy two, stranding his cursor on the page body; a doubled
  ArrowDown moved the menu two items; a doubled Enter or Right would fire an action
  twice. The check now runs before anything inspects whether the menu is open, which
  is the ordering that matters - by the time the second Escape arrives the menu has
  closed, so a later check no longer recognises the key as ours and passes it on.
- **"Atk" was read aloud as "AK"** in buff names like *Blessing of Fervor (Extra
  Atk)*. Those are the names as Foundry stores them, so the expansion happens in what
  gets spoken, not in world data. Also covers Dmg, DR and SR, whole words only.

### Changed
- **Speech speed moved off `[` and `]` to `,` and `.`** Foundry v13 core binds
  BracketLeft and BracketRight to Send to Back and Bring to Front - confirmed in its
  own `client-keybindings.mjs` - so the module had been quietly taking two of
  Foundry's bindings from every player who installed it. Tobias's rule: the Quick Menu
  moves, because Foundry gives players no easy way to rebind its own. All four speech
  keys are settings now, so a future collision is a per-player fix. Minus and Equal
  stay: core binds zoom to the numpad and E/Q, never the main-row keys.
- **Passive items no longer get chat commands.** Tobias: "we don't really need
  triggers for items that don't have triggerable abilities. Waste of
  time/space/commands." The old test ended in `|| item.system.equipped`, which handed
  a command to every worn passive item. It now uses PF1's own `hasAction`, with
  charges and a declared activation as fallbacks so nothing usable is lost. This also
  retires `/c6t` and `/o6`, which answers Josh's separate point that a code with the
  letter `o` beside a digit is easy to confuse with zero.

### Not changed, deliberately
- **Weapon Focus adding +1 to CMB.** Tobias ruled it stays: he wanted Weapon Focus to
  cover whole weapon categories, there is no clean way to express that, so it targets
  all attack rolls and CMB comes along. "Not a huge problem. I always error on the
  side of the fighter-type classes when balancing since wizards can stop time."
- The activation key default stays Backquote even though core binds it to Push to
  Talk. It is already a per-player setting, voice chat is off in the world, and it is
  the key Josh has learned.

### Notes
- 173 assertions over 8 suites.
- Still unverified: the real attack-card shape. One `/cmb` and one weapon attack will
  either announce a total or log the shape, and either outcome settles it.

## [0.11.0] - 2026-10-07

Josh instrumented the menu bug with a key logger in his own tab. His log disproved
the diagnosis in 0.9.0 and 0.10.0, and identified the real cause.

### Fixed
- **The menu bug, actually.** The arrow keys were never being intercepted - they
  reached the page every time. The menu was simply already closed. His log showed
  that the first activation press after VoiceOver moves focus arrives in the page as
  **two keydown events with identical `event.timeStamp`**, both `isTrusted`, neither
  a repeat. While the activation key was a toggle, the first opened the menu and the
  second closed it, so every arrow afterwards went to a closed menu. From the chat
  box, his next Up Arrow brought up chat history, because focus had been handed back.

  Both earlier explanations were wrong: ProseMirror was not eating the arrows, and
  VoiceOver was not holding them in browse mode.

  The fix is his, and it is better than a debounce: **make every key idempotent.**
  - The activation key only ever **opens**. If the menu is already open it
    re-announces the current item, which doubles as a "where am I" key.
  - **`Escape` always closes the whole menu**, in one press. `Left` and `Backspace`
    still step back a level. Previously all three stepped back, so a doubled Escape
    could back out of a submenu *and* close the menu.

  Pressing either key twice now lands in the same state as pressing it once, so a
  screen reader doubling a keystroke stops mattering wherever it happens. A duplicate
  guard backs that up, keyed on an exact `timeStamp` match rather than a guessed time
  window, so it can only suppress a literal duplicate of the event just serviced.

- **Items whose names contain a plus sign had commands that could never be typed.**
  "Charisma +6 Tattoo" produced `/c+t` and "The Operative +6" produced `/o+`; the
  resolver accepted them but the chat interceptor only matches letters and digits, so
  neither item could fire. Every generated command is now stripped to letters and
  digits, at the single point every path goes through - including a player alias set
  with `/fqm rename`. Those two are now `/c6t` and `/o6`.

### Changed
- **Taking keyboard focus is now a per-player setting, default on.** Josh asked for
  it to stay available rather than be removed: NVDA and JAWS read pages in a browse
  mode that keeps the arrow keys, and Mac VoiceOver Quick Nav does the same, so the
  focus grab into a `role="application"` region is what those users need. He turns it
  off, because his log proves he does not need it and because taking focus drags his
  VoiceOver cursor into the off-screen menu box - which the page cannot undo, since
  it can only restore keyboard focus, not a VoiceOver cursor. That is also the likely
  route by which his roll mode ended up on Self Roll.
- Focus is only handed back on close if it was taken in the first place.
- `Escape` now speaks a short confirmation, since otherwise there is no way to hear
  that the menu closed. A menu closed by executing a roll stays silent.
- 140 assertions over 6 suites.

### Not yet verified
- That the arrows reach the menu with focus left where it was. Josh has not been able
  to test that configuration, and neither have I; before 0.9.0 there was no focus grab
  and the menu did work for him whenever it had not gone dead, so it is expected to.
- Windows screen readers and VoiceOver Quick Nav. Neither of us can test those.

## [0.10.0] - 2026-10-07

From Josh field report of 2026-10-07.

### Fixed
- **The open menu no longer swallows keys it does not use.** 0.9.0 consumed every
  unmodified keystroke while the menu was open and passed Ctrl/Alt/Cmd chords back,
  on the reasoning that a screen reader drives on Ctrl+Option. Josh pointed out that
  VoiceOver modifier is configurable - his is **Caps Lock**, because Pro Tools has
  claimed Ctrl+Option, and another user may have set it to something else again. So
  no chord can reliably be handed back, and the accommodation did nothing for the one
  person it was written for.

  The menu now claims only the keys it actually responds to, and only unmodified.
  Tab, letters, function keys, Home, End and anything else bound by the browser,
  Foundry or an assistive tool pass straight through, whatever modifier that tool
  uses. The rule lives in `scripts/input/MenuKeys.js` as a pure function with 14
  assertions, rather than buried in an event handler.

  One case this cannot solve, stated plainly: if a screen reader passes a plain arrow
  key through as part of its own chord, nothing in the page can tell it apart from the
  player pressing that arrow.

### Added
- **`/bfo`** - the buffs on your sheet that are switched **off**. Josh asked whether
  `/bf` lists what is available or what is live; it is what is live, and he then named
  the thing he actually needs: "I always feel like a bit of a heel bugging people to
  make sure my buffs are on... I can then know with a couple key strokes what is on
  for my character. And then tell my Claude or my fellow players hey, can you turn
  haste on for me." Knowing what is on does not tell you what is missing, so that is
  its own command.

### Changed
- Both buff reads now say the count before the list, so you know how long it is before
  it starts.
- `getBuffs` reads PF1 own `ItemBuffPF.isActive` rather than the raw `system.active`
  field, so it stays correct if the data model moves. Confirmed against the pf1 11.11
  source: PF1 gates a buff Changes behind that getter, so `/bf` reports buffs that are
  genuinely affecting the character - not merely present.
- 128 assertions over 6 suites.

## [0.9.2] - 2026-10-07

### Fixed
- **Manifest conformance.** 0.9.1 described Josh role with a `flags` key inside his
  author entry. The v13 package author schema is `name`, `email`, `url` and `discord`
  only, and a non-schema key in a manifest is how a module ends up failing metadata
  validation at the next restart - the same class of fault that currently stops
  `folken-games-scenes-universal` loading. The entry is now plain `name`; the authors
  array already means co-authors, and the detail lives in the README.

## [0.9.1] - 2026-10-07

### Changed
- **Josh Morrison is credited as co-developer**, in the module manifest and the README.
  He is the blind player this module is built for, and the command scheme, the audio
  ordering and most of what it gets right came out of his field reports. His email is
  deliberately not published in the manifest; that is his to share, not ours.

## [0.9.0] - 2026-10-07

All of this came from two field reports by Josh, the blind player the module is for.

### Fixed
- **The menu could open and then ignore every arrow key.** The real bug, not the one
  0.6.0 guessed at. The menu opened, announced Favorites, and then no arrow key
  reached it until he had pressed Escape and reopened it several times. Two causes,
  both fixed: the keydown listener was on the bubble phase, so a focused ProseMirror
  chat editor consumed the arrows before they ever got to the document; and the menu
  never took focus, so a screen reader stayed in browse mode and kept the arrows for
  its own navigation. The menu now takes focus on open (restoring it on close) inside
  a `role="application"` container, and listens on the capture phase. Modified keys
  are passed through untouched so VoiceOver chords still work while the menu is up.
- **`/ac` figures summed to 42 against an AC of 36.** PF1 already includes the
  inherent `Base +10` in its source list and 0.8.0 added a second one. Nothing is
  added now.
- **A bonus that was counting could be left out.** 0.8.0 dropped every entry PF1
  flagged `disabled`, which silently lost a Shield spell +4 that was genuinely
  applying. Every entry is now reported with an `applies` flag instead. PF1 own
  consumers of this data do not filter on the flag either.
- **Raw translation keys were read aloud** - he heard
  "PF1.Subtypes.Item.equipment.other.Single". Labels are localized, with a sayable
  fallback.
- **Roll notes were read out as raw link markup.** PF1 enriches notes before handing
  them over, so a note referencing an item arrives as an anchor tag; the chat card
  rendered it correctly but the voice read the markup. Notes are reduced to plain
  speech, content links to their visible label. `TTSManager.speak` also strips markup
  defensively, so no future caller can put markup into his ear by forgetting to.
- **Double full stop** after a note that already ended in one.
- **Duplicate spellbook commands.** A second caster-level and concentration pair is
  only created when the numbers actually differ. Olbryn second book is his racial
  spell-like abilities at the same caster level 15 and concentration 23, so `/clc2`
  and `/conc2` rolled exactly what `/clc` and `/conc` already rolled. Deduplicating on
  the figures rather than excluding spell-like books keeps the useful case: a book
  that ever diverges gets its pair back automatically.

### Changed
- **`/ac` is three numbers: AC, touch, flat-footed.** No base, no breakdown, no CMD,
  no notes. In his words: "It is like having a book read to me while I am trying to
  follow the table." Each quick command now answers one question and stops.
- **CMD moved to its own `/cmd`.** Hearing it in the same breath as AC made it sound
  like part of AC. It sits beside AC on the sheet, which groups them for the eye, but
  by ear it answers a different question.
- **The AC breakdown moved to the agent API** (`api.getAC()`), which is where he does
  reconcile his sheet. Also new: `api.getNotes(context)` for any PF1 roll-note context.

### Added
- **`/cmb`** rolls a combat maneuver. One command covers trip, grapple, bull rush,
  disarm and the rest, since all of them are d20 plus CMB. It goes through PF1 own
  `rollAttack({ maneuver: true })`, so the real total and any maneuver roll notes come
  with it rather than being reassembled here. PF1 has no `rollCMB`.
- `scripts/character/Spellbooks.js` and `scripts/chat/StateSpeech.js` hold these rules
  as pure functions. 107 assertions over 5 suites.

## [0.8.0] - 2026-10-05

### Added
- **`/ac`** - reads AC, touch, flat-footed, CMD and flat-footed CMD, then where every
  bonus comes from, then any roll notes that apply to AC. The breakdown is PF1's own
  source data, the same thing a sighted player gets by hovering the AC box.
  Non-stacking bonuses that something else has superseded are left out, so the numbers
  read aloud actually add up to the total, and the inherent base 10 is stated because
  PF1 keeps it out of that list.
- `/ac` is reserved, so no item or spell can take the command.
- New `scripts/chat/StateSpeech.js` holds the sentence building as pure functions, so
  the wording is covered by tests rather than only verifiable by listening to it.

### Notes
- Uses `actor.getSourceDetails(path)` and `actor.getContextNotesParsed('ac')`. The
  older `actor.sourceDetails` property is deprecated in PF1 v11 and logs a warning on
  every access, so it is deliberately not used.
- 13 new assertions, 84 across the suite.

## [0.7.0] - 2026-10-04

Level-first spell commands, to Josh's specification.

### Changed
- **Spells are now named by level first.** The spell level leads as a digit (`0` for
  cantrips), then four letters for a one-word name or the initials for a multi-word
  one: Haste is `/3hast`, Teleport `/5tele`, Magic Missile `/1mm`, Detect Magic `/0dm`,
  Teleport, Greater `/7tg`. Only "of" is dropped, so Protection from Evil is `/1pfe`,
  and an apostrophe no longer starts a word, so Mage's Faithful Hound is `/5mfh`.
  The command now falls out of the spell instead of having to be memorised.
- This **replaces** the old spell codes (`/hast`, `/dem`, `/dim`, `/tst`, `/tse`) with
  no aliases kept, the same as the saves change in 0.5.2.
- A tiebreak between two spells of the same level keeps the level prefix:
  Faerie Fire `/1ffi`, Feather Fall `/1ffa`.

### Unchanged
- Wands, scrolls and potions keep their initials and the extend rule (`/stec`, `/stel`).
- Skills, saves, ability checks and the combat commands are untouched.

## [0.6.1] - 2026-10-04

### Fixed
- `/ini` for Initiative, as the old macro set documented it (had become `/init`).
- The secondary spellbook's commands were missing. Every in-use spellbook now gets its
  own caster-level and concentration commands: `/clc`, `/conc`, `/clc2`, `/conc2`.

## [0.6.0] - 2026-10-04

### Fixed
- **Menu navigation wraps instead of clamping.** At either end the menu re-announced
  the same entry, which to someone listening is indistinguishable from a stuck menu.
  A one-entry list now says so out loud rather than repeating itself.

## [0.5.4] - 2026-10-04

### Fixed
- A GM owns every actor in the world, so the agent API offered 132 characters as
  "yours". A GM now gets their assigned character and must name anyone else.

## [0.5.3] - 2026-10-04

### Fixed
- Two names sharing their *last* word could never be separated by extending it
  (Detect Magic / Dispel Magic). They now separate from the front: `/dem`, `/dim`.

## [0.5.2] - 2026-10-04

### Changed
- **Clashes are separated by taking more letters, not by a pick-a-number prompt.**
- **Aliases removed.** One name, one command: `/for`, `/ref`, `/wil`, `/itm` stand alone.

### Fixed
- An assigned command now wins over the clash list. Previously the item handed the
  bare code was shadowed by the clash group and its command never fired.
- Multi-word names skipped the reserved-command check, so "Scroll of Technomancy"
  took `/st` from the status command.

## [0.5.0] - 2026-10-03

### Added
- **Agent API** on `game.modules.get('folken-games-quick-menu').api` — an owned-actor
  scoped read surface for a blind player's AI assistant, with plain-text exports.
- **State reads**: `/st`, `/hp`, `/cond`, `/bf`.
- **`/list` and `/find`** for browsing and searching commands, spoken letter by letter.

## [0.3.0] - 2026-07-05

Accessibility + Foundry **v14** update.

### Fixed
- **Chat commands now work on Foundry v14.** The interceptor read the raw message and
  bailed on anything starting with `<`, but v14's ProseMirror chat input serializes
  typed input to HTML (`<p>/per</p>`) — so every `/command` silently failed on v14. It
  now extracts the plain text first. (Same class of bug fixed in advanced-macros.)

### Added
- **Live TTS speed & volume controls** (parity with the poker/dungeon blind mode):
  `[` / `]` slow down / speed up the reading voice, `-` / `=` lower / raise its volume.
  Announced back aloud and persisted across reloads; suppressed while typing.
- **Spoken confirmations for item actions.** Using, activating, or consuming an item now
  speaks a confirmation ("… sent to chat", "… activated", "… consumed") — previously
  these posted to chat silently with no feedback for a blind player.
- **Jump-to-Chat hotkey** (default `Backslash`, configurable) — moves focus straight to
  the chat prompt and confirms via TTS, so the player never has to navigate to it.
- **Chat prompt accessible name.** The chat input gets `aria-label="Chat message"` on
  load and every chat re-render, so screen readers stop announcing it as "new line".

### Changed
- Browser-voice rate/volume now come from the live, persisted values instead of a setting.
- Compatibility raised to **verified 14**.

## [0.2.0] - 2026-03-23

### Added
- **Chat Command System**: Type `/per`, `/str`, `/fort` etc. directly in chat to execute actions. No dependency on the advanced-macros module.
- **`/scan` Command**: Scans your character and builds dynamic abbreviations for all spells, attacks, items, and feats. Walks you through any naming conflicts via TTS.
- **`/list` Command**: Browse commands by category (`/list skills`, `/list spells`, `/list attacks`). TTS reads them in small groups instead of dumping everything at once.
- **`/find` Command**: Search all commands by name (`/find fire` finds Fireball, Fire Shield, etc.).
- **`/fqm` Meta-Commands**: `/fqm rename`, `/fqm reset`, `/fqm help` for managing aliases.
- **Abbreviation Generator**: Auto-generates 3-4 letter abbreviations from ability names using system keys, a legacy compatibility table, multi-word acronyms, and single-word truncation.
- **Collision Resolution**: When two abilities share an abbreviation, guides the player through choosing which keeps the short name via an interactive TTS-driven flow. Choices persist in actor flags.
- **ActionExecutor**: Shared execution engine used by both the chat commands and the quick menu. Extracted from QuickMenuManager for clean separation.
- **TTS Provider Chain**: Supports Talking Actors (character voice via ElevenLabs), direct ElevenLabs API, and browser Web Speech API with automatic fallback.
- **New Settings**: Enable Chat Commands, TTS Provider, ElevenLabs API Key, ElevenLabs Voice ID.
- **Reserved Command Protection**: Built-in Foundry commands (`/roll`, `/whisper`, `/gm`, etc.) are never intercepted or generated as abbreviations.
- **Actor Flag Persistence**: Alias choices stored at `actor.flags['folken-games-quick-menu'].chatAliases`, surviving browser refreshes and module reinstalls.
- **Deduplication**: Action items with identical label+actionType (e.g., Initiative appearing in both Combat and Stats) are deduplicated to prevent false collisions.
- **Lazy Build**: If no actor is available at startup, the resolver builds on first command and prompts the user to try again.

### Changed
- **Module Description**: Updated to reflect unified accessibility focus.
- **Foundry Compatibility**: Now verified for Foundry v13, minimum v12.
- **QuickMenuManager**: Execute methods moved to shared ActionExecutor (~650 lines extracted). Menu delegates to `game.folkenQuickMenu.actionExecutor.execute()`.

### Removed
- Commented-out dead code from previous iterations.
- Dependency on advanced-macros module for chat command routing.

## [0.1.0] - 2025-01-27

### Added
- **Initial Release**: Complete TTS-based character navigation system for FoundryVTT
- **iPod-Style Interface**: Hierarchical menu navigation inspired by classic iPod design
- **Advanced Keyboard Controls**: Arrow keys, numbers (1-9), F key favorites, / key submenus, U key unfavorite
- **Smart TTS System**: 120% default speed, streamlined announcements, enhanced attack reporting
- **Movement Isolation**: Suspends FoundryVTT controls while menu is active
- **Per-Character Favorites**: Add any action to favorites with F key, storage per character and user
- **GM Token Support**: Game Masters can use menu with any selected token for testing
- **Skill Enhancement**: Take 10/Take 20 submenus for skill checks
- **Roll Result Integration**: Instant TTS announcements of dice totals using chat message hooks
- **Attack Intelligence**: "18 to hit, 12 damage" comprehensive attack result reporting
- **Token Positioning**: UI automatically positions near selected/assigned actor tokens
- **No Dialog Mode**: All actions use skipDialog for instant execution
- **PF1 Integration**: Complete character data extraction (skills, attacks, spells, items, abilities, saves, stats)
- **Accessibility Focus**: Screen reader friendly, high contrast support, optimized for blind users
- **Compact Design**: Modern dark theme with minimal screen footprint
- **Configurable Settings**: TTS speed (50%-200%), visual UI toggle, activation key customization

### Fixed
- **Control Suspension**: Removed problematic keybinding manipulation that caused JavaScript errors
- **Spell Navigation**: Fixed spell level submenu navigation issues, ensured Ready spells appear before Unprepared

### Key Features
- **Navigation**: Backtick (`) activation, arrow keys, numbers (1-9), F favorites, / submenus
- **TTS Integration**: Streamlined announcements, 120% speed, instant roll results
- **Character Actions**: Skills (Take 10/20), attacks (to-hit + damage), spells, items, saves, abilities
- **Smart UI**: Token-relative positioning, movement control suspension, compact design
- **Accessibility**: Optimized for screen readers and blind users, high contrast support
- **Performance**: Instant execution, efficient rendering, minimal resource usage

### Technical
- ESModules architecture for clean code organization
- Event-driven design using FoundryVTT hooks
- Modular component structure for easy maintenance
- Browser Web Speech API integration
- Responsive CSS design with accessibility features

### Supported Systems
- Pathfinder 1st Edition (PF1)
- Foundation for PF2e support (planned)

### Requirements
- FoundryVTT v11.315 or higher
- Modern browser with Web Speech API support
- PF1 system for full functionality
