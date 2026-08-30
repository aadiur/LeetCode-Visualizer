"use strict";
/* ===================== ENGINE ORCHESTRATOR ===================== */
const { tokenize, LexError } = typeof require !== 'undefined' ? require('./lexer.js') : window.PyLexer;
const { parse, ParseError } = typeof require !== 'undefined' ? require('./parser.js') : window.PyParser;
const RT = typeof require !== 'undefined' ? require('./runtime.js') : window.PyRuntime;
const IN = typeof require !== 'undefined' ? require('./interpreter.js') : window.PyInterp;
const DET = typeof require !== 'undefined' ? require('./detector.js') : window.PyDetector;

const { PyList, PyDict, PySet, PyObject, PyTuple, PyClass, PyError, resetIdCounter } = RT;
const { Interpreter, pyStr, shortVal, computeOutputLines } = IN;
const { UsageTracker, classifyValue, objShape } = DET;

// ---------- world snapshot ----------
function renderValue(v, heapOut, visiting){
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'){
    return v === undefined ? null : v;
  }
  if (v instanceof PyList || v instanceof PyDict || v instanceof PySet || v instanceof PyObject || v instanceof PyTuple){
    populateHeap(v, heapOut, visiting);
    return { __ref: v.id };
  }
  if (v instanceof RT.PyFunction) return { __func: v.name };
  if (v instanceof PyClass) return { __class: v.name };
  return null;
}

function populateHeap(v, heapOut, visiting){
  if (heapOut[v.id]) return; // already captured this step
  if (visiting.has(v.id)) return; // cycle guard
  visiting.add(v.id);
  if (v instanceof PyList){
    heapOut[v.id] = {
      type: 'list', id: v.id,
      items: v.items.map(it => ({ id: it.id, value: renderValue(it.value, heapOut, visiting) }))
    };
  } else if (v instanceof PyDict){
    heapOut[v.id] = {
      type: 'dict', id: v.id, isDefaultdict: !!v.defaultFactory,
      entries: v.entries.map(e => ({ id: e.id, key: renderValue(e.key, heapOut, visiting), value: renderValue(e.value, heapOut, visiting) }))
    };
  } else if (v instanceof PySet){
    heapOut[v.id] = {
      type: 'set', id: v.id,
      items: v.items.map(it => ({ id: it.id, value: renderValue(it.value, heapOut, visiting) }))
    };
  } else if (v instanceof PyTuple){
    heapOut[v.id] = {
      type: 'tuple', id: v.id,
      values: v.values.map(x => renderValue(x, heapOut, visiting))
    };
  } else if (v instanceof PyObject){
    const attrs = {};
    for (const [k, val] of v.attrs) attrs[k] = renderValue(val, heapOut, visiting);
    heapOut[v.id] = {
      type: 'object', id: v.id, className: v.klass.name, shape: objShape(v), attrs
    };
  }
  visiting.delete(v.id);
}

function snapshotWorld(interp, env){
  const heap = {};
  const visiting = new Set();
  const frames = [];
  // globals
  const globalVars = {};
  for (const [k, v] of interp.globals.vars){
    if (v instanceof RT.PyFunction || v instanceof PyClass) continue; // skip defs in var display
    globalVars[k] = renderValue(v, heap, visiting);
  }
  frames.push({ name: '<module>', line: null, vars: globalVars, isGlobal: true });
  for (const f of interp.callStack){
    const vars = {};
    if (f.env){
      for (const [k, v] of f.env.vars){
        if (v instanceof RT.PyFunction || v instanceof PyClass) continue;
        vars[k] = renderValue(v, heap, visiting);
      }
    }
    frames.push({ name: f.name, line: f.line, vars });
  }
  return { heap, frames };
}

// ---------- entry-point synthesis ----------
function looksLikeInvocationHappened(interp){
  return interp.steps.some(s => s.kind === 'CALL');
}

