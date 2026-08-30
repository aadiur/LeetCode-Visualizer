"use strict";
/* ===================== TREE-WALKING INTERPRETER ===================== */
const RT = typeof require !== 'undefined' ? require('./runtime.js') : window.PyRuntime;
const { nextId, resetIdCounter, PyError, BreakSignal, ContinueSignal, ReturnSignal,
        PyList, PyDict, PySet, PyClass, PyObject, PyFunction, NativeFunction, PyTuple } = RT;

class Env {
  constructor(parent, kind='block'){
    this.vars = new Map();
    this.parent = parent;
    this.kind = kind; // 'module' | 'function' | 'block'
  }
  funcScope(){
    let e = this;
    while (e && e.kind === 'block') e = e.parent;
    return e;
  }
  has(name){
    // full lexical chain: local block scopes -> enclosing function scopes -> module (LEGB, minus builtins)
    let e = this;
    while (e){ if (e.vars.has(name)) return true; e = e.parent; }
    return false;
  }
  get(name){
    let e = this;
    while (e){
      if (e.vars.has(name)) return e.vars.get(name);
      e = e.parent;
    }
    throw new PyError('NameError', `name '${name}' is not defined`);
  }
  setLocal(name, val){ this.vars.set(name, val); }
  // assignment: python default is "create/update in current function-local scope" unless
  // the name was declared `global` (module scope) or `nonlocal` (nearest enclosing function scope).
  set(name, val, declaredGlobals, declaredNonlocals){
    if (declaredGlobals && declaredGlobals.has(name)){
      let m = this; while (m.parent) m = m.parent;
      m.vars.set(name, val); return;
    }
    if (declaredNonlocals && declaredNonlocals.has(name)){
      // find nearest enclosing FUNCTION scope (skip current function) that already has it
      let e = this.funcScope() ? this.funcScope().parent : this.parent;
      while (e){
        if (e.vars.has(name)){ e.vars.set(name, val); return; }
        e = e.parent;
      }
      // not found anywhere - create in nearest enclosing function scope as fallback
      let target = this.funcScope() ? this.funcScope().parent : this.parent;
      (target || this).vars.set(name, val);
      return;
    }
    // local semantics: if this exact function-local scope chain (up to function boundary,
    // inclusive of block scopes within it) already has it, update in place; else create locally
    // in the *current* innermost scope (matches block-scoped var creation used throughout this engine).
    let e = this;
    while (e){
      if (e.vars.has(name)){ e.vars.set(name, val); return; }
      if (e.kind === 'function') break;
      e = e.parent;
    }
    this.vars.set(name, val);
  }
}

function truthy(v){
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (v instanceof PyList) return v.items.length > 0;
  if (v instanceof PyDict) return v.entries.length > 0;
  if (v instanceof PySet) return v.items.length > 0;
  if (v instanceof PyTuple) return v.values.length > 0;
  return true;
}

function pyEquals(a, b){
  if (a === b) return true;
  if (a instanceof PyList && b instanceof PyList){
    if (a.items.length !== b.items.length) return false;
    for (let i=0;i<a.items.length;i++) if (!pyEquals(a.items[i].value, b.items[i].value)) return false;
    return true;
  }
  if (a instanceof PyTuple && b instanceof PyTuple){
    if (a.values.length !== b.values.length) return false;
    for (let i=0;i<a.values.length;i++) if (!pyEquals(a.values[i], b.values[i])) return false;
    return true;
  }
  if (a instanceof PyDict && b instanceof PyDict){
    if (a.entries.length !== b.entries.length) return false;
    for (const e of a.entries){ if (!b.has(e.key) || !pyEquals(b.get(e.key), e.value)) return false; }
    return true;
  }
  if (a instanceof PySet && b instanceof PySet){
    if (a.items.length !== b.items.length) return false;
    for (const it of a.items) if (!b.has(it.value)) return false;
    return true;
  }
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return false;
}

function pyContains(container, item){
  if (typeof container === 'string'){
    if (typeof item !== 'string') throw new PyError('TypeError', "'in <string>' requires string as left operand");
    return container.includes(item);
  }
  if (container instanceof PyList) return container.items.some(it => pyEquals(it.value, item));
  if (container instanceof PyTuple) return container.values.some(v => pyEquals(v, item));
  if (container instanceof PyDict) return container.has(item);
  if (container instanceof PySet) return container.has(item);
  throw new PyError('TypeError', `argument of type is not iterable`);
}

function pyLen(v){
  if (typeof v === 'string') return v.length;
  if (v instanceof PyList) return v.items.length;
  if (v instanceof PyDict) return v.entries.length;
  if (v instanceof PySet) return v.items.length;
  if (v instanceof PyTuple) return v.values.length;
  throw new PyError('TypeError', `object of this type has no len()`);
}

function pyStr(v, insideRepr=false){
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return formatNum(v);
  if (typeof v === 'string') return insideRepr ? ("'" + v.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + "'") : v;
  if (v instanceof PyList) return '[' + v.items.map(it => pyStr(it.value, true)).join(', ') + ']';
  if (v instanceof PyTuple) return '(' + v.values.map(x => pyStr(x, true)).join(', ') + (v.values.length===1?',':'') + ')';
  if (v instanceof PyDict) return '{' + v.entries.map(e => pyStr(e.key, true) + ': ' + pyStr(e.value, true)).join(', ') + '}';
  if (v instanceof PySet) return v.items.length===0 ? 'set()' : '{' + v.items.map(it => pyStr(it.value, true)).join(', ') + '}';
  if (v instanceof PyObject) return `<${v.klass.name} object>`;
  if (v instanceof PyFunction) return `<function ${v.name}>`;
  return String(v);
}
function formatNum(n){
  if (Number.isInteger(n)) return String(n);
  if (!isFinite(n)) return n > 0 ? 'inf' : '-inf';
  return String(n);
}

function pyType(v){
  if (v === null) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'str';
  if (v instanceof PyList) return 'list';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PySet) return 'set';
  if (v instanceof PyTuple) return 'tuple';
  if (v instanceof PyObject) return v.klass.name;
  return 'object';
}

class TimeoutErr extends Error { constructor(msg){ super(msg); this.name='TimeoutErr'; } }

class ModuleMarker { constructor(name, attrs){ this.name=name; this.attrs = attrs; } }
const MATH_MODULE = new ModuleMarker('math', {
  inf: Infinity, pi: Math.PI, e: Math.E,
  floor: new NativeFunction('floor', a=>Math.floor(a[0])),
  ceil: new NativeFunction('ceil', a=>Math.ceil(a[0])),
  sqrt: new NativeFunction('sqrt', a=>Math.sqrt(a[0])),
  pow: new NativeFunction('pow', a=>Math.pow(a[0],a[1])),
  log: new NativeFunction('log', a=> a.length>1? Math.log(a[0])/Math.log(a[1]) : Math.log(a[0])),
  log2: new NativeFunction('log2', a=>Math.log2(a[0])),
  gcd: new NativeFunction('gcd', a=>{ let x=Math.abs(a[0]),y=Math.abs(a[1]); while(y){[x,y]=[y,x%y];} return x; }),
  fabs: new NativeFunction('fabs', a=>Math.abs(a[0])),
});

