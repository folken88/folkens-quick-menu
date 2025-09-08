# FolkenGames Quick Menu - Project Sitemap

## 📁 Core Module Files

### `module.json`
**Purpose**: FoundryVTT module manifest  
**Location**: `/module.json`  
**Function**: Defines module metadata, dependencies, scripts, styles, languages, and settings

### `scripts/module.js`
**Purpose**: Main module entry point  
**Location**: `/scripts/module.js`  
**Function**: Initializes module, registers settings, creates global instances, sets up hooks

## 🎮 Core System Files

### `scripts/menu/QuickMenuManager.js`
**Purpose**: Central menu system controller  
**Location**: `/scripts/menu/QuickMenuManager.js`  
**Functions**:
- Menu navigation and state management (`menuStack`, `selectedIndex`)
- Character data integration via `CharacterDataExtractor`
- Action execution (spells, skills, attacks, items, saves, abilities)
- Favorites system (per-user, per-character storage)
- Visual UI rendering and positioning
- Spell preparation/unpreparing (P/U key functionality)
- FoundryVTT control suspension during menu use

### `scripts/character/CharacterDataExtractor.js`
**Purpose**: Character data processing and formatting  
**Location**: `/scripts/character/CharacterDataExtractor.js`  
**Functions**:
- Extract skills, attacks, spells, items, abilities, saves, stats from PF1 actors
- Format data into menu-compatible structure
- Handle spell level organization with custom numbering (0=cantrips, 1=1st level, etc.)
- Categorize items (Consumables, Activated Items, Other Items)
- Determine spell preparation status

### `scripts/tts/TTSManager.js`
**Purpose**: Text-to-Speech system  
**Location**: `/scripts/tts/TTSManager.js`  
**Functions**:
- Speech synthesis with dynamic rate adjustment
- Menu content announcement
- Roll result announcements (simple totals and attack summaries)
- Error feedback
- TTS speed customization (120% default)
- Debouncing to prevent speech interruption

### `scripts/input/KeyboardHandler.js`
**Purpose**: Global keyboard input management  
**Location**: `/scripts/input/KeyboardHandler.js`  
**Functions**:
- Global key capture and event prevention
- Menu navigation (arrows, numbers, Enter, Escape)
- Action keys (F=favorite, R=unfavorite, P=prepare, U=unprepare, /=submenu)
- Rapid number sequence navigation for deep menu access
- Module activation toggle (backtick key)

## 🎨 UI and Styling

### `styles/quick-menu.css`
**Purpose**: Visual menu styling  
**Location**: `/styles/quick-menu.css`  
**Function**: iPod-style compact UI with dark backgrounds, rounded corners, positioned relative to tokens

## 🌐 Localization

### `lang/en.json`
**Purpose**: English language strings  
**Location**: `/lang/en.json`  
**Function**: Settings names, hints, and UI text

## 📋 Documentation

### `README.md`
**Purpose**: User documentation  
**Location**: `/README.md`  
**Function**: Installation, usage, features, navigation controls

### `CHANGELOG.md`
**Purpose**: Version history  
**Location**: `/CHANGELOG.md`  
**Function**: Track feature additions, fixes, and changes

### `docs/sitemap.md` (This File)
**Purpose**: Development reference  
**Location**: `/docs/sitemap.md`  
**Function**: Document file structure and responsibilities

## 🔧 Configuration Files

### `.gitignore`
**Purpose**: Git exclusion rules  
**Location**: `/.gitignore`  
**Function**: Exclude docs folder and other development files from version control

## 🗂️ Data Flow

```
User Input (KeyboardHandler) 
    ↓
Menu Navigation (QuickMenuManager)
    ↓
Character Data (CharacterDataExtractor)
    ↓
Action Execution (QuickMenuManager)
    ↓
TTS Feedback (TTSManager)
```

## 🔑 Key Integrations

- **FoundryVTT API**: `game.settings`, `Hooks`, actor methods, item operations
- **PF1 System**: Actor/item data structures, spell preparation mechanics
- **Web APIs**: SpeechSynthesis, localStorage, DOM events
- **User Preferences**: Per-character favorites, TTS speed, UI visibility

## 🚀 Entry Points

1. **Module Load**: `module.js` → Register settings → Create managers
2. **User Activation**: Backtick key → `KeyboardHandler` → `QuickMenuManager.openMenu()`
3. **Menu Navigation**: Key events → Menu state changes → TTS announcements
4. **Action Execution**: Enter key → FoundryVTT API calls → Result feedback

## 🎯 Critical Dependencies

- **FoundryVTT Core**: v11+ (for modern hooks and APIs)
- **PF1 System**: Actor/item data structures and roll methods
- **Web Speech API**: For TTS functionality
- **Modern Browser**: For ES6+ features and CSS grid
