# Dynamic Actions Enhancement for Blind Players

## Current Limitations

Our current PF2e actions system has several inefficiencies for blind players:

1. **Static Hardcoded Lists**: We maintain manual arrays of actions per category
2. **No Context Awareness**: Actions don't adapt to character state or situation
3. **No Frequency-Based Ordering**: Most-used actions aren't prioritized
4. **Limited Personalization**: No learning from player usage patterns

## Proposed Dynamic Enhancements

### 1. **Dynamic Action Discovery**
Instead of hardcoded lists, dynamically discover available actions:

```javascript
// Current (static):
athletics: ['climb', 'disarm', 'forceOpen', 'grapple', ...]

// Enhanced (dynamic):
static getAvailableActions(actor, category) {
    const allActions = Array.from(game.pf2e.actions.keys());
    const categoryActions = allActions.filter(actionKey => {
        const action = game.pf2e.actions.get(actionKey);
        return this.isActionInCategory(action, category, actor);
    });
    
    return this.prioritizeActions(categoryActions, actor);
}
```

### 2. **Context-Aware Action Filtering**
Filter actions based on character state and situation:

```javascript
static getContextualActions(actor, category) {
    const baseActions = this.getAvailableActions(actor, category);
    
    return baseActions.filter(actionKey => {
        const action = game.pf2e.actions.get(actionKey);
        
        // Skip if character can't perform action
        if (this.isActionUnavailable(action, actor)) return false;
        
        // Prioritize situationally relevant actions
        if (this.isActionRelevant(action, actor)) return true;
        
        return true;
    });
}

static isActionUnavailable(action, actor) {
    // Examples:
    // - Can't swim if no water nearby
    // - Can't climb if no climbable surfaces
    // - Can't grapple if already grappling
    // - Can't stand if already standing
    
    const actionKey = action.key || action.slug;
    
    switch (actionKey) {
        case 'stand':
            return !actor.system?.attributes?.prone; // Already standing
        case 'drop-prone':
            return actor.system?.attributes?.prone; // Already prone
        case 'escape':
            return !this.isGrappled(actor); // Not grappled
        default:
            return false;
    }
}
```

### 3. **Smart Action Prioritization**
Order actions by relevance and frequency:

```javascript
static prioritizeActions(actions, actor) {
    return actions.sort((a, b) => {
        const actionA = game.pf2e.actions.get(a);
        const actionB = game.pf2e.actions.get(b);
        
        // Priority factors (higher score = higher priority)
        let scoreA = this.getActionPriority(actionA, actor);
        let scoreB = this.getActionPriority(actionB, actor);
        
        return scoreB - scoreA; // Sort descending
    });
}

static getActionPriority(action, actor) {
    let score = 0;
    
    // Base frequency score (from usage tracking)
    score += this.getUsageFrequency(action.key, actor) * 10;
    
    // Situational relevance
    score += this.getSituationalRelevance(action, actor) * 5;
    
    // Character build relevance
    score += this.getBuildRelevance(action, actor) * 3;
    
    // Common actions get slight boost
    const commonActions = ['stride', 'strike', 'cast-a-spell'];
    if (commonActions.includes(action.key)) score += 2;
    
    return score;
}
```

### 4. **Usage Pattern Learning**
Track which actions are used most frequently:

```javascript
// In localStorage per character
static trackActionUsage(actionKey, actor) {
    const storageKey = `fqm-action-usage-${game.user.id}-${actor.id}`;
    let usage = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    usage[actionKey] = (usage[actionKey] || 0) + 1;
    localStorage.setItem(storageKey, JSON.stringify(usage));
}

static getUsageFrequency(actionKey, actor) {
    const storageKey = `fqm-action-usage-${game.user.id}-${actor.id}`;
    const usage = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return usage[actionKey] || 0;
}
```

### 5. **Quick Access for Frequent Actions**
Create a "Quick Actions" category with most-used actions:

