"use strict";
// Build the single-file standalone leetcode-visualizer.html from engine/*.js + style.css + page_template.html.
// Each file is wrapped in its own IIFE so top-level const/class names (exportObj, tokenize, PyError, ...)
// don't collide when merged into one <script> block — this is what separate <script src> tags give for
// free, and is required for the bundle to not throw "already declared" on load.
const fs = require('fs');

const files = ['lexer.js','parser.js','runtime.js','interpreter.js','detector.js','engine.js','renderer.js','viz-main.js'];
const jsBundle = files.map(f => {
  const code = fs.readFileSync('engine/'+f, 'utf8');
  return '/* ---- engine/'+f+' ---- */\n(function(){\n' + code + '\n})();';
}).join('\n\n');
const css = fs.readFileSync('engine/style.css', 'utf8');
const template = fs.readFileSync('page_template.html', 'utf8');

const html = template.replace('__CSS__', () => css).replace('__JS__', () => jsBundle);
fs.writeFileSync('leetcode-visualizer.html', html);
console.log('built leetcode-visualizer.html —', html.length, 'bytes');

// sanity: exactly one script block, no dup, and it parses
const scriptCount = (html.match(/<script>/g) || []).length;
if (scriptCount !== 1) throw new Error('expected exactly 1 <script> block, found ' + scriptCount);
const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
new Function('window', 'document', m[1]);
console.log('OK: single script block, syntax valid');