function computeOutputLines(buf){
  if (buf === '') return [];
  const parts = buf.split('\n');
  if (buf.endsWith('\n')) parts.pop();
  return parts;
}

class Interpreter {
  constructor(opts={}){
    this.globals = new Env(null, 'module');
    this.classes = new Map();
    this.steps = [];
    this.output = [];
    this._outBuf = '';
    this.stepBudget = opts.maxSteps || 4000;
    this.stepCount = 0;
    this.callDepthLimit = opts.maxDepth || 220;
    this.callStack = []; // {name, line}
    this.stepListener = opts.onStep || null;
    this.startTime = Date.now();
    this.timeBudgetMs = opts.maxMs || 4000;
    this.declaredGlobalsPerFunc = new WeakMap();
  }

  checkBudget(line){
    this.stepCount++;
    if (this.stepCount > this.stepBudget){
      throw new TimeoutErr(`Stopped after ${this.stepBudget} steps (possible infinite loop).`);
    }
    if (Date.now() - this.startTime > this.timeBudgetMs){
      throw new TimeoutErr(`Execution exceeded time limit (${this.timeBudgetMs}ms). Possible infinite loop.`);
    }
  }

  emit(kind, line, desc, extra={}){
    const rec = {
      idx: this.steps.length,
      kind, line, desc,
      callStack: this.callStack.map(f => ({ name: f.name, line: f.line })),
      output: this.output.slice(),
      ...extra
    };
    this.steps.push(rec);
    if (this.stepListener) this.stepListener(rec);
    return rec;
  }

  currentFrame(){ return this.callStack[this.callStack.length-1]; }

  // ============ statement execution (generator) ============
  *execBody(stmts, env){
    for (const s of stmts) yield* this.execStmt(s, env);
  }

