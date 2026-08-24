/**
 * Main Content Script
 * Injects visualization button and panel into LeetCode pages
 */

class LeetCodeVisualizer {
  constructor() {
    this.isVisible = false;
    this.backend = 'http://localhost:3000'; // Will be configurable
    this.isExecuting = false;
  }

  /**
   * Initialize the visualizer
   */
  init() {
    console.log('[LeetCode Visualizer] Initializing...');

    // Wait for page to fully load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  /**
   * Set up the UI
   */
  setup() {
    // Check if we're on a problem page
    if (!window.leetcodeDetector.isOnProblemPage()) {
      console.log('[LeetCode Visualizer] Not on a problem page');
      return;
    }

    console.log('[LeetCode Visualizer] On problem page, setting up UI...');

    // Create and inject the button
    this.createButton();

    // Create and inject the panel (hidden by default)
    this.createPanel();

    // Set up message listeners
    this.setupMessageListeners();

    console.log('[LeetCode Visualizer] Setup complete');
  }

  /**
   * Create the "Visualize" button
   */
  createButton() {
    // Find the submit button container
    const submitContainer = document.querySelector(
      '[data-testid="submit-code-btn"],' +
      'button:contains("Submit"),' +
      '.py-[5px]:has(button)' // Common container in LeetCode
    );

    if (!submitContainer) {
      console.log('[LeetCode Visualizer] Could not find submit button container');
      // Create our own container
      this.createButtonInToolbar();
      return;
    }

    // Create our button
    const button = document.createElement('button');
    button.id = 'lcv-visualize-btn';
    button.className = 'lcv-button lcv-button-primary';
    button.innerHTML = '🎨 Visualize Execution';
    button.title = 'Visualize your algorithm execution step-by-step';

    button.addEventListener('click', () => this.handleVisualize());

    // Insert button before submit button
    submitContainer.insertAdjacentElement('beforebegin', button);
  }

  /**
   * Create button in toolbar if container not found
   */
  createButtonInToolbar() {
    // Find any toolbar/action area
    const toolbar = document.querySelector(
      '[data-testid="action-area"],' +
      '.editor-toolbar,' +
      '[class*="toolbar"]'
    ) || document.querySelector('[role="toolbar"]');

    if (!toolbar) {
      console.log('[LeetCode Visualizer] Could not find toolbar');
      return;
    }

    const button = document.createElement('button');
    button.id = 'lcv-visualize-btn';
    button.className = 'lcv-button lcv-button-primary';
    button.innerHTML = '🎨 Visualize';
    button.title = 'Visualize your algorithm execution';
    button.addEventListener('click', () => this.handleVisualize());

    toolbar.appendChild(button);
  }

  /**
   * Create the visualization panel
   */
  createPanel() {
    // Create panel container
    const panelContainer = document.createElement('div');
    panelContainer.id = 'lcv-panel-container';
    panelContainer.className = 'lcv-panel-container lcv-hidden';

    // Create panel content
    const panel = document.createElement('div');
    panel.className = 'lcv-panel';
    panel.innerHTML = `
      <div class="lcv-panel-header">
        <h3>Algorithm Visualizer</h3>
        <button id="lcv-close-btn" class="lcv-close-btn">✕</button>
      </div>
      
      <div class="lcv-panel-content">
        <div id="lcv-status" class="lcv-status">Ready</div>
        
        <div class="lcv-controls">
          <button id="lcv-run-btn" class="lcv-button lcv-button-small">Run Visualization</button>
          <button id="lcv-pause-btn" class="lcv-button lcv-button-small" disabled>Pause</button>
          <button id="lcv-reset-btn" class="lcv-button lcv-button-small">Reset</button>
        </div>
        
        <div id="lcv-visualization-area" class="lcv-visualization-area">
          <div class="lcv-placeholder">
            <p>Click "Run Visualization" to see your algorithm in action</p>
          </div>
        </div>
        
        <div id="lcv-stats" class="lcv-stats">
          <span>Step: <span id="lcv-step-count">0</span> / <span id="lcv-total-steps">0</span></span>
          <span>Time: <span id="lcv-exec-time">0</span>ms</span>
        </div>
        
        <div id="lcv-console" class="lcv-console">
          <div class="lcv-console-label">Console Output:</div>
          <div id="lcv-console-output" class="lcv-console-output"></div>
        </div>
      </div>
    `;

    panelContainer.appendChild(panel);
    document.body.appendChild(panelContainer);

    // Attach event listeners
    document.getElementById('lcv-close-btn').addEventListener('click', 
      () => this.togglePanel());
    document.getElementById('lcv-run-btn').addEventListener('click',
      () => this.handleRunVisualization());
    document.getElementById('lcv-pause-btn').addEventListener('click',
      () => this.handlePause());
    document.getElementById('lcv-reset-btn').addEventListener('click',
      () => this.handleReset());
  }

  /**
   * Handle visualize button click
   */
  handleVisualize() {
    if (!window.codeExtractor) {
      alert('Code extractor not loaded yet. Please wait...');
      return;
    }

    const code = window.codeExtractor.getCode();
    if (!code) {
      alert('Could not extract code. Please make sure you have code in the editor.');
      return;
    }

    // Show the panel
    this.showPanel();

    // Set status
    this.setStatus('Ready to run. Click "Run Visualization"');
  }

  /**
   * Handle run visualization button
   */
  handleRunVisualization() {
    if (this.isExecuting) {
      alert('Execution already in progress');
      return;
    }

    const code = window.codeExtractor.getCode();
    const context = window.codeExtractor.getContext();

    if (!code) {
      alert('No code to visualize');
      return;
    }

    this.isExecuting = true;
    this.setStatus('Sending code to backend...');
    document.getElementById('lcv-run-btn').disabled = true;

    // Send to backend for execution
    this.executeCode(code, context);
  }

  /**
   * Execute code via backend API
   */
  executeCode(code, context) {
    const payload = {
      code,
      language: context.problem.language || 'python',
      problemId: context.problem.id,
      problemTitle: context.problem.title
    };

    console.log('[LeetCode Visualizer] Sending to backend:', payload);

    fetch(`${this.backend}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('[LeetCode Visualizer] Execution result:', data);
      this.renderVisualization(data);
      this.setStatus('Execution complete');
    })
    .catch(error => {
      console.error('[LeetCode Visualizer] Error:', error);
      this.setStatus(`Error: ${error.message}`);
      alert(`Visualization failed: ${error.message}\n\nMake sure the backend server is running (http://localhost:3000)`);
    })
    .finally(() => {
      this.isExecuting = false;
      document.getElementById('lcv-run-btn').disabled = false;
    });
  }

  /**
   * Render execution visualization
   */
  renderVisualization(executionData) {
    const vizArea = document.getElementById('lcv-visualization-area');
    const statsArea = document.getElementById('lcv-stats');
    const consoleArea = document.getElementById('lcv-console-output');

    // Clear previous visualization
    vizArea.innerHTML = '';
    consoleArea.innerHTML = '';

    // Render each step
    if (executionData.steps && executionData.steps.length > 0) {
      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'lcv-steps';

      executionData.steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'lcv-step';
        stepDiv.innerHTML = `
          <div class="lcv-step-number">Step ${index + 1}</div>
          <div class="lcv-step-content">
            <pre>${JSON.stringify(step.variables, null, 2)}</pre>
          </div>
        `;
        stepsContainer.appendChild(stepDiv);
      });

      vizArea.appendChild(stepsContainer);

      // Update stats
      document.getElementById('lcv-total-steps').textContent = executionData.steps.length;
      document.getElementById('lcv-exec-time').textContent = executionData.executionTime || 0;
    }

