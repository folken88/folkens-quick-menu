# FolkenGames Quick Menu

A unified accessibility module for FoundryVTT designed for blind and visually impaired players. Provides two parallel interfaces to the same dynamic action system:

1. **Chat Commands** — Type `/per` to roll Perception, `/scan` to discover all your abilities, `/list spells` to browse commands by category.
2. **iPod-Style Quick Menu** — Press backtick to open a TTS-driven hierarchical menu navigated with arrow keys and numbers.

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
/fqm reset             → Clear all custom aliases and re-scan
/fqm help              → Show all available meta-commands
```

### Where Aliases Are Stored

Aliases persist in actor flags at `actor.flags['folken-games-quick-menu'].chatAliases`. You can inspect them in the browser console:

```javascript
game.user.character.getFlag('folken-games-quick-menu', 'chatAliases')
```

To clear manually: `await game.user.character.unsetFlag('folken-games-quick-menu', 'chatAliases')`

## Quick Menu (iPod Interface)

### Usage

1. **Press `` ` ``** (backtick) to open the Quick Menu
2. **Navigate** with arrow keys or numbers 1-9
3. **Select** with Enter or Right arrow
4. **Go back** with Escape or Left arrow
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
| `Left` / `Backspace` | Back one level |
| `Escape` | Close the whole menu, in one press |
| `F` | Add to favorites |
| `R` | Remove from favorites |
| `P` | Prepare spell (+1) |
| `U` | Unprepare spell (-1) |
| `/` | Item submenu (Take 10/20) |
| `1-9` | Number navigation |
| `Scroll wheel` | Navigate |


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

These work anywhere in Foundry (whether or not the menu is open), and are suppressed while you're typing in a text field so they never interfere with chat. They mirror the poker/dungeon game's blind mode.

| Key | Action |
|-----|--------|
| `[` / `]` | Reading speed slower / faster (announced, persisted) |
| `-` / `=` | Voice volume down / up (announced, persisted) |
| `\` (Backslash) | Jump focus to the chat prompt (fixes v14 announcing it as "new line"); configurable |

Item actions also speak a confirmation when triggered from the menu ("Blood Caimon Hide sent to chat", "… equipped", "… consumed"), so you always know something happened.

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
| Speech Slower / Faster Key | Comma / Period | Reading-speed keys. Moved off `[` `]` in 0.12.0, which Foundry core binds to Send to Back / Bring to Front |
| Voice Quieter / Louder Key | Minus / Equal | Volume keys |
| Debug Mode | Off | Enable debug logging |

*Reading speed and voice volume are adjusted live with `[` `]` and `-` `=` (see Global Accessibility Keys) and persist across reloads.*

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