  *execStmt(stmt, env){
    this.checkBudget(stmt.line);
    this._lastLine = stmt.line;
    if (this.currentFrame()) this.currentFrame().line = stmt.line;
    switch (stmt.type){
      case 'Pass': return;
      case 'Block': { for (const s of stmt.body) yield* this.execStmt(s, env); return; }
      case 'ExprStmt': {
        const before = this.steps.length;
        const v = yield* this.evalExpr(stmt.expr, env);
        if (this.steps.length === before){
          let desc = describeExprStmt(stmt.expr, v);
          this.emit('EXPR', stmt.line, desc);
        }
        return;
      }
      case 'Assign': {
        const val = yield* this.evalExpr(stmt.value, env);
        for (const target of stmt.targets){
          yield* this.assignTo(target, val, env);
        }
        const names = stmt.targets.map(t => exprToText(t)).join(', ');
        this.emit('ASSIGN', stmt.line, `${names} = ${shortVal(val)}`, { vars: [names] });
        return;
      }
      case 'AugAssign': {
        const cur = yield* this.evalExpr(stmt.target, env);
        const rhs = yield* this.evalExpr(stmt.value, env);
        const result = binOp(stmt.op, cur, rhs);
        yield* this.assignTo(stmt.target, result, env);
        this.emit('ASSIGN', stmt.line, `${exprToText(stmt.target)} ${stmt.op}= ${shortVal(rhs)}  →  ${shortVal(result)}`);
        return;
      }
      case 'If': {
        const cond = yield* this.evalExpr(stmt.test, env);
        const t = truthy(cond);
        this.emit('IF_CHECK', stmt.line, `if ${exprToText(stmt.test)}  →  ${t ? 'True' : 'False'}`, { result: t });
        if (t) yield* this.execBody(stmt.body, env);
        else yield* this.execBody(stmt.orelse, env);
        return;
      }
      case 'While': {
        this.emit('LOOP_START', stmt.line, `while ${exprToText(stmt.test)}`);
        let iter = 0;
        while (true){
          this.checkBudget(stmt.line);
          const cond = yield* this.evalExpr(stmt.test, env);
          const t = truthy(cond);
          this.emit('LOOP_CHECK', stmt.line, `while ${exprToText(stmt.test)}  →  ${t ? 'True' : 'False'}`, { result: t });
          if (!t) break;
          iter++;
          try {
            yield* this.execBody(stmt.body, env);
          } catch (e){
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal){ continue; }
            throw e;
          }
        }
        return;
      }
      case 'For': {
        const iterable = yield* this.evalExpr(stmt.iter, env);
        const list = toIterableArray(iterable);
        this.emit('LOOP_START', stmt.line, `for ${exprToText(stmt.target)} in ${exprToText(stmt.iter)}  (${list.length} items)`);
        for (let idx=0; idx<list.length; idx++){
          this.checkBudget(stmt.line);
          yield* this.assignTo(stmt.target, list[idx], env);
          this.emit('LOOP_ITER', stmt.line, `${exprToText(stmt.target)} = ${shortVal(list[idx])}  (iteration ${idx+1}/${list.length})`, { iterVar: exprToText(stmt.target), iterVal: list[idx], iterIndex: idx });
          try {
            yield* this.execBody(stmt.body, env);
          } catch (e){
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal){ continue; }
            throw e;
          }
        }
        return;
      }
      case 'Break': this.emit('BREAK', stmt.line, 'break'); throw new BreakSignal();
      case 'Continue': this.emit('CONTINUE', stmt.line, 'continue'); throw new ContinueSignal();
      case 'Return': {
        const val = stmt.value ? yield* this.evalExpr(stmt.value, env) : null;
        this.emit('RETURN', stmt.line, `return ${stmt.value ? shortVal(val) : ''}`, { returnValue: val });
        throw new ReturnSignal(val);
      }
      case 'FunctionDef': {
        const fn = new PyFunction(stmt.name, stmt.params, stmt.body, env);
        env.setLocal(stmt.name, fn);
        return;
      }
      case 'ClassDef': {
        const methods = new Map();
        const bases = [];
        for (const b of stmt.bases){
          const bv = yield* this.evalExpr(b, env);
          if (bv instanceof PyClass) bases.push(bv);
        }
        const klass = new PyClass(stmt.name, bases, methods);
        for (const s of stmt.body){
          if (s.type === 'FunctionDef'){
            methods.set(s.name, new PyFunction(s.name, s.params, s.body, env));
          } else if (s.type === 'Assign'){
            // class-level attribute default (rare in LC code) - evaluate & stash on class via a synthetic __init__? skip complexity: store as static default
            // We just execute it in a throwaway env; store on klass.statics
            if (!klass.statics) klass.statics = new Map();
            const v = yield* this.evalExpr(s.value, env);
            for (const t of s.targets) if (t.type==='Name') klass.statics.set(t.id, v);
          } else if (s.type === 'Pass'){ /* noop */ }
        }
        env.setLocal(stmt.name, klass);
        this.classes.set(stmt.name, klass);
        return;
      }
      case 'Global': {
        if (!env.declaredGlobals) env.declaredGlobals = new Set();
        for (const n of stmt.names) env.declaredGlobals.add(n);
        return;
      }
      case 'Nonlocal': {
        if (!env.declaredNonlocals) env.declaredNonlocals = new Set();
        for (const n of stmt.names) env.declaredNonlocals.add(n);
        return;
      }
      case 'Del': {
        // support del list[i], del dict[k], del name
        const t = stmt.target;
        if (t.type === 'Subscript'){
          const obj = yield* this.evalExpr(t.obj, env);
          const idxNode = t.index;
          if (obj instanceof PyList){
            const i = yield* this.evalExpr(idxNode, env);
            obj.pop(i);
          } else if (obj instanceof PyDict){
            const k = yield* this.evalExpr(idxNode, env);
            obj.delete(k);
          }
        } else if (t.type === 'Name'){
          let e = env; while (e){ if (e.vars.has(t.id)){ e.vars.delete(t.id); break; } e = e.parent; }
        }
        this.emit('EXPR', stmt.line, `del ${exprToText(t)}`);
        return;
      }
      case 'Assert': {
        const v = yield* this.evalExpr(stmt.test, env);
        if (!truthy(v)){
          const msg = stmt.msg ? pyStr(yield* this.evalExpr(stmt.msg, env)) : '';
          throw new PyError('AssertionError', msg);
        }
        return;
      }
      case 'Raise': {
        let msg = 'Exception';
        let ptype = 'Exception';
        if (stmt.exc){
          const v = yield* this.evalExpr(stmt.exc, env);
          if (v instanceof PyObject){ msg = v.klass.name; ptype = v.klass.name; }
          else { msg = pyStr(v); }
        }
        throw new PyError(ptype, msg);
      }
      case 'Try': {
        try {
          yield* this.execBody(stmt.body, env);
          yield* this.execBody(stmt.orelse, env);
        } catch (e){
          if (e instanceof PyError){
            let handled = false;
            for (const h of stmt.handlers){
              handled = true;
              if (h.exName) env.set(h.exName, e.message, null);
              yield* this.execBody(h.body, env);
              break;
            }
            if (!handled) throw e;
          } else {
            throw e;
          }
        } finally {
          yield* this.execBody(stmt.finalbody, env);
        }
        return;
      }
      case 'With': {
        // Minimal: evaluate ctx exprs, bind as-names, execute body (no real __enter__/__exit__ semantics needed for LC-style DS problems)
        for (const it of stmt.items){
          const v = yield* this.evalExpr(it.ctx, env);
          if (it.asName) yield* this.assignTo(it.asName, v, env);
        }
        yield* this.execBody(stmt.body, env);
        return;
      }
      default:
        throw new PyError('SyntaxError', `Unsupported statement: ${stmt.type} on line ${stmt.line+1}`);
    }
  }

  *assignTo(target, val, env){
    if (target.type === 'Name'){
      env.set(target.id, val, env.declaredGlobals, env.declaredNonlocals);
      return;
    }
    if (target.type === 'TupleTarget' || target.type === 'Tuple'){
      const items = target.items;
      const vals = valuesOf(val);
      // support starred target: *rest
      const starIdx = items.findIndex(it => it.type === 'Starred');
      if (starIdx === -1){
        for (let i=0;i<items.length;i++) yield* this.assignTo(items[i], vals[i], env);
      } else {
        const before = items.slice(0, starIdx);
        const after = items.slice(starIdx+1);
        for (let i=0;i<before.length;i++) yield* this.assignTo(before[i], vals[i], env);
        const restCount = vals.length - before.length - after.length;
        const restVals = vals.slice(before.length, before.length+restCount);
        yield* this.assignTo(items[starIdx].value, new PyList(restVals), env);
        for (let i=0;i<after.length;i++) yield* this.assignTo(after[i], vals[before.length+restCount+i], env);
      }
      return;
    }
    if (target.type === 'Attribute'){
      const obj = yield* this.evalExpr(target.obj, env);
      if (!(obj instanceof PyObject)) throw new PyError('AttributeError', `cannot set attribute on non-object`);
      obj.attrs.set(target.attr, val);
      return;
    }
    if (target.type === 'Subscript'){
      const obj = yield* this.evalExpr(target.obj, env);
      if (obj instanceof PyList){
        if (target.index.type === 'Slice'){
          const {lower, upper} = yield* this.evalSliceBounds(target.index, env);
          const newVals = valuesOf(val);
          const n = obj.items.length;
          const lo = lower===null?0:normIdxClamp(lower,n);
          const hi = upper===null?n:normIdxClamp(upper,n);
          const newItems = newVals.map(v => ({id: nextId(), value: v}));
          obj.items.splice(lo, Math.max(0,hi-lo), ...newItems);
        } else {
          const i = yield* this.evalExpr(target.index, env);
          obj.set(i, val);
        }
      } else if (obj instanceof PyDict){
        const k = yield* this.evalExpr(target.index, env);
        obj.set(k, val);
      } else {
        throw new PyError('TypeError', `object does not support item assignment`);
      }
      return;
    }
    throw new PyError('SyntaxError', `Cannot assign to ${target.type}`);
  }

  *evalSliceBounds(sliceNode, env){
    const lower = sliceNode.lower ? yield* this.evalExpr(sliceNode.lower, env) : null;
    const upper = sliceNode.upper ? yield* this.evalExpr(sliceNode.upper, env) : null;
    return { lower, upper };
  }

  // ============ expression evaluation (generator) ============
  *evalExpr(node, env){
    switch(node.type){
      case 'Num': return node.value;
      case 'Str': return node.value;
      case 'Const': return node.value;
      case 'FString': {
        let out = '';
        for (const p of node.parts){
          if (p.type === 'str') out += p.value;
          else { const v = yield* this.evalExpr(p.node, env); out += pyStr(v); }
        }
        return out;
      }
      case 'Name': {
        if (env.declaredGlobals && env.declaredGlobals.has(node.id)){
          let m = env; while (m.parent) m = m.parent;
          if (m.vars.has(node.id)) return m.vars.get(node.id);
        }
        if (env.has(node.id)) return env.get(node.id);
        if (BUILTINS[node.id]) return BUILTINS[node.id];
        if (node.id === 'math') return MATH_MODULE;
        throw new PyError('NameError', `name '${node.id}' is not defined`);
      }
      case 'Tuple': {
        const vals = [];
        for (const it of node.items) vals.push(yield* this.evalExpr(it, env));
        return new PyTuple(vals);
      }
      case 'List': {
        const vals = [];
        for (const it of node.items){
          if (it.type === 'Starred'){
            const sv = yield* this.evalExpr(it.value, env);
            for (const x of valuesOf(sv)) vals.push(x);
          } else vals.push(yield* this.evalExpr(it, env));
        }
        return new PyList(vals);
      }
      case 'Set': {
        const vals = [];
        for (const it of node.items) vals.push(yield* this.evalExpr(it, env));
        return new PySet(vals);
      }
      case 'Dict': {
        const d = new PyDict([]);
        for (let i=0;i<node.keys.length;i++){
          if (node.keys[i] === null){
            const spread = yield* this.evalExpr(node.values[i], env);
            if (spread instanceof PyDict) for (const [k,v] of spread.items()) d.set(k,v);
            continue;
          }
          const k = yield* this.evalExpr(node.keys[i], env);
          const v = yield* this.evalExpr(node.values[i], env);
          d.set(k, v);
        }
        return d;
      }
      case 'ListComp': {
        const out = [];
        yield* this.runComprehension(node.generators, env, function*(scope){ out.push(yield* this.evalExpr(node.element, scope)); }.bind(this));
        return new PyList(out);
      }
      case 'SetComp': {
        const out = [];
        yield* this.runComprehension(node.generators, env, function*(scope){ out.push(yield* this.evalExpr(node.element, scope)); }.bind(this));
        return new PySet(out);
      }
      case 'DictComp': {
        const d = new PyDict([]);
        yield* this.runComprehension(node.generators, env, function*(scope){
          const k = yield* this.evalExpr(node.key, scope);
          const v = yield* this.evalExpr(node.value, scope);
          d.set(k, v);
        }.bind(this));
        return d;
      }
      case 'GeneratorExp': {
        const out = [];
        yield* this.runComprehension(node.generators, env, function*(scope){ out.push(yield* this.evalExpr(node.element, scope)); }.bind(this));
        return new PyList(out); // treat as list (materialized) for simplicity
      }
      case 'BoolOp': {
        const l = yield* this.evalExpr(node.left, env);
        if (node.op === 'and'){ if (!truthy(l)) return l; return yield* this.evalExpr(node.right, env); }
        else { if (truthy(l)) return l; return yield* this.evalExpr(node.right, env); }
      }
      case 'UnaryOp': {
        const v = yield* this.evalExpr(node.operand, env);
        switch(node.op){
          case 'not': return !truthy(v);
          case '-': return -v;
          case '+': return +v;
          case '~': return ~v;
        }
        break;
      }
      case 'Compare': {
        let left = yield* this.evalExpr(node.left, env);
        let result = true;
        for (const c of node.ops){
          const right = yield* this.evalExpr(c.right, env);
          let ok;
          switch(c.op){
            case '==': ok = pyEquals(left, right); break;
            case '!=': ok = !pyEquals(left, right); break;
            case '<': ok = pyCompareLT(left, right); break;
            case '>': ok = pyCompareLT(right, left); break;
            case '<=': ok = !pyCompareLT(right, left); break;
            case '>=': ok = !pyCompareLT(left, right); break;
            case 'in': ok = pyContains(right, left); break;
            case 'not in': ok = !pyContains(right, left); break;
            case 'is': ok = (left === right) || (left===null && right===null); break;
            case 'is not': ok = !((left === right) || (left===null && right===null)); break;
          }
          if (!ok){ result = false; break; }
          left = right;
        }
        return result;
      }
      case 'BinOp': {
        const l = yield* this.evalExpr(node.left, env);
        const r = yield* this.evalExpr(node.right, env);
        return binOp(node.op, l, r);
      }
      case 'IfExp': {
        const t = yield* this.evalExpr(node.test, env);
        return truthy(t) ? (yield* this.evalExpr(node.body, env)) : (yield* this.evalExpr(node.orelse, env));
      }
      case 'NamedExpr': {
        const v = yield* this.evalExpr(node.value, env);
        yield* this.assignTo(node.target, v, env);
        return v;
      }
      case 'Lambda': {
        return new PyFunction('<lambda>', node.params, [{ type:'Return', value: node.body, line: node.line }], env);
      }
      case 'Attribute': {
        const obj = yield* this.evalExpr(node.obj, env);
        return this.getAttr(obj, node.attr);
      }
      case 'Subscript': {
        const obj = yield* this.evalExpr(node.obj, env);
        if (node.index.type === 'Slice'){
          const lower = node.index.lower ? yield* this.evalExpr(node.index.lower, env) : null;
          const upper = node.index.upper ? yield* this.evalExpr(node.index.upper, env) : null;
          const step = node.index.step ? yield* this.evalExpr(node.index.step, env) : null;
          if (typeof obj === 'string') return sliceStr(obj, lower, upper, step);
          if (obj instanceof PyList) return obj.slice(lower, upper, step);
          throw new PyError('TypeError', 'unsliceable object');
        }
        if (node.index.type === 'TupleIndex'){
          // e.g. matrix[i, j] rare; or numpy-style. Fallback: treat as tuple key for dict.
          const idxs = [];
          for (const it of node.index.items) idxs.push(yield* this.evalExpr(it, env));
          if (obj instanceof PyDict) return obj.get(new PyTuple(idxs));
          throw new PyError('TypeError', 'invalid index');
        }
        const idx = yield* this.evalExpr(node.index, env);
        if (typeof obj === 'string'){
          let i = idx; const n = obj.length; if (i<0) i+=n;
          if (i<0||i>=n) throw new PyError('IndexError', 'string index out of range');
          return obj[i];
        }
        if (obj instanceof PyList) return obj.get(idx);
        if (obj instanceof PyDict) return obj.get(idx);
        if (obj instanceof PyTuple){ let i=idx; if(i<0) i+=obj.values.length; return obj.values[i]; }
        throw new PyError('TypeError', `'${pyType(obj)}' object is not subscriptable`);
      }
      case 'Call': {
        return yield* this.evalCall(node, env);
      }
      case 'Starred': {
        return yield* this.evalExpr(node.value, env);
      }
      default:
        throw new PyError('SyntaxError', `Unsupported expression: ${node.type}`);
    }
  }

  *runComprehension(generators, env, bodyFn){
    const self = this;
    function* rec(i, scope){
      if (i >= generators.length){ yield* bodyFn(scope); return; }
      const g = generators[i];
      const iterable = yield* self.evalExpr(g.iter, scope);
      const list = toIterableArray(iterable);
      for (const item of list){
        const inner = new Env(scope, 'block');
        yield* self.assignTo(g.target, item, inner);
        let ok = true;
        for (const cond of g.ifs){
          const cv = yield* self.evalExpr(cond, inner);
          if (!truthy(cv)){ ok = false; break; }
        }
        if (ok) yield* rec(i+1, inner);
      }
    }
    yield* rec(0, env);
  }

  getAttr(obj, attr){
    if (obj instanceof ModuleMarker){
      if (attr in obj.attrs) return obj.attrs[attr];
      throw new PyError('AttributeError', `module '${obj.name}' has no attribute '${attr}'`);
    }
    if (obj instanceof PyObject){
      if (obj.attrs.has(attr)) return obj.attrs.get(attr);
      const m = obj.klass.findMethod(attr);
      if (m) return m.bind(obj);
      if (obj.klass.statics && obj.klass.statics.has(attr)) return obj.klass.statics.get(attr);
      throw new PyError('AttributeError', `'${obj.klass.name}' object has no attribute '${attr}'`);
    }
    if (obj instanceof PyClass){
      const m = obj.findMethod(attr);
      if (m) return m;
      if (obj.statics && obj.statics.has(attr)) return obj.statics.get(attr);
    }
    // builtin methods resolved at call time (see evalCall Attribute-func handling)
    return new BoundBuiltinMethodMarker(obj, attr);
  }

  *evalCall(node, env){
    // resolve callee
    let calleeIsAttr = node.func.type === 'Attribute';
    let selfObj = null, methodName = null, funcVal = null;
    if (calleeIsAttr){
      selfObj = yield* this.evalExpr(node.func.obj, env);
      methodName = node.func.attr;
      if (selfObj instanceof ModuleMarker){
        const f = selfObj.attrs[methodName];
        const args2 = [];
        for (const a of node.args) args2.push(yield* this.evalExpr(a, env));
        if (f instanceof NativeFunction) return f.fn(args2, {}, this, node.line);
        throw new PyError('TypeError', `'${methodName}' is not callable`);
      }
    } else {
      funcVal = yield* this.evalExpr(node.func, env);
    }
    const args = [];
    for (const a of node.args){
      if (a.type === 'Starred'){
        const sv = yield* this.evalExpr(a.value, env);
        for (const x of valuesOf(sv)) args.push(x);
      } else args.push(yield* this.evalExpr(a, env));
    }
    const kwargs = {};
    for (const kw of node.kwargs) kwargs[kw.name] = yield* this.evalExpr(kw.value, env);

    if (calleeIsAttr){
      // built-in container methods
      const built = yield* this.callBuiltinMethod(selfObj, methodName, args, kwargs, node.line);
      if (built !== NOT_BUILTIN) return built;
      // user-defined method / bound function
      if (selfObj instanceof PyObject){
        const m = selfObj.klass.findMethod(methodName);
        if (!m) throw new PyError('AttributeError', `'${selfObj.klass.name}' object has no attribute '${methodName}'`);
        return yield* this.callFunction(m, [selfObj, ...args], kwargs, node.line, `${selfObj.klass.name}.${methodName}`);
      }
      if (selfObj instanceof PyClass){
        const m = selfObj.findMethod(methodName);
        if (m) return yield* this.callFunction(m, args, kwargs, node.line, `${selfObj.name}.${methodName}`);
      }
      throw new PyError('AttributeError', `object has no attribute '${methodName}'`);
    } else {
      if (funcVal instanceof PyClass){
        const inst = new PyObject(funcVal);
        if (funcVal.statics) for (const [k,v] of funcVal.statics) inst.attrs.set(k, v);
        const init = funcVal.findMethod('__init__');
        if (init) yield* this.callFunction(init, [inst, ...args], kwargs, node.line, `${funcVal.name}.__init__`);
        return inst;
      }
      if (funcVal instanceof PyFunction){
        return yield* this.callFunction(funcVal, args, kwargs, node.line, funcVal.name);
      }
      if (funcVal instanceof NativeFunction){
        return funcVal.fn(args, kwargs, this, node.line);
      }
      if (typeof funcVal === 'string' || typeof funcVal === 'number'){
        throw new PyError('TypeError', `'${pyType(funcVal)}' object is not callable`);
      }
      // builtin global function name fallback
      if (node.func.type === 'Name' && BUILTINS[node.func.id]){
        return BUILTINS[node.func.id](args, kwargs, this, node.line);
      }
      throw new PyError('TypeError', `object is not callable`);
    }
  }

  *callFunction(fn, args, kwargs, callLine, displayName){
    if (this.callStack.length >= this.callDepthLimit){
      throw new PyError('RecursionError', 'maximum recursion depth exceeded');
    }
    const fnEnv = new Env(fn.closureEnv, 'function');
    bindParams(fn.params, args, kwargs, fnEnv);
    this.callStack.push({ name: displayName || fn.name, line: fn.body.length? fn.body[0].line : callLine, env: fnEnv });
    this.emit('CALL', callLine, `${displayName || fn.name}(${args.map(shortVal).join(', ')})`, { callName: displayName||fn.name });
    try {
      yield* this.execBody(fn.body, fnEnv);
      this.emit('RETURN', callLine, `${displayName||fn.name} returns None (implicit)`, { returnValue: null });
      return null;
    } catch (e){
      if (e instanceof ReturnSignal){
        return e.value;
      }
      throw e;
    } finally {
      this.callStack.pop();
    }
  }

  *callBuiltinMethod(self, name, args, kwargs, line){
    if (self instanceof PyList){
      switch(name){
        case 'append': self.push(args[0]); this.emit('PUSH', line, `append(${shortVal(args[0])})`, { containerId: self.id }); return null;
        case 'appendleft': self.insert(0, args[0]); this.emit('PUSH', line, `appendleft(${shortVal(args[0])})`, { containerId: self.id }); return null;
        case 'push': self.push(args[0]); this.emit('PUSH', line, `push(${shortVal(args[0])})`, { containerId: self.id }); return null;
        case 'pop': {
          const v = self.pop(args.length? args[0] : undefined);
          this.emit('POP', line, `pop() → ${shortVal(v)}`, { containerId: self.id });
          return v;
        }
        case 'popleft': {
          const v = self.pop(0);
          this.emit('POP', line, `popleft() → ${shortVal(v)}`, { containerId: self.id });
          return v;
        }
        case 'insert': self.insert(args[0], args[1]); this.emit('PUSH', line, `insert(${args[0]}, ${shortVal(args[1])})`, { containerId: self.id }); return null;
        case 'remove': self.removeValue(args[0], pyEquals); this.emit('POP', line, `remove(${shortVal(args[0])})`, { containerId: self.id }); return null;
        case 'extend': for (const v of valuesOf(args[0])) self.push(v); this.emit('PUSH', line, `extend(...)`, { containerId: self.id }); return null;
        case 'index': { const i = self.items.findIndex(it=>pyEquals(it.value,args[0])); if(i===-1) throw new PyError('ValueError', `${shortVal(args[0])} is not in list`); return i; }
        case 'count': return self.items.filter(it=>pyEquals(it.value,args[0])).length;
        case 'sort': {
          const keyFn = kwargs.key;
          const reverse = truthy(kwargs.reverse);
          const idxArr = self.items.map((it,i)=>i);
          const keyOf = (it) => keyFn ? callSync(this, keyFn, [it.value]) : it.value;
          idxArr.sort((ai,bi) => pyCompareKey(keyOf(self.items[ai]), keyOf(self.items[bi])));
          let newItems = idxArr.map(i => self.items[i]);
          if (reverse) newItems.reverse();
          self.items = newItems;
          this.emit('SORT', line, `sort()`, { containerId: self.id });
          return null;
        }
        case 'reverse': self.items.reverse(); this.emit('SORT', line, `reverse()`, { containerId: self.id }); return null;
        case 'copy': return self.clone();
        case 'clear': self.items = []; this.emit('POP', line, 'clear()', { containerId: self.id }); return null;
      }
      return NOT_BUILTIN;
    }
    if (self instanceof PyDict){
      switch(name){
        case 'get': return self.has(args[0]) ? self.get(args[0]) : (args.length>1 ? args[1] : null);
        case 'keys': return new PyList(self.keys());
        case 'values': return new PyList(self.values());
        case 'items': return new PyList(self.items().map(([k,v])=>new PyTuple([k,v])));
        case 'pop': {
          if (self.has(args[0])){ const v = self.get(args[0]); self.delete(args[0]); this.emit('POP', line, `dict.pop(${shortVal(args[0])})`, { containerId: self.id }); return v; }
          if (args.length>1) return args[1];
          throw new PyError('KeyError', shortVal(args[0]));
        }
        case 'setdefault': {
          if (!self.has(args[0])) { self.set(args[0], args.length>1?args[1]:null); this.emit('PUSH', line, `setdefault(${shortVal(args[0])})`, { containerId: self.id }); }
          return self.get(args[0]);
        }
        case 'update': {
          const other = args[0];
          if (other instanceof PyDict) for (const [k,v] of other.items()) self.set(k,v);
          this.emit('PUSH', line, 'update(...)', { containerId: self.id });
          return null;
        }
        case 'copy': return self.clone();
      }
      return NOT_BUILTIN;
    }
    if (self instanceof PySet){
      switch(name){
        case 'add': self.add(args[0]); this.emit('PUSH', line, `add(${shortVal(args[0])})`, { containerId: self.id }); return null;
        case 'discard': self.discard(args[0]); this.emit('POP', line, `discard(${shortVal(args[0])})`, { containerId: self.id }); return null;
        case 'remove': self.remove(args[0]); this.emit('POP', line, `remove(${shortVal(args[0])})`, { containerId: self.id }); return null;
        case 'pop': { if(self.items.length===0) throw new PyError('KeyError','pop from an empty set'); const v = self.items.shift().value; this.emit('POP', line, 'set.pop()', { containerId: self.id }); return v; }
        case 'union': return new PySet([...self.values, ...valuesOf(args[0])]);
        case 'intersection': { const ov = valuesOf(args[0]); return new PySet(self.values.filter(v=>ov.some(o=>pyEquals(o,v)))); }
        case 'difference': { const ov = valuesOf(args[0]); return new PySet(self.values.filter(v=>!ov.some(o=>pyEquals(o,v)))); }
        case 'copy': return self.clone();
      }
      return NOT_BUILTIN;
    }
    if (typeof self === 'string'){
      switch(name){
        case 'split': return new PyList(args.length? self.split(args[0]) : self.trim().split(/\s+/).filter(x=>x.length));
        case 'join': return valuesOf(args[0]).map(pyStr).join(self);
        case 'strip': return args.length ? stripChars(self, args[0]) : self.trim();
        case 'lstrip': return args.length ? self.replace(new RegExp('^['+escapeRe(args[0])+']+'), '') : self.replace(/^\s+/, '');
        case 'rstrip': return args.length ? self.replace(new RegExp('['+escapeRe(args[0])+']+$'), '') : self.replace(/\s+$/, '');
        case 'lower': return self.toLowerCase();
        case 'upper': return self.toUpperCase();
        case 'replace': return self.split(args[0]).join(args[1]);
        case 'find': { const i = self.indexOf(args[0]); return i; }
        case 'index': { const i = self.indexOf(args[0]); if(i===-1) throw new PyError('ValueError','substring not found'); return i; }
        case 'startswith': return self.startsWith(args[0]);
        case 'endswith': return self.endsWith(args[0]);
        case 'isdigit': return /^\d+$/.test(self);
        case 'isalpha': return /^[A-Za-z]+$/.test(self);
        case 'isalnum': return /^[A-Za-z0-9]+$/.test(self);
        case 'isupper': return self === self.toUpperCase() && self !== self.toLowerCase();
        case 'islower': return self === self.toLowerCase() && self !== self.toUpperCase();
        case 'isspace': return /^\s+$/.test(self);
        case 'count': { let c=0,i=0; while((i=self.indexOf(args[0],i))!==-1){c++;i+=Math.max(1,args[0].length);} return c; }
        case 'format': { let i=0; return self.replace(/\{\}/g, ()=>pyStr(args[i++])); }
        case 'capitalize': return self.length? self[0].toUpperCase()+self.slice(1).toLowerCase(): self;
        case 'title': return self.replace(/\w\S*/g, t=>t[0].toUpperCase()+t.slice(1).toLowerCase());
        case 'swapcase': return self.split('').map(c=>c===c.toUpperCase()?c.toLowerCase():c.toUpperCase()).join('');
        case 'zfill': { const w=args[0]; return self.length>=w? self : '0'.repeat(w-self.length)+self; }
      }
      return NOT_BUILTIN;
    }
    return NOT_BUILTIN;
  }
}

