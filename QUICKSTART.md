# AIR Visualizer — Quick Start (2 Minutes)

## 🚀 Get Started Right Now

### Step 1: Open the File
Download and open **`leetcode-visualizer.html`** in your browser.
No installation, no build step, no dependencies — it just works.

### Step 2: See an Example
The app loads with **Bubble Sort** by default.
- Left panel: Source code
- Middle panel: AIR events (semantic breakdown)
- Right panel: Visualization (animated arrays, stacks, etc.)

### Step 3: Try the Controls

**At the top:**
- Language chips (C++ / Python / Java / JavaScript) — click to switch
- Example dropdown — load Bubble Sort, Two-Pointer, Stack, Queue, or Anomaly examples
- Mode toggle — switch between LIVE (auto-update) and STEP (frame-by-frame)

**At the bottom:**
- ⏮ Step back / ▶ Play / ⏭ Step forward
- Slider — seek to any step in the execution
- Status — shows current step and total steps

### Step 4: Write Your Own Code
Click "Blank — write your own" in the dropdown, then type in the left panel.

**Example code to try:**
```cpp
vector<int> arr = {3,1,4,1,5,9};
for(int i=0;i<arr.size();i++){
  for(int j=i+1;j<arr.size();j++){
    if(arr[i]>arr[j]){
      swap(arr[i], arr[j]);
    }
  }
}
```

As you type, the **visualization updates in real-time** in the right panel.

### Step 5: Explore the Visualization
- **Arrays**: See cells with values, move left/right as you swap
- **Stacks**: Watch cells stack vertically
- **Queues**: Watch cells appear at the back, disappear at the front
- **Variables**: Live values in the "VARIABLES" section below
- **Pointers**: See i, j, l, r labels moving as loop counters change
- **Anomalies**: Red warning banner if loop is infinite

### Step 6: Control Playback
- **Play button** (▶): Auto-steps through entire execution
- **Slider**: Click and drag to jump to any step instantly
- **Step buttons** (⏮ / ⏭): Go back or forward one step at a time

---

## 📋 Supported Code

### Languages
✅ C++ (std::vector, stack, queue, sort, etc.)  
✅ Python (lists, range, append, pop, etc.)  
✅ Java (arrays, Stack, Queue, etc.)  
✅ JavaScript (arrays, push, pop, etc.)

### Data Structures
✅ Arrays: `vector<int>`, `int[]`, `list`, etc.  
✅ Stacks: `stack<T>` or hint with `// stack`  
✅ Queues: `queue<T>` or hint with `// queue`  
✅ Variables: `int x = 5`, `let x = 5`, etc.

### Operations
✅ push, pop, append, remove  
✅ sort, reverse, swap  
✅ for loops (C-style and Python range-based)  
✅ while loops  
✅ if/else  
✅ +, -, *, /, comparisons, array indexing  

---

## 🎯 Key Features

### Live Typing
Type code, watch it animate **instantly** — no "compile" button, no waiting.

### Cross-Language Equivalence
Same algorithm in 4 languages produces **identical visualization**.
Great for learning: write in one language, understand the algorithm in another.

### Anomaly Detection
Automatically flags:
- Infinite loops (loop counter moving wrong direction)
- Loops that never terminate
- Backward array reversals that don't work

### Frame-by-Frame Debugging
Click any line in the left gutter → jumps to the first event affecting that line.
Click any AIR event → visualization syncs to that step.

### Smooth Animations
Elements smoothly enter/exit/move — not jarring or flickery.
Powered by CSS transforms for 60fps performance.

---

## 💡 Tips & Tricks

### Hint for Python Stacks/Queues
Python lists are generic, so add a comment:
```python
st = []  # stack
st.append(5)
st.pop()
```
The `# stack` hint tells the visualizer to treat this list as a stack.

Similarly for queues:
```python
q = []  # queue
q.append(1)
q.popleft()
```

### Click the Gutter to Jump
The line numbers on the left are clickable. Click line 3 → visualization jumps to the first event affecting line 3.

### Use the Slider for Instant Rewind
Drag the timeline slider at the bottom to jump to any step instantly. Perfect for reviewing a specific moment.

### Switch Languages Without Losing State
Select a different language chip → example code updates. Your understanding of the algorithm doesn't change; just the syntax.

---

## 🔧 Troubleshooting

