"use strict";
/* ===================== DATA-STRUCTURE DETECTOR ===================== */
const RT = typeof require !== 'undefined' ? require('./runtime.js') : window.PyRuntime;
const { PyList, PyDict, PySet, PyObject, PyTuple } = RT;

// Track per-list usage stats keyed by heap id, updated as the interpreter emits container events.
class UsageTracker {
  constructor(){ this.stats = new Map(); }
  get(id){
    if (!this.stats.has(id)) this.stats.set(id, { appendEnd:0, popEnd:0, popFront:0, pushFront:0, indexSet:0, indexGet:0, sorted:0 });
    return this.stats.get(id);
  }
  onStep(step){
    if (!step.containerId) return;
    const s = this.get(step.containerId);
    if (step.kind === 'PUSH'){
      if (/appendleft|insert\(0/.test(step.desc)) s.pushFront++; else s.appendEnd++;
    } else if (step.kind === 'POP'){
      if (/popleft/.test(step.desc)) s.popFront++; else s.popEnd++;
    } else if (step.kind === 'SORT'){ s.sorted++; }
  }
}

const LABEL_PRIORITY = ['val','value','data','key','item','label','x','n','num','elem'];
function nodeAttrLabel(attrsMap, fallbackId){
  for (const name of LABEL_PRIORITY){
    if (attrsMap.has(name)) return attrsMap.get(name);
  }
  const skip = new Set(['next','left','right','neighbors','edges','children','prev']);
  for (const [k,v] of attrsMap){
    if (skip.has(k)) continue;
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  }
  return fallbackId;
}

function classNodeShape(klass){
  // Inspect a class's __init__ method (or any observed instance) for a 'next'/'left'+'right'/'neighbors' pattern.
  return null; // shape decided per-instance at snapshot time (attrs are dynamic)
}

function objShape(obj){
  const keys = [...obj.attrs.keys()];
  const hasNext = keys.includes('next');
  const hasLeftRight = keys.includes('left') && keys.includes('right');
  const hasNeighbors = keys.some(k => k==='neighbors' || k==='edges' || k==='children');
  const hasChildOnly = keys.includes('children');
  if (hasLeftRight) return 'tree';
  if (hasNeighbors) return 'graph';
  if (hasNext) return 'linked_list';
  return 'object';
}

// Classify a variable's value into a visual role for rendering.
// value: the runtime value; usage: UsageTracker; nameHint: variable name (optional)
function classifyValue(value, usage, nameHint){
  if (value instanceof PyList){
    if (value.items.length > 0 && value.items.every(it => it.value instanceof PyList)){
      // uniform rectangular? still show as grid even if ragged (renderer pads)
      return 'grid';
    }
    const s = usage ? usage.get(value.id) : null;
    const nameLower = (nameHint||'').toLowerCase();
    if (s){
      const onlyEndOps = s.popFront===0 && s.pushFront===0;
      const onlyFrontBack = (s.appendEnd>0 && s.popFront>0) || (s.pushFront>0);
      if (onlyFrontBack) return 'queue';
      if (onlyEndOps && (s.appendEnd>0 || s.popEnd>0) && s.indexSet===0){
        if (nameLower.includes('queue') || nameLower==='q') return 'queue';
        return 'stack';
      }
    }
    if (nameLower.includes('stack') || nameLower==='stk') return 'stack';
    if (nameLower.includes('queue') || nameLower==='q' || nameLower==='dq' || nameLower.includes('deque')) return 'queue';
    return 'array';
  }
  if (value instanceof PyDict) return 'map';
  if (value instanceof PySet) return 'set';
  if (value instanceof PyTuple) return 'tuple';
  if (value instanceof PyObject){
    const shape = objShape(value);
    if (shape === 'linked_list') return 'linked_list_head';
    if (shape === 'tree') return 'tree_root';
    if (shape === 'graph') return 'graph_node';
    return 'object';
  }
  return 'scalar';
}

// Walk a linked-list head, return ordered node list + cycle info. Cap traversal.
function walkLinkedList(head, maxLen=300){
  const nodes = [];
  const seen = new Map(); // id -> index
  let cur = head;
  let cycleBackTo = -1;
  while (cur instanceof PyObject && nodes.length < maxLen){
    if (seen.has(cur.id)){ cycleBackTo = seen.get(cur.id); break; }
    seen.set(cur.id, nodes.length);
    nodes.push(cur);
    cur = cur.attrs.get('next');
  }
  return { nodes, cycleBackTo };
}

// Walk a binary tree, return {id,val,leftId,rightId,depth,x} layout-ready list. Cap size.
function walkTree(root, maxNodes=200){
  const nodes = [];
  const idToNode = new Map();
  let counter = { leaf: 0 };
  function assignX(node, depth){
    if (!(node instanceof PyObject) || nodes.length >= maxNodes) return null;
    if (idToNode.has(node.id)) return idToNode.get(node.id); // guard against shared refs
    const rec = { id: node.id, val: nodeAttrLabel(node.attrs, node.id), depth, x:0, leftId:null, rightId:null, obj: node };
    nodes.push(rec);
    idToNode.set(node.id, rec);
    const l = node.attrs.get('left');
    const r = node.attrs.get('right');
    const lrec = assignX(l, depth+1);
    rec.x = counter.leaf; // placeholder, fixed below for leaves
    if (lrec) rec.leftId = lrec.id;
    if (!lrec) { rec.x = counter.leaf; counter.leaf++; }
    const rrec = assignX(r, depth+1);
    if (rrec) rec.rightId = rrec.id;
    if (lrec && rrec) rec.x = (lrec.x + rrec.x) / 2;
    else if (lrec && !rrec) rec.x = lrec.x + 0.5;
    else if (!lrec && rrec) rec.x = rrec.x - 0.5;
    else if (!lrec && !rrec){ /* x already assigned above */ }
    return rec;
  }
  assignX(root, 0);
  return nodes;
}

// Walk a graph from a starting node object (BFS over .neighbors/.edges/.children), cap size.
function walkGraphFromNode(startNode, maxNodes=100){
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const queue = [startNode];
  seen.add(startNode.id);
  while (queue.length && nodes.length < maxNodes){
    const n = queue.shift();
    const val = nodeAttrLabel(n.attrs, n.id);
    nodes.push({ id: n.id, val, obj: n });
    const nb = n.attrs.get('neighbors') || n.attrs.get('edges') || n.attrs.get('children');
    if (nb instanceof PyList){
      for (const it of nb.items){
        const target = it.value;
        if (!(target instanceof PyObject)) continue;
        edges.push({ from: n.id, to: target.id });
        if (!seen.has(target.id)){ seen.add(target.id); queue.push(target); }
      }
    }
  }
  return { nodes, edges };
}

// Detect adjacency-list graphs represented as dict[key] = list_of_keys (common competitive pattern)
function isAdjacencyDict(d){
  if (!(d instanceof PyDict) || d.entries.length === 0) return false;
  return d.entries.every(e => e.value instanceof PyList &&
    (typeof e.key === 'number' || typeof e.key === 'string'));
}

const exportObj = { UsageTracker, classifyValue, objShape, walkLinkedList, walkTree, walkGraphFromNode, isAdjacencyDict };
if (typeof module !== 'undefined') module.exports = exportObj;
else window.PyDetector = exportObj;