const NOT_BUILTIN = Symbol('not-builtin');
class BoundBuiltinMethodMarker {}

function callSync(interp, fn, args){
  // used for sort key functions - run to completion ignoring step emission subtleties (simple key fns only)
  const gen = interp.callFunction(fn, args, {}, 0, fn.name);
  let res = gen.next();
  while (!res.done) res = gen.next();
  return res.value;
}

function bindParams(params, args, kwargs, env){
  let ai = 0;
  for (const p of params){
    if (p.star === '*'){
      env.setLocal(p.name, new PyList(args.slice(ai)));
      ai = args.length;
      continue;
    }
    if (p.star === '**'){
      const d = new PyDict([]);
      for (const k in kwargs) d.set(k, kwargs[k]);
      env.setLocal(p.name, d);
      continue;
    }
    if (p.name === 'self' && ai < args.length){ env.setLocal('self', args[ai]); ai++; continue; }
    if (kwargs.hasOwnProperty(p.name)){ env.setLocal(p.name, kwargs[p.name]); continue; }
    if (ai < args.length){ env.setLocal(p.name, args[ai]); ai++; }
    else if (p.default !== null && p.default !== undefined){
      // defaults may reference outer scope; evaluate synchronously (defaults are typically constants)
      env.setLocal(p.name, evalConstDefault(p.default));
    } else {
      env.setLocal(p.name, null);
    }
  }
}
function evalConstDefault(node){
  switch(node.type){
    case 'Num': return node.value;
    case 'Str': return node.value;
    case 'Const': return node.value;
    case 'List': return new PyList(node.items.map(evalConstDefault));
    case 'UnaryOp': if(node.op==='-') return -evalConstDefault(node.operand); return evalConstDefault(node.operand);
    default: return null;
  }
}

