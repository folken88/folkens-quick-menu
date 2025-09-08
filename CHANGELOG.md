# Changelog

All notable changes to the FolkenGames Quick Menu module will be documented in this file.

## [0.1.0] - 2025-01-27

### Added
- **Initial Release**: Complete TTS-based character navigation system for FoundryVTT
- **iPod-Style Interface**: Hierarchical menu navigation inspired by classic iPod design
- **Advanced Keyboard Controls**: Arrow keys, numbers (1-9), F key favorites, / key submenus
- **Smart TTS System**: 120% default speed, streamlined announcements, enhanced attack reporting
- **Movement Isolation**: Suspends FoundryVTT controls while menu is active
- **Dynamic Favorites**: Add any action to favorites with F key, persistent storage
- **Skill Enhancement**: Take 10/Take 20 submenus for skill checks
- **Roll Result Integration**: Instant TTS announcements of dice totals using chat message hooks
- **Attack Intelligence**: "18 to hit, 12 damage" comprehensive attack result reporting
- **Token Positioning**: UI automatically positions near selected/assigned actor tokens
- **No Dialog Mode**: All actions use skipDialog for instant execution
- **PF1 Integration**: Complete character data extraction (skills, attacks, spells, items, abilities, saves, stats)
- **Accessibility Focus**: Screen reader friendly, high contrast support, optimized for blind users
- **Compact Design**: Modern dark theme with minimal screen footprint
- **Configurable Settings**: TTS speed (50%-200%), visual UI toggle, activation key customization

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
