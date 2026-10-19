// Background script for Instagram Reels Control Extension
// Initializes settings defaults and refreshes already-open Instagram tabs.

function reportRuntimeError(context) {
  if (!chrome.runtime.lastError) return false;
  console.error(`Instagram Reels Control ${context}:`, chrome.runtime.lastError.message);
  return true;
}

function injectIntoOpenInstagramTabs() {
  chrome.tabs.query({ url: ['https://*.instagram.com/*'] }, (tabs) => {
    if (reportRuntimeError('could not find open Instagram tabs')) return;

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      }, () => {
        if (reportRuntimeError(`could not refresh styles in tab ${tab.id}`)) return;
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          reportRuntimeError(`could not refresh controls in tab ${tab.id}`);
        });
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([
    'autoScroll',
    'hudEnabled',
    'hotkeysEnabled',
    'defaultSpeed',
    'defaultVolume',
    'isMuted',
    'useNativeControls'
  ], (result) => {
    if (reportRuntimeError('could not read settings')) return;
    const defaults = {
      autoScroll: true,
      hudEnabled: true,
      hotkeysEnabled: true,
      defaultSpeed: 1.0,
      defaultVolume: 0.8,
      isMuted: false,
      useNativeControls: false
    };
    
    const updates = {};
    for (const key in defaults) {
      if (result[key] === undefined) {
        updates[key] = defaults[key];
      }
    }
    
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        if (reportRuntimeError('could not initialize settings')) return;
        console.log('Instagram Reels Control settings initialized:', updates);
      });
    }
  });

});

// The worker starts after install, update, or a developer-mode Reload. Static
// content scripts are not retroactively added to already-open tabs, so refresh
// those tabs once per worker startup. The content controller is idempotent.
injectIntoOpenInstagramTabs();