function valuesOf(v){
  if (v instanceof PyList) return v.values;
  if (v instanceof PyTuple) return v.values;
  if (v instanceof PySet) return v.values;
  if (typeof v === 'string') return v.split('');
  if (v instanceof PyDict) return v.keys();
  return [v];
}
function toIterableArray(v){
  if (typeof v === 'number') throw new PyError('TypeError', "'int' object is not iterable");
  return valuesOf(v);
}

function pyCompareLT(a, b){
  if (typeof a === 'number' && typeof b === 'number') return a < b;
  if (typeof a === 'string' && typeof b === 'string') return a < b;
  if (a instanceof PyList && b instanceof PyList){
    const n = Math.min(a.items.length, b.items.length);
    for (let i=0;i<n;i++){
      if (pyCompareLT(a.items[i].value,b.items[i].value)) return true;
      if (pyCompareLT(b.items[i].value,a.items[i].value)) return false;
    }
    return a.items.length < b.items.length;
  }
  if (a instanceof PyTuple && b instanceof PyTuple){
    const n = Math.min(a.values.length, b.values.length);
    for (let i=0;i<n;i++){
      if (pyCompareLT(a.values[i],b.values[i])) return true;
      if (pyCompareLT(b.values[i],a.values[i])) return false;
    }
    return a.values.length < b.values.length;
  }
  if (typeof a === 'boolean') return pyCompareLT(a?1:0, typeof b==='boolean'?(b?1:0):b);
  if (typeof b === 'boolean') return pyCompareLT(typeof a==='boolean'?(a?1:0):a, b?1:0);
  throw new PyError('TypeError', `'<' not supported between instances`);
}
function pyCompareKey(a,b){ return pyCompareLT(a,b) ? -1 : (pyCompareLT(b,a) ? 1 : 0); }

