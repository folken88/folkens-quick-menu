# FolkenGames Quick Menu

A unified accessibility module for FoundryVTT designed for blind and visually impaired players. Provides two parallel interfaces to the same dynamic action system:

1. **Chat Commands** — Type `/per` to roll Perception, `/scan` to discover all your abilities, `/list spells` to browse commands by category.
2. **iPod-Style Quick Menu** — Press backtick to open a TTS-driven hierarchical menu navigated with arrow keys and numbers.

Both interfaces share a common engine that dynamically discovers your character's skills, spells, attacks, items, and abilities. No static macros to maintain, no collisions that silently break things.

**Supported Systems:** Pathfinder 1e (PF1), Pathfinder 2e (PF2e), Starfinder (via PF2e)

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

### Abbreviation System

The module auto-generates 3-4 letter abbreviations from ability names:

| Name | Abbreviation | Rule |
|------|-------------|------|
| Perception | `/per` | PF1 system skill key |
| Fortitude Save | `/fort` | Legacy table |
| Wand of Cure Light Wounds | `/wclw` | First letter of each significant word |
| Destructinator | `/dest` | First 4 characters |
| Sneak Attack | `/sa` | First letter of each word |

When two abilities share an abbreviation (e.g., "Sneak Attack" and "Silent Advance" both map to `/sa`), the module guides you through resolving the conflict via TTS:

> "Conflict for S A. 1, Sneak Attack. 2, Silent Advance. Type the number to choose."

Your choice is saved to the actor's flags and persists across sessions.

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
| `` ` `` | Open/Close menu |
| `Up/Down` | Navigate |
| `Page Up/Down` | Jump 10 items |
| `Right/Enter` | Select / enter submenu |
| `Left/Escape` | Back / close |
| `F` | Add to favorites |
| `R` | Remove from favorites |
| `P` | Prepare spell (+1) |
| `U` | Unprepare spell (-1) |
| `/` | Item submenu (Take 10/20) |
| `1-9` | Number navigation |
| `Scroll wheel` | Navigate |

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
| Debug Mode | Off | Enable debug logging |

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

- FoundryVTT v12+
- PF1 or PF2e game system
- Modern browser with Web Speech API support

## License

MIT License

## Credits

Created by **Folken Games** for the FoundryVTT community. Designed with and for blind players.
