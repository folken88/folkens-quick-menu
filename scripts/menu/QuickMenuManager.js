/**
 * QuickMenuManager - Core menu navigation system
 * Manages the hierarchical iPod-style menu structure
 */

import { debugLog, getSetting } from '../module.js';

export class QuickMenuManager {
  constructor() {
    this.isOpen = false;
    this.currentMenu = null;
    this.menuStack = [];
    this.selectedIndex = 0;
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
   * Open the quick menu
   */
  async openMenu() {
    if (this.isOpen) return;
    
    debugLog('Opening Quick Menu');
    this.isOpen = true;
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
   * Navigate into a submenu or execute an action
   */
  navigateForward() {
    if (!this.isOpen || !this.currentMenu) return;
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (!selectedItem) return;
    
    debugLog('Navigating forward to:', selectedItem);
    
    if (selectedItem.type === 'submenu') {
      this.enterSubmenu(selectedItem);
    } else if (selectedItem.type === 'action') {
      this.executeAction(selectedItem);
    }
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
    
    const index = number - 1; // Convert to 0-based index
    if (index >= 0 && index < this.currentMenu.length) {
      this.selectedIndex = index;
      this.announceCurrentSelection();
      this.render();
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
    // Save current state
    this.menuStack.push({
      menu: this.currentMenu,
      selectedIndex: this.selectedIndex
    });
    
    // Load submenu content
    const submenuItems = await this.loadSubmenuItems(menuItem.id);
    this.currentMenu = submenuItems;
    this.selectedIndex = 0;
    
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
      // Execute the action based on type
      switch (actionItem.actionType) {
        case 'skill':
          await this.executeSkillRoll(actionItem);
          break;
        case 'attack':
          await this.executeAttackRoll(actionItem);
          break;
        case 'spell':
          await this.executeSpellCast(actionItem);
          break;
        case 'item':
          await this.executeItemUse(actionItem);
          break;
        case 'save':
          await this.executeSaveRoll(actionItem);
          break;
        case 'ability':
          await this.executeAbilityCheck(actionItem);
          break;
        case 'initiative':
          await this.executeInitiativeRoll(actionItem);
          break;
        default:
          console.warn('Unknown action type:', actionItem.actionType);
      }
      
      // Close menu after successful action
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
      case 'spells':
        return game.folkenQuickMenu.characterData.getSpells(actor);
      case 'items':
        return game.folkenQuickMenu.characterData.getItems(actor);
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
    
    // Fall back to selected token
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
   * Load favorites from client storage
   */
  loadFavorites() {
    try {
      const stored = localStorage.getItem('folkenQuickMenu.favorites');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load favorites:', error);
      return [];
    }
  }

  /**
   * Save favorites to client storage
   */
  saveFavorites() {
    try {
      localStorage.setItem('folkenQuickMenu.favorites', JSON.stringify(this.favorites));
    } catch (error) {
      console.warn('Failed to save favorites:', error);
    }
  }

  /**
   * Announce current selection via TTS
   */
  announceCurrentSelection() {
    if (!getSetting('enableTTS') || !this.currentMenu) return;
    
    const selectedItem = this.currentMenu[this.selectedIndex];
    if (selectedItem) {
      const message = `${this.selectedIndex + 1}. ${selectedItem.label}`;
      game.folkenQuickMenu.tts.speak(message);
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

  /**
   * Execute different types of rolls and actions
   */
  async executeSkillRoll(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const skillKey = actionItem.skillKey;
    
    // Handle take 10/20 options
    const rollOptions = { skipDialog: true };
    
    if (actionItem.take10) {
      rollOptions.take10 = true;
      // No TTS announcement needed - user already heard "Take 10 X"
    } else if (actionItem.take20) {
      rollOptions.take20 = true;
      // No TTS announcement needed - user already heard "Take 20 X"
    } else {
      // No TTS announcement needed - user already heard the skill name
    }
    
    // Set up chat message hook to announce the result
    const hookId = Hooks.once("createChatMessage", (message) => {
      if (message.rolls?.[0]?.total && game.folkenQuickMenu?.tts) {
        // Announce the rolled result
        game.folkenQuickMenu.tts.announceRollResult(message.rolls[0].total);
      }
    });
    
    try {
      await actor.rollSkill(skillKey, rollOptions);
    } catch (error) {
      console.error("Skill check error:", error);
      // Clean up hook if roll fails
      Hooks.off("createChatMessage", hookId);
    }
  }

  async executeAttackRoll(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const item = actor.items.get(actionItem.itemId);
    if (item) {
      const useOptions = { skipDialog: true };
      
      if (actionItem.fullAttack) {
        useOptions.fullAttack = true;
        // No TTS announcement needed - user already heard "Full Attack X"
      } else {
        // No TTS announcement needed - user already heard the attack name
      }
      
      // Set up chat message hook to announce the result
      const hookId = Hooks.once("createChatMessage", (message) => {
        if (message.rolls && game.folkenQuickMenu?.tts) {
          // Announce detailed attack results
          game.folkenQuickMenu.tts.announceAttackResult(message);
        }
      });
      
      try {
        await item.use(useOptions);
      } catch (error) {
        console.error("Attack roll error:", error);
        // Clean up hook if roll fails
        Hooks.off("createChatMessage", hookId);
      }
    }
  }

  async executeSpellCast(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const spell = actor.items.get(actionItem.itemId);
    if (spell) {
      // No TTS announcement needed - user already heard the spell name
      await spell.use({ skipDialog: true });
    }
  }

  async executeItemUse(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const item = actor.items.get(actionItem.itemId);
    if (item) {
      // No TTS announcement needed - user already heard the item name
      await item.use({ skipDialog: true });
    }
  }

  async executeSaveRoll(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const saveType = actionItem.saveType;
    // No TTS announcement needed - user already heard the save name
    
    // Set up chat message hook to announce the result
    const hookId = Hooks.once("createChatMessage", (message) => {
      if (message.rolls?.[0]?.total && game.folkenQuickMenu?.tts) {
        // Announce the rolled result
        game.folkenQuickMenu.tts.announceRollResult(message.rolls[0].total);
      }
    });
    
    try {
      await actor.rollSavingThrow(saveType, { skipDialog: true });
    } catch (error) {
      console.error("Saving throw error:", error);
      // Clean up hook if roll fails
      Hooks.off("createChatMessage", hookId);
    }
  }

  async executeAbilityCheck(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    const abilityKey = actionItem.abilityKey;
    // No TTS announcement needed - user already heard the ability name
    
    // Set up chat message hook to announce the result
    const hookId = Hooks.once("createChatMessage", (message) => {
      if (message.rolls?.[0]?.total && game.folkenQuickMenu?.tts) {
        // Announce the rolled result
        game.folkenQuickMenu.tts.announceRollResult(message.rolls[0].total);
      }
    });
    
    try {
      await actor.rollAbilityTest(abilityKey, { skipDialog: true });
    } catch (error) {
      console.error("Ability check error:", error);
      // Clean up hook if roll fails
      Hooks.off("createChatMessage", hookId);
    }
  }

  async executeInitiativeRoll(actionItem) {
    const actor = this.getCurrentActor();
    if (!actor) return;
    
    // No TTS announcement needed - user already heard "Initiative"
    
    // Set up chat message hook to announce the result
    const hookId = Hooks.once("createChatMessage", (message) => {
      if (message.rolls?.[0]?.total && game.folkenQuickMenu?.tts) {
        // Announce the rolled result
        game.folkenQuickMenu.tts.announceRollResult(message.rolls[0].total);
      }
    });
    
    try {
      await actor.rollInitiative({ skipDialog: true });
    } catch (error) {
      console.error("Initiative roll error:", error);
      // Clean up hook if roll fails
      Hooks.off("createChatMessage", hookId);
    }
  }

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
    
    // Disable canvas interactions
    if (canvas?.stage) {
      this._originalCanvasStates.interactive = canvas.stage.interactive;
      canvas.stage.interactive = false;
    }
    
    // Disable keyboard manager if it exists
    if (game.keyboard) {
      this._originalCanvasStates.keyboardActive = game.keyboard.active;
      game.keyboard.active = false;
    }
    
    // Disable canvas layers
    if (canvas?.tokens) {
      this._originalCanvasStates.tokensInteractive = canvas.tokens.interactive;
      canvas.tokens.interactive = false;
    }
    
    debugLog('FoundryVTT controls suspended');
  }

  /**
   * Resume FoundryVTT controls when menu is closed
   */
  resumeFoundryControls() {
    if (!this._originalCanvasStates) return;
    
    // Restore canvas interactions
    if (canvas?.stage && this._originalCanvasStates.interactive !== undefined) {
      canvas.stage.interactive = this._originalCanvasStates.interactive;
    }
    
    // Restore keyboard manager
    if (game.keyboard && this._originalCanvasStates.keyboardActive !== undefined) {
      game.keyboard.active = this._originalCanvasStates.keyboardActive;
    }
    
    // Restore canvas layers
    if (canvas?.tokens && this._originalCanvasStates.tokensInteractive !== undefined) {
      canvas.tokens.interactive = this._originalCanvasStates.tokensInteractive;
    }
    
    this._originalCanvasStates = null;
    debugLog('FoundryVTT controls resumed');
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
    html += '<div class="quick-menu-items">';
    
    this.currentMenu.forEach((item, index) => {
      const isSelected = index === this.selectedIndex;
      const selectedClass = isSelected ? 'selected' : '';
      html += `<div class="quick-menu-item ${selectedClass}" data-type="${item.type}" data-action-type="${item.actionType || ''}">`;
      html += `<span class="item-number">${index + 1}</span>`;
      html += `<span class="item-label">${item.label}</span>`;
      html += '</div>';
    });
    
    html += '</div>';
    html += '</div>';
    
    this.ui.innerHTML = html;
  }
}
