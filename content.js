function checkForYouTubeAds() {
  try {
    const adOverlay = document.querySelector('.ytp-ad-player-overlay');
    const skipButton = document.querySelector('.ytp-ad-skip-button');
    const adText = document.querySelector('.ytp-ad-text');

    if (adOverlay || (skipButton && adText)) {
      chrome.runtime.sendMessage({ action: 'muteTab' });
    } else {
      chrome.runtime.sendMessage({ action: 'unmuteTab' });
    }
  } catch (error) {
    console.log('Error checking for YouTube ads:', error);
    if (error.message.includes('Extension context invalidated')) {
      console.log('Extension context invalidated. Stopping ad detection.');
      if (window.adDetectionObserver) {
        window.adDetectionObserver.disconnect();
      }
    }
  }
}

function initAdDetection() {
  const observer = new MutationObserver(checkForYouTubeAds);
  const config = { childList: true, subtree: true };
  observer.observe(document.body, config);
  window.adDetectionObserver = observer;
  checkForYouTubeAds();
}

// Initial check when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdDetection);
} else {
  initAdDetection();
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleAdMuter') {
    if (request.enabled) {
      initAdDetection();
    } else if (window.adDetectionObserver) {
      window.adDetectionObserver.disconnect();
    }
  }
});
