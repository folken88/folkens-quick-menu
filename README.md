# FolkenGames Quick Menu

A unified accessibility module for FoundryVTT designed for blind and visually impaired players. Provides two parallel interfaces to the same dynamic action system:

1. **Chat Commands** — Type `/per` to roll Perception, `/scan` to discover all your abilities, `/list spells` to browse commands by category.
2. **iPod-Style Quick Menu** — Press backtick to open a TTS-driven hierarchical menu navigated with arrow keys and letters.

Both interfaces share a common engine that dynamically discovers your character's skills, spells, attacks, items, and abilities. No static macros to maintain, no collisions that silently break things. A planned third interface — **push-to-talk voice** — will route spoken words ("perception", "balrog", "status") through the same engine.

Commands are deliberately short (3-4 characters) because blind players type little: `/per`, `/st`, `/hp`, `/eq`.

**Supported:** Foundry **v13 and v14** · Pathfinder 1e (PF1) · Pathfinder 2e (PF2e, partial)

## Chat Commands

### Getting Started

Skills, saves, and ability checks work immediately — no setup required:

```
/per    → Roll Perception
/str    → Strength check
/fort   → Fortitude save
/init   → Roll Initiative
```

For spells, attacks, items, and feats, type `/scan` first:

```
/scan   → Scans your character, builds abbreviations, walks you through any conflicts
```

### Browsing Your Commands

```
/list          → TTS summary of categories ("47 commands. Say /list skills, /list spells...")
/list skills   → TTS reads skill abbreviations one by one
/list spells   → TTS reads spell abbreviations
/find fire     → Search all commands matching "fire"
```

Commands are always **spelled out** in TTS so you hear exactly what to type — `/find balrog` says *"slash b, a, l, r, for Balrog"*, never "balrruh."

### Situational Awareness (state reads)

Instant reads of your current condition — no navigation needed:

```
/st     → Full status: HP, AC, ability damage, conditions, buffs
/hp     → Hit points (plus temp / nonlethal)
/ac     → AC, touch, flat-footed
/cmd    → CMD and flat-footed CMD
/cmb    → Roll a combat maneuver (trip, grapple, bull rush, disarm, any of them)
/cond   → Active conditions
/bf     → Buffs that are ON and affecting you
/bfo    → Buffs on your sheet that are OFF - the list to hand someone
```

> `/st` → "70 of 70 hit points. AC 22, touch 15, flat-footed 18. No conditions. Buffs: Inspire Courage, Haste."

> `/ac` → "AC 36, touch 22, flat-footed 28."    `/cmd` → "CMD 35, flat-footed 27."

Each of these answers one question and stops. That is deliberate: a blind player hears one thing at a time, with the rest of the table talking over it, so a command that reads out a paragraph is worse than useless mid-combat. The full AC breakdown (every contributing bonus, including the ones PF1 overrode, plus roll notes) is on the **agent API** instead, where an assistant can reconcile a sheet properly.

### Up-casting (spontaneous casters)

When a spontaneous caster runs out of slots at a spell's level, casting it offers
a higher slot instead:

> `/6dis` -> "Out of 6th. Cast Disintegrate with a 7th?"
> Type **Y** to cast it from a 7th-level slot, or **N** to cancel.

- Only for spontaneous books. A prepared caster hears "None left."
- It takes the **lowest** free level above the spell's own, so the big slots go last.
- The offer expires after 30 seconds, and any other command withdraws it, so a
  stray Y can never spend a slot you had forgotten about. A Y or N that arrives
  just after it expired is told "Offer expired." instead of going to chat.
- The spell is cast exactly as written. The larger slot buys the cast, nothing more.

**Choosing the slot yourself.** Add the slot level to the spell's command:
`/6cl7` casts Chain Lightning (`/6cl`) from a 7th-level slot, with no question,
whether or not 6th-level slots remain.

**Slots left.** `/sr1` to `/sr9` read the slots left at that level:
"3 of 5 7th-level spells left." For a prepared caster it counts the spells
prepared at that level that are still uncast.

