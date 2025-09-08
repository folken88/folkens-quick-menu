# PF2e Integration Guide for Folken Games Quick Menu

This guide documents the official PF2e system APIs and patterns for implementing a blind-friendly quick menu in FoundryVTT.

## Overview

The PF2e system provides stable, documented inline syntax for triggering actions without needing to reverse-engineer internal methods. These are the official entry points:

- **@Check[]** - Universal skill/saves/perception/flat/statistic rolls
- **@Damage[]** - Typed damage with proper traits and automation  
- **[[/act]]** - System actions by slug (maneuvers, etc.)
- **@Template[]** - Area templates

## Inline Checks (@Check)

Use for skills, saves, Perception, flat checks, or any statistic slug with proper degrees-of-success and DC handling.

### Syntax Pattern
```
@Check[ type | one DC chooser | optional parameters ]
```

### Examples
```
@Check[fortitude|dc:20|basic]
@Check[athletics|dc:20|traits:action:long-jump]
@Check[perception|defense:perception]
@Check[reflex|against:class-spell|basic]
@Check[flat|dc:4]
@Check[arcane,occultism|dc:20]  // Multiple buttons
```

### Key Parameters
- **type** - skill/save/perception/flat/lore/statistic slug
- **defense** - target's defense statistic (e.g., perception)
- **against** - use a statistic (e.g., class-spell) to set the DC
- **dc** - numeric DC or resolve(@actor...): `dc:resolve(@actor.attributes.classDC.value)`
- **Other params** - basic, showDC, adjustment, immutable, name, traits, options, overrideTraits, rollerRole

## Inline Damage (@Damage)

Use when you want the system to apply traits, modifiers, and automation to damage rolls.

### Syntax Pattern
```
@Damage[ formula | optional roll options ]
```

### Examples
```
@Damage[(1d6 + 3)[fire]]
@Damage[5d6[acid],5d6[cold],5d6[fire]]
@Damage[(2d6 + 4 + (2d6[precision]))[slashing]]
@Damage[1d6[persistent,fire]]
@Damage[2d6[fire]|options:area-damage]
```

## Inline Actions ([[/act]])

PF2e exposes every system action via chat-style slash commands. Perfect for maneuvers.

### Syntax Pattern
```
[[/act action-slug optional arguments]]
```

### Examples
```
[[/act grapple]]
[[/act administer-first-aid variant=stop-bleeding]]
[[/act sneak dc=20]]
[[/act seek dc=thievery]]
[[/act make-an-impression statistic=performance]]
```

### Getting Available Actions
```javascript
// List all available action slugs
console.log(Object.keys(game.pf2e.actions));
```

## Inline Templates (@Template)

For area effects and templates.

### Syntax Pattern
```
@Template[type:emanation|distance:30]
```

Also supports: burst, cone, line, width, traits, and custom JSON.

## Runtime Menu Building Patterns

### A) Enumerate System Actions
```javascript
const actions = Object.keys(game.pf2e.actions).sort();
// Build UI with actions as [[/act ${slug}]]
```

### B) Build Core Checks Grid
```javascript
const a = token?.actor ?? game.user.character;
const skillSlugs = Object.keys(a.system.skills);
const saveSlugs = ["fortitude","reflex","will"];
const core = ["perception","flat"];
// Each becomes @Check[${slug}]
```

### C) Enumerate Skills and Saves
```javascript
const a = token?.actor ?? game.user.character;
const skills = Object.entries(a.system.skills).map(([slug, s]) => ({ 
  slug, 
  label: s.label 
}));
const saves = ["fortitude","reflex","will"].map(k => ({ 
  slug: k, 
  label: a.system.saves[k].label 
}));
const perception = { 
  slug: "perception", 
  label: a.system.attributes.perception.label 
};
```

### D) Target-Based Opposed Checks
```javascript
// If target selected, generate opposed checks
@Check[deception|defense:perception]
@Check[athletics|defense:fortitude]
```

## Quick Menu Implementation Strategy

1. **Skills/Saves/Perception** → Use `@Check[slug]` syntax
2. **Actions/Maneuvers** → Use `[[/act slug]]` syntax  
3. **Damage Effects** → Use `@Damage[formula[type]]` syntax
4. **Spells** → Post to chat for built-in buttons or use relevant inline syntax
5. **Items** → Post to chat or emit relevant inline action/check/damage

## Key Benefits

- **Stable API** - These are officially maintained entry points
- **Full Automation** - Inherits all PF2e traits, modifiers, and roll options
- **Degrees of Success** - Proper critical success/failure handling
- **Rule Elements** - Automatically applies character modifiers
- **Roll Options** - Supports automation like area-damage, damaging-effect, etc.

## Primary Documentation Sources

- **PF2e Style Guide** - Comprehensive inline syntax reference
- **PF2e Wiki Quickstart** - Rule elements and roll options  
- **PF2e Release Notes** - Current automation behavior updates

## Implementation Notes for Quick Menu

- Use inline syntax instead of direct internal method calls
- Leverage `game.pf2e.actions` for discovering available maneuvers
- Build menus dynamically from actor.system.skills, actor.system.saves
- Post chat messages with inline syntax for instant execution
- Support both targeted and untargeted scenarios
