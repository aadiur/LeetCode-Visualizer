"use strict";
/* ===================== VISUALIZATION RENDERER ===================== */
(function(root){
  const DET = typeof require !== 'undefined' ? require('./detector.js') : window.PyDetector;

  function el(tag, cls, parent){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgEl(tag, attrs={}){
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function fmtScalar(v){
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === 'string') return v.length ? v : '""';
    return String(v);
  }
  function isRef(v){ return v && typeof v === 'object' && '__ref' in v; }
  function deref(v, heap){ return isRef(v) ? heap[v.__ref] : v; }

  // Generic "what's the display value of this node" heuristic — the class might
  // name its payload field val/value/data/key/item/x/n/anything. Try common
  // names first, then fall back to the first attribute that isn't itself a
  // pointer to another node/container (next/left/right/neighbors/edges/children).
  const LABEL_NAME_PRIORITY = ['val','value','data','key','item','label','x','n','num','elem'];
  const POINTER_ATTR_NAMES = new Set(['next','left','right','neighbors','edges','children','prev']);
  function nodeLabel(attrs, heap){
    for (const name of LABEL_NAME_PRIORITY){
      if (attrs[name] !== undefined) return fmtScalar(deref(attrs[name], heap));
    }
    for (const k in attrs){
      if (POINTER_ATTR_NAMES.has(k)) continue;
      const v = deref(attrs[k], heap);
      if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'){
        return fmtScalar(v);
      }
    }
    return '•';
  }

  // ---------- FLIP animation helper ----------
  // Before re-render, capture bounding boxes of elements keyed by data-flip-key.
  // After re-render, apply inverse transform then animate to identity.
  function flipCapture(container){
    const map = new Map();
    if (!container) return map;
    container.querySelectorAll('[data-flip-key]').forEach(node => {
      map.set(node.getAttribute('data-flip-key'), node.getBoundingClientRect());
    });
    return map;
  }
  function flipApply(container, prevRects){
    if (!container) return;
    container.querySelectorAll('[data-flip-key]').forEach(node => {
      const key = node.getAttribute('data-flip-key');
      const prev = prevRects.get(key);
      if (!prev){
        node.classList.add('flip-enter');
        requestAnimationFrame(() => { node.classList.add('flip-enter-active'); });
        setTimeout(() => node.classList.remove('flip-enter','flip-enter-active'), 380);
        return;
      }
      const cur = node.getBoundingClientRect();
      const dx = prev.left - cur.left, dy = prev.top - cur.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5){
        node.style.transition = 'none';
        node.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          node.style.transition = 'transform 320ms cubic-bezier(.2,.8,.2,1)';
          node.style.transform = '';
        });
      }
    });
  }

  // ---------- pointer detection ----------
  function collectPointers(frames, targetListId){
    // returns [{name, idx}] for int vars across active frames whose value is a valid index into this list
    const out = [];
    for (const frame of frames){
      for (const name in frame.vars){
        const v = frame.vars[name];
        if (typeof v === 'number' && Number.isInteger(v)){
          out.push({ name, idx: v, frame: frame.name });
        }
      }
    }
    return out;
  }
  function pointersForIndex(pointers, idx, n){
    return pointers.filter(p => (p.idx === idx) || (p.idx < 0 && p.idx + n === idx));
  }

  const FLAG_COLORS = ['#6ee7ff','#ff8fd6','#ffd166','#9dff8f','#c9a4ff','#ff9d7a'];
  function colorForName(name, cache){
    if (!cache.map) { cache.map = new Map(); cache.i = 0; }
    if (!cache.map.has(name)) cache.map.set(name, FLAG_COLORS[cache.i++ % FLAG_COLORS.length]);
    return cache.map.get(name);
  }

  // ---------- collapsible block headers ----------
  // Every visualization block (array/graph/tree/call-stack/...) is fully
  // re-rendered from scratch on every animation step (the container's
  // innerHTML gets wiped), so per-block collapsed/expanded state can't live on
  // the DOM node itself — it would reset every step. Instead it lives here, in
  // a module-level Set keyed by a stable id, which survives across re-renders
  // because it's just a JS closure variable, not part of the DOM that gets
  // discarded. This is what lets a user collapse e.g. the call stack once and
  // have it stay collapsed as playback continues.
  const collapsedBlocks = new Set();
  function addHeader(wrap, label, key){
    if (!label) return null;
    const blockKey = key || label;
    const head = el('div', 'ds-head', wrap);
    el('div', 'ds-label', head).textContent = label;
    const chevron = el('span', 'ds-chevron', head);
    chevron.textContent = '\u25BE';
    chevron.setAttribute('aria-hidden', 'true');
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.title = 'Click to collapse or expand';
    if (collapsedBlocks.has(blockKey)) wrap.classList.add('collapsed');
    const toggle = () => {
      if (collapsedBlocks.has(blockKey)) collapsedBlocks.delete(blockKey);
      else collapsedBlocks.add(blockKey);
      wrap.classList.toggle('collapsed');
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault && e.preventDefault(); toggle(); }
    });
    return head;
  }

  // ---------- array / string ----------
  function renderArray(container, list, opts){
    const { heap, pointers, colorCache, label, highlightIdx, compareIdx, mismatchIdx } = opts;
    const wrap = el('div', 'ds-block ds-array', container);
    addHeader(wrap, label);
    const flagsRow = el('div', 'array-flags-row', wrap);
    const cellsRow = el('div', 'array-cells-row', wrap);
    const idxRow = el('div', 'array-idx-row', wrap);
    const n = list.items.length;

    // group pointer flags by cell index
    const byIdx = new Map();
    for (const p of pointers){
      let idx = p.idx; if (idx < 0) idx += n;
      if (idx < 0 || idx >= n) continue;
      if (!byIdx.has(idx)) byIdx.set(idx, []);
      byIdx.get(idx).push(p);
    }
    for (let i = 0; i < n; i++){
      const slot = el('div', 'array-flag-slot', flagsRow);
      const flags = byIdx.get(i) || [];
      for (const f of flags){
        const chip = el('div', 'ptr-flag', slot);
        chip.textContent = f.name;
        chip.style.setProperty('--flag-color', colorForName(f.name, colorCache));
        chip.setAttribute('data-flip-key', 'ptr:'+f.name);
      }
    }
    list.items.forEach((it, i) => {
      const cell = el('div', 'array-cell', cellsRow);
      cell.setAttribute('data-flip-key', 'cell:'+it.id);
      if (i === highlightIdx) cell.classList.add('cell-active');
      if (i === compareIdx) cell.classList.add('cell-compare');
      if (i === mismatchIdx) cell.classList.add('cell-mismatch');
      if (byIdx.has(i)) cell.classList.add('cell-pointed');
      const valEl = el('div', 'cell-val', cell);
      valEl.textContent = fmtScalar(deref(it.value, heap));
      const idxEl = el('div', 'array-idx-cell', idxRow);
      idxEl.textContent = i;
    });
    if (n === 0){ el('div', 'ds-empty', wrap).textContent = '(empty)'; }
    return wrap;
  }

  // ---------- 2D grid ----------
  function renderGrid(container, list, opts){
    const { heap, label, activeCell, visitedCells } = opts;
    const wrap = el('div', 'ds-block ds-grid', container);
    addHeader(wrap, label);
    const visitedKeys = new Set((visitedCells||[]).map(([r,c]) => r+','+c));
    const table = el('div', 'grid-table', wrap);
    list.items.forEach((rowRefItem, ri) => {
      const rowVal = deref(rowRefItem.value, heap);
      const rowEl = el('div', 'grid-row', table);
      if (rowVal && rowVal.items){
        rowVal.items.forEach((cellItem, ci) => {
          const cell = el('div', 'grid-cell', rowEl);
          cell.setAttribute('data-flip-key', 'gcell:'+cellItem.id);
          if (visitedKeys.has(ri+','+ci)) cell.classList.add('cell-visited');
          if (activeCell && activeCell[0]===ri && activeCell[1]===ci) cell.classList.add('cell-active');
          cell.textContent = fmtScalar(deref(cellItem.value, heap));
        });
      }
    });
    return wrap;
  }

  // ---------- stack ----------
  function renderStack(container, list, opts){
    const { heap, label } = opts;
    const wrap = el('div', 'ds-block ds-stack', container);
    addHeader(wrap, label);
    const body = el('div', 'stack-body', wrap);
    if (list.items.length === 0){ el('div', 'ds-empty', body).textContent = '(empty)'; return wrap; }
    const top = el('div', 'stack-top-flag', body);
    top.innerHTML = '<span>TOP</span><div class="stack-top-arrow"></div>';
    const col = el('div', 'stack-col', body);
    for (let i = list.items.length - 1; i >= 0; i--){
      const it = list.items[i];
      const cell = el('div', 'stack-cell', col);
      cell.setAttribute('data-flip-key', 'cell:'+it.id);
      if (i === list.items.length - 1) cell.classList.add('cell-active');
      cell.textContent = fmtScalar(deref(it.value, heap));
    }
    const base = el('div', 'stack-base', body);
    return wrap;
  }

  // ---------- queue ----------
  function renderQueue(container, list, opts){
    const { heap, label } = opts;
    const wrap = el('div', 'ds-block ds-queue', container);
    addHeader(wrap, label);
    const body = el('div', 'queue-body', wrap);
    el('div', 'queue-flag front', body).textContent = 'FRONT';
    const row = el('div', 'queue-row', body);
    list.items.forEach((it, i) => {
      const cell = el('div', 'array-cell', row);
      cell.setAttribute('data-flip-key', 'cell:'+it.id);
      if (i === 0) cell.classList.add('cell-active');
      cell.textContent = fmtScalar(deref(it.value, heap));
    });
    el('div', 'queue-flag back', body).textContent = 'BACK';
    if (list.items.length === 0) el('div', 'ds-empty', body).textContent = '(empty)';
    return wrap;
  }

  // ---------- map / set ----------
  function renderMap(container, dict, opts){
    const { heap, label } = opts;
    const wrap = el('div', 'ds-block ds-map', container);
    addHeader(wrap, label && (label + (dict.isDefaultdict ? ' (defaultdict)' : '')), label);
    const body = el('div', 'chip-row', wrap);
    dict.entries.forEach(e => {
      const chip = el('div', 'map-chip', body);
      chip.setAttribute('data-flip-key', 'kv:'+e.id);
      const k = el('span', 'chip-key', chip); k.textContent = fmtScalar(deref(e.key, heap));
      el('span', 'chip-sep', chip).textContent = ':';
      const v = el('span', 'chip-val', chip); v.textContent = fmtScalar(deref(e.value, heap));
    });
    if (dict.entries.length === 0) el('div', 'ds-empty', body).textContent = '(empty)';
    return wrap;
  }
  function renderSet(container, set, opts){
    const { heap, label } = opts;
    const wrap = el('div', 'ds-block ds-set', container);
    addHeader(wrap, label);
    const body = el('div', 'chip-row', wrap);
    set.items.forEach(it => {
      const chip = el('div', 'set-chip', body);
      chip.setAttribute('data-flip-key', 'sv:'+it.id);
      chip.textContent = fmtScalar(deref(it.value, heap));
    });
    if (set.items.length === 0) el('div', 'ds-empty', body).textContent = '(empty)';
    return wrap;
  }

  // ---------- linked list (SVG chain) ----------
  function renderLinkedList(container, headRef, heap, opts){
    const { label, pointers } = opts;
    const wrap = el('div', 'ds-block ds-linkedlist', container);
    addHeader(wrap, label);
    const nodes = [];
    const seen = new Map();
    let cur = headRef;
    let cycleTo = -1;
    while (cur && nodes.length < 60){
      const obj = deref(cur, heap);
      if (!obj || obj.type !== 'object') break;
      if (seen.has(obj.id)){ cycleTo = seen.get(obj.id); break; }
      seen.set(obj.id, nodes.length);
      nodes.push(obj);
      cur = obj.attrs.next;
    }
    if (nodes.length === 0){ el('div', 'ds-empty', wrap).textContent = 'None'; return wrap; }
    const W = 78, H = 52, GAP = 46, PAD = 30, ROWH = 96;
    const svgW = PAD*2 + nodes.length*(W+GAP);
    const svg = svgEl('svg', { viewBox: `0 0 ${svgW} ${ROWH}`, class: 'll-svg', style:`width:${svgW}px;height:${ROWH}px` });
    const defs = svgEl('defs');
    defs.innerHTML = `<marker id="llArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--ll-arrow)"/></marker>`;
    svg.appendChild(defs);
    const g = svgEl('g');
    svg.appendChild(g);
    // pointer flags
    const ptrByNode = new Map();
    for (const p of (pointers||[])){
      const idx = seen.get(p.refId);
      if (idx === undefined) continue;
      if (!ptrByNode.has(idx)) ptrByNode.set(idx, []);
      ptrByNode.get(idx).push(p.name);
    }
    nodes.forEach((node, i) => {
      const x = PAD + i*(W+GAP);
      const y = 34;
      const rect = svgEl('rect', { x, y, width:W, height:H, rx:10, class:'ll-node' });
      g.appendChild(rect);
      const text = svgEl('text', { x: x+W/2, y: y+H/2+6, class:'ll-val', 'text-anchor':'middle' });
      text.textContent = nodeLabel(node.attrs, heap);
      g.appendChild(text);
      if (i < nodes.length - 1 || cycleTo !== -1){
        const x2 = (i < nodes.length-1) ? PAD + (i+1)*(W+GAP) : PAD + cycleTo*(W+GAP) + W/2;
        const y2 = (i < nodes.length-1) ? y+H/2 : y + H + 18;
        const line = svgEl('path', {
          d: (i < nodes.length-1)
            ? `M${x+W},${y+H/2} L${x2-4},${y+H/2}`
            : `M${x+W/2},${y+H} C ${x+W/2},${y+H+30} ${x2},${y2+10} ${x2},${y+H}`,
          class: 'll-edge', 'marker-end':'url(#llArrow)'
        });
        g.appendChild(line);
      } else {
        const nullTxt = svgEl('text', { x: x+W+18, y: y+H/2+5, class:'ll-null' });
        nullTxt.textContent = 'None';
        g.appendChild(nullTxt);
        const line = svgEl('path', { d:`M${x+W},${y+H/2} L${x+W+14},${y+H/2}`, class:'ll-edge', 'marker-end':'url(#llArrow)' });
        g.appendChild(line);
      }
      const flags = ptrByNode.get(i) || [];
      flags.forEach((fname, fi) => {
        const fy = y - 14 - fi*20;
        const flagRect = svgEl('rect', { x:x+W/2-20, y:fy-14, width:40, height:18, rx:5, class:'ll-flag-bg' });
        g.appendChild(flagRect);
        const flagTxt = svgEl('text', { x:x+W/2, y:fy-1, class:'ll-flag-txt', 'text-anchor':'middle' });
        flagTxt.textContent = fname;
        g.appendChild(flagTxt);
        const stem = svgEl('path', { d:`M${x+W/2},${fy+4} L${x+W/2},${y-2}`, class:'ll-flag-stem' });
        g.appendChild(stem);
      });
    });
    wrap.appendChild(svg);
    return wrap;
  }

  // ---------- binary tree (SVG) ----------
  function renderTree(container, rootRef, heap, opts){
    const { label } = opts;
    const wrap = el('div', 'ds-block ds-tree', container);
    addHeader(wrap, label);
    const rootObj = deref(rootRef, heap);
    if (!rootObj || rootObj.type !== 'object'){ el('div','ds-empty',wrap).textContent='None'; return wrap; }
    const nodes = []; const idToIdx = new Map(); let leafX = 0;
    function walk(objRef, depth){
      const obj = deref(objRef, heap);
      if (!obj || obj.type !== 'object' || idToIdx.has(obj.id)) return null;
      const rec = { obj, depth, x:0, leftIdx:null, rightIdx:null };
      const idx = nodes.length;
      nodes.push(rec); idToIdx.set(obj.id, idx);
      const li = walk(obj.attrs.left, depth+1);
      const ri = walk(obj.attrs.right, depth+1);
      rec.leftIdx = li; rec.rightIdx = ri;
      if (li===null && ri===null){ rec.x = leafX; leafX++; }
      else if (li!==null && ri!==null){ rec.x = (nodes[li].x + nodes[ri].x)/2; }
      else if (li!==null){ rec.x = nodes[li].x + 0.5; }
      else { rec.x = nodes[ri].x - 0.5; }
      return idx;
    }
    walk(rootRef, 0);
    const R = 22, XGAP = 64, YGAP = 74, PAD = 40;
    const maxX = Math.max(...nodes.map(n=>n.x));
    const maxDepth = Math.max(...nodes.map(n=>n.depth));
    const svgW = PAD*2 + maxX*XGAP + 2*R;
    const svgH = PAD*2 + maxDepth*YGAP + 2*R;
    const svg = svgEl('svg', { viewBox:`0 0 ${svgW} ${svgH}`, class:'tree-svg', style:`width:${svgW}px;height:${svgH}px` });
    const g = svgEl('g'); svg.appendChild(g);
    function pos(n){ return { x: PAD + n.x*XGAP + R, y: PAD + n.depth*YGAP + R }; }
    nodes.forEach(n => {
      const p = pos(n);
      if (n.leftIdx !== null){ const c = pos(nodes[n.leftIdx]); g.appendChild(svgEl('line', {x1:p.x,y1:p.y,x2:c.x,y2:c.y,class:'tree-edge'})); }
      if (n.rightIdx !== null){ const c = pos(nodes[n.rightIdx]); g.appendChild(svgEl('line', {x1:p.x,y1:p.y,x2:c.x,y2:c.y,class:'tree-edge'})); }
    });
    nodes.forEach(n => {
      const p = pos(n);
      const circle = svgEl('circle', { cx:p.x, cy:p.y, r:R, class:'tree-node' });
      g.appendChild(circle);
      const txt = svgEl('text', { x:p.x, y:p.y+5, class:'tree-val', 'text-anchor':'middle' });
      txt.textContent = nodeLabel(n.obj.attrs, heap);
      g.appendChild(txt);
    });
    wrap.appendChild(svg);
    return wrap;
  }

  // ---------- graph (SVG circular layout) ----------
  function renderGraph(container, startRef, heap, opts){
    const { label } = opts;
    const wrap = el('div', 'ds-block ds-graph', container);
    addHeader(wrap, label);
    const startObj = deref(startRef, heap);
    if (!startObj || startObj.type !== 'object'){ el('div','ds-empty',wrap).textContent='None'; return wrap; }
    const nodes = []; const idToIdx = new Map(); const edges = [];
    const queue = [startObj];
    idToIdx.set(startObj.id, 0);
    nodes.push(startObj);
    let qi = 0;
    while (qi < queue.length && nodes.length < 40){
      const n = queue[qi++];
      const nb = n.attrs.neighbors || n.attrs.edges || n.attrs.children;
      const nbList = deref(nb, heap);
      if (nbList && nbList.type === 'list'){
        for (const it of nbList.items){
          const t = deref(it.value, heap);
          if (!t || t.type !== 'object') continue;
          if (!idToIdx.has(t.id)){ idToIdx.set(t.id, nodes.length); nodes.push(t); queue.push(t); }
          const a = idToIdx.get(n.id), b = idToIdx.get(t.id);
          if (a < b) edges.push([a,b]); // dedupe roughly
        }
      }
    }
    const R = 20, CX = 170, CY = 150, RADIUS = Math.max(90, nodes.length*14);
    const svg = svgEl('svg', { viewBox:`0 0 ${CX*2} ${CY*2}`, class:'graph-svg', style:`width:${CX*2}px;height:${CY*2}px` });
    const g = svgEl('g'); svg.appendChild(g);
    const positions = nodes.map((n,i) => {
      const angle = (2*Math.PI*i)/nodes.length - Math.PI/2;
      return { x: CX + RADIUS*Math.cos(angle), y: CY + RADIUS*Math.sin(angle) };
    });
    const seenEdge = new Set();
    for (const [a,b] of edges){
      const k = a<b?a+'-'+b:b+'-'+a;
      if (seenEdge.has(k)) continue; seenEdge.add(k);
      g.appendChild(svgEl('line', { x1:positions[a].x, y1:positions[a].y, x2:positions[b].x, y2:positions[b].y, class:'graph-edge' }));
    }
    nodes.forEach((n,i) => {
      const p = positions[i];
      g.appendChild(svgEl('circle', { cx:p.x, cy:p.y, r:R, class:'graph-node' }));
      const txt = svgEl('text', { x:p.x, y:p.y+5, class:'graph-val', 'text-anchor':'middle' });
      txt.textContent = nodeLabel(n.attrs, heap);
      g.appendChild(txt);
    });
    wrap.appendChild(svg);
    return wrap;
  }

  // Adjacency-list graph: heapListObj is a PyList of PyLists, e.g.
  // graph = [[1,2], [0,3,4], [0,5], [1], [1,6], [2], [4]]  ->  index i is a
  // vertex, each entry in graph[i] is an edge to that vertex.
  function renderAdjacencyGraph(container, heapListObj, heap, opts){
    const { label, pointers } = opts;
    const wrap = el('div', 'ds-block ds-graph', container);
    addHeader(wrap, label);
    const n = heapListObj.items.length;
    if (n === 0){ el('div','ds-empty',wrap).textContent = '(empty)'; return wrap; }

    const edges = [];
    const seenEdge = new Set();
    heapListObj.items.forEach((it, i) => {
      const inner = deref(it.value, heap);
      if (!inner || inner.type !== 'list') return;
      for (const innerIt of inner.items){
        const v = innerIt.value;
        if (typeof v !== 'number' || v < 0 || v >= n) continue; // ignore anything not a valid vertex id
        const a = i, b = v;
        const k = a < b ? a+'-'+b : b+'-'+a;
        if (seenEdge.has(k) && a !== b) continue;
        seenEdge.add(k);
        edges.push([a, b]);
      }
    });

    const R = 19, CX = 160, CY = 150, RADIUS = Math.max(80, n * 13);
    const svg = svgEl('svg', { viewBox:`0 0 ${CX*2} ${CY*2}`, class:'graph-svg', style:`width:${CX*2}px;height:${CY*2}px` });
    const g = svgEl('g'); svg.appendChild(g);
    const positions = [];
    for (let i = 0; i < n; i++){
      const angle = (2*Math.PI*i)/n - Math.PI/2;
      positions.push({ x: CX + RADIUS*Math.cos(angle), y: CY + RADIUS*Math.sin(angle) });
    }

    const activeIdx = new Set((pointers||[]).map(p => p.idx).filter(i => i>=0 && i<n));
    const activeEdgeKey = (pointers||[]).length >= 2 ? (() => {
      const idxs = pointers.map(p=>p.idx).filter(i=>i>=0&&i<n);
      if (idxs.length < 2) return null;
      const a = idxs[idxs.length-2], b = idxs[idxs.length-1];
      return a<b ? a+'-'+b : b+'-'+a;
    })() : null;

    for (const [a,b] of edges){
      const k = a<b?a+'-'+b:b+'-'+a;
      const isActive = k === activeEdgeKey;
      g.appendChild(svgEl('line', {
        x1:positions[a].x, y1:positions[a].y, x2:positions[b].x, y2:positions[b].y,
        class: 'graph-edge' + (isActive ? ' graph-edge-active' : '')
      }));
    }
    for (let i = 0; i < n; i++){
      const p = positions[i];
      const isActive = activeIdx.has(i);
      g.appendChild(svgEl('circle', { cx:p.x, cy:p.y, r:R, class:'graph-node' + (isActive ? ' graph-node-active' : '') }));
      const txt = svgEl('text', { x:p.x, y:p.y+5, class:'graph-val', 'text-anchor':'middle' });
      txt.textContent = String(i);
      g.appendChild(txt);
    }
    // pointer flags (vertex/neighbour/etc) above the node they currently reference
    const byIdx = new Map();
    for (const ptr of (pointers||[])){
      if (ptr.idx < 0 || ptr.idx >= n) continue;
      if (!byIdx.has(ptr.idx)) byIdx.set(ptr.idx, []);
      byIdx.get(ptr.idx).push(ptr.name);
    }
    byIdx.forEach((names, idx) => {
      const p = positions[idx];
      names.forEach((name, fi) => {
        const fy = p.y - R - 10 - fi*20;
        const w = Math.max(34, name.length*7+12);
        g.appendChild(svgEl('rect', { x:p.x-w/2, y:fy-13, width:w, height:17, rx:5, class:'ll-flag-bg' }));
        const t = svgEl('text', { x:p.x, y:fy-1, class:'ll-flag-txt', 'text-anchor':'middle' });
        t.textContent = name;
        g.appendChild(t);
      });
    });

    wrap.appendChild(svg);
    return wrap;
  }

  // ---------- scalar chips ----------
  function renderScalars(container, entries){
    const wrap = el('div', 'ds-block ds-scalars', container);
    const row = el('div', 'chip-row', wrap);
    entries.forEach(([name, val]) => {
      const chip = el('div', 'scalar-chip', row);
      chip.setAttribute('data-flip-key', 'scalar:'+name);
      const n = el('span', 'scalar-name', chip); n.textContent = name;
      el('span', 'scalar-eq', chip).textContent = '=';
      const v = el('span', 'scalar-val', chip); v.textContent = fmtScalar(val);
      chip.classList.add(typeof val === 'boolean' ? 'bool-'+val : (val===null?'is-none':'is-'+typeof val));
    });
    return wrap;
  }

  // ---------- call stack ----------
  function renderCallStack(container, frames){
    if (frames.length <= 1) return null; // only globals, no active calls
    const wrap = el('div', 'ds-block ds-callstack', container);
    // Fixed key (not the label) — the label's depth number changes every
    // step, but we want collapse state to stay put across those changes.
    addHeader(wrap, `CALL STACK (depth ${frames.length-1})`, 'call-stack');
    const body = el('div', 'callstack-body', wrap);
    for (let i = frames.length - 1; i >= 1; i--){
      const f = frames[i];
      const card = el('div', 'callstack-frame', body);
      if (i === frames.length - 1) card.classList.add('frame-active');
      const head = el('div', 'frame-head', card);
      head.textContent = f.name + (f.line !== null && f.line !== undefined ? `  (line ${f.line+1})` : '');
      const varsRow = el('div', 'frame-vars', card);
      for (const k in f.vars){
        if (k === 'self') continue;
        const v = f.vars[k];
        if (isRef(v)) continue; // containers shown in main viz, keep frame card light
        const chip = el('span', 'frame-var-chip', varsRow);
        chip.textContent = `${k}=${fmtScalar(v)}`;
      }
    }
    return wrap;
  }

  const exportObj = {
    el, svgEl, fmtScalar, isRef, deref, flipCapture, flipApply, collectPointers, pointersForIndex, colorForName,
    addHeader,
    renderArray, renderGrid, renderStack, renderQueue, renderMap, renderSet, renderLinkedList, renderTree, renderGraph,
    renderScalars, renderCallStack, renderAdjacencyGraph
  };
  if (typeof module !== 'undefined') module.exports = exportObj;
  else window.PyRenderer = exportObj;
})(typeof window !== 'undefined' ? window : globalThis);