function findEntry(interp){
  // Prefer a Solution class's primary method; else last top-level function defined.
  let solClass = null;
  for (const [name, v] of interp.globals.vars){
    if (v instanceof PyClass && name === 'Solution') solClass = v;
  }
  if (solClass){
    let best = null, bestLen = -1;
    for (const [mname, fn] of solClass.methods){
      if (mname === '__init__') continue;
      const len = fn.body.length;
      if (len > bestLen){ bestLen = len; best = { kind:'method', klass: solClass, fn, name: mname }; }
    }
    if (best) return best;
  }
  // any class with a non-init method (rare pattern, e.g. MinStack-style problems)
  let lastFn = null;
  for (const [name, v] of interp.globals.vars){
    if (v instanceof RT.PyFunction) lastFn = { kind:'function', fn: v, name };
  }
  if (lastFn) return lastFn;
  for (const [name, v] of interp.globals.vars){
    if (v instanceof PyClass){
      for (const [mname, fn] of v.methods){
        if (mname === '__init__') continue;
        return { kind:'method', klass: v, fn, name: mname };
      }
    }
  }
  return null;
}

function findClassShaped(interp, predicate){
  for (const [name, v] of interp.globals.vars){
    if (v instanceof PyClass){
      const init = v.methods.get('__init__');
      if (!init) continue;
      const assigned = new Set();
      (function scan(stmts){
        for (const s of stmts){
          if (s.type === 'Assign' && s.targets[0] && s.targets[0].type==='Attribute' && s.targets[0].obj.type==='Name' && s.targets[0].obj.id==='self'){
            assigned.add(s.targets[0].attr);
          }
        }
      })(init.body);
      if (predicate(assigned)) return v;
    }
  }
  return null;
}

