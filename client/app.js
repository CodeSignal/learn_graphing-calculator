/**
 * Graphing Calculator Application
 */

import StateManager from './core/state-manager.js';
import ConfigLoader from './core/config-loader.js';
import defaultConfig from './configs/default-config.js';
import Modal from './design-system/components/modal/modal.js';
import GraphEngine from './graph-engine.js';
import SidebarManager from './components/sidebar-manager.js';
import ExpressionList from './components/expression-list.js';


class App {
  constructor() {
    this.graphEngine = null;
    this.expressionList = null;

    this.helpModal = null;
    this.debug = false;
  }

  /**
   * Initialize application
   */
  async init() {
    if (this.debug) {
      console.log('[App] Initializing...');
    }

    // Initialize Components first so we can use them if needed
    // But State needs to be ready.

    // Initialize State Management
    await this.initState();

    // Initialize Components
    this.initComponents();

    // Initialize Help Modal
    this.initHelp();

    // Set Ready Status
    this.setStatus('Ready');

    if (this.debug) {
      console.log('[App] Initialized');
    }
  }

  /**
   * Initialize State Manager
   */
  async initState() {
    let config;

    try {
      // Try loading config from JSON file
      config = await ConfigLoader.load('./configs/config.json');
      if (this.debug) {
        console.log('[App] Loaded config from config.json');
      }
    } catch (error) {
      // Fallback to default-config.js
      if (this.debug) {
        console.log('[App] Failed to load config.json, using default-config.js:', error);
      }
      config = ConfigLoader.fromObject(defaultConfig);
    }

    StateManager.initialize(config);
  }

  /**
   * Initialize Components
   */
  initComponents() {
    // GraphEngine (Canvas)
    this.graphEngine = new GraphEngine('graph-canvas');
    this.graphEngine.init();

    // Initialize Sidebar Manager
    this.sidebarManager = new SidebarManager('sidebar', 'sidebar-resizer', 'btn-toggle-sidebar', 'btn-floating-toggle-sidebar');
    this.sidebarManager.init();

    // Expression List (Sidebar)
    this.expressionList = new ExpressionList('expression-list', 'btn-add-expression');
    this.expressionList.init();



    // Global Buttons
    this.initGlobalControls();
  }

  /**
   * Initialize Global Controls (Zoom, Reset)
   */
  initGlobalControls() {
    document.getElementById('btn-home').addEventListener('click', () => {
      // Reset to initial graph config from state
      const initialGraph = StateManager.get('config')?.graph;
      if (initialGraph) {
        StateManager.set('graph', { ...initialGraph });
      }
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.graphEngine.zoom(1.2);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.graphEngine.zoom(0.8);
    });
  }

  /**
   * Initialize Help System
   */
  initHelp() {
    const helpTemplate = document.getElementById('help-content-template');
    if (!helpTemplate) return;

    const helpContent = helpTemplate.content.cloneNode(true);

    this.helpModal = Modal.createHelpModal({
      title: 'Using the Calculator',
      content: helpContent
    });

    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
      btnHelp.addEventListener('click', () => {
        this.helpModal.open();
      });
    }
  }




  /**
   * Update Status Bar
   */
  setStatus(msg) {
    const el = document.getElementById('status');
    if (el) el.textContent = msg;
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebug(enabled) {
    this.debug = enabled;
  }
}

// Start App
const app = new App();
window.app = app; // For debugging
app.init().catch(err => console.error(err));
