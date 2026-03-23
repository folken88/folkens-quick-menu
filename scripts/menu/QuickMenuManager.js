/**
 * QuickMenuManager - Core menu navigation system
 * Manages the hierarchical iPod-style menu structure
 */

import { debugLog, getSetting } from '../module.js';
import { CharacterDataExtractor } from '../character/CharacterDataExtractor.js';
import { CharacterDataExtractorPF2e } from '../character/CharacterDataExtractorPF2e.js';

export class QuickMenuManager {
  constructor() {
    this.isOpen = false;
    this.currentMenu = null;
    this.menuStack = [];
    this.selectedIndex = 0;
    // Initialize with base menu - will be rebuilt dynamically when opened
    this.rootMenuItems = [
      { id: 'favorites', label: 'Favorites', type: 'submenu' },
      { id: 'skills', label: 'Skills', type: 'submenu' },
      { id: 'attacks', label: 'Attacks', type: 'submenu' },
      { id: 'spells', label: 'Spells', type: 'submenu' },
      { id: 'items', label: 'Items', type: 'submenu' },
      { id: 'abilities', label: 'Abilities', type: 'submenu' },
      { id: 'saves', label: 'Saving Throws', type: 'submenu' },
      { id: 'stats', label: 'Statistics', type: 'submenu' }
    ];
    
    this.ui = null;
    this.favorites = this.loadFavorites();
  }

  /**
   * Initialize the menu manager
   */
  async initialize() {
    debugLog('QuickMenuManager initializing...');
    
    // Create visual UI if enabled
    if (getSetting('showVisualUI')) {
      this.createVisualUI();
    }
    
    debugLog('QuickMenuManager initialized');
  }

  /**
   * Build root menu based on current system
   */
  buildRootMenu() {
    if (game.folkenQuickMenu?.systemDetector?.isPF2e()) {
      // PF2e menu with Actions (no separate Skills menu since Actions covers skill-based actions)
      this.rootMenuItems = [
        { id: 'favorites', label: 'Favorites', type: 'submenu' },
        { id: 'actions', label: 'Actions', type: 'submenu' },
        { id: 'attacks', label: 'Attacks', type: 'submenu' },
        { id: 'spells', label: 'Spells', type: 'submenu' },
        { id: 'items', label: 'Items', type: 'submenu' },
        { id: 'abilities', label: 'Abilities', type: 'submenu' },
        { id: 'saves', label: 'Saving Throws', type: 'submenu' },
        { id: 'stats', label: 'Statistics', type: 'submenu' }
      ];
    } else {
      // PF1 menu
      this.rootMenuItems = [
        { id: 'favorites', label: 'Favorites', type: 'submenu' },
        { id: 'skills', label: 'Skills', type: 'submenu' },
        { id: 'combat', label: 'Combat', type: 'submenu' },
        { id: 'spells', label: 'Spells', type: 'submenu' },
        { id: 'items', label: 'Items', type: 'submenu' },
        { id: 'abilities', label: 'Abilities', type: 'submenu' },
        { id: 'saves', label: 'Saving Throws', type: 'submenu' },
        { id: 'stats', label: 'Statistics', type: 'submenu' }
      ];
    }
    
    debugLog('Built root menu for system:', game.folkenQuickMenu?.systemDetector?.isPF2e() ? 'PF2e' : 'PF1');
  }

  /**
   * Open the quick menu
   */
  async openMenu() {
    if (this.isOpen) return;
    
    debugLog('Opening Quick Menu');
    this.isOpen = true;
    
    // Build menu based on current system
    this.buildRootMenu();
    this.currentMenu = this.rootMenuItems;
    this.selectedIndex = 0;
    this.menuStack = [];
    
    // Get current character data
    const actor = this.getCurrentActor();
    if (!actor) {
      ui.notifications.warn('No character selected or assigned');
      this.closeMenu();
      return;
    }
    
    // Update menu with character data
    await this.updateMenuForActor(actor);
    
    // Refresh favorites for this character
    this.refreshFavoritesForActor();
    
    // Show visual UI if enabled
    if (getSetting('showVisualUI') && this.ui) {
      this.positionUI();
      this.ui.style.display = 'block';
    }
    
    // Suspend FoundryVTT controls
    this.suspendFoundryControls();
    
    // Announce just the current selection
    this.announceCurrentSelection();
    
    this.render();
  }

