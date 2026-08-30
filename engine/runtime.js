"use strict";
/* ===================== RUNTIME OBJECT MODEL ===================== */
let __heapId = 1;
function nextId(){ return __heapId++; }
function resetIdCounter(){ __heapId = 1; }

class PyNone { toString(){ return 'None'; } }
const NONE = null; // use JS null to represent Python None throughout

class PyError extends Error {
  constructor(pyType, message){
    super(message);
    this.pyType = pyType; // 'IndexError', 'KeyError', 'TypeError', 'ZeroDivisionError', 'AttributeError', ...
    this.name = 'PyError';
  }
}

class BreakSignal { }
class ContinueSignal { }
class ReturnSignal { constructor(value){ this.value = value; } }

// A Python list. items = [{id, value}]
class PyList {
  constructor(values = [], role=null){
    this.id = nextId();
    this.items = values.map(v => ({ id: nextId(), value: v }));
    this.roleHint = role; // 'stack' | 'queue' | 'array' | null (explicit hint)
  }
  get length(){ return this.items.length; }
  get values(){ return this.items.map(it => it.value); }
  normIndex(i){
    let n = this.items.length;
    if (i < 0) i += n;
    return i;
  }
  get(i){
    const idx = this.normIndex(i);
    if (idx < 0 || idx >= this.items.length) throw new PyError('IndexError', 'list index out of range');
    return this.items[idx].value;
  }
  set(i, v){
    const idx = this.normIndex(i);
    if (idx < 0 || idx >= this.items.length) throw new PyError('IndexError', 'list assignment index out of range');
    this.items[idx].value = v;
  }
  push(v){ this.items.push({ id: nextId(), value: v }); }
  insert(i, v){
    let idx = i < 0 ? Math.max(0, this.items.length + i) : Math.min(i, this.items.length);
    this.items.splice(idx, 0, { id: nextId(), value: v });
  }
  pop(i){
    if (this.items.length === 0) throw new PyError('IndexError', i === undefined ? 'pop from empty list' : 'pop from empty list');
    let idx = (i === undefined) ? this.items.length - 1 : this.normIndex(i);
    if (idx < 0 || idx >= this.items.length) throw new PyError('IndexError', 'pop index out of range');
    return this.items.splice(idx, 1)[0].value;
  }
  removeValue(v, eq){
    const idx = this.items.findIndex(it => eq(it.value, v));
    if (idx === -1) throw new PyError('ValueError', 'list.remove(x): x not in list');
    this.items.splice(idx, 1);
  }
  clone(){
    const l = new PyList([]);
    l.items = this.items.map(it => ({ id: it.id, value: it.value }));
    l.roleHint = this.roleHint;
    return l;
  }
  slice(lower, upper, step){
    const n = this.items.length;
    step = step === null || step === undefined ? 1 : step;
    let start, stop;
    if (step > 0){
      start = lower === null || lower === undefined ? 0 : normSliceIdx(lower, n);
      stop = upper === null || upper === undefined ? n : normSliceIdx(upper, n);
    } else {
      start = lower === null || lower === undefined ? n - 1 : normSliceIdx(lower, n, true);
      stop = upper === null || upper === undefined ? -1 : normSliceIdx(upper, n, true);
    }
    const out = [];
    if (step > 0){ for (let i = start; i < stop && i < n; i += step) if (i>=0) out.push(this.items[i]); }
    else { for (let i = start; i > stop && i >= 0; i += step) if (i<n) out.push(this.items[i]); }
    const l = new PyList([]);
    l.items = out.map(it => ({ id: it.id, value: it.value }));
    return l;
  }
}
function normSliceIdx(i, n, forNeg){
  if (i < 0) i += n;
  if (i < 0) i = forNeg ? -1 : 0;
  if (i > n) i = n;
  return i;
}

