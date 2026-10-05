# Changelog

All notable changes to the FolkenGames Quick Menu module will be documented in this file.

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