function binOp(op, l, r){
  if (op === '+'){
    if (typeof l === 'string' || typeof r === 'string') { if(typeof l!=='string'||typeof r!=='string') throw new PyError('TypeError','can only concatenate str'); return l + r; }
    if (l instanceof PyList && r instanceof PyList) return new PyList([...l.values, ...r.values]);
    if (l instanceof PyTuple && r instanceof PyTuple) return new PyTuple([...l.values, ...r.values]);
    return l + r;
  }
  if (op === '-'){
    if (l instanceof PySet && r instanceof PySet) return new PySet(l.values.filter(v=>!r.has(v)));
    return l - r;
  }
  if (op === '*'){
    if (typeof l === 'string' && typeof r === 'number') return l.repeat(Math.max(0,r));
    if (typeof r === 'string' && typeof l === 'number') return r.repeat(Math.max(0,l));
    if (l instanceof PyList && typeof r === 'number'){ let out=[]; for(let i=0;i<r;i++) out.push(...l.values); return new PyList(out); }
    if (r instanceof PyList && typeof l === 'number'){ let out=[]; for(let i=0;i<l;i++) out.push(...r.values); return new PyList(out); }
    return l * r;
  }
  if (op === '/'){ if (r===0) throw new PyError('ZeroDivisionError','division by zero'); return l / r; }
  if (op === '//'){ if (r===0) throw new PyError('ZeroDivisionError','integer division or modulo by zero'); return Math.floor(l / r); }
  if (op === '%'){
    if (typeof l === 'string') return pyPercentFormat(l, r);
    if (r===0) throw new PyError('ZeroDivisionError','modulo by zero');
    return ((l % r) + r) % r;
  }
  if (op === '**') return Math.pow(l, r);
  if (op === '&'){ if (l instanceof PySet) return new PySet(l.values.filter(v=>r.has(v))); return l & r; }
  if (op === '|'){ if (l instanceof PySet) return new PySet([...l.values, ...r.values]); return l | r; }
  if (op === '^'){ if (l instanceof PySet) return new PySet([...l.values.filter(v=>!r.has(v)), ...r.values.filter(v=>!l.has(v))]); return l ^ r; }
  if (op === '<<') return l << r;
  if (op === '>>') return l >> r;
  if (op === '@'){ throw new PyError('TypeError', 'matrix mult not supported'); }
  throw new PyError('SyntaxError', `Unknown operator ${op}`);
}
function pyPercentFormat(fmt, args){
  const list = (args instanceof PyTuple) ? args.values : [args];
  let i = 0;
  return fmt.replace(/%[sd]/g, () => pyStr(list[i++]));
}

