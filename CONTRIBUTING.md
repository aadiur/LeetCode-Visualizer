# Contributing

Thanks for taking a look. This project is a real (not regex-based) Python
interpreter + generic data-structure visualizer, built for LeetCode-style
array / stack / linked-list / tree / graph problems.

## Project layout

```
engine/            The actual engine — framework-agnostic, no DOM assumptions
                    except in renderer.js / viz-main.js.
  lexer.js          Python tokenizer.
  parser.js         Recursive-descent + Pratt parser → AST.
  runtime.js        Runtime object model (PyList/PyDict/PySet/PyObject/...),
                    each with a stable id for animation continuity.
  interpreter.js    Generator-based tree-walking evaluator. Real scopes, real
                    recursion (via `yield*` delegation), step/time budgets.
  detector.js       Classifies a value's *visual role* (array / stack / queue /
                    grid / linked list / tree / graph / map / set) from shape
                    and usage — never from problem name.
  engine.js         Orchestration: runs code, snapshots world state per step,
                    auto-synthesizes example arguments for bare LeetCode
                    submissions, classifies errors.
  renderer.js       Pure DOM/SVG drawing functions, one per visual role, with
                    FLIP-based animation.
  viz-main.js       Wires the above into the standalone page's UI (live
                    typing, auto-play, restart/speed controls).
  style.css         Shared visual styling (also reused, scoped, by the
                    extension's in-page panel).

content/            Chrome extension content scripts (LeetCode page integration).
background.js       Extension service worker (lifecycle only — no backend).
manifest.json       Extension manifest (MV3).
page_template.html  Markup used to build leetcode-visualizer.html.
build.js            Bundles engine/*.js + style.css into a single-file
                     leetcode-visualizer.html (each source file is wrapped in
                     its own IIFE so top-level names don't collide when merged).
tests/
  test_suite.js       Interpreter regression tests — real LeetCode problems,
                       asserted against real Python output. Run with
                       `npm test`.
  dom_smoke_test.js   A small hand-rolled DOM shim (no jsdom dependency) that
                       loads the actual engine files, simulates clicks/typing,
                       and asserts nothing throws. Run with `npm run test:dom`.
```

## Making a change

1. Edit files under `engine/` (or `content/` for extension-specific behavior).
   Never edit `leetcode-visualizer.html` directly — it's a generated build
   artifact (see `build.js`); your edits will be overwritten.
2. Run `npm test` — this rebuilds the bundle first (`pretest`), then runs the
   regression suite. All 17 cases must pass.
3. Run `npm run test:dom` to sanity-check the UI wiring didn't break.
4. If you touched `engine/renderer.js` or `engine/viz-main.js`, please also
   open `leetcode-visualizer.html` in an actual browser and eyeball it — the
   DOM shim catches crashes, not visual regressions.
5. If you added a new Python language feature (a builtin, a syntax form),
   add a regression case to `tests/test_suite.js` with a real LeetCode
   problem that needs it, not just a synthetic snippet.

## Design rules this project tries to hold to

- **No problem-specific logic.** The interpreter and detector must not
  contain anything like `if (functionName === 'twoSum')`. Correctness comes
  from actually running the code and classifying by shape/usage, not from
  recognizing which problem it is.
- **Python is the fully-supported path.** C++/Java/JavaScript are
  intentionally left on a best-effort heuristic engine and marked "Beta" in
  the UI — please don't quietly promote them to "supported" without giving
  them the same real lexer/parser/interpreter treatment Python has.
- **No backend.** Everything runs client-side in the browser. If a change
  needs a server or a subprocess, it's probably the wrong approach for this
  project — reconsider whether it can be done as a client-side interpreter
  feature instead.

## Reporting a visualization bug

The most useful bug report is: the exact Python snippet, and a short
description/screenshot of what rendered vs. what you expected. Most bugs
found so far have been "the renderer assumed a specific attribute name" type
issues (e.g. assuming `.val` when a class used `.data`) — a concrete snippet
makes those trivial to fix and turn into a regression test.
