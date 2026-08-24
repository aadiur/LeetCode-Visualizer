/**
 * Service Worker for LeetCode Visualizer Extension
 * Handles background tasks and communication between content script and backend
 */

console.log('[LeetCode Visualizer] Service worker loaded');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Service Worker] Message received:', message);

  if (message.type === 'EXECUTE_CODE') {
    // Forward to backend
    executeOnBackend(message.payload)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'PARSE_TEST_CASES') {
    parseTestCases(message.payload)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

/**
 * Execute code on backend
 */
async function executeOnBackend(payload) {
  const backendUrl = 'http://localhost:3000'; // Will be configurable

  const response = await fetch(`${backendUrl}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Parse test cases
 */
async function parseTestCases(payload) {
  const backendUrl = 'http://localhost:3000';

  const response = await fetch(`${backendUrl}/parse-tests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Service Worker] Extension installed');
    // Could open setup page here
  } else if (details.reason === 'update') {
    console.log('[Service Worker] Extension updated');
  }
});