function sliceStr(s, lower, upper, step){
  step = step === null || step === undefined ? 1 : step;
  const n = s.length;
  let start, stop;
  if (step > 0){
    start = lower===null||lower===undefined?0:normSliceIdx(lower,n);
    stop = upper===null||upper===undefined?n:normSliceIdx(upper,n);
    let out=''; for(let i=start;i<stop && i<n;i+=step) if(i>=0) out+=s[i];
    return out;
  } else {
    start = lower===null||lower===undefined?n-1:normSliceIdx(lower,n,true);
    stop = upper===null||upper===undefined?-1:normSliceIdx(upper,n,true);
    let out=''; for(let i=start;i>stop && i>=0;i+=step) if(i<n) out+=s[i];
    return out;
  }
}
function normSliceIdx(i, n, forNeg){ if (i<0) i+=n; if (i<0) i = forNeg?-1:0; if (i>n) i=n; return i; }
function normIdxClamp(i, n){ if (i<0) i+=n; if(i<0) i=0; if(i>n) i=n; return i; }
function stripChars(s, chars){
  let a=0,b=s.length;
  while(a<b && chars.includes(s[a])) a++;
  while(b>a && chars.includes(s[b-1])) b--;
  return s.slice(a,b);
}
function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function shortVal(v){
  const s = pyStr(v, true);
  return s.length > 60 ? s.slice(0,57)+'...' : s;
}
function exprToText(node){
  if (!node) return '';
  switch(node.type){
    case 'Name': return node.id;
    case 'Num': return String(node.value);
    case 'Str': return "'"+node.value+"'";
    case 'Const': return node.value===true?'True':node.value===false?'False':'None';
    case 'Attribute': return exprToText(node.obj)+'.'+node.attr;
    case 'Subscript': return exprToText(node.obj)+'['+exprToText(node.index)+']';
    case 'Slice': return (node.lower?exprToText(node.lower):'')+':'+(node.upper?exprToText(node.upper):'');
    case 'Call': return exprToText(node.func)+'('+node.args.map(exprToText).join(', ')+')';
    case 'BinOp': return exprToText(node.left)+' '+node.op+' '+exprToText(node.right);
    case 'BoolOp': return exprToText(node.left)+' '+node.op+' '+exprToText(node.right);
    case 'UnaryOp': return node.op+' '+exprToText(node.operand);
    case 'Compare': return exprToText(node.left)+node.ops.map(o=>' '+o.op+' '+exprToText(o.right)).join('');
    case 'Tuple': return '('+node.items.map(exprToText).join(', ')+')';
    case 'TupleTarget': return '('+node.items.map(exprToText).join(', ')+')';
    case 'List': return '['+node.items.map(exprToText).join(', ')+']';
    case 'IfExp': return exprToText(node.body)+' if '+exprToText(node.test)+' else '+exprToText(node.orelse);
    default: return '<expr>';
  }
}
function describeExprStmt(node, val){
  if (node.type === 'Call'){
    const fname = node.func.type==='Name' ? node.func.id : (node.func.type==='Attribute'? exprToText(node.func):'call');
    if (fname === 'print') return `print → ${val===null?'':pyStr(val)}`;
    return `${exprToText(node)}`;
  }
  return exprToText(node);
}

