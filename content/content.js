/**
 * Main Content Script
 * Injects a "Visualize" button + step-through panel into LeetCode problem pages.
 *
 * Runs entirely client-side using the same engine/renderer as the standalone
 * visualizer (engine/lexer.js, parser.js, runtime.js, interpreter.js, detector.js,
 * engine.js, renderer.js — loaded before this file via manifest.json). No backend
 * server is required for Python.
 */

class LeetCodeVisualizer {
  constructor() {
    this.isVisible = false;
    this.isExecuting = false;
    this.result = null;
    this.roles = null;
    this.stepIndex = 0;
    this.playTimer = null;
  }

  init() {
    console.log('[LeetCode Visualizer] Initializing...');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    if (!window.leetcodeDetector || !window.leetcodeDetector.isOnProblemPage()) {
      console.log('[LeetCode Visualizer] Not on a problem page');
      return;
    }
    console.log('[LeetCode Visualizer] On problem page, setting up UI...');
    this.createButton();
    this.createPanel();
    console.log('[LeetCode Visualizer] Setup complete');
  }

  createButton() {
    const submitContainer = document.querySelector('[data-testid="submit-code-btn"]');
    const button = document.createElement('button');
    button.id = 'lcv-visualize-btn';
    button.className = 'lcv-button lcv-button-primary';
    button.innerHTML = '🎨 Visualize Execution';
    button.title = 'Visualize your algorithm execution step-by-step';
    button.addEventListener('click', () => this.handleVisualize());

    if (submitContainer) {
      submitContainer.insertAdjacentElement('beforebegin', button);
      return;
    }
    this.createButtonInToolbar(button);
  }

  createButtonInToolbar(button) {
    const toolbar = document.querySelector('[data-testid="action-area"], .editor-toolbar, [class*="toolbar"]') ||
      document.querySelector('[role="toolbar"]');
    if (!toolbar) {
      // fall back to a fixed floating button so the feature is always reachable
      button.classList.add('lcv-floating-btn');
      document.body.appendChild(button);
      return;
    }
    toolbar.appendChild(button);
  }

  createPanel() {
    const panelContainer = document.createElement('div');
    panelContainer.id = 'lcv-panel-container';
    panelContainer.className = 'lcv-panel-container lcv-hidden';

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
          <button id="lcv-prev-btn" class="lcv-button lcv-button-small" disabled>◀</button>
          <button id="lcv-play-btn" class="lcv-button lcv-button-small" disabled>▶</button>
          <button id="lcv-next-btn" class="lcv-button lcv-button-small" disabled>▶|</button>
          <button id="lcv-reset-btn" class="lcv-button lcv-button-small">Reset</button>
        </div>
        <input type="range" id="lcv-slider" min="0" max="0" value="0" style="width:100%;margin:8px 0;" disabled>
        <div id="lcv-narration" class="trace-mini" style="display:none;"></div>
        <div id="lcv-error" class="lcv-error" style="display:none;"></div>
        <div id="lcv-visualization-area" class="lcv-visualization-area">
          <div class="lcv-placeholder">
            <p>Click "Run Visualization" to see your algorithm in action.</p>
            <p style="opacity:.6;font-size:11px;">Runs fully in your browser — Python only for now.</p>
          </div>
        </div>
        <div id="lcv-stats" class="lcv-stats">
          <span>Step: <span id="lcv-step-count">0</span> / <span id="lcv-total-steps">0</span></span>
        </div>
        <div id="lcv-console" class="lcv-console">
          <div class="lcv-console-label">Output:</div>
          <div id="lcv-console-output" class="lcv-console-output"></div>
        </div>
      </div>
    `;

    panelContainer.appendChild(panel);
    document.body.appendChild(panelContainer);

    document.getElementById('lcv-close-btn').addEventListener('click', () => this.togglePanel());
    document.getElementById('lcv-run-btn').addEventListener('click', () => this.handleRunVisualization());
    document.getElementById('lcv-prev-btn').addEventListener('click', () => this.step(-1));
    document.getElementById('lcv-next-btn').addEventListener('click', () => this.step(1));
    document.getElementById('lcv-play-btn').addEventListener('click', () => this.togglePlay());
    document.getElementById('lcv-reset-btn').addEventListener('click', () => this.handleReset());
    document.getElementById('lcv-slider').addEventListener('input', (e) => {
      this.pause();
      this.stepIndex = parseInt(e.target.value, 10);
      this.renderCurrentStep();
    });
  }

  handleVisualize() {
    if (!window.codeExtractor) {
      alert('Code extractor not loaded yet. Please wait a moment and try again.');
      return;
    }
    this.showPanel();
    this.setStatus('Ready — click "Run Visualization"');
  }

  handleRunVisualization() {
    if (this.isExecuting) return;
    if (!window.codeExtractor) { alert('Code extractor not ready.'); return; }

    const code = window.codeExtractor.getCode();
    const context = window.codeExtractor.getContext();
    if (!code || !code.trim()) { alert('No code found in the editor.'); return; }

    const lang = (context && context.problem && context.problem.language) || 'python';
    if (!/python/i.test(lang)) {
      this.showError({ type: 'Unsupported language', message: `Detected "${lang}". This build runs Python directly in the browser; switch LeetCode's language selector to Python3 to visualize.` });
      this.renderStats(0, 0);
      return;
    }

