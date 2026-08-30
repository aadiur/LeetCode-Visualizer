"use strict";
(function(){
  const E = window.PyEngine, R = window.PyRenderer;

  const DEFAULT_SOURCE = `class Solution:
    def isValid(self, s: str) -> bool:
        stack = []
        pairs = {')': '(', ']': '[', '}': '{'}
        for c in s:
            if c in '([{':
                stack.append(c)
            elif not stack or stack.pop() != pairs[c]:
                return False
        return not stack
`;

  const LINE_HEIGHT = 21; // must match .source-edit's line-height in CSS
  const PAD_TOP = 14;     // must match .source-edit's padding-top in CSS

  const state = {
    lang: 'python',
    result: null,
    roles: null,
    stepIndex: 0,
    playTimer: null,
    liveMode: true,
    debounceTimer: null,
    hasEverSucceeded: false,
    speedMs: 550,
  };

  const $ = sel => document.querySelector(sel);
  const sourceEdit = $('#sourceEdit');
  const lineHighlight = $('#lineHighlight');
  const errLineMarker = $('#errLineMarker');
  const entryBar = $('#entryBar');
  const entryNote = $('#entryNote');
  const entryInput = $('#entryInput');
  const runBtn = $('#runBtn');
  const liveToggle = $('#liveToggle');
  const liveStatus = $('#liveStatus');
  const traceScroll = $('#traceScroll');
  const vizScroll = $('#vizScroll');
  const narration = $('#narration');
  const errorBanner = $('#errorBanner');
  const restartBtn = $('#restartBtn');
  const liveProgress = $('#liveProgress');
  const outputConsole = $('#outputConsole');
  const stepMeta = $('#stepMeta');

  sourceEdit.value = DEFAULT_SOURCE;
  sourceEdit.setAttribute('wrap', 'off');

  const colorCache = {};

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ---------- line highlight overlay (sits behind the live, always-editable textarea) ----------
  function positionHighlight(el, lineIndex, cls){
    if (lineIndex === null || lineIndex === undefined){ el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.className = 'line-highlight-bar ' + (cls||'');
    const top = PAD_TOP + lineIndex * LINE_HEIGHT - sourceEdit.scrollTop;
    el.style.top = top + 'px';
  }
  function clearHighlights(){
    lineHighlight.style.display = 'none';
    errLineMarker.style.display = 'none';
  }
  sourceEdit.addEventListener('scroll', () => {
    if (lineHighlight.style.display === 'block') positionHighlight(lineHighlight, lineHighlight._line, 'active');
    if (errLineMarker.style.display === 'block') positionHighlight(errLineMarker, errLineMarker._line, 'err');
  });

  function setLiveStatus(text, kind){
    liveStatus.textContent = text;
    liveStatus.className = 'live-status ' + (kind || '');
  }

  function scheduleLiveRun(){
    if (!state.liveMode) return;
    setLiveStatus('typing…', 'pending');
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => { runLive(); }, 750);
  }

  sourceEdit.addEventListener('input', scheduleLiveRun);
  sourceEdit.addEventListener('keydown', (e) => {
    if (e.key === 'Tab'){
      e.preventDefault();
      const s = sourceEdit.selectionStart, en = sourceEdit.selectionEnd;
      sourceEdit.value = sourceEdit.value.slice(0,s) + '    ' + sourceEdit.value.slice(en);
      sourceEdit.selectionStart = sourceEdit.selectionEnd = s + 4;
      scheduleLiveRun();
    }
  });

  // A "live" run happens quietly while typing. On success it immediately plays the
  // whole thing start to finish, automatically — no play/pause/scrub, it just runs.
  // On failure (extremely common mid-keystroke, e.g. an unfinished line) it does NOT
  // blow away the last good animation or show a scary red banner — it keeps playing
  // what it had and shows a small inline status instead.
  function runLive(){
    const src = sourceEdit.value;
    const res = E.runPython(src, { maxSteps: 8000, maxMs: 6000, maxDepth: 200 });
    if (res.error && state.hasEverSucceeded){
      setLiveStatus('waiting for valid code…', 'pending');
      positionErrMarkerOnly(res.error);
      return;
    }
    applyResult(res);
    if (!res.error){
      setLiveStatus('live', 'ok');
      state.hasEverSucceeded = true;
      playFromStart();
    } else {
      setLiveStatus('fix the error below', 'err');
    }
  }

  // Manual Run / Restart: always applies immediately and plays from the top, loudly
  // showing errors if the code is actually broken (not just mid-keystroke).
  function run(customCallLine){
    try { _runInner(customCallLine); }
    catch (e){
      console.error(e);
      showError({ type: 'InternalError', message: (e && e.message) || String(e) });
    }
  }
  function _runInner(customCallLine){
    let src = sourceEdit.value;
    if (customCallLine && customCallLine.trim()){
      src += '\nprint(' + customCallLine.trim() + ')\n';
    }
    const res = E.runPython(src, { maxSteps: 8000, maxMs: 6000, maxDepth: 200 });
    applyResult(res);
    if (!res.error) state.hasEverSucceeded = true;
    setLiveStatus(res.error ? 'fix the error below' : 'live', res.error ? 'err' : 'ok');
    playFromStart();
  }

  function applyResult(res){
    state.result = res;
    state.roles = res.steps.length ? E.computeRoles(res.steps) : new Map();

    if (res.error) showError(res.error); else hideError();
    entryBar.style.display = res.entryNote ? 'block' : 'none';
    if (res.entryNote) entryNote.textContent = 'Auto-generated call (no driver code found): ' + res.entryNote;

    renderTraceList();
  }

  function positionErrMarkerOnly(err){
    if (err && err.line !== null && err.line !== undefined){
      errLineMarker._line = err.line;
      positionHighlight(errLineMarker, err.line, 'err');
    }
  }

  function showError(err){
    errorBanner.classList.add('show');
    errorBanner.innerHTML = `<span class="et">${escapeHtml(err.type)}</span>${escapeHtml(err.message)}` +
      (err.line !== null && err.line !== undefined ? ` <span style="color:var(--text-dim)">(line ${err.line+1})</span>` : '');
    if (err.line !== null && err.line !== undefined){
      errLineMarker._line = err.line;
      positionHighlight(errLineMarker, err.line, 'err');
    } else {
      errLineMarker.style.display = 'none';
    }
  }
  function hideError(){
    errorBanner.classList.remove('show');
    errorBanner.innerHTML = '';
    errLineMarker.style.display = 'none';
  }

  const KIND_LABELS = {
    ASSIGN:'ASSIGN', IF_CHECK:'IF', LOOP_START:'LOOP', LOOP_CHECK:'LOOP CHECK', LOOP_ITER:'ITERATE',
    PUSH:'PUSH', POP:'POP', SORT:'SORT', CALL:'CALL', RETURN:'RETURN', BREAK:'BREAK', CONTINUE:'CONTINUE', EXPR:'EXPR'
  };

  function renderTraceList(){
    traceScroll.innerHTML = '';
    const steps = state.result.steps;
    steps.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'trace-card';
      card.id = 'trace-' + i;
      card.title = 'Click to jump the animation here';
      card.onclick = () => { clearInterval(state.playTimer); state.stepIndex = i; renderStep(); };
      const kindEl = document.createElement('span');
      kindEl.className = 'trace-kind k-' + s.kind;
      kindEl.textContent = KIND_LABELS[s.kind] || s.kind;
      const lineEl = document.createElement('span');
      lineEl.className = 'trace-line-no';
      lineEl.textContent = 'L' + (s.line + 1);
      const desc = document.createElement('div');
      desc.className = 'trace-desc';
      desc.textContent = s.desc;
      card.appendChild(kindEl);
      card.appendChild(lineEl);
      card.appendChild(desc);
      traceScroll.appendChild(card);
    });
  }

  function renderStep(){
    const steps = state.result.steps;
    liveProgress.textContent = steps.length ? `${state.stepIndex+1} / ${steps.length}` : '';
    if (!steps.length){
      vizScroll.innerHTML = '<div class="ds-empty">No execution steps to show.</div>';
      narration.innerHTML = state.result.error ? 'Fix the error to see a visualization.' : 'No output.';
      outputConsole.innerHTML = '';
      stepMeta.textContent = '';
      clearHighlights();
      return;
    }
    const i = Math.max(0, Math.min(state.stepIndex, steps.length - 1));
    const step = steps[i];
    stepMeta.textContent = `L${step.line+1} · ${step.kind}`;

    lineHighlight._line = step.line;
    positionHighlight(lineHighlight, step.line, 'active');
    errLineMarker.style.display = 'none';

    document.querySelectorAll('.trace-card.current').forEach(n => n.classList.remove('current'));
    const tc = document.getElementById('trace-' + i);
    if (tc){ tc.classList.add('current'); tc.scrollIntoView({ block:'nearest' }); }

    narration.innerHTML = `<span class="nk">${escapeHtml(KIND_LABELS[step.kind]||step.kind)}</span> &nbsp; ${escapeHtml(step.desc)}`;

    outputConsole.innerHTML = '';
    step.output.forEach(line => {
      const d = document.createElement('div');
      d.className = 'oline';
      d.textContent = line;
      outputConsole.appendChild(d);
    });

    renderViz(step);
  }

  function renderViz(step){
    const prevRects = R.flipCapture(vizScroll);
    vizScroll.innerHTML = '';

    const vv = E.pickVizVars(step, state.roles);
    const heap = step.world.heap;
    const ptrCandidates = E.objectPointerList(step);

    R.renderCallStack(vizScroll, step.world.frames);

    const containerVars = vv.filter(v => v.kind !== 'scalar');
    const scalarVars = vv.filter(v => v.kind === 'scalar');

    containerVars.forEach(v => {
      const label = v.name;
      switch (v.kind){
        case 'array': {
          const pointers = R.collectPointers(step.world.frames, v.heapObj.id).filter(p => p.name !== v.name);
          R.renderArray(vizScroll, v.heapObj, { heap, pointers, colorCache, label });
          break;
        }
        case 'stack': R.renderStack(vizScroll, v.heapObj, { heap, label }); break;
        case 'queue': R.renderQueue(vizScroll, v.heapObj, { heap, label }); break;
        case 'grid': R.renderGrid(vizScroll, v.heapObj, { heap, label }); break;
        case 'map': R.renderMap(vizScroll, v.heapObj, { heap, label }); break;
        case 'set': R.renderSet(vizScroll, v.heapObj, { heap, label }); break;
        case 'tuple': R.renderArray(vizScroll, v.heapObj, { heap, pointers: [], colorCache, label: label + ' (tuple)' }); break;
        case 'linked_list': R.renderLinkedList(vizScroll, v.ref, heap, { label, pointers: ptrCandidates }); break;
        case 'tree': R.renderTree(vizScroll, v.ref, heap, { label }); break;
        case 'graph': R.renderGraph(vizScroll, v.ref, heap, { label }); break;
        case 'object': {
          const wrap = R.el('div', 'ds-block ds-map', vizScroll);
          R.el('div', 'ds-label', wrap).textContent = label + '  (' + v.heapObj.className + ')';
          const row = R.el('div', 'chip-row', wrap);
          for (const k in v.heapObj.attrs){
            const val = v.heapObj.attrs[k];
            const chip = R.el('div', 'map-chip', row);
            R.el('span','chip-key',chip).textContent = k;
            R.el('span','chip-sep',chip).textContent = ':';
            R.el('span','chip-val',chip).textContent = R.isRef(val) ? '(object)' : R.fmtScalar(val);
          }
          break;
        }
      }
    });

    if (scalarVars.length) R.renderScalars(vizScroll, scalarVars.map(v => [v.name, v.value]));
    if (!containerVars.length && !scalarVars.length){
      vizScroll.innerHTML += '<div class="ds-empty">No local variables yet.</div>';
    }

    R.flipApply(vizScroll, prevRects);
  }

  // Fully dynamic playback: no play/pause/scrub controls — every successful run
  // (typing or Run/Restart) always animates automatically from the first step to
  // the last, then just holds on the final frame.
  function playFromStart(){
    clearInterval(state.playTimer);
    state.stepIndex = 0;
    renderStep();
    if (!state.result || state.result.steps.length < 2) return;
    state.playTimer = setInterval(() => {
      if (state.stepIndex >= state.result.steps.length - 1){ clearInterval(state.playTimer); return; }
      state.stepIndex++;
      renderStep();
    }, state.speedMs);
  }

  runBtn.addEventListener('click', () => run());
  restartBtn.addEventListener('click', () => { if (state.result) playFromStart(); });
  entryInput.addEventListener('keydown', e => { if (e.key === 'Enter') run(entryInput.value); });

  liveToggle.addEventListener('change', () => {
    state.liveMode = liveToggle.checked;
    setLiveStatus(state.liveMode ? 'live' : 'manual — press Run', state.liveMode ? 'ok' : '');
  });

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.speedMs = parseInt(btn.dataset.speed, 10);
      if (state.playTimer){ playFromStart(); } // restart the interval at the new speed, from the top
    });
  });

  document.querySelectorAll('.lang-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.lang-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.lang = chip.dataset.lang;
      const notice = document.getElementById('langNotice');
      if (state.lang !== 'python'){
        notice.style.display = 'block';
        notice.textContent = `${chip.textContent.trim()} support uses the older pattern-based engine and can misread complex control flow. Python now runs on a full real interpreter — for guaranteed-correct execution and live typing, use Python.`;
      } else {
        notice.style.display = 'none';
      }
    });
  });

  // initial run with the bundled example, plays automatically
  try { run(); } catch(e){ console.error(e); }

  window.__vizState = state;
  window.__vizRun = run;

  window.addEventListener('error', (ev) => {
    if (errorBanner){
      errorBanner.classList.add('show');
      errorBanner.innerHTML = '<span class="et">Script Error</span>' + escapeHtml(ev.message || 'Unknown error') +
        ' — open DevTools (F12) console for the full trace.';
    }
  });
})();