This is the rules as written: the Core Rulebook's section on spell slots says "A
spellcaster always has the option to fill a higher-level spell slot with a
lower-level spell." (0.14.0 wrongly called it a house rule; Josh found the line.)

### Abbreviation System

Commands are generated from the thing's own name, so you can work out the command
without having been told it.

**Skills, saves and checks** use the system's own key, corrected where it collides:

| Name | Command | Rule |
|------|---------|------|
| Perception | `/per` | PF1 skill key |
| Fortitude Save | `/for` | Saves are three letters |
| Reflex Save | `/ref` | |
| Will Save | `/wil` | |
| Intimidate | `/itm` | Moved off `int`, which Intelligence owns |
| Initiative | `/ini` | |
| Concentration / Caster level | `/conc`, `/clc` | Second spellbook: `/conc2`, `/clc2` |

**Spells are level-first.** The spell level comes first as a digit, `0` for cantrips:

| Spell | Command | Rule |
|-------|---------|------|
| Haste (3rd) | `/3hast` | One word: its first four letters |
| Teleport (5th) | `/5tele` | |
| Magic Missile (1st) | `/1mm` | Several words: the initials |
| Detect Magic (cantrip) | `/0dm` | |
| Teleport, Greater (7th) | `/7tg` | |
| Protection from Evil (1st) | `/1pfe` | Only "of" is dropped |
| Mage's Faithful Hound (5th) | `/5mfh` | An apostrophe does not start a word |

**Everything else** — wands, scrolls, potions, gear, feats, attacks — takes the
initials of each significant word, or the first four letters of a one-word name:

| Name | Command |
|------|---------|
| Wand of Cure Light Wounds | `/wclw` |
| Sneak Attack | `/sa` |
| Destructinator | `/dest` |

**When two things come out the same**, the module pulls them apart by taking more
letters rather than asking you to pick a number:

- Faerie Fire and Feather Fall, both 1st level → `/1ffi` and `/1ffa`
- Scroll of Technomancy and Scroll of Teleport → `/stec` and `/stel`
- When the shared word is the *last* one, it takes more of the first instead:
  Detect Magic and Dispel Magic at the same level → `/2dem` and `/2dim`

Every command is handed to exactly one thing, and there are no aliases: one name,
one command. A command that would collide with a Foundry built-in or one of this
module's own meta-commands gets an `x` appended (`/statx`, not `/stat`).

### Managing Aliases

```
/fqm rename sa2 sila   → Rename /sa2 to /sila
/fqm reset             → Clear all custom aliases, restore each item's own code and speak every code that moved
/fqm help              → Show all available meta-commands
```

### A Command Never Changes Under You

Codes are assigned in tiers, and nothing assigned earlier ever moves:

1. **The fixed core** - every skill, save and ability check, initiative, combat
   maneuver, stabilize, caster level, concentration and pool read - comes from
   system keys, so it is identical on every character in every game. Perception
   is `/per`, Will is `/wil`, Intimidate is `/itm`.
2. **Permanent things** - attacks, spells, features, gear - oldest first by the
   date Foundry stamped on the item. The thing you had first keeps its code; a
   newcomer that would collide extends its own.
3. **Consumables** always give way.

Every generated code is remembered on the character by name and type, so a
rebuild, a reload or a restocked potion gets the same answer. Your own `/fqm
rename` beats everything except the fixed core: a skill, save or check
code can never be taken by an alias, and an old alias that clashed is cleared
when the core takes over, each move spoken once. Renaming or identifying an
item rebuilds its code and speaks every move. Potions, wands and scrolls get
spell-style codes: p, w or s plus the spell's letters (`/pcmw`, `/wclw`,
`/sfly`). Two wands of one spell stay two commands; rename one to tell them
apart. When you gain an item its code is spoken once: "Potion
of Fly is slash p, f, l." If a code ever has to change - only your own alias can
cause that - the voice says which and what it is now.

### Where Aliases Are Stored

Aliases persist in actor flags at `actor.flags['folken-games-quick-menu'].chatAliases`. You can inspect them in the browser console:

