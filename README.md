# FolkenGames Quick Menu

A super fast TTS-based hierarchical character navigation system for FoundryVTT, designed for accessibility and efficiency. Inspired by the classic iPod interface, this module provides instant access to character functions through keyboard navigation and intelligent text-to-speech announcements.

## Features

- **Keyboard Navigation**: Navigate with arrow keys, numbers, or scroll wheel
- **Smart TTS**: Announces current selection as you navigate
- **Text-to-Speech**: Full TTS support for accessibility
- **Hierarchical Menu**: iPod-style nested menu structure
- **Dynamic Favorites**: Add any action to favorites with F key
- **Skill Options**: Take 10/Take 20 submenus for skills
- **No Dialogs**: All actions use skipDialog for instant execution
- **Smart Result Announcements**: Only dice totals (no redundant "rolling" messages)
- **Enhanced Attack Feedback**: "18 to hit, 12 damage" for complete attack information
- **Movement Isolation**: Suspends FoundryVTT movement controls while menu is open
- **Character Integration**: Automatically extracts skills, attacks, spells, and items from your character
- **System Support**: Designed for PF1 system (PF2e support planned)
- **Compact Visual UI**: Positioned near your token, shows on by default

## Quick Start

1. **Install** the module from the FoundryVTT module browser
2. **Assign a character** to your user account (or select a token on the canvas)
3. **Press `` ` ``** (backtick key) to open the Quick Menu
4. **Navigate** through the hierarchical menu system:
   - Use **arrow keys** or **numbers 1-9** to navigate
   - Press **Enter** or **Right arrow** to select/enter submenus
   - Press **F** to add current item to favorites
   - Press **/** to access item-specific options (Take 10/20, etc.)
   - Press **Escape** or **Left arrow** to go back
5. **Listen** for TTS announcements of your current selection and roll results

## Menu Structure

```
Quick Menu
├── 1. Favorites       (Dynamic favorites added with F key)
├── 2. Skills          (All character skills + Take 10/20 options)
├── 3. Attacks         (Weapons with to-hit + damage reporting)
├── 4. Spells          (Organized by spell level 0-9)
├── 5. Items           (Usable consumables and equipment)
├── 6. Abilities       (Special abilities and feats)
├── 7. Saves           (Fortitude, Reflex, Will saves)
└── 8. Stats           (Ability checks and initiative)
```

### Example Navigation Flow
```
User: Press ` → hears "1. Favorites"
User: Press 2 → hears "2. Skills" 
User: Press Enter → hears "1. Acrobatics"
User: Press F → hears "Acrobatics favorited"
User: Press / → hears "1. Take 10 Acrobatics"
User: Press Enter → [dice sounds] → hears "23"
```

## Navigation Controls

| Input | Action |
|-------|--------|
| `` ` `` | Open/Close Quick Menu |
| `↑` / `↓` | Navigate up/down |
| `→` / `Enter` | Select/Enter submenu |
| `←` / `Escape` | Back/Close |
| `F` | Add current item to favorites |
| `/` | Show item submenu (Take 10/20, etc.) |
| `1-9` | Jump to numbered item |
| `Scroll Wheel` | Navigate up/down |
| `Middle Click` | Select item |

## Settings

- **Enable Quick Menu**: Toggle the entire system
- **Enable Text-to-Speech**: Toggle TTS announcements
- **TTS Speaking Speed**: Adjust speech rate (50%-200%, defaults to 120% for efficiency)
- **Debug Mode**: Enable debug logging
- **Show Visual UI**: Display the iPod-style visual interface
- **Activation Key**: Customize the key to open the menu

## Accessibility Features

- **Smart TTS Navigation**: Announces current selection as you navigate through menus
- **Smart Roll Results**: Announces dice totals instantly without redundant "rolling" messages
- **Enhanced Attack Results**: Reports both to-hit and damage totals for attacks
- **Optimized TTS Speed**: Defaults to 120% speed for efficiency (preferred by accessibility users)
- **Full TTS Support**: Every menu item and action is announced
- **Keyboard Only**: Complete navigation without mouse
- **High Contrast**: Supports high contrast display modes
- **Screen Reader Friendly**: Compatible with screen reader software

## System Requirements

- FoundryVTT v11.315 or higher
- PF1 system (currently supported)
- Modern browser with Web Speech API support (for TTS)

## Character Requirements

The Quick Menu requires either:
1. A character assigned to your user account, OR
2. A single selected token on the canvas

## Technical Details

### Module Structure
```
folken-games-quick-menu/
├── scripts/
│   ├── module.js                 # Main entry point
│   ├── menu/
│   │   └── QuickMenuManager.js   # Core menu system
│   ├── character/
│   │   └── CharacterDataExtractor.js # Character data extraction
│   ├── tts/
│   │   └── TTSManager.js         # Text-to-speech functionality
│   └── input/
│       └── KeyboardHandler.js   # Keyboard input handling
├── styles/
│   └── quick-menu.css           # iPod-style visual UI
├── lang/
│   └── en.json                  # Localization
└── module.json                  # Module manifest
```

### Character Data Extraction

The module automatically extracts:
- **Skills**: All available skills with modifiers
- **Attacks**: Weapons and attack items
- **Spells**: Organized by spell level (Cantrips, Level 1-9)
- **Items**: Consumables and usable equipment
- **Abilities**: Special abilities and feats with uses
- **Saves**: Fortitude, Reflex, and Will saves
- **Stats**: Ability score checks and initiative

### TTS Integration

- Uses browser's built-in Web Speech API
- Announces menu navigation and selections
- Configurable voice settings
- Queue management for smooth speech flow

## Development

This module is designed with modularity and extensibility in mind:

- **ESModules**: Clean import/export structure
- **Separation of Concerns**: Each component has a specific responsibility
- **Event-Driven**: Uses FoundryVTT hooks and browser events
- **Configurable**: Extensive settings for customization

## Roadmap

- [ ] PF2e system support
- [ ] Custom favorites management
- [ ] Macro integration
- [ ] Voice commands
- [ ] Mobile/touch support
- [ ] Additional game system support

## Contributing

Issues and pull requests welcome! Please see the [GitHub repository](https://github.com/folken88/folkens-quick-menu) for development guidelines.

## License

This module is released under the MIT License.

## Credits

Created by **Folken88** for the FoundryVTT community.

Inspired by the classic iPod interface design for intuitive hierarchical navigation.
