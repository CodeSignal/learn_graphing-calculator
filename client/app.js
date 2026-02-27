/**
 * Graphing Calculator Application
 */

import StateManager from './core/state-manager.js';
import EventBus from './core/event-bus.js';
import ConfigLoader from './core/config-loader.js';
import defaultConfig from './configs/default-config.js';
import Modal from './design-system/components/modal/modal.js';
import GraphEngine from './graph-engine.js';
import SidebarManager from './components/sidebar-manager.js';
import ExpressionList from './components/expression-list.js';
import Logger from './utils/logger.js';
import { renderLatex } from './utils/math-formatter.js';


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
    // Initialize logger first (checks URL parameters for debug mode)
    Logger.init();

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

    // Inject StateManager into EventBus for immediate callbacks
    // This must be done before components subscribe with immediate: true
    EventBus.setStateManager(StateManager);
  }

  /**
   * Initialize Components
   */
  initComponents() {
    // GraphEngine (Canvas)
    this.graphEngine = new GraphEngine('graph-canvas');
    this.graphEngine.init();

    // Log initial state of the application (after GraphEngine creates assignment expressions)
    const functions = StateManager.get('functions') || [];
    const functionsStr = functions.length > 0
      ? functions.map(f => `${f.id}: ${f.expression}`).join(', ')
      : '';
    Logger.logActivity(`Initial state: ${functionsStr}`);

    // Initialize Sidebar Manager
    this.sidebarManager = new SidebarManager('sidebar', 'sidebar-resizer', 'btn-toggle-sidebar', 'btn-floating-toggle-sidebar');
    this.sidebarManager.init();

    // Expression List (Sidebar)
    this.expressionList = new ExpressionList('expression-list', 'btn-add-expression');
    this.expressionList.init();

    // Sidebar tabs
    this.initSidebarTabs();

    // Global Buttons
    this.initGlobalControls();
  }

  /**
   * Initialize sidebar tab controls for expressions/parameters sections
   */
  initSidebarTabs() {
    const expressionTab = document.getElementById('tab-expressions');
    const parameterTab = document.getElementById('tab-parameters');
    const expressionLabel = expressionTab?.querySelector('.sidebar-tab-label');
    const parameterLabel = parameterTab?.querySelector('.sidebar-tab-label');

    if (!expressionTab || !parameterTab || !this.expressionList) {
      return;
    }

    this.renderSidebarTabLabels(expressionLabel, parameterLabel);

    const setActiveTab = (section) => {
      const isExpressions = section === 'expressions';

      expressionTab.classList.toggle('is-active', isExpressions);
      expressionTab.classList.toggle('button-secondary', isExpressions);
      expressionTab.classList.toggle('button-tertiary', !isExpressions);
      expressionTab.setAttribute('aria-selected', isExpressions ? 'true' : 'false');

      parameterTab.classList.toggle('is-active', !isExpressions);
      parameterTab.classList.toggle('button-secondary', !isExpressions);
      parameterTab.classList.toggle('button-tertiary', isExpressions);
      parameterTab.setAttribute('aria-selected', isExpressions ? 'false' : 'true');

      this.expressionList.setActiveSection(section);
    };

    expressionTab.addEventListener('click', () => {
      setActiveTab('expressions');
    });

    parameterTab.addEventListener('click', () => {
      setActiveTab('parameters');
    });

    // Default section on every load
    setActiveTab('expressions');
  }

  /**
   * Render math symbols for sidebar tabs using KaTeX
   * @param {HTMLElement|null} expressionLabel - Expressions tab label host
   * @param {HTMLElement|null} parameterLabel - Parameters tab label host
   */
  renderSidebarTabLabels(expressionLabel, parameterLabel) {
    if (expressionLabel) {
      renderLatex('f(x)', expressionLabel);
    }
    if (parameterLabel) {
      renderLatex('\\theta', parameterLabel);
    }
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