### "I don't see any visualization"
- Make sure you're creating a container: `vector<int> arr = {...}`
- For Python stacks: add `# stack` comment
- Check the AIR stream (middle panel) — if you see events, the engine is working

### "The swap isn't working"
- Make sure you're using `swap(arr[i], arr[j])` with array indices
- Single-element swap like `swap(a, b)` also works, but you need variables declared first

### "The loop seems to run forever"
- Check if your loop counter moves **away** from the exit condition
- Example: `for(i=0; i<n; i--)` is wrong (i decreases from 0)
- A red warning banner will appear if anomaly is detected

### "How do I clear the visualization?"
- Click example dropdown → select "Blank — write your own"
- Start typing new code

---

## 📚 Examples to Try

### Example 1: Selection Sort
```cpp
vector<int> arr = {4,2,7,1,9};
for(int i=0;i<arr.size();i++){
  int min=i;
  for(int j=i+1;j<arr.size();j++){
    if(arr[j]<arr[min]) min=j;
  }
  swap(arr[i], arr[min]);
}
```
Watch: Element-by-element, smallest gets selected and swapped into position.

### Example 2: Linear Search
```python
arr = [10,20,30,40,50]
target = 30
for i in range(len(arr)):
    if arr[i] == target:
        result = i
```
Watch: Pointer moves through array until target found.

### Example 3: Stack with Parentheses Check (simplified)
```javascript
let st = []; // stack
let s = "((()))";
for(let i=0;i<s.length;i++){
  if(s[i]=='(') st.push(1);
  else if(s[i]==')' && st.length>0) st.pop();
}
```
Watch: Stack grows with opening parens, shrinks with closing.

### Example 4: Merge Two Sorted Arrays
```cpp
vector<int> a = {1,3,5};
vector<int> b = {2,4,6};
vector<int> result;
int i=0, j=0;
while(i<a.size() && j<b.size()){
  if(a[i]<b[j]) result.push_back(a[i++]);
  else result.push_back(b[j++]);
}
```
Watch: Two pointers converge, result array grows.

---

## 🎓 Learning Tips

### Understand via Visualization
1. **Read** the algorithm code
2. **Watch** the visualization — see data move
3. **Read** the AIR stream — understand what each operation means
4. **Pause** (click a step) — think about why it happened
5. **Modify** the code — see how changes affect the algorithm

### Compare Languages
1. Load "Bubble Sort" in C++
2. Watch the visualization
3. Switch to Python → watch the same algorithm
4. Switch to Java → identical visualization
5. Realize: **algorithm transcends syntax**

### Test Edge Cases
- Empty array: `vector<int> arr = {}`
- Single element: `vector<int> arr = {5}`
- Already sorted: `vector<int> arr = {1,2,3,4,5}`
- Reverse sorted: `vector<int> arr = {5,4,3,2,1}`
- Duplicates: `vector<int> arr = {3,3,3}`

---

## ⌨️ Keyboard Shortcuts

Currently:
- **Tab** in code editor → insert 2 spaces

Future (coming soon):
- Space → Play/Pause
- ← / → → Step back/forward
- G → Go to line
- ? → Help

---

## 📖 Next Steps

1. **Read** `README.md` for detailed architecture & features
2. **See** `VALIDATION_REPORT.md` for comprehensive test results
3. **Explore** the preloaded examples (Bubble Sort, Two-Pointer, Stack, Queue, Anomaly)
4. **Write** your own DSA solutions and watch them animate
5. **Learn** by comparing across languages

---

## 🤔 Common Questions

**Q: Can I save my code?**
A: Yes! Your browser's developer tools (F12 → Elements) show the textarea content. Copy it anytime. Future: built-in export.

**Q: Can I record videos of the animation?**
A: Yes! Use your browser's built-in screen recorder (Chrome: Ctrl+Alt+S) or tools like OBS.

**Q: Does it work on mobile?**
A: Yes! Responsive design adapts to smaller screens. Touch-friendly controls.

**Q: Can I use this for interviews?**
A: Yes! Share the link + your code. Interviewers can watch your algorithm in real-time, see if your logic is correct.

**Q: What if my code has errors?**
A: The engine tries its best. Unrecognized lines are logged but won't crash the app. You'll see "UNKNOWN" in the AIR stream.

---

## 🎉 You're Ready!

Open the file and start visualizing. The interface is designed to be intuitive — explore, click around, break things (you can't), learn!

**Happy Coding!** 🚀