// Python dict - preserves insertion order, each entry has stable id
class PyDict {
  constructor(entries = []){ // entries: [[k,v], ...]
    this.id = nextId();
    this.entries = []; // {id, key, value}
    for (const [k,v] of entries) this.set(k, v);
    this.defaultFactory = null; // for defaultdict
  }
  static keyStr(k){
    if (k instanceof PyList) return 'L:' + k.values.map(PyDict.keyStr).join(',');
    if (k && k.constructor && k.constructor.name === 'PyTuple') return 'T:' + k.values.map(PyDict.keyStr).join(',');
    if (k === null) return 'None';
    if (typeof k === 'boolean') return 'b:'+k;
    if (typeof k === 'number') return 'n:'+k;
    if (typeof k === 'string') return 's:'+k;
    if (Array.isArray(k)) return 'A:'+k.map(PyDict.keyStr).join(',');
    return 'o:'+String(k);
  }
  findIdx(k){
    const ks = PyDict.keyStr(k);
    return this.entries.findIndex(e => PyDict.keyStr(e.key) === ks);
  }
  has(k){ return this.findIdx(k) !== -1; }
  get(k){
    const idx = this.findIdx(k);
    if (idx === -1){
      if (this.defaultFactory){
        const v = this.defaultFactory();
        this.set(k, v);
        return v;
      }
      throw new PyError('KeyError', formatKeyErr(k));
    }
    return this.entries[idx].value;
  }
  set(k, v){
    const idx = this.findIdx(k);
    if (idx === -1) this.entries.push({ id: nextId(), key: k, value: v });
    else this.entries[idx].value = v;
  }
  delete(k){
    const idx = this.findIdx(k);
    if (idx === -1) throw new PyError('KeyError', formatKeyErr(k));
    this.entries.splice(idx, 1);
  }
  get size(){ return this.entries.length; }
  keys(){ return this.entries.map(e => e.key); }
  values(){ return this.entries.map(e => e.value); }
  items(){ return this.entries.map(e => [e.key, e.value]); }
  clone(){
    const d = new PyDict([]);
    d.entries = this.entries.map(e => ({ id: e.id, key: e.key, value: e.value }));
    d.defaultFactory = this.defaultFactory;
    return d;
  }
}
function formatKeyErr(k){
  if (typeof k === 'string') return "'"+k+"'";
  return String(k);
}

// Python set
class PySet {
  constructor(values = []){
    this.id = nextId();
    this.items = []; // {id, value}
    for (const v of values) this.add(v);
  }
  keyOf(v){ return PyDict.keyStr(v); }
  has(v){ const k = this.keyOf(v); return this.items.some(it => this.keyOf(it.value) === k); }
  add(v){ if (!this.has(v)) this.items.push({ id: nextId(), value: v }); }
  discard(v){ const k=this.keyOf(v); const idx = this.items.findIndex(it=>this.keyOf(it.value)===k); if (idx!==-1) this.items.splice(idx,1); }
  remove(v){ const k=this.keyOf(v); const idx = this.items.findIndex(it=>this.keyOf(it.value)===k); if (idx===-1) throw new PyError('KeyError', formatKeyErr(v)); this.items.splice(idx,1); }
  get size(){ return this.items.length; }
  get values(){ return this.items.map(it=>it.value); }
  clone(){ const s = new PySet([]); s.items = this.items.map(it=>({id:it.id,value:it.value})); return s; }
}

// user-defined class
class PyClass {
  constructor(name, bases, methods){
    this.name = name;
    this.bases = bases || [];
    this.methods = methods; // Map<string, PyFunction>
  }
  findMethod(name){
    if (this.methods.has(name)) return this.methods.get(name);
    for (const b of this.bases){ const m = b.findMethod && b.findMethod(name); if (m) return m; }
    return null;
  }
}

// instance of a user class - heap object with attrs
class PyObject {
  constructor(klass){
    this.id = nextId();
    this.klass = klass;
    this.attrs = new Map(); // name -> value
  }
}

class PyFunction {
  constructor(name, params, body, closureEnv, selfBound=null){
    this.name = name;
    this.params = params;
    this.body = body;
    this.closureEnv = closureEnv;
    this.selfBound = selfBound; // for bound methods
  }
  bind(self){
    const f = new PyFunction(this.name, this.params, this.body, this.closureEnv, self);
    return f;
  }
}

class NativeFunction {
  constructor(name, fn){ this.name = name; this.fn = fn; }
}

class PyTuple {
  constructor(values){ this.id = nextId(); this.values = values; }
}

const exportObj = {
  nextId, resetIdCounter, NONE, PyError, BreakSignal, ContinueSignal, ReturnSignal,
  PyList, PyDict, PySet, PyClass, PyObject, PyFunction, NativeFunction, PyTuple, formatKeyErr
};
if (typeof module !== 'undefined') module.exports = exportObj;
else window.PyRuntime = exportObj;