function synthArgs(interp, params){
  const llClass = findClassShaped(interp, a => a.has('next'));
  const treeClass = findClassShaped(interp, a => a.has('left') && a.has('right'));
  const graphClass = findClassShaped(interp, a => a.has('neighbors'));
  const args = [];
  const notes = [];
  let numsVal = null;
  const names = params.filter(p=>p.name!=='self').map(p=>p.name.toLowerCase());
  const hasS2 = names.filter(n=>n==='s'||n==='word'||n.includes('str')).length;
  let stringCounter = 0;

  function buildLinkedList(vals){
    if (!llClass) return new PyList(vals); // fallback
    const init = llClass.methods.get('__init__');
    let dummy = new PyObject(llClass);
    // manual init: val=0, next=None default, then set .val/.next by field name matching common convention
    dummy.attrs.set('val', 0); dummy.attrs.set('next', null);
    let cur = dummy;
    for (const v of vals){
      const node = new PyObject(llClass);
      node.attrs.set('val', v); node.attrs.set('next', null);
      cur.attrs.set('next', node);
      cur = node;
    }
    return dummy.attrs.get('next');
  }
  function buildTree(vals){
    if (!treeClass) return null;
    const nodes = vals.map(v => v===null? null : (()=>{ const o=new PyObject(treeClass); o.attrs.set('val',v); o.attrs.set('left',null); o.attrs.set('right',null); return o; })());
    for (let i=0;i<nodes.length;i++){
      if (!nodes[i]) continue;
      const li = 2*i+1, ri = 2*i+2;
      if (li < nodes.length && nodes[li]) nodes[i].attrs.set('left', nodes[li]);
      if (ri < nodes.length && nodes[ri]) nodes[i].attrs.set('right', nodes[ri]);
    }
    return nodes[0] || null;
  }
  function buildGraphTriangle(){
    if (!graphClass) return null;
    const a = new PyObject(graphClass); a.attrs.set('val',1); a.attrs.set('neighbors', new PyList([]));
    const b = new PyObject(graphClass); b.attrs.set('val',2); b.attrs.set('neighbors', new PyList([]));
    const c = new PyObject(graphClass); c.attrs.set('val',3); c.attrs.set('neighbors', new PyList([]));
    a.attrs.set('neighbors', new PyList([b,c]));
    b.attrs.set('neighbors', new PyList([a,c]));
    c.attrs.set('neighbors', new PyList([a,b]));
    return a;
  }

  for (const p of params){
    if (p.name === 'self') continue;
    const n = p.name.toLowerCase();
    const ann = (p.annotation||'').toLowerCase();
    let v;
    if (n === 'head' || n==='l1' || n==='list1'){ v = buildLinkedList(n==='l1'||n==='list1' ? [1,2,4] : [1,2,3,4,5]); notes.push(`${p.name} = list(${n==='l1'||n==='list1'?'[1,2,4]':'[1,2,3,4,5]'})`); }
    else if (n === 'l2' || n === 'list2'){ v = buildLinkedList([1,3,4]); notes.push(`${p.name} = list([1,3,4])`); }
    else if (ann.includes('listnode') || (llClass && n.includes('head'))){ v = buildLinkedList([1,2,3]); notes.push(`${p.name} = list([1,2,3])`); }
    else if (n === 'root' || n === 'root1'){ v = buildTree([3,9,20,null,null,15,7]); notes.push(`${p.name} = tree([3,9,20,null,null,15,7])`); }
    else if (n === 'root2'){ v = buildTree([3,9,20,null,null,15,7]); notes.push(`${p.name} = tree(...)`); }
    else if (ann.includes('treenode')){ v = buildTree([1,2,3]); notes.push(`${p.name} = tree([1,2,3])`); }
    else if (n === 'node' && graphClass){ v = buildGraphTriangle(); notes.push(`${p.name} = graph(triangle)`); }
    else if ((n === 'matrix' || n === 'board') && !ann.includes('str')){ v = new PyList([new PyList([1,2,3]), new PyList([4,5,6]), new PyList([7,8,9])]); notes.push(`${p.name} = [[1,2,3],[4,5,6],[7,8,9]]`); }
    else if (n === 'grid'){ v = new PyList(['110','010','001'].map(r => new PyList(r.split('')))); notes.push(`${p.name} = grid(1=land,0=water)`); }
    else if (n === 'intervals'){ v = new PyList([[1,3],[2,6],[8,10],[15,18]].map(pr=>new PyList(pr))); notes.push(`${p.name} = [[1,3],[2,6],[8,10],[15,18]]`); }
    else if (n === 'edges'){ v = new PyList([[0,1],[1,2],[2,0]].map(pr=>new PyList(pr))); notes.push(`${p.name} = [[0,1],[1,2],[2,0]]`); }
    else if (n === 'piles'){ v = new PyList([3,6,7,11]); notes.push(`${p.name} = [3,6,7,11]`); }
    else if (n === 'h' && names.includes('piles')){ v = 8; notes.push(`${p.name} = 8`); }
    else if (n === 'nums' || n === 'arr' || n === 'array' || n === 'a' && ann.includes('list')){
      v = new PyList([4,2,7,1,9,5,3]); numsVal = v; notes.push(`${p.name} = [4,2,7,1,9,5,3]`);
    }
    else if (n === 'target' && numsVal){
      const a = numsVal.values; v = a[0]+a[1]; notes.push(`${p.name} = ${v}  (${a[0]}+${a[1]}, guaranteed solvable)`);
    }
    else if (n === 'k'){ v = 2; notes.push(`${p.name} = 2`); }
    else if (n === 'n'){ v = 5; notes.push(`${p.name} = 5`); }
    else if (n === 'target'){ v = 9; notes.push(`${p.name} = 9`); }
    else if (n === 'x'){ v = 10; notes.push(`${p.name} = 10`); }
    else if (n === 's' || n === 'string'){
      stringCounter++;
      v = "()[]{}"; notes.push(`${p.name} = "()[]{}"`);
    }
    else if (n === 'word1'){ v = 'horse'; notes.push(`${p.name} = "horse"`); }
    else if (n === 'word2'){ v = 'ros'; notes.push(`${p.name} = "ros"`); }
    else if (n.includes('str') || ann.includes('str')){ v = 'abcabcbb'; notes.push(`${p.name} = "abcabcbb"`); }
    else if (ann.includes('list[list') || ann.includes('list[list[int]]')){ v = new PyList([new PyList([1,2]), new PyList([3,4])]); notes.push(`${p.name} = [[1,2],[3,4]]`); }
    else if (ann.includes('list')){ v = new PyList([4,2,7,1,9,5,3]); notes.push(`${p.name} = [4,2,7,1,9,5,3]`); }
    else if (ann.includes('bool')){ v = true; notes.push(`${p.name} = True`); }
    else if (ann.includes('float')){ v = 1.0; notes.push(`${p.name} = 1.0`); }
    else if (p.default !== null && p.default !== undefined){ v = null; /* handled by bindParams default */ continue; }
    else { v = 5; notes.push(`${p.name} = 5  (generic default — edit input to customize)`); }
    args.push(v);
  }
  return { args, notes };
}

