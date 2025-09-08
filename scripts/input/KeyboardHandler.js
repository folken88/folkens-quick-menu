/**
 * KeyboardHandler - Handles keyboard input for menu navigation
 * Supports arrow keys, numbers, enter, escape, and scroll wheel
 */

import { debugLog, getSetting } from '../module.js';

export class KeyboardHandler {
  constructor() {
    this.keyListeners = new Map();
    this.isActive = false;
    this.pressedKeys = new Set();
    this.numberSequence = [];
    this.numberTimeout = null;
  }

  /**
   * Initialize keyboard event listeners
   */
  initialize() {
    debugLog('KeyboardHandler initializing...');
    
    // Global keydown listener for activation
    document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));
    
    // Menu-specific listeners (only active when menu is open)
    this.setupMenuListeners();
    
    // Mouse wheel listener
    document.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    
    debugLog('KeyboardHandler initialized');
  }

  /**
   * Handle global keydown events (for menu activation)
   */
  handleGlobalKeydown(event) {
    if (!getSetting('enabled')) return;
    
    // Check for activation key
    const activationKey = getSetting('activationKey');
    if (event.code === activationKey || event.key === activationKey) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.toggleMenu();
      return;
    }
    
    // Handle menu navigation if menu is open
    if (game.folkenQuickMenu?.menuManager?.isOpen) {
      // Prevent ALL other keyboard events from reaching FoundryVTT
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      this.handleMenuKeydown(event);
    }
  }

  /**
   * Handle menu-specific keyboard events
   */
  handleMenuKeydown(event) {
    if (!game.folkenQuickMenu?.menuManager?.isOpen) return;
    
    const menuManager = game.folkenQuickMenu.menuManager;
    
    // Always prevent default for menu navigation
    event.preventDefault();
    event.stopPropagation();
    
    switch (event.code) {
      case 'ArrowUp':
        menuManager.navigateUp();
        break;
        
      case 'ArrowDown':
        menuManager.navigateDown();
        break;
        
      case 'PageUp':
        menuManager.navigatePageUp();
        break;
        
      case 'PageDown':
        menuManager.navigatePageDown();
        break;
        
      case 'ArrowRight':
      case 'Enter':
      case 'NumpadEnter':
        menuManager.navigateForward();
        break;
        
      case 'KeyF':
        menuManager.favoriteCurrentItem();
        break;
        
      case 'Slash':
        menuManager.showItemSubmenu();
        break;
        
      case 'KeyP':
        menuManager.prepareCurrentSpell();
        break;
        
      case 'KeyU':
        menuManager.unprepareCurrentSpell();
        break;
        
      case 'KeyR':  // R for Remove from favorites
        menuManager.unfavoriteCurrentItem();
        break;
        
      case 'ArrowLeft':
      case 'Escape':
      case 'Backspace':
        menuManager.navigateBack();
        break;
        
      case 'Digit1':
      case 'Numpad1':
        this.handleNumberInput(1, menuManager);
        break;
        
      case 'Digit2':
      case 'Numpad2':
        this.handleNumberInput(2, menuManager);
        break;
        
      case 'Digit3':
      case 'Numpad3':
        this.handleNumberInput(3, menuManager);
        break;
        
      case 'Digit4':
      case 'Numpad4':
        this.handleNumberInput(4, menuManager);
        break;
        
      case 'Digit5':
      case 'Numpad5':
        this.handleNumberInput(5, menuManager);
        break;
        
      case 'Digit6':
      case 'Numpad6':
        this.handleNumberInput(6, menuManager);
        break;
        
      case 'Digit7':
      case 'Numpad7':
        this.handleNumberInput(7, menuManager);
        break;
        
      case 'Digit8':
      case 'Numpad8':
        this.handleNumberInput(8, menuManager);
        break;
        
      case 'Digit9':
      case 'Numpad9':
        this.handleNumberInput(9, menuManager);
        break;
        
      case 'Digit0':
      case 'Numpad0':
        this.handleNumberInput(10, menuManager);
        break;
    }
  }

  /**
   * Handle mouse wheel events
   */
  handleWheel(event) {
    if (!game.folkenQuickMenu?.menuManager?.isOpen) return;
    if (!getSetting('enabled')) return;
    
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    const menuManager = game.folkenQuickMenu.menuManager;
    
    if (event.deltaY > 0) {
      // Scroll down
      menuManager.navigateDown();
    } else if (event.deltaY < 0) {
      // Scroll up
      menuManager.navigateUp();
    }
    
    // Handle wheel click (middle mouse button)
    if (event.button === 1) {
      menuManager.navigateForward();
    }
  }

  /**
   * Setup additional menu-specific listeners
   */
  setupMenuListeners() {
    // Mouse wheel click listener
    document.addEventListener('mousedown', (event) => {
      if (!game.folkenQuickMenu?.menuManager?.isOpen) return;
      
      if (event.button === 1) { // Middle mouse button
        event.preventDefault();
        game.folkenQuickMenu.menuManager.navigateForward();
      }
    });
  }

  /**
   * Handle number input for rapid navigation
   */
  handleNumberInput(number, menuManager) {
    // Clear any existing timeout
    if (this.numberTimeout) {
      clearTimeout(this.numberTimeout);
    }
    
    // Add number to sequence
    this.numberSequence.push(number);
    
    // Set timeout to execute after 500ms of no input
    this.numberTimeout = setTimeout(() => {
      this.executeNumberSequence(menuManager);
    }, 500);
    
    // Also check if we should execute immediately
    // (if user pauses or hits a number that would be invalid for next level)
    this.checkImmediateExecution(menuManager);
  }

  /**
   * Check if we should execute the number sequence immediately
   */
  checkImmediateExecution(menuManager) {
    if (!menuManager.currentMenu) return;
    
    const currentLength = this.numberSequence.length;
    const menuLength = menuManager.currentMenu.length;
    
    // If the current sequence would already exceed menu length, execute now
    const sequenceValue = parseInt(this.numberSequence.join(''));
    if (sequenceValue > menuLength && currentLength > 1) {
      // Remove the last number and execute with the previous sequence
      const lastNumber = this.numberSequence.pop();
      this.executeNumberSequence(menuManager);
      
      // Start new sequence with the last number
      this.numberSequence = [lastNumber];
      this.numberTimeout = setTimeout(() => {
        this.executeNumberSequence(menuManager);
      }, 500);
    }
  }

  /**
   * Execute the accumulated number sequence
   */
  executeNumberSequence(menuManager) {
    if (this.numberSequence.length === 0) return;
    
    // Convert sequence to number and execute
    const targetNumber = parseInt(this.numberSequence.join(''));
    debugLog('Executing number sequence:', this.numberSequence, 'as', targetNumber);
    
    // Execute rapid navigation
    menuManager.navigateToNumberSequence(this.numberSequence.slice());
    
    // Clear sequence and timeout
    this.numberSequence = [];
    if (this.numberTimeout) {
      clearTimeout(this.numberTimeout);
      this.numberTimeout = null;
    }
  }

  /**
   * Toggle menu open/close
   */
  toggleMenu() {
    const menuManager = game.folkenQuickMenu?.menuManager;
    if (!menuManager) return;
    
    if (menuManager.isOpen) {
      menuManager.closeMenu();
    } else {
      menuManager.openMenu();
    }
  }

  /**
   * Add custom key binding
   */
  addKeyBinding(key, callback, options = {}) {
    const binding = {
      callback,
      preventDefault: options.preventDefault !== false,
      stopPropagation: options.stopPropagation !== false,
      requireMenuOpen: options.requireMenuOpen !== false
    };
    
    this.keyListeners.set(key, binding);
    debugLog('Added key binding for:', key);
  }

  /**
   * Remove custom key binding
   */
  removeKeyBinding(key) {
    if (this.keyListeners.has(key)) {
      this.keyListeners.delete(key);
      debugLog('Removed key binding for:', key);
      return true;
    }
    return false;
  }

  /**
   * Check if a key is currently pressed
   */
  isKeyPressed(key) {
    return this.pressedKeys.has(key);
  }

  /**
   * Handle key combinations
   */
  handleKeyCombination(event) {
    const keys = [];
    
    if (event.ctrlKey) keys.push('Ctrl');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');
    if (event.metaKey) keys.push('Meta');
    
    keys.push(event.code);
    
    const combination = keys.join('+');
    
    if (this.keyListeners.has(combination)) {
      const binding = this.keyListeners.get(combination);
      
      if (binding.requireMenuOpen && !game.folkenQuickMenu?.menuManager?.isOpen) {
        return false;
      }
      
      if (binding.preventDefault) {
        event.preventDefault();
      }
      
      if (binding.stopPropagation) {
        event.stopPropagation();
      }
      
      binding.callback(event);
      return true;
    }
    
    return false;
  }

  /**
   * Disable keyboard handling
   */
  disable() {
    this.isActive = false;
    debugLog('KeyboardHandler disabled');
  }

  /**
   * Enable keyboard handling
   */
  enable() {
    this.isActive = true;
    debugLog('KeyboardHandler enabled');
  }

  /**
   * Get current key bindings info
   */
  getKeyBindings() {
    return {
      activation: getSetting('activationKey'),
      navigation: {
        up: 'Arrow Up',
        down: 'Arrow Down',
        forward: 'Arrow Right / Enter',
        back: 'Arrow Left / Escape',
        numbers: '1-9, 0 (for item 10)'
      },
      wheel: {
        scroll: 'Scroll up/down to navigate',
        click: 'Middle click to select'
      }
    };
  }
}
