# Algorithm Visualizer

A real Python interpreter, running entirely in your browser, that turns any
array / stack / linked-list / tree / graph LeetCode solution into a live,
animated visualization — as you type. No backend. No per-problem hardcoding.

![CI](https://img.shields.io/badge/tests-17%2F17%20passing-3fe0c5)
![license](https://img.shields.io/badge/license-MIT-blue)
![no backend](https://img.shields.io/badge/backend-none%20required-informational)

```
class Solution:
    def isValid(self, s: str) -> bool:
        stack = []
        pairs = {')': '(', ']': '[', '}': '{'}
        for c in s:
            if c in '([{':
                stack.append(c)
            elif not stack or stack.pop() != pairs[c]:
                return False
        return not stack
```
→ paste that in, and watch a real vertical stack with a TOP marker animate
push/pop/mismatch in real time, synced to the highlighted source line.

---

## Why this exists

Most "algorithm visualizer" tools either hardcode an animation per named
problem, or fake execution by pattern-matching source *text* against a list
of regexes (`if line matches "for X in range"` → emit a loop event). The
second approach looks like a real interpreter until it hits an `elif`, a
helper closure, a tuple-keyed set, or a class it doesn't recognize — and then
it either silently does nothing or gives the wrong answer.

This project actually **parses Python into an AST and executes it** with a
real tree-walking interpreter: real scopes, real recursion, real objects.
Correctness comes from running your code, not from recognizing it.

## Features

- **Real Python execution** — a hand-written lexer → recursive-descent/Pratt
  parser → generator-based tree-walking interpreter. Full `if/elif/else`,
  `while`/`for` with `break`/`continue`, functions, classes, recursion,
  closures, `nonlocal`/`global`, comprehensions, f-strings, slicing, and the
  common builtins/methods you'd actually use in a LeetCode solution.
- **Generic data-structure detection** — a list is classified as an array,
  stack, queue, or 2D grid by *how it's actually used* (only ever
  `.append()`/`.pop()`-ed → stack; `.append()` + `.popleft()` → queue; list of
  lists → grid), not by variable name or problem identity. An object with a
  `.next`-shaped attribute becomes an animated linked-list chain; `.left`/
  `.right` becomes a tree; `.neighbors`/`.edges` becomes a graph.
- **Live, dynamic playback** — the code editor is always editable (never
  swaps to a read-only view). Pause typing for a moment and it silently
  re-runs and replays the whole execution automatically, like a video — no
  scrubber, no play/pause button to manage. Mid-keystroke syntax errors don't
  nuke the last good animation or throw up a scary red banner.
- **Recursion call-stack panel** — because recursion is real (via generator
  delegation), the current call stack is always visualizable for free.
- **Auto-generated example input** — a bare LeetCode submission with no
  driver code gets sensible example arguments synthesized from parameter
  names/annotations (`nums`+`target` → a solvable pair, `head`/`l1`/`l2` → a
  built linked list, `root` → a built tree, `grid` → an island-style char
  grid, ...) — fully editable if it guesses wrong.
- **Zero backend** — everything above runs client-side. The standalone tool
  is a single self-contained HTML file; the Chrome extension's in-page panel
  uses the same engine directly, no server round-trip.
- **Chrome extension** — adds a "Visualize Execution" button next to
  LeetCode's Submit button, with the same live visualization inline on the
  problem page.

## Quick start

### Standalone tool

No install, no build step required to use it:

```
open leetcode-visualizer.html   # or just double-click it
```

Everything (interpreter, renderer, styles) is bundled into that one file.

### Chrome extension

1. `chrome://extensions` → enable **Developer mode** (top right).
2. **Load unpacked** → select this repository's root folder.
3. Open any LeetCode problem, write/paste a Python solution, click
   **🎨 Visualize Execution** next to Submit.

### Rebuilding the standalone bundle after editing `engine/*`

```
npm run build     # regenerates leetcode-visualizer.html from engine/*.js + engine/style.css
npm test          # rebuilds, then runs the interpreter regression suite
npm run test:dom  # loads the real engine files into a hand-rolled DOM shim and
                   # simulates clicks/typing to catch wiring bugs (no jsdom needed)
```

`leetcode-visualizer.html` is a **generated file** (see `build.js`) — edit
`engine/*.js` and `page_template.html`, not the generated HTML directly.

## How it works

```
source code
     │
     ▼
  lexer.js          tokenize (handles Python's significant indentation)
     │
     ▼
  parser.js          recursive-descent + Pratt expression parser → AST
     │                (if/elif/else properly chained, functions, classes,
     │                 comprehensions, f-strings, slicing, ...)
     ▼
  interpreter.js     generator-based tree-walking evaluator
     │                • real Env scope chain (closures actually work)
     │                • real recursion via `yield*` delegation
     │                  → call stack falls out for free
     │                • step/time budgets → infinite loops can't hang the tab
     ▼
  engine.js          runs the module, snapshots a frozen "world" (all live
     │                variables + a reachable-object heap, each with a
     │                stable id) after every executed statement
     ▼
  detector.js         classifies each container by shape + accumulated usage:
     │                 array / stack / queue / grid / linked-list / tree /
     │                 graph / map / set — never by problem name
     ▼
  renderer.js         draws the current role: flat cells with index labels
                       and pointer flags, a vertical stack with a TOP marker,
                       an SVG node-and-arrow chain for linked lists, an SVG
                       tree/graph layout, chip lists for maps/sets — with
                       FLIP-based motion so elements slide/highlight instead
                       of popping between steps.
```

## What's real vs. scoped out

**Python** is the fully supported path — real lexer/parser/interpreter,
tested against real problems (see below).

**C++ / Java / JavaScript** intentionally were *not* rewritten. The language
chips are still there and marked **Beta** with an inline note in the UI —
honest placeholders, not silently-broken promises. JavaScript is the most
natural next language to give the same real-interpreter treatment (C-like
syntax, no indentation-sensitivity); C++/Java would need a much larger effort
(real compilation, or a much bigger interpreter) to reach the same
correctness bar Python has now.

Also scoped out on purpose: multiple inheritance, decorators, metaclasses,
`async`/`await`, and exact int/float print formatting (`4/2` shows as `2`,
not Python's `2.0`). None of that shows up in typical array/stack/
linked-list/tree/graph solutions — if you hit one, please open an issue with
the snippet.

## Tested against

`npm test` runs a regression suite of real LeetCode-style problems and
asserts against real Python output: Two Sum, Binary Search, Best Time to
Buy/Sell Stock, Spiral Matrix, Set Matrix Zeroes, Number of Islands (DFS + 2D
grid + tuple-keyed set), Valid Parentheses, Daily Temperatures (monotonic
stack), Reverse Linked List, Merge Two Sorted Lists, Max Depth of Binary
Tree, Invert Binary Tree, Clone Graph (recursion + object identity map),
Merge Sort, 3Sum, Merge Intervals, Koko Eating Bananas (binary search over
the answer).

Bugs that were caught and fixed along the way, kept here because they're
the interesting part of "does this actually work":
closures that couldn't see an enclosing function's variables (the classic
"DFS helper function" pattern used in Number of Islands-style problems),
`nonlocal` not being parsed at all, tuple-keyed sets/dicts silently
colliding (`(r, c) in visited` treated every tuple as equal), a generator
expression as a call's sole argument (`sum(x for x in y)`) crashing the
parser, and a renderer that assumed every node class named its payload
`.val`/`.value` instead of, say, `.data`.

## Project layout

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full file-by-file breakdown
and the design rules the project tries to hold to (no problem-specific
logic, no backend).

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please add a regression
test in `tests/test_suite.js` for any interpreter/renderer fix.

## License

MIT — see [LICENSE](LICENSE).