  /**
   * Close the quick menu
   */
  closeMenu() {
    debugLog('Closing Quick Menu');
    this.isOpen = false;
    this.currentMenu = null;
    this.menuStack = [];
    this.selectedIndex = 0;
    
    // Resume FoundryVTT controls
    this.resumeFoundryControls();
    
    // Hide visual UI
    if (this.ui) {
      this.ui.style.display = 'none';
    }
  }

  /**
   * Navigate up in the menu
   */
  navigateUp() {
    if (!this.isOpen || !this.currentMenu) return;
    
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Navigate down in the menu
   */
  navigateDown() {
    if (!this.isOpen || !this.currentMenu) return;
    
    this.selectedIndex = Math.min(this.currentMenu.length - 1, this.selectedIndex + 1);
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Navigate up by 10 items (Page Up)
   */
  navigatePageUp() {
    if (!this.isOpen || !this.currentMenu) return;
    
    this.selectedIndex = Math.max(0, this.selectedIndex - 10);
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Navigate down by 10 items (Page Down)
   */
  navigatePageDown() {
    if (!this.isOpen || !this.currentMenu) return;
    
    this.selectedIndex = Math.min(this.currentMenu.length - 1, this.selectedIndex + 10);
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Navigate into a submenu or execute an action
   */
  navigateForward() {
    if (!this.isOpen || !this.currentMenu) {
      debugLog('Cannot navigate forward: menu not open or no current menu');
      return;
    }
    
    debugLog('Navigate forward called. Current menu length:', this.currentMenu.length, 'Selected index:', this.selectedIndex);
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (!selectedItem) {
      debugLog('No selected item found at index', this.selectedIndex);
      return;
    }
    
    debugLog('Navigating forward to:', selectedItem);
    
    if (selectedItem.type === 'submenu') {
      debugLog('Item is submenu, entering...');
      this.enterSubmenu(selectedItem);
    } else if (selectedItem.type === 'action') {
      debugLog('Item is action, executing...');
      this.executeAction(selectedItem);
    } else if (selectedItem.type === 'spell_level') {
      debugLog('Item is spell level submenu, entering...');
      this.enterSpellLevel(selectedItem);
    } else if (selectedItem.type === 'item_category') {
      debugLog('Item is item category submenu, entering...');
      this.enterItemCategory(selectedItem);
    } else if (selectedItem.type === 'action_category') {
      debugLog('Item is action category submenu, entering...');
      this.enterActionCategory(selectedItem);
    } else if (['skill', 'attack', 'spell', 'item', 'ability', 'save', 'stat', 'strike', 'pf2e_action'].includes(selectedItem.type)) {
      debugLog('Item is executable action, executing...');
      this.executeAction(selectedItem);
    } else {
      debugLog('Unknown item type:', selectedItem.type);
    }
  }

  /**
   * Enter a spell level submenu (PF2e specific)
   */
  async enterSpellLevel(spellLevelItem) {
    debugLog('Entering spell level:', spellLevelItem);
    
    const actor = this.getCurrentActor();
    if (!actor) {
      debugLog('No actor available for spell level');
      return;
    }
    
    // Save current state
    this.menuStack.push({
      menu: this.currentMenu,
      selectedIndex: this.selectedIndex
    });
    
    // Get spells for this level
    let spells = [];
    if (game.folkenQuickMenu.systemDetector.isPF2e()) {
      spells = game.folkenQuickMenu.characterData.getSpellsForLevel(
        actor, 
        spellLevelItem.spellLevel, 
        spellLevelItem.tradition
      );
    } else {
      spells = game.folkenQuickMenu.characterData.getSpellsForLevel(actor, spellLevelItem.spellLevel);
    }
    
    this.currentMenu = spells;
    this.selectedIndex = 0;
    
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Enter an item category submenu (PF2e specific)
   */
  async enterItemCategory(categoryItem) {
    debugLog('Entering item category:', categoryItem);
    
    const actor = this.getCurrentActor();
    if (!actor) {
      debugLog('No actor available for item category');
      return;
    }
    
    // Save current state
    this.menuStack.push({
      menu: this.currentMenu,
      selectedIndex: this.selectedIndex
    });
    
    // Get items for this category
    const items = game.folkenQuickMenu.characterData.getItemsByCategory(actor, categoryItem.id);
    
    this.currentMenu = items;
    this.selectedIndex = 0;
    
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Enter an action category submenu (PF2e specific)
   */
  async enterActionCategory(categoryItem) {
    debugLog('Entering action category:', categoryItem);
    
    const actor = this.getCurrentActor();
    if (!actor) {
      debugLog('No actor available for action category');
      return;
    }
    
    // Save current state
    this.menuStack.push({
      menu: this.currentMenu,
      selectedIndex: this.selectedIndex
    });
    
    // Get actions for this category
    const actions = game.folkenQuickMenu.characterData.getActionsByCategory(actor, categoryItem.id);
    
    this.currentMenu = actions;
    this.selectedIndex = 0;
    
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Navigate back to previous menu
   */
  navigateBack() {
    if (!this.isOpen) return;
    
    if (this.menuStack.length === 0) {
      this.closeMenu();
      return;
    }
    
    const previousState = this.menuStack.pop();
    this.currentMenu = previousState.menu;
    this.selectedIndex = previousState.selectedIndex;
    
    // Announce just the current selection
    this.announceCurrentSelection();
    
    this.render();
  }

  /**
   * Navigate directly to a numbered item
   */
  navigateToNumber(number) {
    if (!this.isOpen || !this.currentMenu) return;
    
    // Look for item with matching displayNumber first
    let targetIndex = -1;
    for (let i = 0; i < this.currentMenu.length; i++) {
      const item = this.currentMenu[i];
      if (item.displayNumber !== undefined && item.displayNumber === number) {
        targetIndex = i;
        break;
      }
    }
    
    // Fallback to traditional index-based navigation if no displayNumber match
    if (targetIndex === -1) {
      targetIndex = number - 1; // Convert to 0-based index
    }
    
    if (targetIndex >= 0 && targetIndex < this.currentMenu.length) {
      this.selectedIndex = targetIndex;
      this.announceCurrentSelection();
      this.render();
    }
  }

  /**
   * Navigate using a number sequence for rapid navigation
   */
  async navigateToNumberSequence(sequence) {
    if (!this.isOpen || !this.currentMenu || sequence.length === 0) return;
    
    debugLog('Executing number sequence navigation:', sequence);
    
    for (let i = 0; i < sequence.length; i++) {
      const number = sequence[i];
      
      // Look for item with matching displayNumber first
      let targetIndex = -1;
      for (let j = 0; j < this.currentMenu.length; j++) {
        const item = this.currentMenu[j];
        if (item.displayNumber !== undefined && item.displayNumber === number) {
          targetIndex = j;
          break;
        }
      }
      
      // Fallback to traditional index-based navigation if no displayNumber match
      if (targetIndex === -1) {
        targetIndex = number - 1; // Convert to 0-based index
      }
      
      if (targetIndex >= 0 && targetIndex < this.currentMenu.length) {
        this.selectedIndex = targetIndex;
        
        // If this is the last number in sequence, just announce and render
        if (i === sequence.length - 1) {
          this.announceCurrentSelection();
          this.render();
          return;
        }
        
        // Otherwise, navigate into the submenu
        const selectedItem = this.currentMenu[this.selectedIndex];
        if (selectedItem && selectedItem.type === 'submenu') {
          await this.enterSubmenu(selectedItem);
          // Small delay to allow menu to update
          await new Promise(resolve => setTimeout(resolve, 50));
        } else if (selectedItem && selectedItem.type === 'action') {
          // If we hit an action before the sequence is complete, execute it
          this.executeAction(selectedItem);
          return;
        } else {
          // Invalid path, stop here
          this.announceCurrentSelection();
          this.render();
          return;
        }
      } else {
        // Invalid number for current menu, stop here
        game.folkenQuickMenu.tts.speak('Invalid selection');
        return;
      }
    }
  }

  /**
   * Prepare/unprepare current spell
   */
  prepareCurrentSpell() {
    if (!this.isOpen || !this.currentMenu) return;
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (!selectedItem || selectedItem.actionType !== 'spell') return;
    
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const spell = actor.items.get(selectedItem.itemId);
    if (!spell) return;
    
    // PF1 uses preparation.value for currently prepared count
    const currentCount = spell.system.preparation?.value || 0;
    const newCount = currentCount + 1; // Increment by 1
    
    debugLog(`Preparing spell: ${spell.name} from ${currentCount} to ${newCount}`);
    
    // Update the spell preparation value (currently prepared)
    const updateData = {
      'system.preparation.value': newCount
    };
    
    debugLog('Update data:', updateData);
    
    spell.update(updateData).then(() => {
      game.folkenQuickMenu.tts.speak(`${spell.name} ${newCount} prepared`);
      
      debugLog(`Spell update successful: ${spell.name} now has ${newCount} prepared`);
      
      // Update the current menu item to reflect change
      const selectedItem = this.currentMenu[this.selectedIndex];
      if (selectedItem) {
        selectedItem.prepared = newCount > 0;
      }
    }).catch(error => {
      console.error('Error updating spell preparation:', error);
      debugLog('Full spell data:', spell.system);
      game.folkenQuickMenu.tts.speak('Failed to update spell');
    });
  }

  /**
   * Unprepare current spell (decrement preparation count)
   */
  unprepareCurrentSpell() {
    if (!this.isOpen || !this.currentMenu) return;
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (!selectedItem || selectedItem.actionType !== 'spell') return;
    
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const spell = actor.items.get(selectedItem.itemId);
    if (!spell) return;
    
    // PF1 uses preparation.value for currently prepared count
    const currentCount = spell.system.preparation?.value || 0;
    const newCount = Math.max(0, currentCount - 1); // Decrement by 1, minimum 0
    
    debugLog(`Unpreparing spell: ${spell.name} from ${currentCount} to ${newCount}`);
    
    // Update the spell preparation value (currently prepared)
    const updateData = {
      'system.preparation.value': newCount
    };
    
    debugLog('Update data:', updateData);
    
    spell.update(updateData).then(() => {
      if (newCount > 0) {
        game.folkenQuickMenu.tts.speak(`${spell.name} ${newCount} prepared`);
      } else {
        game.folkenQuickMenu.tts.speak(`${spell.name} unprepared`);
      }
      
      debugLog(`Spell update successful: ${spell.name} now has ${newCount} prepared`);
      
      // Update the current menu item to reflect change
      const selectedItem = this.currentMenu[this.selectedIndex];
      if (selectedItem) {
        selectedItem.prepared = newCount > 0;
      }
    }).catch(error => {
      console.error('Error updating spell preparation:', error);
      debugLog('Full spell data:', spell.system);
      game.folkenQuickMenu.tts.speak('Failed to update spell');
    });
  }

  /**
   * Refresh the current menu (useful after spell preparation changes)
   */
  async refreshCurrentMenu() {
    if (!this.isOpen || !this.currentMenu || this.menuStack.length === 0) return;
    
    // Get the parent menu info to recreate current menu
    const parentState = this.menuStack[this.menuStack.length - 1];
    const parentItem = parentState.menu[parentState.selectedIndex];
    
    let refreshedItems = [];
    const actor = this.getCurrentActor();
    
    if (parentItem.preparationType !== undefined) {
      // We're in a preparation submenu
      refreshedItems = game.folkenQuickMenu.characterData.getSpellsByPreparation(
        actor, parentItem.spellLevel, parentItem.preparationType
      );
    } else if (parentItem.spellLevel !== undefined) {
      // We're in a spell level submenu
      refreshedItems = game.folkenQuickMenu.characterData.getSpellsForLevel(actor, parentItem.spellLevel);
    }
    
    if (refreshedItems.length > 0) {
      this.currentMenu = refreshedItems;
      // Keep selection if possible, otherwise reset to 0
      if (this.selectedIndex >= refreshedItems.length) {
        this.selectedIndex = 0;
      }
      this.render();
    }
  }

  /**
   * Remove current item from favorites
   */
  unfavoriteCurrentItem() {
    if (!this.isOpen || !this.currentMenu) return;
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (!selectedItem || selectedItem.type !== 'action') return;
    
    // Check if we're in the favorites menu
    // We're in favorites if the parent menu is root and selected index 0 (favorites)
    const isInFavoritesMenu = this.menuStack.length > 0 && 
      this.menuStack[this.menuStack.length - 1].menu === this.rootMenuItems &&
      this.menuStack[this.menuStack.length - 1].selectedIndex === 0;
    
    if (!isInFavoritesMenu) {
      game.folkenQuickMenu.tts.speak('Not in favorites');
      return;
    }
    
    // Find and remove from favorites
    const favoriteIndex = this.favorites.findIndex(fav => 
      fav.actionType === selectedItem.actionType && 
      fav.skillKey === selectedItem.skillKey &&
      fav.itemId === selectedItem.itemId &&
      fav.saveType === selectedItem.saveType
    );
    
    if (favoriteIndex === -1) {
      game.folkenQuickMenu.tts.speak('Not favorited');
      return;
    }
    
    // Remove from favorites
    this.favorites.splice(favoriteIndex, 1);
    this.saveFavorites();
    
    game.folkenQuickMenu.tts.speak(`${selectedItem.label} removed`);
    
    // Refresh the favorites menu
    this.refreshFavoritesMenu();
  }

  /**
   * Refresh the favorites menu after changes
   */
  refreshFavoritesMenu() {
    if (!this.isOpen || this.menuStack.length === 0) return;
    
    // Check if we're in favorites submenu
    const parentState = this.menuStack[this.menuStack.length - 1];
    if (parentState.menu === this.rootMenuItems && parentState.selectedIndex === 0) {
      // We're in the favorites submenu, refresh it
      this.currentMenu = this.getFavorites();
      
      // Adjust selection if needed
      if (this.selectedIndex >= this.currentMenu.length) {
        this.selectedIndex = Math.max(0, this.currentMenu.length - 1);
      }
      
      // If no favorites left, announce and go back
      if (this.currentMenu.length === 0) {
        game.folkenQuickMenu.tts.speak('No favorites remaining');
        this.navigateBack();
      } else {
        this.announceCurrentSelection();
        this.render();
      }
    }
  }

  /**
   * Add current item to favorites
   */
  favoriteCurrentItem() {
    if (!this.isOpen || !this.currentMenu) return;
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (!selectedItem || selectedItem.type !== 'action') return;
    
    // Check if already favorited
    const existingFav = this.favorites.find(fav => 
      fav.actionType === selectedItem.actionType && 
      fav.skillKey === selectedItem.skillKey &&
      fav.itemId === selectedItem.itemId
    );
    
    if (existingFav) {
      game.folkenQuickMenu.tts.speak(`${selectedItem.label} already favorited`);
      return;
    }
    
    // Add to favorites
    this.favorites.push({
      id: `fav_${Date.now()}`,
      label: selectedItem.label,
      type: 'action',
      actionType: selectedItem.actionType,
      skillKey: selectedItem.skillKey,
      itemId: selectedItem.itemId,
      saveType: selectedItem.saveType,
      originalItem: selectedItem
    });
    
    this.saveFavorites();
    game.folkenQuickMenu.tts.speak(`${selectedItem.label} favorited`);
    
    debugLog('Added to favorites:', selectedItem.label);
  }

  /**
   * Show submenu options for current item (take 10/20, etc.)
   */
  showItemSubmenu() {
    if (!this.isOpen || !this.currentMenu) return;
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (!selectedItem || selectedItem.type !== 'action') return;
    
    // Generate submenu based on action type
    let submenuItems = [];
    
    if (selectedItem.actionType === 'skill') {
      submenuItems = [
        {
          id: `${selectedItem.id}_take10`,
          label: `Take 10 ${selectedItem.label}`,
          type: 'action',
          actionType: 'skill',
          skillKey: selectedItem.skillKey,
          take10: true
        },
        {
          id: `${selectedItem.id}_take20`,
          label: `Take 20 ${selectedItem.label}`,
          type: 'action',
          actionType: 'skill',
          skillKey: selectedItem.skillKey,
          take20: true
        }
      ];
    } else if (selectedItem.actionType === 'attack') {
      submenuItems = [
        {
          id: `${selectedItem.id}_normal`,
          label: `Normal ${selectedItem.label}`,
          type: 'action',
          actionType: 'attack',
          itemId: selectedItem.itemId
        },
        {
          id: `${selectedItem.id}_full`,
          label: `Full Attack ${selectedItem.label}`,
          type: 'action',
          actionType: 'attack',
          itemId: selectedItem.itemId,
          fullAttack: true
        }
      ];
    } else {
      // For other types, just execute normally
      this.navigateForward();
      return;
    }
    
    if (submenuItems.length > 0) {
      // Save current state and enter submenu
      this.menuStack.push({
        menu: this.currentMenu,
        selectedIndex: this.selectedIndex
      });
      
      this.currentMenu = submenuItems;
      this.selectedIndex = 0;
      
      this.announceCurrentSelection();
      this.render();
    }
  }

  /**
   * Enter a submenu
   */
  async enterSubmenu(menuItem) {
    debugLog('Entering submenu:', menuItem);
    
    // Save current state
    this.menuStack.push({
      menu: this.currentMenu,
      selectedIndex: this.selectedIndex
    });
    
    let submenuItems = [];
    
    // Handle special submenu cases
    if (menuItem.spellLevel !== undefined) {
      // This is a spell level submenu - get spells directly
      const actor = this.getCurrentActor();
      submenuItems = game.folkenQuickMenu.characterData.getSpellsForLevel(actor, menuItem.spellLevel);
      debugLog('Spell level submenu items:', submenuItems);
    } else if (menuItem.itemCategory !== undefined) {
      // This is an item category submenu
      const actor = this.getCurrentActor();
      submenuItems = game.folkenQuickMenu.characterData.getItemsByCategory(actor, menuItem.itemCategory);
      debugLog('Item category submenu items:', submenuItems);
    } else if (menuItem.type === 'item_actions') {
      // This is an item actions submenu - get actions for the specific item
      const actor = this.getCurrentActor();
      submenuItems = game.folkenQuickMenu.characterData.getItemActions ? 
                     game.folkenQuickMenu.characterData.getItemActions(actor, menuItem.id) : [];
      debugLog('Item actions submenu items:', submenuItems);
    } else {
      // Regular submenu
      submenuItems = await this.loadSubmenuItems(menuItem.id);
      debugLog('Regular submenu items:', submenuItems);
    }
    
    this.currentMenu = submenuItems;
    this.selectedIndex = 0;
    
    debugLog('New current menu:', this.currentMenu);
    debugLog('Selected index:', this.selectedIndex);
    
    // Check if menu is empty
    if (!this.currentMenu || this.currentMenu.length === 0) {
      debugLog('WARNING: Empty submenu created!');
      game.folkenQuickMenu.tts.speak('Empty menu');
      return;
    }
    
    // Announce just the current selection
    this.announceCurrentSelection();
    this.render();
  }

  /**
   * Execute an action item
   */
  async executeAction(actionItem) {
    debugLog('Executing action:', actionItem);

    try {
      const actor = this.getCurrentActor();
      if (!actor) {
        ui.notifications.warn('No character selected or assigned');
        return;
      }
      await game.folkenQuickMenu.actionExecutor.execute(actionItem, actor);
      this.closeMenu();
    } catch (error) {
      console.error('Error executing action:', error);
      ui.notifications.error(`Failed to execute ${actionItem.label}`);
    }
  }

  /**
   * Load submenu items based on menu type
   */
  async loadSubmenuItems(menuType) {
    const actor = this.getCurrentActor();
    if (!actor) return [];
    
    switch (menuType) {
      case 'skills':
        return game.folkenQuickMenu.characterData.getSkills(actor);
      case 'attacks':
        return game.folkenQuickMenu.characterData.getAttacks(actor);
      case 'combat':
        return game.folkenQuickMenu.characterData.getCombat(actor);
      case 'actions':
        // PF2e actions menu
        return game.folkenQuickMenu.characterData.getActions ? 
               game.folkenQuickMenu.characterData.getActions(actor) : [];
      case 'spells':
        return game.folkenQuickMenu.characterData.getSpells(actor);
      case 'items':
        return game.folkenQuickMenu.characterData.getItems(actor);
      case 'item_category':
        return game.folkenQuickMenu.characterData.getItemsByCategory(actor, menuType.split('_')[2]);
      case 'item_actions':
        // Get actions for a specific item
        return game.folkenQuickMenu.characterData.getItemActions ? 
               game.folkenQuickMenu.characterData.getItemActions(actor, menuType.split('_')[2]) : [];
      case 'action_category':
        return game.folkenQuickMenu.characterData.getActionsByCategory(actor, menuType.split('_')[2]);
      case 'abilities':
        return game.folkenQuickMenu.characterData.getAbilities(actor);
      case 'saves':
        return game.folkenQuickMenu.characterData.getSaves(actor);
      case 'stats':
        return game.folkenQuickMenu.characterData.getStats(actor);
      case 'favorites':
        return this.getFavorites();
      default:
        return [];
    }
  }

  /**
   * Get current actor (assigned or selected)
   */
  getCurrentActor() {
    // First try assigned character
    const assignedActor = game.user.character;
    if (assignedActor) return assignedActor;
    
    // Fall back to selected token (allows GM to test with any token)
    const controlled = canvas.tokens.controlled;
    if (controlled.length === 1) {
      return controlled[0].actor;
    }
    
    return null;
  }

  /**
   * Update menu items for specific actor
   */
  async updateMenuForActor(actor) {
    debugLog('Updating menu for actor:', actor.name);
    // This could be used to dynamically show/hide menu items based on actor capabilities
  }

  /**
   * Get favorites list
   */
  getFavorites() {
    return this.favorites;
  }

  /**
   * Load favorites from client storage (per character)
   */
  loadFavorites() {
    try {
      const actor = this.getCurrentActor();
      if (!actor) return [];
      
      const key = `folkenQuickMenu.favorites.${game.user.id}.${actor.id}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        return JSON.parse(stored);
      } else {
        // First time for this character - add default Perception favorite
        const defaultFavorites = this.createDefaultFavorites(actor);
        // Save the defaults so they persist
        localStorage.setItem(key, JSON.stringify(defaultFavorites));
        return defaultFavorites;
      }
    } catch (error) {
      console.warn('Failed to load favorites:', error);
      return [];
    }
  }

  /**
   * Save favorites to client storage (per character)
   */
  saveFavorites() {
    try {
      const actor = this.getCurrentActor();
      if (!actor) return;
      
      const key = `folkenQuickMenu.favorites.${game.user.id}.${actor.id}`;
      localStorage.setItem(key, JSON.stringify(this.favorites));
    } catch (error) {
      console.warn('Failed to save favorites:', error);
    }
  }

  /**
   * Create default favorites for a new character
   */
  createDefaultFavorites(actor) {
    const defaults = [];
    
    // Add Perception as default - everyone needs it
    const perceptionSkill = actor.system?.skills?.per;
    if (perceptionSkill) {
      defaults.push({
        type: 'skill',
        id: 'per',
        label: 'Perception',
        actionType: 'skill'
      });
    }
    
    debugLog('Created default favorites for actor:', actor.name, defaults);
    return defaults;
  }

  /**
   * Refresh favorites for current character
   */
  refreshFavoritesForActor() {
    this.favorites = this.loadFavorites();
  }

  /**
   * Announce current selection via TTS
   */
  announceCurrentSelection() {
    if (!getSetting('enableTTS') || !this.currentMenu) return;
    
    debugLog('Announcing current selection. Menu length:', this.currentMenu.length, 'Selected index:', this.selectedIndex);
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (selectedItem) {
      // Use displayNumber if available, otherwise use index + 1
      const displayNum = selectedItem.displayNumber !== undefined ? selectedItem.displayNumber : this.selectedIndex + 1;
      const message = `${displayNum}. ${selectedItem.label}`;
      debugLog('Announcing:', message);
      game.folkenQuickMenu.tts.speak(message);
      
      // Update visual UI and scroll to selection
      this.render();
    } else {
      debugLog('No selected item found!');
    }
  }

  /**
   * Announce entire menu contents via TTS
   */
  announceMenuContents(menuName) {
    if (!getSetting('enableTTS') || !this.currentMenu) return;
    
    debugLog('Announcing menu contents for:', menuName);
    game.folkenQuickMenu.tts.announceMenuListing(menuName, this.currentMenu);
  }

  // ─── All execute* methods have been moved to ActionExecutor.js ───
  // QuickMenuManager.executeAction() now delegates to game.folkenQuickMenu.actionExecutor

  /**
   * Create visual UI positioned near token
   */
  createVisualUI() {
    this.ui = document.createElement('div');
    this.ui.id = 'folken-quick-menu-ui';
    this.ui.style.display = 'none';
    document.body.appendChild(this.ui);
  }

  /**
   * Position UI near the current token
   */
  positionUI() {
    if (!this.ui) return;
    
    const actor = this.getCurrentActor();
    let token = null;
    
    // Try to find the token for this actor
    if (actor) {
      token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
    }
    
    // If no token found, use selected token
    if (!token && canvas.tokens.controlled.length > 0) {
      token = canvas.tokens.controlled[0];
    }
    
    if (token) {
      // Position relative to token
      const tokenBounds = token.bounds;
      const canvasPos = canvas.app.stage.toGlobal(tokenBounds);
      
      this.ui.style.position = 'fixed';
      this.ui.style.left = `${canvasPos.x + tokenBounds.width + 10}px`;
      this.ui.style.top = `${canvasPos.y}px`;
      this.ui.style.zIndex = '10000';
    } else {
      // Fall back to top-left of canvas
      const canvasRect = canvas.app.view.getBoundingClientRect();
      this.ui.style.position = 'fixed';
      this.ui.style.left = `${canvasRect.left + 20}px`;
      this.ui.style.top = `${canvasRect.top + 20}px`;
      this.ui.style.zIndex = '10000';
    }
  }

  /**
   * Suspend FoundryVTT controls while menu is open
   */
  suspendFoundryControls() {
    // Store original states
    this._originalCanvasStates = {};
    
    // Only disable basic canvas panning to prevent accidental movement
    // Our keyboard handlers already prevent movement keys with preventDefault
    
    // Disable canvas pan/zoom controls only
    if (canvas?.stage) {
      this._originalCanvasStates.canvasPan = canvas.pan;
      canvas.pan = () => {}; // Disable panning
    }
    
    // Don't disable token interactivity - too aggressive
    // Don't disable canvas stage interactivity - breaks double-click and other interactions
    // Don't disable mouse interaction manager - breaks token selection/interaction
    // Don't disable all layers - too broad and affects other functionality
    
    debugLog('FoundryVTT controls suspended (minimal scope)');
    debugLog('Only canvas panning disabled. Keyboard events handled by our event system.');
  }

  /**
   * Resume FoundryVTT controls when menu is closed
   */
  resumeFoundryControls() {
    if (!this._originalCanvasStates) return;
    
    // Restore canvas pan controls only
    if (canvas?.stage && this._originalCanvasStates.canvasPan !== undefined) {
      canvas.pan = this._originalCanvasStates.canvasPan;
    }
    
    this._originalCanvasStates = null;
    debugLog('FoundryVTT controls resumed (minimal scope)');
  }

  /**
   * Render the visual UI
   */
  render() {
    if (!this.ui || !getSetting('showVisualUI') || !this.currentMenu) return;
    
    // Position UI every time we render (in case token moved)
    this.positionUI();
    
    let html = '<div class="quick-menu-container compact">';
    html += '<div class="quick-menu-header">Quick Menu</div>';
    html += '<div class="quick-menu-items" id="quick-menu-items-container">';
    
    this.currentMenu.forEach((item, index) => {
      const isSelected = index === this.selectedIndex;
      const selectedClass = isSelected ? 'selected' : '';
      html += `<div class="quick-menu-item ${selectedClass}" data-index="${index}" data-type="${item.type}" data-action-type="${item.actionType || ''}">`;
      const displayNum = item.displayNumber !== undefined ? item.displayNumber : index + 1;
      html += `<span class="item-number">${displayNum}</span>`;
      html += `<span class="item-label">${item.label}</span>`;
      html += '</div>';
    });
    
    html += '</div>';
    html += '</div>';
    
    this.ui.innerHTML = html;
    
    // Scroll selected item into view
    this.scrollToSelectedItem();
  }

  /**
   * Scroll the selected item into view
   */
  scrollToSelectedItem() {
    if (!this.ui || this.selectedIndex < 0) return;
    
    const container = this.ui.querySelector('#quick-menu-items-container');
    const selectedItem = this.ui.querySelector(`[data-index="${this.selectedIndex}"]`);
    
    if (container && selectedItem) {
      // Calculate if the item is visible
      const containerRect = container.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      
      // Check if item is above the visible area
      if (itemRect.top < containerRect.top) {
        selectedItem.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }
      // Check if item is below the visible area
      else if (itemRect.bottom > containerRect.bottom) {
        selectedItem.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'end',
          inline: 'nearest'
        });
      }
    }
  }

  // (execute* methods moved to scripts/executor/ActionExecutor.js)

}
