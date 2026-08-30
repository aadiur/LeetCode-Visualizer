/**
 * LeetCode Problem Detector
 * Detects problem details from the LeetCode page
 */

class LeetCodeDetector {
  constructor() {
    this.problemId = null;
    this.problemTitle = null;
    this.difficulty = null;
    this.language = 'python'; // default
  }

  /**
   * Detect if we're on a LeetCode problem page
   */
  isOnProblemPage() {
    // Check URL pattern
    const urlPattern = /leetcode\.com\/(problems\/[a-z0-9-]+|submissions\/\d+)/i;
    if (!urlPattern.test(window.location.href)) {
      return false;
    }

    // Check for Monaco editor
    const editor = document.querySelector('[class*="monaco"]') || 
                   document.querySelector('[class*="editor"]');
    return !!editor;
  }

  /**
   * Extract problem ID from URL
   */
  extractProblemId() {
    const match = window.location.href.match(/problems\/([a-z0-9-]+)/i);
    if (match) {
      this.problemId = match[1];
      return this.problemId;
    }
    return null;
  }

  /**
   * Extract problem title
   */
  extractProblemTitle() {
    // Try different selectors
    const selectors = [
      '[data-testid="problem-title"]',
      '.css-v3d350', // LeetCode title class
      'h1',
      '[class*="title"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        this.problemTitle = element.textContent.trim();
        return this.problemTitle;
      }
    }
    return null;
  }

  /**
   * Extract difficulty level
   */
  extractDifficulty() {
    const selectors = [
      '[data-testid="difficulty-badge"]',
      '[class*="difficulty"]',
      '.text-olive', // Easy
      '.text-orange', // Medium
      '.text-red' // Hard
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent.trim().toLowerCase();
        if (text.includes('easy') || text.includes('medium') || text.includes('hard')) {
          this.difficulty = text;
          return this.difficulty;
        }
      }
    }
    return null;
  }

  /**
   * Detect selected language from tab or dropdown
   */
  detectLanguage() {
    // Check active language tab
    const activeTab = document.querySelector(
      '[role="tab"][aria-selected="true"]'
    );
    if (activeTab) {
      const text = activeTab.textContent.trim().toLowerCase();
      if (text.includes('python')) this.language = 'python';
      else if (text.includes('javascript') || text.includes('js')) this.language = 'javascript';
      else if (text.includes('c++') || text.includes('cpp')) this.language = 'cpp';
      else if (text.includes('java')) this.language = 'java';
      else if (text.includes('c#') || text.includes('csharp')) this.language = 'csharp';
      else if (text.includes('go')) this.language = 'go';
      else if (text.includes('rust')) this.language = 'rust';
      else if (text.includes('ruby')) this.language = 'ruby';
    }
    return this.language;
  }

  /**
   * Get all test cases from the page
   */
  extractTestCases() {
    const testCases = [];
    
    // Try to find test case containers
    const testContainers = document.querySelectorAll(
      '[data-testid="test-case"],' +
      '[class*="test-case"],' +
      '.css-1o0maq0' // Common LeetCode test container class
    );

    testContainers.forEach((container, index) => {
      try {
        // Extract input
        const inputElement = container.querySelector('[class*="input"]');
        const inputText = inputElement?.textContent || '';
        
        // Extract output
        const outputElement = container.querySelector('[class*="output"]');
        const outputText = outputElement?.textContent || '';

        if (inputText || outputText) {
          testCases.push({
            index,
            input: inputText.replace(/^input:\s*/i, '').trim(),
            output: outputText.replace(/^output:\s*/i, '').trim()
          });
        }
      } catch (e) {
        console.log('Error extracting test case:', e);
      }
    });

    return testCases.length > 0 ? testCases : null;
  }

  /**
   * Get complete problem details
   */
  getProblemDetails() {
    return {
      id: this.extractProblemId(),
      title: this.extractProblemTitle(),
      difficulty: this.extractDifficulty(),
      language: this.detectLanguage(),
      url: window.location.href,
      testCases: this.extractTestCases()
    };
  }

  /**
   * Watch for language changes
   */
  onLanguageChange(callback) {
    const tabs = document.querySelectorAll('[role="tab"]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        setTimeout(() => {
          const newLanguage = this.detectLanguage();
          callback(newLanguage);
        }, 100);
      });
    });
  }
}

// Create global instance
window.leetcodeDetector = new LeetCodeDetector();

console.log('[LeetCode Visualizer] Detector loaded');
