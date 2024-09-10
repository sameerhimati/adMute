console.log('Ad Muter extension loaded on a non-YouTube site');

// For now, this script does nothing, but you can add functionality for other sites here in the future
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleAdMuter') {
    console.log('Ad Muter toggled on a non-YouTube site');
    sendResponse({ success: true });
  }
});