// ---------- role computation across whole run ----------
function computeRoles(steps){
  const usage = new UsageTracker();
  const names = new Map(); // heapId -> Set(varNames)
  for (const step of steps){
    usage.onStep(step);
    if (!step.world) continue;
    for (const frame of step.world.frames){
      for (const k in frame.vars){
        const v = frame.vars[k];
        if (v && typeof v === 'object' && '__ref' in v){
          if (!names.has(v.__ref)) names.set(v.__ref, new Set());
          names.get(v.__ref).add(k);
        }
      }
    }
  }
  const roles = new Map();
  for (const [id, stats] of usage.stats){
    const nameSet = names.get(id) || new Set();
    const nameHint = [...nameSet][0] || '';
    roles.set(id, { stats, names: nameSet, nameHint });
  }
  return roles;
}

function decideListRole(heapListObj, roleInfo, heap){
  // grid check first: every item is a ref to a list
  const isGrid = heapListObj.items.length > 0 && heapListObj.items.every(it =>
    it.value && typeof it.value === 'object' && '__ref' in it.value && heap[it.value.__ref] && heap[it.value.__ref].type === 'list'
  );
  if (isGrid) return 'grid';
  const s = roleInfo ? roleInfo.stats : null;
  const nameHint = (roleInfo ? roleInfo.nameHint : '').toLowerCase();
  if (s){
    if (s.pushFront > 0 || (s.appendEnd>0 && s.popFront>0)) return 'queue';
    if ((s.appendEnd>0 || s.popEnd>0) && s.indexSet===0){
      if (nameHint.includes('queue') || nameHint==='q') return 'queue';
      return 'stack';
    }
  }
  if (nameHint.includes('stack') || nameHint==='stk') return 'stack';
  if (nameHint.includes('queue') || nameHint==='q' || nameHint.includes('deque')) return 'queue';
  return 'array';
}

// Decide which frame variables to surface in the main visualization panel for a given step.
// Merge across the whole active frame stack (globals -> outer calls -> innermost call) so a
// container built in an outer frame stays visible even while execution has descended into a
// nested/recursive call; inner frames win on name collisions.
function pickVizVars(step, roles){
  const heap = step.world.heap;
  const frames = step.world.frames;
  const byName = new Map();
  for (const frame of frames){
    for (const k in frame.vars){
      if (k === 'self'){
        const v = frame.vars[k];
        if (v && v.__ref && heap[v.__ref] && heap[v.__ref].type === 'object'){
          for (const ak in heap[v.__ref].attrs) byName.set('self.'+ak, heap[v.__ref].attrs[ak]);
        }
        continue;
      }
      byName.set(k, frame.vars[k]);
    }
  }
  const display = [...byName.entries()].map(([name, value]) => ({ name, value }));
  // classify each
  return display.map(d => {
    const v = d.value;
    if (v && typeof v === 'object' && '__ref' in v){
      const obj = heap[v.__ref];
      if (!obj) return { ...d, kind: 'scalar', display: null };
      if (obj.type === 'list') return { ...d, kind: decideListRole(obj, roles.get(obj.id), heap), heapObj: obj };
      if (obj.type === 'dict') return { ...d, kind: 'map', heapObj: obj };
      if (obj.type === 'set') return { ...d, kind: 'set', heapObj: obj };
      if (obj.type === 'tuple') return { ...d, kind: 'tuple', heapObj: obj };
      if (obj.type === 'object'){
        if (obj.shape === 'linked_list') return { ...d, kind: 'linked_list', ref: v };
        if (obj.shape === 'tree') return { ...d, kind: 'tree', ref: v };
        if (obj.shape === 'graph') return { ...d, kind: 'graph', ref: v };
        return { ...d, kind: 'object', heapObj: obj };
      }
    }
    return { ...d, kind: 'scalar' };
  });
}


