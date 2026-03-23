# Changelog

All notable changes to the FolkenGames Quick Menu module will be documented in this file.

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