    if (!window.PyEngine) {
      this.showError({ type: 'Engine not loaded', message: 'The visualization engine failed to load with the page. Try reloading LeetCode.' });
      return;
    }

    this.isExecuting = true;
    this.setStatus('Running...');
    document.getElementById('lcv-run-btn').disabled = true;

    // yield to the UI thread so the "Running..." status paints before we run
    setTimeout(() => {
      try {
        const res = window.PyEngine.runPython(code, { maxSteps: 6000, maxMs: 5000, maxDepth: 200 });
        this.result = res;
        this.roles = res.steps.length ? window.PyEngine.computeRoles(res.steps) : new Map();
        this.stepIndex = 0;
        this.hideError();
        if (res.error) this.showError(res.error);
        this.setStatus(res.error ? 'Finished with an error' : 'Execution complete');
        this.renderStats(res.steps.length ? 1 : 0, res.steps.length);
        const slider = document.getElementById('lcv-slider');
        slider.max = Math.max(0, res.steps.length - 1);
        slider.value = 0;
        slider.disabled = res.steps.length === 0;
        document.getElementById('lcv-prev-btn').disabled = res.steps.length === 0;
        document.getElementById('lcv-next-btn').disabled = res.steps.length === 0;
        document.getElementById('lcv-play-btn').disabled = res.steps.length === 0;
        this.renderCurrentStep();
      } catch (e) {
        this.showError({ type: 'InternalError', message: String(e && e.message || e) });
      } finally {
        this.isExecuting = false;
        document.getElementById('lcv-run-btn').disabled = false;
      }
    }, 10);
  }

  step(delta) {
    if (!this.result || !this.result.steps.length) return;
    this.pause();
    this.stepIndex = Math.max(0, Math.min(this.result.steps.length - 1, this.stepIndex + delta));
    document.getElementById('lcv-slider').value = this.stepIndex;
    this.renderCurrentStep();
  }

  togglePlay() {
    if (this.playTimer) { this.pause(); return; }
    if (!this.result || !this.result.steps.length) return;
    document.getElementById('lcv-play-btn').textContent = '⏸';
    this.playTimer = setInterval(() => {
      if (this.stepIndex >= this.result.steps.length - 1) { this.pause(); return; }
      this.stepIndex++;
      document.getElementById('lcv-slider').value = this.stepIndex;
      this.renderCurrentStep();
    }, 700);
  }
  pause() {
    if (this.playTimer) { clearInterval(this.playTimer); this.playTimer = null; }
    document.getElementById('lcv-play-btn').textContent = '▶';
  }

  renderStats(cur, total) {
    document.getElementById('lcv-step-count').textContent = cur;
    document.getElementById('lcv-total-steps').textContent = total;
  }

  renderCurrentStep() {
    const vizArea = document.getElementById('lcv-visualization-area');
    const consoleArea = document.getElementById('lcv-console-output');
    const narration = document.getElementById('lcv-narration');
    vizArea.innerHTML = '';
    consoleArea.innerHTML = '';

    if (!this.result || !this.result.steps.length) {
      vizArea.innerHTML = '<div class="lcv-placeholder"><p>No execution steps to show.</p></div>';
      narration.style.display = 'none';
      return;
    }
    const steps = this.result.steps;
    const i = Math.max(0, Math.min(this.stepIndex, steps.length - 1));
    const step = steps[i];
    this.renderStats(i + 1, steps.length);

    narration.style.display = 'block';
    narration.innerHTML = `<span class="nk">${escapeHtml(step.kind)}</span> · L${step.line + 1} — ${escapeHtml(step.desc)}`;

    const R = window.PyRenderer, E = window.PyEngine;
    const vv = E.pickVizVars(step, this.roles);
    const heap = step.world.heap;
    const ptrCandidates = E.objectPointerList(step);
    const colorCache = {};

    R.renderCallStack(vizArea, step.world.frames);
    const containerVars = vv.filter(v => v.kind !== 'scalar');
    const scalarVars = vv.filter(v => v.kind === 'scalar');

    containerVars.forEach(v => {
      switch (v.kind) {
        case 'array': {
          const pointers = R.collectPointers(step.world.frames, v.heapObj.id).filter(p => p.name !== v.name);
          R.renderArray(vizArea, v.heapObj, { heap, pointers, colorCache, label: v.name });
          break;
        }
        case 'stack': R.renderStack(vizArea, v.heapObj, { heap, label: v.name }); break;
        case 'queue': R.renderQueue(vizArea, v.heapObj, { heap, label: v.name }); break;
        case 'grid': {
          const { activeCell, visitedCells } = E.computeGridOverlay(step, v.heapObj, heap);
          R.renderGrid(vizArea, v.heapObj, { heap, label: v.name, activeCell, visitedCells });
          break;
        }
        case 'adjacency_list': {
          const pointers = R.collectPointers(step.world.frames, v.heapObj.id).filter(p => p.name !== v.name);
          R.renderAdjacencyGraph(vizArea, v.heapObj, heap, { label: v.name, pointers });
          break;
        }
        case 'map': R.renderMap(vizArea, v.heapObj, { heap, label: v.name }); break;
        case 'set': R.renderSet(vizArea, v.heapObj, { heap, label: v.name }); break;
        case 'tuple': R.renderArray(vizArea, v.heapObj, { heap, pointers: [], colorCache, label: v.name + ' (tuple)' }); break;
        case 'linked_list': R.renderLinkedList(vizArea, v.ref, heap, { label: v.name, pointers: ptrCandidates }); break;
        case 'tree': R.renderTree(vizArea, v.ref, heap, { label: v.name }); break;
        case 'graph': R.renderGraph(vizArea, v.ref, heap, { label: v.name }); break;
      }
    });
    if (scalarVars.length) R.renderScalars(vizArea, scalarVars.map(v => [v.name, v.value]));
    if (!containerVars.length && !scalarVars.length) {
      vizArea.innerHTML += '<div class="lcv-placeholder"><p>No local variables yet.</p></div>';
    }

    step.output.forEach(line => {
      const d = document.createElement('div');
      d.className = 'lcv-output-line';
      d.textContent = line;
      consoleArea.appendChild(d);
    });
  }

  showError(err) {
    const el = document.getElementById('lcv-error');
    el.style.display = 'block';
    el.innerHTML = `<b>${escapeHtml(err.type)}</b>: ${escapeHtml(err.message)}` +
      (err.line !== null && err.line !== undefined ? ` (line ${err.line + 1})` : '');
  }
  hideError() {
    const el = document.getElementById('lcv-error');
    el.style.display = 'none';
    el.innerHTML = '';
  }

  handleReset() {
    this.pause();
    this.result = null;
    this.stepIndex = 0;
    document.getElementById('lcv-visualization-area').innerHTML =
      '<div class="lcv-placeholder"><p>Click "Run Visualization" to see your algorithm in action.</p></div>';
    document.getElementById('lcv-console-output').innerHTML = '';
    document.getElementById('lcv-narration').style.display = 'none';
    this.hideError();
    this.renderStats(0, 0);
    const slider = document.getElementById('lcv-slider');
    slider.value = 0; slider.max = 0; slider.disabled = true;
    document.getElementById('lcv-prev-btn').disabled = true;
    document.getElementById('lcv-next-btn').disabled = true;
    document.getElementById('lcv-play-btn').disabled = true;
    this.setStatus('Ready');
  }

  togglePanel() {
    const container = document.getElementById('lcv-panel-container');
    container.classList.toggle('lcv-hidden');
    this.isVisible = !this.isVisible;
  }
  showPanel() {
    document.getElementById('lcv-panel-container').classList.remove('lcv-hidden');
    this.isVisible = true;
  }
  setStatus(message) {
    const statusEl = document.getElementById('lcv-status');
    if (statusEl) statusEl.textContent = message;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const visualizer = new LeetCodeVisualizer();
visualizer.init();
console.log('[LeetCode Visualizer] Content script loaded');