```javascript
static getQuickActions(actor) {
    const allUsage = this.getAllActionUsage(actor);
    const sortedByUsage = Object.entries(allUsage)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8); // Top 8 most used
    
    return sortedByUsage.map(([actionKey, count]) => ({
        type: 'pf2e_action',
        id: actionKey,
        label: this.getActionDisplayName(actionKey),
        actionType: 'pf2e_action',
        actionKey: actionKey,
        usageCount: count
    }));
}
```

### 6. **Character Build-Aware Actions**
Prioritize actions based on character features:

```javascript
static getBuildRelevance(action, actor) {
    let relevance = 0;
    
    // Check class features
    const characterClass = actor.system?.details?.class?.name?.toLowerCase();
    
    switch (characterClass) {
        case 'rogue':
            if (['hide', 'sneak', 'tumbleThrough'].includes(action.key)) {
                relevance += 3;
            }
            break;
        case 'monk':
            if (['stride', 'flurryOfBlows', 'enterStance'].includes(action.key)) {
                relevance += 3;
            }
            break;
        case 'fighter':
            if (['attack', 'stride', 'raiseShield'].includes(action.key)) {
                relevance += 3;
            }
            break;
    }
    
    // Check feats
    const feats = actor.itemTypes?.feat || [];
    feats.forEach(feat => {
        if (this.featEnhancesAction(feat, action)) {
            relevance += 2;
        }
    });
    
    return relevance;
}
```

### 7. **Adaptive Menu Categories**
Reorganize categories based on character and situation:

```javascript
static getAdaptiveActionCategories(actor) {
    const categories = [];
    
    // Always include quick actions for frequent items
    categories.push({
        type: 'action_category',
        id: 'quick',
        label: 'Quick Actions',
        actionType: 'submenu',
        priority: 100
    });
    
    // Add contextual categories
    if (this.isInCombat(actor)) {
        categories.push({
            type: 'action_category',
            id: 'combat',
            label: 'Combat Actions',
            actionType: 'submenu',
            priority: 90
        });
    }
    
    if (this.hasMovementOptions(actor)) {
        categories.push({
            type: 'action_category',
            id: 'movement',
            label: 'Movement',
            actionType: 'submenu',
            priority: 80
        });
    }
    
    // Standard categories with dynamic relevance
    const standardCategories = [
        'athletics', 'acrobatics', 'stealth', 'deception', 
        'intimidation', 'diplomacy', 'general'
    ];
    
    standardCategories.forEach(cat => {
        const relevance = this.getCategoryRelevance(cat, actor);
        if (relevance > 0) {
            categories.push({
                type: 'action_category',
                id: cat,
                label: this.getCategoryDisplayName(cat),
                actionType: 'submenu',
                priority: relevance
            });
        }
    });
    
    // Sort by priority
    return categories.sort((a, b) => b.priority - a.priority);
}
```

## Benefits for Blind Players

### 🚀 **Speed Improvements**:
1. **Most-used actions appear first** - reduces navigation time
2. **Contextual filtering** - eliminates irrelevant options
3. **Quick Actions category** - instant access to frequent actions

### 🎯 **Accuracy Improvements**:
1. **Situational awareness** - only shows available actions
2. **Character-specific relevance** - highlights build-appropriate actions
3. **Usage learning** - adapts to player preferences

### 🔧 **Efficiency Improvements**:
1. **Fewer menu levels** for common actions
2. **Smart categorization** based on current situation
3. **Automatic adaptation** without manual configuration

## Implementation Priority

### Phase 1 (Immediate):
- Dynamic action discovery from `game.pf2e.actions`
- Basic usage tracking and prioritization
- Quick Actions category

### Phase 2 (Short-term):
- Context-aware filtering (combat, exploration states)
- Character build relevance scoring
- Adaptive category ordering

### Phase 3 (Long-term):
- Advanced situational awareness
- Cross-session learning patterns
- Integration with other modules for enhanced context

This approach transforms our static action system into an intelligent, adaptive interface that learns from the player and responds to the current game state - dramatically improving efficiency for blind players! 🎉
