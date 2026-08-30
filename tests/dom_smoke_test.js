"use strict";
const fs = require('fs');

class FakeClassList {
  constructor(node){ this.node = node; this.set = new Set(); }
  add(...c){ c.forEach(x=>x && this.set.add(x)); }
  remove(...c){ c.forEach(x=>this.set.delete(x)); }
  contains(c){ return this.set.has(c); }
  toggle(c){ if (this.set.has(c)) this.set.delete(c); else this.set.add(c); }
}
let idCounter = 0;
class FakeNode {
  constructor(tag){
    this.tagName = (tag||'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.classList = new FakeClassList(this);
    this.style = {};
    this._text = '';
    this._html = '';
    this.dataset = {};
    this._listeners = {};
    this._id = ++idCounter;
    this.disabled = false;
    this.value = '';
    this.scrollTop = 0;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.checked = false;
  }
  set id(v){ this.attrs.id = v; registry.set(v, this); }
  get id(){ return this.attrs.id; }
  set className(v){ this.classList = new FakeClassList(this); (v||'').split(/\s+/).filter(Boolean).forEach(c=>this.classList.add(c)); }
  get className(){ return [...this.classList.set].join(' '); }
  set textContent(v){ this._text = String(v); this.children = []; }
  get textContent(){ return this._text; }
  set innerHTML(v){ this._html = v; this.children = []; }
  get innerHTML(){ return this._html; }
  appendChild(c){ this.children.push(c); c.parentNode = this; return c; }
  insertAdjacentElement(pos, el){ this.parentNode && this.parentNode.appendChild(el); }
  setAttribute(k,v){ this.attrs[k]=v; if (k==='data-flip-key') this.dataset.flipKey=v; if (k==='id') this.id = v; }
  getAttribute(k){ return this.attrs[k]; }
  addEventListener(ev,fn){ this._listeners[ev]=this._listeners[ev]||[]; this._listeners[ev].push(fn); }
  dispatch(ev, evtObj){ (this._listeners[ev]||[]).forEach(fn=>fn(evtObj||{})); }
  querySelectorAll(sel){
    // supports simple class selectors like '.trace-card.current'
    const classes = sel.replace(/^\./,'').split('.');
    const out = [];
    const walk = n => { if (classes.every(c=>n.classList && n.classList.contains(c))) out.push(n); (n.children||[]).forEach(walk); };
    walk(this);
    return out.filter(n=>n!==this);
  }
  querySelector(sel){ const r = this.querySelectorAll(sel); return r[0]||null; }
  scrollIntoView(){}
  getBoundingClientRect(){ return {left:0,top:0,width:10,height:10}; }
}
const registry = new Map();
const rootBody = new FakeNode('body');

global.document = {
  createElement: tag => new FakeNode(tag),
  createElementNS: (ns, tag) => new FakeNode(tag),
  querySelector: sel => {
    if (sel.startsWith('#')) return registry.get(sel.slice(1)) || null;
    return rootBody.querySelector(sel);
  },
  querySelectorAll: sel => rootBody.querySelectorAll(sel),
  getElementById: id => registry.get(id) || null,
  body: rootBody,
  addEventListener: () => {},
};
global.window = global;
global.requestAnimationFrame = fn => setTimeout(fn, 0);
global.addEventListener = () => {};
global.window.addEventListener = () => {};
global.window.prompt = () => null;
global.escapeHtml = null;

function loadBrowserStyle(path){
  const code = fs.readFileSync(path, 'utf8');
  try {
    const fn = new Function('window', 'document', code);
    fn(global.window, global.document);
    console.log('OK   ' + path);
  } catch (e){
    console.log('FAIL ' + path + '  ::  ' + e.name + ': ' + e.message);
    console.log(e.stack.split('\n').slice(0,4).join('\n'));
    throw e;
  }
}

// --- build a minimal DOM tree matching leetcode-visualizer.html's ids, registered by id ---
function make(tag, id, cls){
  const n = new FakeNode(tag);
  if (id) n.id = id;
  if (cls) n.className = cls;
  rootBody.appendChild(n);
  return n;
}
make('textarea', 'sourceEdit');
make('div', 'lineHighlight');
make('div', 'errLineMarker');
make('div', 'entryBar');
make('div', 'entryNote');
make('input', 'entryInput');
make('div', 'langNotice');
make('button', 'runBtn');
make('input', 'liveToggle').checked = true;
make('span', 'liveStatus');
make('div', 'traceScroll');
make('span', 'stepMeta');
make('div', 'vizScroll');
make('div', 'narration');
make('div', 'outputConsole');
make('div', 'errorBanner');
make('button', 'restartBtn');
for (const spd of [1400,550,220]){
  const b = new FakeNode('button');
  b.className = 'speed-btn' + (spd===550?' active':'');
  b.dataset.speed = String(spd);
  rootBody.appendChild(b);
}
make('span', 'liveProgress');
rootBody.querySelectorAll = FakeNode.prototype.querySelectorAll.bind(rootBody);
// lang chips
for (const lang of ['python','cpp','java','javascript']){
  const chip = new FakeNode('div');
  chip.className = 'lang-chip' + (lang==='python' ? ' active' : '');
  chip.dataset.lang = lang;
  chip.textContent = lang;
  rootBody.appendChild(chip);
}

const files = ['lexer.js','parser.js','runtime.js','interpreter.js','detector.js','engine.js','renderer.js','viz-main.js'];
for (const f of files) loadBrowserStyle('./engine/' + f);

console.log('\n--- simulating Run click ---');
try {
  registry.get('runBtn').dispatch('click');
  console.log('Run click handled OK');
  console.log('trace children:', registry.get('traceScroll').children.length);
  console.log('viz children:', registry.get('vizScroll').children.length);
  console.log('narration text:', registry.get('narration').innerHTML.slice(0,80));
  console.log('error banner classes:', [...registry.get('errorBanner').classList.set]);
  console.log('lineHighlight top after run:', registry.get('lineHighlight').style.top, 'display:', registry.get('lineHighlight').style.display);
} catch(e){
  console.log('CLICK CRASH:', e.name, e.message);
  console.log(e.stack);
}

console.log('\n--- simulating live typing (debounced auto-run) ---');
try {
  const ta = registry.get('sourceEdit');
  ta.value = ta.value + '\n# a comment appended while typing\n';
  ta.dispatch('input', {});
  console.log('typing dispatched, waiting for debounce...');
  setTimeout(() => {
    console.log('after debounce: trace children:', registry.get('traceScroll').children.length);
    console.log('live status text:', registry.get('liveStatus').textContent);
    console.log('lineHighlight display:', registry.get('lineHighlight').style.display);

    console.log('\n--- simulating typing INVALID code mid-edit (should NOT nuke viz or show big error) ---');
    const vizBefore = registry.get('vizScroll').children.length;
    ta.value = ta.value + '\n    if x ==\n'; // syntactically broken
    ta.dispatch('input', {});
    setTimeout(() => {
      console.log('viz children unchanged during invalid mid-type:', registry.get('vizScroll').children.length === vizBefore, '(before='+vizBefore+', after='+registry.get('vizScroll').children.length+')');
      console.log('live status during invalid code:', registry.get('liveStatus').textContent);
      console.log('error banner shown (should be false, since a good run already happened):', registry.get('errorBanner').classList.contains('show'));
      console.log('\nALL DONE');
    }, 900);
  }, 900);
} catch(e){
  console.log('TYPING SIM CRASH:', e.name, e.message);
  console.log(e.stack);
}