```javascript
game.user.character.getFlag('folken-games-quick-menu', 'chatAliases')
```

To clear manually: `await game.user.character.unsetFlag('folken-games-quick-menu', 'chatAliases')`

## Quick Menu (iPod Interface)

### Usage

1. **Press `` ` ``** (backtick) to open the Quick Menu
2. **Navigate** with arrow keys, or type letters to jump to a name (numbers are an optional setting)
3. **Select** with Enter or Right arrow
4. **Go back** with Left arrow; Left at the top stays put ("Top.") and only Escape closes the menu
5. **Listen** for TTS announcements

### Menu Structure

```
Quick Menu
  1. Favorites       (added with F key)
  2. Skills          (all skills + Take 10/20)
  3. Combat          (attacks, initiative, stabilize)
  4. Spells          (by level, with P/U to prepare/unprepare)
  5. Items           (consumables, equipment, containers)
  6. Abilities       (feats and class abilities)
  7. Saves           (Fortitude, Reflex, Will)
  8. Stats           (ability checks, initiative)
```

### Controls

| Input | Action |
|-------|--------|
| `` ` `` | Open the menu. If it is already open, re-announce the current item ("where am I") |
| `Up/Down` | Navigate |
| `Page Up/Down` | Jump 10 items |
| `Right/Enter` | Select / enter submenu |
| `Left` / `Backspace` | Back one level. At the top level it stays put and says "Top." |
| `Escape` | Close the whole menu, in one press. The only key that closes it |
| `A-Z` | Type-ahead: letters typed within a second jump to the first item starting with them ("per" → Perception); the same letter again goes to the next match. If joined letters match nothing, the newest letter is tried alone. Never uses an item |
| `Shift+F` | Add to favorites (configurable) |
| `Shift+R` | Remove from favorites (configurable) |
| `Shift+P` | Prepare spell (+1) (configurable). Only for a character with a prepared spellbook |
| `Shift+U` | Unprepare spell (-1) (configurable) |
| `/` | Options: Take 10/20 on a skill, Normal/Full Attack on an attack. Anything else says "No options" and is never used |
| `Shift`+anything else | Passed through |
| `0-9` | Move to that position in the list. Numbers are off by default: a digit jumps at once and items are not read with their numbers. Turn on *Speak item numbers in the menu* to hear them and to combine digits (38 reaches item 38). Never uses an item |
| `Scroll wheel` | Navigate |


**What the menu says.** Items are read by name. Landing on a consumable speaks its
count at once. An empty Items category says "<category>, empty." and stays. A
container lists everything inside it, read-only, with quantities (`/lds` in chat
speaks the same); both PF1 container formats work. A spell that appears in two
spellbooks says which ("Detect Magic, spell-like"). Slash on a favorite offers
its own Slash menu, and removing the last favorite works and speaks.

**Keys the module claims.** The module only ever consumes keys it actually uses,
and every one of them is a setting, because Foundry core owns many of the obvious
choices. If a key of ours ever collides with one of Foundry's, the module moves —
Foundry gives players no easy way to rebind its own.

**Why each key does only one thing.** A screen reader can deliver one physical
keypress to the page as two identical events. While the activation key toggled,
that opened the menu and instantly closed it again, and every arrow afterwards
went to a closed menu - which is what a blind player experiences as "the menu is
dead". So the activation key only ever opens, and `Escape` only ever closes: press
either twice and you end up where you would have after pressing it once.

## Global Accessibility Keys

These work anywhere in Foundry (whether or not the menu is open). They are suppressed while you're typing in a text field so they never interfere with chat - except while the menu is open, when nothing is being typed even if focus is still in the chat box. They mirror the poker/dungeon game's blind mode.

