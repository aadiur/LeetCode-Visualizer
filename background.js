/**
 * Service Worker for the Algorithm Visualizer extension.
 *
 * Execution now runs entirely inside the content script (engine/*.js), so this
 * worker no longer proxies to any backend — there is no backend anymore.
 * It just handles install/update lifecycle logging.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Algorithm Visualizer] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[Algorithm Visualizer] Extension updated');
  }
});
