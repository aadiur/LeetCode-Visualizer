/**
 * LeetCode Visualizer Backend Server
 * Executes user code with instrumentation and returns execution trace
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PythonExecutor } = require('./executors/python-executor');
const { JavaScriptExecutor } = require('./executors/javascript-executor');
const { CPPExecutor } = require('./executors/cpp-executor');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Executors
const pythonExecutor = new PythonExecutor();
const jsExecutor = new JavaScriptExecutor();
const cppExecutor = new CPPExecutor();

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * Main execution endpoint
 * POST /execute
 * Body: { code, language, problemId?, problemTitle? }
 */
app.post('/execute', async (req, res) => {
  try {
    const { code, language = 'python', problemId, problemTitle } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'No code provided'
      });
    }

    console.log(`[Backend] Executing ${language} code (Problem: ${problemId || 'unknown'})`);
    console.log(`[Backend] Code length: ${code.length} chars`);

    let executor;
    switch (language.toLowerCase()) {
      case 'python':
      case 'python3':
        executor = pythonExecutor;
        break;
      case 'javascript':
      case 'js':
        executor = jsExecutor;
        break;
      case 'cpp':
      case 'c++':
        executor = cppExecutor;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported language: ${language}`
        });
    }

    // Execute with timeout
    const result = await executeWithTimeout(
      () => executor.execute(code),
      5000 // 5 second timeout
    );

    res.json({
      success: true,
      language,
      problemId,
      problemTitle,
      ...result
    });

  } catch (error) {
    console.error('[Backend] Execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Execution failed'
    });
  }
});

/**
 * Parse test cases from LeetCode
 * POST /parse-tests
 */
app.post('/parse-tests', async (req, res) => {
  try {
    const { html, problemId } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'No HTML provided'
      });
    }

    console.log(`[Backend] Parsing test cases for problem ${problemId || 'unknown'}`);

    // Parse test cases from HTML
    const testCases = parseTestCasesFromHTML(html);

    res.json({
      success: true,
      testCases,
      count: testCases.length
    });

  } catch (error) {
    console.error('[Backend] Parse error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Parsing failed'
    });
  }
});

/**
 * Analytics endpoint (for future use)
 * POST /analytics
 */
app.post('/analytics', async (req, res) => {
  try {
    const { problemId, language, executionTime, testsPassed } = req.body;

    console.log(`[Analytics] Problem: ${problemId}, Language: ${language}, Time: ${executionTime}ms, Tests: ${testsPassed}`);

    // TODO: Store in database
    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Execute function with timeout
 */
async function executeWithTimeout(fn, timeout = 5000) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Execution timeout')), timeout)
    )
  ]);
}

/**
 * Parse test cases from HTML (LeetCode format)
 */
function parseTestCasesFromHTML(html) {
  // This is a placeholder implementation
  // In reality, you'd parse the HTML DOM to extract test cases
  // Example format:
  // Input: nums = [2,7,11,15], target = 9
  // Output: [0,1]

  const testCases = [];
  const testPattern = /Input:\s*(.+?)\s*Output:\s*(.+?)(?=Input:|$)/gs;

  let match;
  while ((match = testPattern.exec(html)) !== null) {
    testCases.push({
      input: match[1].trim(),
      expected: match[2].trim()
    });
  }

  return testCases;
}

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('[Backend] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  LeetCode Visualizer Backend Server          ║`);
  console.log(`║  Listening on http://localhost:${PORT}                  ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
});

module.exports = app;
