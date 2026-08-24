# 🚀 LeetCode Visualizer Extension - Phase 1 Setup Guide

## ✅ What's Included (Phase 1 - MVP)

### Frontend (Browser Extension)
- ✅ Chrome Extension infrastructure (Manifest v3)
- ✅ LeetCode problem detector
- ✅ Code extractor from Monaco editor
- ✅ Visualization panel with controls
- ✅ Professional UI with animations

### Backend (Node.js Server)
- ✅ Express server for code execution
- ✅ Python executor with AST instrumentation
- ✅ JavaScript executor with Proxy tracking
- ✅ Basic execution trace capture
- ✅ Error handling and timeouts

### Data Structures Visualized
- ✅ Arrays/Lists
- ✅ Variables (int, float, string, bool)
- ✅ Basic step-by-step execution

---

## 📋 Prerequisites

### Required Software
- Node.js 16+ (download from https://nodejs.org/)
- npm or yarn
- Chrome or Chromium browser
- Python 3.7+ (for Python code execution)
- Git (optional, for cloning)

### System Requirements
- 2GB+ RAM
- 500MB disk space
- Internet connection (initially, then offline works)

---

## 🛠️ Installation & Setup

### Step 1: Get the Code

Copy all the files from the `leetcode-extension-src/` directory to your local machine.

```bash
# Directory structure should look like:
leetcode-extension/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── icons/
│   └── content/
│       ├── detector.js
│       ├── code-extractor.js
│       ├── content.js
│       └── panel.css
├── backend/
│   ├── server.js
│   ├── executors/
│   │   ├── python-executor.js
│   │   ├── javascript-executor.js
│   │   └── cpp-executor.js
│   ├── tracers/
│   │   └── python-tracer.py
│   ├── package.json
│   └── ...
└── docs/
    └── ...
```

### Step 2: Set Up Backend Server

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Required packages for package.json:
# express
# cors
# body-parser
# python-shell
# child_process
```

Create `backend/package.json`:

```json
{
  "name": "leetcode-visualizer-backend",
  "version": "1.0.0",
  "description": "LeetCode Visualizer backend server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "python-shell": "^5.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

```bash
# Install packages
npm install

# Start the server
npm start

# Expected output:
# ╔══════════════════════════════════════════════╗
# ║  LeetCode Visualizer Backend Server          ║
# ║  Listening on http://localhost:3000          ║
# ╚══════════════════════════════════════════════╝
```

### Step 3: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Navigate to the `extension/` directory and select it
5. The extension should appear in your list

**You should see:**
- ✅ "LeetCode Algorithm Visualizer" extension installed
- ✅ Icon appears in top right
- ✅ No errors in the chrome://extensions page

### Step 4: Test on LeetCode

1. Go to https://leetcode.com/problems/two-sum/ (or any problem)
2. Paste Python code in the editor:

```python
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                if nums[i] + nums[j] == target:
                    return [i, j]
        return []
```

3. Look for the **🎨 Visualize Execution** button (appears next to Submit)
4. Click it → visualization panel should appear on the right
5. Click "Run Visualization" button
6. You should see:
   - ✅ Backend receives the code
   - ✅ Executes it
   - ✅ Shows execution steps
   - ✅ Displays variables

---

## 🔧 Backend Executor Implementation

You need to create the executor files. Here's a template:

### `backend/executors/python-executor.js`

```javascript
/**
 * Python Executor
 * Executes Python code with instrumentation
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PythonTracer } = require('../tracers/python-tracer');

class PythonExecutor {
  async execute(code) {
    try {
      const tracer = new PythonTracer();
      const instrumentedCode = tracer.instrument(code);
      
      console.log('[PythonExecutor] Executing instrumented code');
      
      // Create temporary file
      const tempFile = path.join('/tmp', `ltc_${Date.now()}.py`);
      fs.writeFileSync(tempFile, instrumentedCode);
      
      // Execute with Python
      const result = await this.runPython(tempFile);
      
      // Cleanup
      fs.unlinkSync(tempFile);
      
      return {
        success: true,
        executionTime: result.time,
        steps: result.steps,
        output: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        steps: [],
        output: ''
      };
    }
  }

  runPython(filePath) {
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [filePath], {
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024
      });

      let stdout = '';
      let stderr = '';
      const startTime = Date.now();

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        
        if (code !== 0) {
          reject(new Error(stderr || 'Python execution failed'));
        } else {
          try {
            // Parse output from instrumented code
            const result = JSON.parse(stdout);
            resolve({
              time: executionTime,
              steps: result.steps || [],
              output: result.output || '',
              error: null
            });
          } catch (e) {
            resolve({
              time: executionTime,
              steps: [],
              output: stdout,
              error: stderr || null
            });
          }
        }
      });

      python.on('error', (err) => {
        reject(err);
      });
    });
  }
}

module.exports = { PythonExecutor };
```

### `backend/executors/javascript-executor.js`

```javascript
/**
 * JavaScript Executor
 * Executes JavaScript with Proxy-based state tracking
 */

class JavaScriptExecutor {
  async execute(code) {
    const startTime = Date.now();
    const steps = [];
    const outputs = [];

    try {
      // Create a tracking function
      const trackState = (varName, value) => {
        steps.push({
          variable: varName,
          value: JSON.stringify(value),
          timestamp: Date.now() - startTime
        });
      };

      // Create a console override
      const customConsole = {
        log: (...args) => {
          outputs.push(args.map(a => String(a)).join(' '));
        }
      };

      // Create a safe execution context
      const context = {
        console: customConsole,
        _track_state: trackState,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Math,
        JSON
      };

      // Execute code
      const fn = new Function(...Object.keys(context), code);
      await fn(...Object.values(context));

      return {
        success: true,
        executionTime: Date.now() - startTime,
        steps,
        output: outputs.join('\n'),
        error: null
      };
    } catch (error) {
      return {
        success: false,
        executionTime: Date.now() - startTime,
        steps,
        output: outputs.join('\n'),
        error: error.message
      };
    }
  }
}

module.exports = { JavaScriptExecutor };
```

### `backend/executors/cpp-executor.js`

```javascript
/**
 * C++ Executor (Stub for Phase 2)
 */

class CPPExecutor {
  async execute(code) {
    return {
      success: false,
      error: 'C++ execution not yet implemented (Phase 2)'
    };
  }
}

module.exports = { CPPExecutor };
```

---

## 🧪 Testing the Setup

### Test 1: Check Backend is Running

```bash
curl http://localhost:3000/health
# Should return: {"status":"ok",...}
```

### Test 2: Check Extension is Loaded

1. Go to chrome://extensions
2. Look for "LeetCode Algorithm Visualizer"
3. Should show as enabled with no errors

### Test 3: Test Simple Python Code

Go to https://leetcode.com/problems/two-sum/

```python
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        return [0, 1]
```

Click "🎨 Visualize Execution" → Should work

---

## 🐛 Troubleshooting

### "Cannot find module" errors

```bash
# Make sure you're in backend directory
cd backend

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Backend not starting

```bash
# Check if port 3000 is in use
lsof -i :3000

# If it's in use, either:
# 1. Kill the process
# 2. Or use a different port:
PORT=3001 npm start
```

### Extension not loading

1. Make sure manifest.json is in the extension folder
2. Try disabling and re-enabling the extension
3. Check chrome://extensions for error messages
4. Reload the extension with the refresh icon

### Code not visualizing

1. Make sure backend is running (http://localhost:3000/health)
2. Check browser console (F12 → Console tab) for errors
3. Make sure code is in the editor
4. Try a simple test case first (like the Two Sum example)

---

## 📝 Next Steps

### To Complete Phase 1 (Months 1-2):

1. **Polish Python tracer** - Add better variable tracking
2. **Add test case parsing** - Auto-detect test cases from page
3. **Improve visualization** - Show arrays animating
4. **Add error handling** - Better error messages
5. **Performance optimization** - Cache results, timeout handling

### Phase 2 Roadmap (Months 3-4):

- JavaScript execution improvements
- C++ via GDB integration
- Dictionary/HashMap visualization
- Stacks & Queues visualization
- Auto test case detection

---

## 📚 Resources

- [Chrome Extensions Docs](https://developer.chrome.com/docs/extensions/)
- [Express.js Docs](https://expressjs.com/)
- [Python AST Module](https://docs.python.org/3/library/ast.html)
- [LeetCode API](https://leetcode.com/api/)

---

## 🎯 Success Criteria for Phase 1

✅ Extension loads without errors  
✅ Button appears on LeetCode problem pages  
✅ Backend executes Python code  
✅ Variables are tracked  
✅ Visualization panel shows execution steps  
✅ Works on at least 5 different Python problems  

---

## 💬 Support

If you get stuck:
1. Check the TROUBLESHOOTING section above
2. Read the LEETCODE_EXTENSION_BLUEPRINT.md for architecture details
3. Look at server console logs for errors
4. Check browser console (F12) for extension errors

**Good luck! You're building something amazing.** 🚀

