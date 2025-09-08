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
        
      case 'ArrowLeft':
      case 'Escape':
      case 'Backspace':
        menuManager.navigateBack();
        break;
        
      case 'Digit1':
      case 'Numpad1':
        menuManager.navigateToNumber(1);
        break;
        
      case 'Digit2':
      case 'Numpad2':
        menuManager.navigateToNumber(2);
        break;
        
      case 'Digit3':
      case 'Numpad3':
        menuManager.navigateToNumber(3);
        break;
        
      case 'Digit4':
      case 'Numpad4':
        menuManager.navigateToNumber(4);
        break;
        
      case 'Digit5':
      case 'Numpad5':
        menuManager.navigateToNumber(5);
        break;
        
      case 'Digit6':
      case 'Numpad6':
        menuManager.navigateToNumber(6);
        break;
        
      case 'Digit7':
      case 'Numpad7':
        menuManager.navigateToNumber(7);
        break;
        
      case 'Digit8':
      case 'Numpad8':
        menuManager.navigateToNumber(8);
        break;
        
      case 'Digit9':
      case 'Numpad9':
        menuManager.navigateToNumber(9);
        break;
        
      case 'Digit0':
      case 'Numpad0':
        menuManager.navigateToNumber(10);
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