// Cross-frame list of {name, refId} for every variable currently bound to a heap OBJECT
// (used by the linked-list / tree / graph renderers to place pointer flags like head/prev/curr).
function objectPointerList(step){
  const heap = step.world.heap;
  const out = [];
  for (const frame of step.world.frames){
    for (const k in frame.vars){
      const v = frame.vars[k];
      if (v && typeof v === 'object' && '__ref' in v){
        const obj = heap[v.__ref];
        if (obj && obj.type === 'object') out.push({ name: k, refId: obj.id });
      }
      if (k === 'self' && v && v.__ref && heap[v.__ref]){
        for (const ak in heap[v.__ref].attrs){
          const av = heap[v.__ref].attrs[ak];
          if (av && typeof av === 'object' && '__ref' in av){
            const obj = heap[av.__ref];
            if (obj && obj.type === 'object') out.push({ name: 'self.'+ak, refId: obj.id });
          }
        }
      }
    }
  }
  return out;
}

function classifyError(e, source){
  if (e instanceof LexError || e instanceof ParseError){
    return { type: 'SyntaxError', message: e.message, line: e.line };
  }
  if (e instanceof PyError){
    return { type: e.pyType || 'RuntimeError', message: e.message, line: e.__line };
  }
  if (e && e.name === 'TimeoutErr'){
    return { type: 'Timeout', message: e.message, line: null };
  }
  if (e instanceof RangeError && /call stack/i.test(e.message)){
    return { type: 'RecursionError', message: 'Maximum recursion depth exceeded (interpreter stack).', line: null };
  }
  return { type: 'InternalError', message: (e && e.message) || String(e), line: null };
}

// ---------- main run ----------
function runPython(source, opts={}){
  resetIdCounter();
  const result = { ok: false, steps: [], output: [], error: null, entryNote: null, source };
  let interp;
  try {
    const ast = parse(source);
    const usage = new UsageTracker();
    interp = new Interpreter({
      maxSteps: opts.maxSteps || 6000,
      maxMs: opts.maxMs || 6000,
      maxDepth: opts.maxDepth || 200,
      onStep: (rec) => {
        usage.onStep(rec);
        try {
          const activeEnv = interp._activeEnvForSnapshot || interp.globals;
          rec.world = snapshotWorld(interp, activeEnv);
        } catch (snapErr){ rec.world = { heap:{}, frames:[] }; }
      }
    });
    // track active env for snapshot purposes: patch execStmt/callFunction to set it
    const origExecStmt = interp.execStmt.bind(interp);
    interp.execStmt = function*(stmt, env){ interp._activeEnvForSnapshot = env; yield* origExecStmt(stmt, env); };

    const gen = interp.execBody(ast.body, interp.globals);
    let r = gen.next();
    while (!r.done) r = gen.next();

    if (!looksLikeInvocationHappened(interp)){
      const entry = findEntry(interp);
      if (entry){
        const { args, notes } = synthArgs(interp, entry.fn.params);
        result.entryNote = (entry.kind === 'method' ? `Solution().${entry.name}(...)` : `${entry.name}(...)`) + '  —  ' + notes.join(', ');
        let callArgs = args;
        let displayName = entry.name;
        if (entry.kind === 'method'){
          const inst = new PyObject(entry.klass);
          const init = entry.klass.methods.get('__init__');
          if (init){
            const g2 = interp.callFunction(init, [inst], {}, 0, entry.klass.name+'.__init__');
            let rr = g2.next(); while(!rr.done) rr = g2.next();
          }
          callArgs = [inst, ...args];
          displayName = `Solution.${entry.name}`;
        }
        const g3 = interp.callFunction(entry.fn, callArgs, {}, 0, displayName);
        let rr = g3.next();
        while (!rr.done) rr = g3.next();
        const retVal = rr.value;
        interp._outBuf += pyStr(retVal) + '\n';
        interp.output = computeOutputLines(interp._outBuf);
        interp.emit('EXPR', entry.fn.body.length ? entry.fn.body[entry.fn.body.length-1].line : 0, `→ result: ${shortVal(retVal)}`);
      }
    }

    result.ok = true;
    result.steps = interp.steps;
    result.output = interp.output;
  } catch (e){
    result.error = classifyError(e, source);
    if (interp){
      result.steps = interp.steps;
      result.output = interp.output;
      if (result.error.line === null || result.error.line === undefined) result.error.line = interp._lastLine;
    }
  }
  return result;
}

const exportObj = { runPython, snapshotWorld, findEntry, synthArgs, classifyError, UsageTracker, classifyValue, computeRoles, decideListRole, pickVizVars, objectPointerList };
if (typeof module !== 'undefined') module.exports = exportObj;
else window.PyEngine = exportObj;