const BUILTINS = {
  len: (a) => pyLen(a[0]),
  range: (a) => {
    let start=0, stop, step=1;
    if (a.length===1) stop=a[0];
    else if (a.length===2){ start=a[0]; stop=a[1]; }
    else { start=a[0]; stop=a[1]; step=a[2]; }
    const out=[];
    if (step>0) for(let i=start;i<stop;i+=step) out.push(i);
    else if (step<0) for(let i=start;i>stop;i+=step) out.push(i);
    return new PyList(out);
  },
  enumerate: (a) => {
    const start = a.length>1? a[1]:0;
    const vals = valuesOf(a[0]);
    return new PyList(vals.map((v,i)=>new PyTuple([i+start, v])));
  },
  zip: (a) => {
    const arrs = a.map(valuesOf);
    const n = Math.min(...arrs.map(x=>x.length));
    const out = [];
    for (let i=0;i<n;i++) out.push(new PyTuple(arrs.map(arr=>arr[i])));
    return new PyList(out);
  },
  sorted: (a, kwargs, interp) => {
    const vals = valuesOf(a[0]).slice();
    const keyFn = kwargs.key;
    const reverse = kwargs.reverse ? truthy(kwargs.reverse) : false;
    const keyOf = v => keyFn ? callSync(interp, keyFn, [v]) : v;
    vals.sort((x,y)=>pyCompareKey(keyOf(x),keyOf(y)));
    if (reverse) vals.reverse();
    return new PyList(vals);
  },
  reversed: (a) => new PyList(valuesOf(a[0]).slice().reverse()),
  min: (a, kwargs, interp) => {
    const vals = a.length===1 ? valuesOf(a[0]) : a;
    if (vals.length===0) throw new PyError('ValueError','min() arg is an empty sequence');
    const keyFn = kwargs.key;
    let best = vals[0], bk = keyFn? callSync(interp,keyFn,[vals[0]]):vals[0];
    for (let i=1;i<vals.length;i++){ const k = keyFn?callSync(interp,keyFn,[vals[i]]):vals[i]; if (pyCompareLT(k,bk)){best=vals[i]; bk=k;} }
    return best;
  },
  max: (a, kwargs, interp) => {
    const vals = a.length===1 ? valuesOf(a[0]) : a;
    if (vals.length===0) throw new PyError('ValueError','max() arg is an empty sequence');
    const keyFn = kwargs.key;
    let best = vals[0], bk = keyFn? callSync(interp,keyFn,[vals[0]]):vals[0];
    for (let i=1;i<vals.length;i++){ const k = keyFn?callSync(interp,keyFn,[vals[i]]):vals[i]; if (pyCompareLT(bk,k)){best=vals[i]; bk=k;} }
    return best;
  },
  abs: (a) => Math.abs(a[0]),
  sum: (a) => valuesOf(a[0]).reduce((x,y)=>x+y, a.length>1?a[1]:0),
  any: (a) => valuesOf(a[0]).some(truthy),
  all: (a) => valuesOf(a[0]).every(truthy),
  round: (a) => a.length>1 ? Number(a[0].toFixed(a[1])) : Math.round(a[0]),
  list: (a) => a.length? new PyList(valuesOf(a[0])) : new PyList([]),
  dict: (a) => { if(!a.length) return new PyDict([]); if (a[0] instanceof PyDict) return a[0].clone(); const d=new PyDict([]); for (const v of valuesOf(a[0])) { const [k,vv]=valuesOf(v); d.set(k,vv);} return d; },
  set: (a) => a.length? new PySet(valuesOf(a[0])) : new PySet([]),
  tuple: (a) => a.length? new PyTuple(valuesOf(a[0])) : new PyTuple([]),
  str: (a) => a.length? pyStr(a[0]) : '',
  int: (a) => a.length? (typeof a[0]==='string'? parseInt(a[0],a.length>1?a[1]:10) : Math.trunc(a[0])) : 0,
  float: (a) => a.length? parseFloat(a[0]) : 0.0,
  bool: (a) => a.length? truthy(a[0]) : false,
  ord: (a) => a[0].charCodeAt(0),
  chr: (a) => String.fromCharCode(a[0]),
  print: (a, kwargs, interp) => {
    const sep = kwargs.sep!==undefined?kwargs.sep:' ';
    const end = kwargs.end!==undefined?kwargs.end:'\n';
    const line = a.map(v=>pyStr(v)).join(sep);
    interp._outBuf += line + end;
    interp.output = computeOutputLines(interp._outBuf);
    return null;
  },
  input: (a, kwargs, interp) => {
    const promptText = a.length ? pyStr(a[0]) : '';
    if (typeof window !== 'undefined' && typeof window.prompt === 'function'){
      const v = window.prompt(promptText || 'Input:');
      if (promptText){ interp._outBuf += promptText + (v===null?'':v) + '\n'; interp.output = computeOutputLines(interp._outBuf); }
      return v === null ? '' : v;
    }
    return '';
  },
  isinstance: (a) => {
    const v = a[0], t = a[1];
    const tname = t instanceof PyClass ? t.name : null;
    if (tname) return v instanceof PyObject && v.klass.name === tname;
    return true;
  },
  divmod: (a) => new PyTuple([Math.floor(a[0]/a[1]), ((a[0]%a[1])+a[1])%a[1]]),
  pow: (a) => a.length>2 ? Math.pow(a[0],a[1])%a[2] : Math.pow(a[0],a[1]),
  hash: (a) => { const s = pyStr(a[0]); let h=0; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;} return h; },
  map: (a, kwargs, interp) => new PyList(valuesOf(a[1]).map(v=>callSync(interp,a[0],[v]))),
  filter: (a, kwargs, interp) => new PyList(valuesOf(a[1]).filter(v=>truthy(a[0]===null?v:callSync(interp,a[0],[v])))),
  deque: (a) => new PyList(a.length?valuesOf(a[0]):[], 'queue'),
  defaultdict: (a) => { const d = new PyDict([]); const factory = a[0]; d.defaultFactory = () => { if (!factory) return null; if (factory instanceof NativeFunction && factory.name==='list') return new PyList([]); if (factory instanceof NativeFunction && factory.name==='int') return 0; if (factory instanceof NativeFunction && factory.name==='set') return new PySet([]); if (factory instanceof NativeFunction && factory.name==='dict') return new PyDict([]); return null; }; return d; },
  Counter: (a) => { const d = new PyDict([]); d.defaultFactory = () => 0; if (a.length){ for (const v of valuesOf(a[0])) d.set(v, (d.has(v)?d.get(v):0)+1); } return d; },
};
BUILTINS.list.__name = 'list'; BUILTINS.int.__name='int'; BUILTINS.set.__name='set'; BUILTINS.dict.__name='dict';
// wrap so factory funcs identify themselves for defaultdict
for (const n of ['list','int','set','dict']) { const orig = BUILTINS[n]; BUILTINS[n] = new NativeFunction(n, orig); }
for (const k in BUILTINS){ if (!(BUILTINS[k] instanceof NativeFunction)) BUILTINS[k] = new NativeFunction(k, BUILTINS[k]); }

const exportObj = { Interpreter, Env, truthy, pyStr, pyType, pyLen, pyEquals, TimeoutErr, BUILTINS, shortVal, exprToText, computeOutputLines };
if (typeof module !== 'undefined') module.exports = exportObj;
else window.PyInterp = exportObj;