    // Show console output
    if (executionData.output) {
      const lines = executionData.output.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          const lineDiv = document.createElement('div');
          lineDiv.className = 'lcv-output-line';
          lineDiv.textContent = line;
          consoleArea.appendChild(lineDiv);
        }
      });
    }

    // Show errors if any
    if (executionData.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'lcv-error';
      errorDiv.textContent = `Error: ${executionData.error}`;
      vizArea.appendChild(errorDiv);
    }
  }

  /**
   * Handle pause button
   */
  handlePause() {
    this.setStatus('Paused');
  }

  /**
   * Handle reset button
   */
  handleReset() {
    document.getElementById('lcv-visualization-area').innerHTML = `
      <div class="lcv-placeholder">
        <p>Click "Run Visualization" to see your algorithm in action</p>
      </div>
    `;
    document.getElementById('lcv-console-output').innerHTML = '';
    document.getElementById('lcv-step-count').textContent = '0';
    document.getElementById('lcv-total-steps').textContent = '0';
    this.setStatus('Ready');
  }

  /**
   * Toggle panel visibility
   */
  togglePanel() {
    const container = document.getElementById('lcv-panel-container');
    container.classList.toggle('lcv-hidden');
    this.isVisible = !this.isVisible;
  }

  /**
   * Show panel
   */
  showPanel() {
    const container = document.getElementById('lcv-panel-container');
    container.classList.remove('lcv-hidden');
    this.isVisible = true;
  }

  /**
   * Set status message
   */
  setStatus(message) {
    const statusEl = document.getElementById('lcv-status');
    if (statusEl) {
      statusEl.textContent = message;
    }
  }

  /**
   * Set up message listeners for backend communication
   */
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[LeetCode Visualizer] Message received:', message);

      if (message.type === 'BACKEND_READY') {
        this.setStatus('Backend connected');
        sendResponse({ status: 'ok' });
      }

      if (message.type === 'EXECUTION_RESULT') {
        this.renderVisualization(message.data);
        sendResponse({ status: 'rendered' });
      }
    });
  }
}

// Initialize when script loads
const visualizer = new LeetCodeVisualizer();
visualizer.init();

console.log('[LeetCode Visualizer] Content script loaded');
