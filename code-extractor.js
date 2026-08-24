/**
 * Code Extractor
 * Extracts the code from LeetCode's Monaco editor
 */

class CodeExtractor {
  constructor() {
    this.editor = null;
    this.observing = false;
  }

  /**
   * Find Monaco editor instance on the page
   */
  findEditor() {
    // Try multiple approaches to find the editor

    // Approach 1: Access via Monaco's loader
    if (window.monaco && window.monaco.editor) {
      const editors = window.monaco.editor.getEditors();
      if (editors.length > 0) {
        this.editor = editors[0];
        return this.editor;
      }
    }

    // Approach 2: Look for editor in DOM with data attributes
    const editorElement = document.querySelector(
      '[data-testid="code-editor"],' +
      '[class*="monaco-editor"],' +
      '.editor-wrapper'
    );
    
    if (editorElement) {
      // Try to access via React props (hackish but works)
      try {
        const reactKey = Object.keys(editorElement).find(key => 
          key.startsWith('__react')
        );
        if (reactKey) {
          const reactProps = editorElement[reactKey];
          if (reactProps && reactProps.child && reactProps.child.return) {
            // Navigate React tree to find editor instance
            const fiber = reactProps.child.return;
            // This is complex and version-dependent
            // Better approach below
          }
        }
      } catch (e) {
        // Fallback to text extraction
      }
    }

    // Approach 3: Inject script to access Monaco directly
    return this.injectAndGetEditor();
  }

  /**
   * Inject script into page context to access Monaco editor
   */
  injectAndGetEditor() {
    return new Promise((resolve) => {
      // Create a script that runs in page context
      const script = document.createElement('script');
      script.innerHTML = `
        (function() {
          // Try to access global Monaco editors
          if (window.monaco && window.monaco.editor) {
            const editors = window.monaco.editor.getEditors();
            if (editors.length > 0) {
              window.__lcvEditor = editors[0];
              window.postMessage({
                type: 'EDITOR_FOUND',
                hasEditor: true
              }, '*');
              return;
            }
          }
          window.postMessage({
            type: 'EDITOR_FOUND',
            hasEditor: false
          }, '*');
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();

      // Listen for response
      const listener = (event) => {
        if (event.data.type === 'EDITOR_FOUND') {
          window.removeEventListener('message', listener);
          if (event.data.hasEditor) {
            // Store reference
            this.editorFound = true;
            resolve(true);
          } else {
            resolve(false);
          }
        }
      };
      window.addEventListener('message', listener);
    });
  }

  /**
   * Get current code from editor
   */
  getCode() {
    try {
      // Try method 1: Monaco API
      if (window.__lcvEditor && window.__lcvEditor.getValue) {
        return window.__lcvEditor.getValue();
      }

      // Try method 2: TextArea (fallback)
      const textarea = document.querySelector(
        'textarea[class*="editor"],' +
        '.monaco-editor textarea'
      );
      if (textarea && textarea.value) {
        return textarea.value;
      }

      // Try method 3: Get from DOM content
      const codeElement = document.querySelector(
        '[class*="code-content"],' +
        '[class*="editor-content"]'
      );
      if (codeElement) {
        return codeElement.innerText || codeElement.textContent;
      }

      return null;
    } catch (e) {
      console.error('Error getting code:', e);
      return null;
    }
  }

  /**
   * Watch for code changes
   */
  watchCodeChanges(callback) {
    // Method 1: Monitor textarea input
    const textarea = document.querySelector('textarea[class*="editor"]');
    if (textarea) {
      textarea.addEventListener('input', (e) => {
        callback(this.getCode());
      });
    }

    // Method 2: Use MutationObserver on code content
    const codeContent = document.querySelector('[class*="editor-content"]');
    if (codeContent) {
      const observer = new MutationObserver(() => {
        callback(this.getCode());
      });
      observer.observe(codeContent, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // Method 3: Polling as fallback
    let lastCode = this.getCode();
    const interval = setInterval(() => {
      const currentCode = this.getCode();
      if (currentCode !== lastCode) {
        lastCode = currentCode;
        callback(currentCode);
      }
    }, 500);

    // Return cleanup function
    return () => clearInterval(interval);
  }

  /**
   * Get code and problem context
   */
  getContext() {
    const detector = window.leetcodeDetector || {};
    return {
      code: this.getCode(),
      problem: {
        id: detector.extractProblemId?.(),
        title: detector.extractProblemTitle?.(),
        difficulty: detector.extractDifficulty?.(),
        language: detector.detectLanguage?.(),
        url: window.location.href
      },
      timestamp: Date.now()
    };
  }
}

// Create global instance
window.codeExtractor = new CodeExtractor();

// Try to initialize
window.codeExtractor.injectAndGetEditor().then(success => {
  if (success) {
    console.log('[LeetCode Visualizer] Editor found and accessible');
  } else {
    console.log('[LeetCode Visualizer] Using fallback code extraction method');
  }
});

console.log('[LeetCode Visualizer] Code extractor loaded');