| Key | Action |
|-----|--------|
| `,` / `.` | Reading speed slower / faster (announced, persisted); configurable |
| `-` / `=` or numpad `-` / `+` | Voice volume down / up (announced, persisted); configurable |
| `Control`, alone | Stop the voice (the default stop key; it is a setting). Works everywhere, including the chat box - the screen-reader convention. Ctrl+anything else is left alone. The built-in S stop key is gone: S is always a letter |
| `\` (Backslash) | Jump focus to the chat prompt (fixes v14 announcing it as "new line"), closing the menu first if it is open; configurable. If focus does not really reach the chat box the voice says so and retries |
| `F9` | Cycle Spoken Detail: auto, short, full - announced; configurable. Works from the chat box too |

### What you hear

- **Accepted.** From the menu, the menu closes at once with a falling tone.
  Every chat command that nothing else confirms gets one short high blip,
  because PF1 can take two seconds or more to answer. The name is not spoken
  at that point; the result says it (Josh's rule).
- **Someone else.** Put `o` (or `other`) after an item or spell code and it is
  used for someone else: the card goes to chat, nothing is applied to you, and
  any buff it switched on is reverted. Any other word after a code is refused
  with the error tones and a spoken reason, and nothing is used. Haste used
  plainly also switches on for your owned allies within 15 feet and names the
  ones Foundry will not let it change.
- **Result.** The name first, then the roll: "Rod, 7 fire damage. 2 of 3 left." The roll: "30 to hit, 11 damage", or "31 damage" for a Fireball.
  Ability damage and nonlethal say so: "1 Constitution damage", "2 nonlethal".
  An attack that always hits says "hits", with no threat to confirm. A threat says so, with its
  confirmation and what the damage becomes if it confirms: "41 to hit, threat,
  confirms 44, 17 damage, 78 on a crit." A natural 20 is "natural 20, hits"; a
  natural 1 is "natural 1, miss". A save the target faces is added when the card's save has a type: "Fort DC
  15." Healing that is temporary hit points says "temporary hit points". Items with uses say what is left: "2 of 3 left."; something that gives a
  point back says "Regained. 2 of 3." Ammunition is only ever read, never spent:
  "17 arrows left." Plain `/r`, `/d` and `/h` rolls are read too. Rolled notes in a card are
  read at every level ("8 images", "Spell penetration 36"); there is no
  "Card posted." and no "Plus notes". Whenever a buff switches on - from a
  potion, wand, scroll, spell or Auto Buff - it is said: "Shield on." At full
  detail a spell adds its range, area, duration and whether spell resistance
  applies; "see text" becomes the linked buff's duration or "see description".
  A card that is slow to roll gets "Lightning Bolt, waiting on the dice." at 8
  seconds and is still read when it lands; an item that never produces a card
  says "no result" after 10 minutes.
- **Failed.** Two pulses at 400 Hz - the Poker Dungeon's error sound, raised so
  it carries over a screen reader - then why, if there is a why: "None left.",
  "No charges.", "Not found. Type slash scan.", "No command." Anything that
  starts with a slash and is not a command, "/per/pod" included, gets this too.
- **Stopped.** One short high blip when the stop key cuts the voice off. Each
  command is read by its own reader, so one still rolling never loses another's
  result.
- **Voice down.** Three long falling slides at full volume, repeating every 20
  seconds until a line is heard again, and a whisper in chat: Chrome's speech
  engine has stopped making sound. Quit Chrome completely and reopen it.

Nothing cuts a result off except menu navigation and the stop key. Lines are
100 ms apart. Every result waits its turn and is spoken once the voice is silent, in order. The stop key
stops only the line playing now; whatever is waiting still plays.

A line is never cut off before Chrome has started speaking it. Josh measured
(2026-11-01, 575 cancels) that a cancel landing on a line Chrome has been handed
but has not started, or in the same instant it starts, jams Chrome's voice until
Chrome is quit; a cancel 1 ms or more after the start never did. So a cut waits
for the start plus 20 ms, an idle engine is never cancelled, and a line that
never starts gets one cancel and one more try before the voice is declared down.

Area spells, scrolls and wands no longer wait for a template to be placed on the
map (setting: *Skip Template Placement*).

## TTS Providers

The module supports three TTS providers with automatic fallback:

1. **Talking Actors** — If the `acd-talking-actors-forked` module is active and the actor has a voice configured, TTS speaks in the character's ElevenLabs voice.
2. **ElevenLabs Direct** — If an ElevenLabs API key and voice ID are entered in module settings, uses ElevenLabs directly.
3. **Browser Speech API** — Default fallback using the browser's built-in Web Speech API.

Configure via module settings: *TTS Provider*, *ElevenLabs API Key*, *ElevenLabs Voice ID*.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Quick Menu | On | Toggle the iPod-style menu |
| Enable Chat Commands | On | Toggle /command chat interceptor |
| Enable TTS | On | Toggle text-to-speech |
| TTS Speed | 120% | Speech rate (50-200%) |
| TTS Provider | Auto | Auto / Browser / ElevenLabs |
| ElevenLabs API Key | — | Optional API key for ElevenLabs TTS |
| ElevenLabs Voice ID | — | Voice ID for ElevenLabs |
| Show Visual UI | On | Show the iPod-style visual interface |
| Activation Key | Backtick | Key to open the quick menu |
| Move Focus Into The Menu | On | On: the menu takes keyboard focus, which screen readers in browse mode (NVDA, JAWS, VoiceOver Quick Nav) need before passing it the arrow keys. Off: focus stays put so your screen-reader cursor does not move |
| Jump-to-Chat Key | Backslash | Key to move focus to the chat prompt |
| Spoken Detail | Auto | Auto is short while a combat is running and fuller outside it; or force Short / Full |
| Menu Voice | Automatic | Which voice reads the menu. Automatic prefers a voice installed on your computer, which is clearer than an online one |
| Speech Slower / Faster Key | Comma / Period | Reading-speed keys. Moved off `[` `]` in 0.12.0, which Foundry core binds to Send to Back / Bring to Front |
| Voice Quieter / Louder Key | Minus / Equal | Volume keys |
| Skip Template Placement | On | Area spells, scrolls and wands cast without waiting for a template on the map |
| Debug Mode | Off | Enable debug logging |

*Reading speed and voice volume are adjusted live with `,` `.` and `-` `=` (see Global Accessibility Keys) and persist across reloads. Roll results and sounds follow the volume too.*

## Architecture

```
scripts/
  module.js                          — Entry point, settings, hooks
  executor/
    ActionExecutor.js                — Shared action execution (skills, attacks, spells, etc.)
  chat/
    ChatCommandInterceptor.js        — chatMessage hook, /scan, /list, /find, /fqm
    AbbreviationGenerator.js         — Name → 3-4 letter abbreviation algorithm
    AbbreviationResolver.js          — Abbreviation ↔ action mapping, collision detection, flag persistence
    CollisionResolver.js             — Interactive guided collision resolution via TTS + chat
  menu/
    QuickMenuManager.js              — iPod-style menu navigation
  character/
    CharacterDataExtractor.js        — PF1 character data discovery
    CharacterDataExtractorPF2e.js    — PF2e character data discovery
  tts/
    TTSManager.js                    — TTS with provider chain (Talking Actors → ElevenLabs → Browser)
  input/
    KeyboardHandler.js               — Keyboard navigation
  system/
    SystemDetector.js                — PF1/PF2e system detection
```

## Migration from folkens-macros-pf1

This module replaces the old `folkens-macros-pf1` static macro compendium. The chat commands use the same abbreviations (`/per`, `/str`, `/wil`, `/init`, etc.) so there's no relearning required. During migration, both modules can be active simultaneously — unrecognized commands pass through to other modules.

## Requirements

- FoundryVTT **v13 or v14** (minimum v12)
- PF1 (full) or PF2e (partial) game system
- Modern browser with Web Speech API support

## License

MIT License

## Credits

Created by **Folken Games** for the FoundryVTT community.

Co-developed with **Josh Morrison**, who is blind and plays with it. The command scheme, the audio ordering and most of what this module gets right came out of his field reports: level-first spell commands, one command per question, and the rule that a value which groups correctly on a character sheet can group wrongly by ear. He found bugs by adding up what he heard.

