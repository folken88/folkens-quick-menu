# PF2e Integration Research - Comprehensive Findings

## Overview
This document contains research findings from examining existing PF2e modules to understand how they interact with the PF2e system and FoundryVTT. This research was conducted to identify gaps in our Quick Menu implementation and learn proven patterns.

## Modules Examined

### 1. PF2e HUD (pf2e-hud)
- **Author**: Idle (reonZ)
- **Key Insights**: Uses advanced module architecture with lib-wrapper integration
- **Code Structure**: Heavily minified/compiled (difficult to extract patterns)

### 2. PF2e Toolbelt (pf2e-toolbelt)
- **Author**: Idle (reonZ)
- **Key Insights**: Similar advanced architecture, compiled code
- **Code Structure**: Uses sophisticated module registration system

### 3. PF2e Macros (pf2e-macros)
- **Author**: Community module
- **Key Insights**: Contains useful patterns for event handling and dialog bypassing
- **Important Patterns Found**:

#### Skip Dialog Implementation:
```javascript
export function eventSkipped(event, isDamage = false) {
    return game.settings.get(moduleName, "skipRollDialogMacro")
        ? new KeyboardEvent('keydown', {
            'shiftKey': isDamage 
                ? game.user.flags.pf2e.settings.showDamageDialogs 
                : game.user.flags.pf2e.settings.showCheckDialogs
        })
        : event;
}

export function rollSkipDialog(event) {
    return game.settings.get(moduleName, "skipRollDialogMacro")
        ? true
        : (event.shiftKey 
            ? game.user.flags.pf2e.settings.showCheckDialogs 
            : !game.user.flags.pf2e.settings.showCheckDialogs);
}
```

### 4. Enhanced Combat HUD PF2e (enhancedcombathud-pf2e)
- **Author**: ArgonUI team
- **Key Insights**: Excellent examples of PF2e integration patterns
- **Important Patterns Found**:

#### Item Macro Creation:
```javascript
function itemMacroCode(item) {
    switch (item.type) {
        case "condition": 
            return `
                for (let actor of actors) {
                    actor.toggleCondition(${item.slug});
                }
            `;
        
        case "effect": 
            return `
                ITEM_UUID = "${item.getFlag("core", "sourceId")}";
                source = (await fromUuid(ITEM_UUID))?.toObject();
                if (!source) return;
                
                if (actor) {
                    const existing = actor.itemTypes.effect.find((item) => 
                        item.flags.core?.sourceId === ITEM_UUID);
                    
                    if (existing) {
                        await existing.delete();
                    } else {
                        await actor.createEmbeddedDocuments("Item", [source]);
                    }
                }
            `;
        
        case "action":
            return `game.pf2e.rollActionMacro({ 
                actorUUID: "${item.actorUUID}", 
                type: "strike", 
                itemId: "LlYpQtJJJGFb1jri", 
                slug: "staff" 
            })`;
        
        default: 
            return `game.pf2e.rollItemMacro("${item.id}");`;
    }
}
```

#### PF2e Actions Integration:
```javascript
// Using game.pf2e.actions for built-in actions
action = game.pf2e.actions.get("stand");
action = game.pf2e.actions.get("drop-prone");

// Executing actions
game.pf2e.actions.get("step").toActionVariant({actors : actor}).toMessage();
```

#### Initiative Rolling:
```javascript
this.actor.rollInitiative({ 
    rerollInitiative: true, 
    createCombatants: true 
});
```

## Key Findings & Gaps in Our Implementation

### 1. Dialog Bypassing Methods
**Current**: We use `shiftKey: true` in fake events
**Better**: Use PF2e's user flag system for dialog preferences:
- `game.user.flags.pf2e.settings.showCheckDialogs`
- `game.user.flags.pf2e.settings.showDamageDialogs`

### 2. Initiative Rolling
**Current**: Missing from our PF2e implementation
**Solution**: Use `actor.rollInitiative()` method

### 3. PF2e Actions System
**Current**: We use hardcoded action lists
**Better**: Access via `game.pf2e.actions.get(actionKey)`
**Available Actions**: 
- "stand", "drop-prone", "step", etc.
- Dynamic access with `game.pf2e.actions` collection

### 4. Effect Management
**Current**: Not implemented
**Pattern**: Use `actor.itemTypes.effect` and `actor.createEmbeddedDocuments`

### 5. Condition Management
**Current**: Not implemented
**Pattern**: Use `actor.toggleCondition(slug)`

### 6. Item Type Checking
**Current**: Basic `item.type` checking
**Better**: Use `item.isOfType("consumable")` etc.

### 7. Unidentified Items
**Current**: Not handled
**Pattern**: Check `item.system.identification?.status == "unidentified"`

## Recommendations for Quick Menu Enhancement

### Immediate Improvements:

1. **Update Dialog Bypassing**:
```javascript
// Instead of hardcoded shiftKey: true
const skipDialog = game.user.flags.pf2e.settings.showCheckDialogs;
const fakeEvent = { 
    shiftKey: !skipDialog,  // Invert based on user preference
    // ... other properties
};
```

2. **Add Initiative Support**:
```javascript
async executeInitiativeRoll(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    try {
        await actor.rollInitiative({ 
            rerollInitiative: true, 
            createCombatants: true 
        });
    } catch (error) {
        console.error("Initiative roll error:", error);
        game.folkenQuickMenu.tts.speak('Initiative failed');
    }
}
```

3. **Enhance Actions System**:
```javascript
// Instead of hardcoded action lists, use:
const availableActions = Array.from(game.pf2e.actions.keys());
const action = game.pf2e.actions.get(actionKey);
```

4. **Add Condition Support**:
```javascript
async executeConditionToggle(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    try {
        await actor.toggleCondition(actionItem.conditionSlug);
        game.folkenQuickMenu.tts.speak(`${actionItem.label} toggled`);
    } catch (error) {
        console.error("Condition toggle error:", error);
        game.folkenQuickMenu.tts.speak('Condition toggle failed');
    }
}
```

### Future Enhancements:

1. **Effect Management Menu**
2. **Condition Management Menu** 
3. **Advanced Item Identification Handling**
4. **Integration with PF2e Workbench Settings**

## API Reference

### Core PF2e Game Object Structure:
```javascript
game.pf2e = {
    actions: Map,           // Built-in actions (stand, drop-prone, etc.)
    rollItemMacro: Function,    // Roll item by Actor.ID.Item.ID path
    rollActionMacro: Function,  // Roll action by parameters
    // ... other methods
}

game.user.flags.pf2e.settings = {
    showCheckDialogs: Boolean,  // User preference for check dialogs
    showDamageDialogs: Boolean, // User preference for damage dialogs
    // ... other settings
}
```

### Actor Methods:
```javascript
actor.rollInitiative(options)
actor.toggleCondition(slug)
actor.itemTypes.effect        // Array of effects
actor.itemTypes.feat         // Array of feats
actor.itemTypes.condition    // Array of conditions
```

### Item Methods:
```javascript
item.isOfType("type")
item.system.identification.status
item.getFlag("core", "sourceId")
```

This research provides a solid foundation for enhancing our PF2e integration with proven patterns from the community.