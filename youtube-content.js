let adObserver = null;
let isEnabled = true;
let isMuted = false;
let isAdPlaying = false;

// Load the saved state
chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    isEnabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
    if (isEnabled) {
        initAdDetection();
    }
});

function checkForYouTubeAds() {
    if (!isEnabled) return;

    try {
        const adOverlay = document.querySelector('.ytp-ad-player-overlay, .video-ads.ytp-ad-module');
        const skipButton = document.querySelector('.ytp-ad-skip-button, .videoAdUiSkipButton, [id^="skip-button"], .ytp-ad-skip-button-modern');
        const adText = document.querySelector('.ytp-ad-text, .videoAdUiAttribution, .ytp-ad-preview-text');
        const adDisplayContainer = document.querySelector('.ad-showing, .ytp-ad-overlay-container');

        const newAdPlaying = !!(adOverlay && (skipButton || adText || adDisplayContainer));

        console.log('Checking for ads:', { 
            adOverlay: !!adOverlay, 
            skipButton: !!skipButton, 
            adText: !!adText,
            adDisplayContainer: !!adDisplayContainer,
            isAdPlaying: newAdPlaying
        });

        if (newAdPlaying && !isAdPlaying) {
            isAdPlaying = true;
            handleAdStart();
        } else if (!newAdPlaying && isAdPlaying) {
            isAdPlaying = false;
            handleAdEnd();
        }

        // if (isAdPlaying && skipButton) {
        //     attemptSkipAd(skipButton);
        // }
    } catch (error) {
        console.log('Error checking for YouTube ads:', error);
        handleExtensionError(error);
    }
}

function handleAdStart() {
    console.log('Ad detected, muting tab');
    chrome.runtime.sendMessage({ action: 'muteTab' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Error muting tab:', chrome.runtime.lastError.message);
            handleExtensionError(chrome.runtime.lastError);
        } else {
            console.log('Tab muted');
            isMuted = true;
        }
    });
}

function handleAdEnd() {
    console.log('Ad ended, unmuting tab');
    chrome.runtime.sendMessage({ action: 'unmuteTab' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Error unmuting tab:', chrome.runtime.lastError.message);
            handleExtensionError(chrome.runtime.lastError);
        } else {
            console.log('Tab unmuted');
            isMuted = false;
        }
    });
}

function attemptSkipAd(skipButton) {
    // if (skipButton && skipButton.offsetParent !== null) {
    //     console.log('Skip button detected, attempting to click');
    //     try {
    //         skipButton.click();
    //         console.log('Skip button clicked');
    //     } catch (clickError) {
    //         console.log('Error clicking skip button:', clickError);
    //     }
    // }
}

function handleExtensionError(error) {
    if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated. Reloading ad detection.');
        stopAdDetection();
        setTimeout(() => {
            setup();
        }, 1000);
    }
}

function initAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
    }
    adObserver = new MutationObserver(() => {
        checkForYouTubeAds();
    });
    const config = { childList: true, subtree: true };
    const playerContainer = document.querySelector('#player-container');
    if (playerContainer) {
        adObserver.observe(playerContainer, config);
    } else {
        adObserver.observe(document.body, config);
    }
    checkForYouTubeAds(); // Initial check
    console.log('Ad detection initialized');
}

function stopAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    console.log('Ad detection stopped');
}

// Initial setup
function setup() {
    initAdDetection();
    // Check for ads every second as a fallback
    setInterval(checkForYouTubeAds, 1000);
}

function initializeExtension() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleAdMuter') {
        isEnabled = request.enabled;
        console.log('Ad Muter toggled:', isEnabled);
        if (isEnabled) {
            initAdDetection();
        } else {
            stopAdDetection();
        }
        sendResponse({ success: true });
    }
});

// Initial load
initializeExtension();

// Handle potential extension context invalidation
window.addEventListener('error', (event) => {
    if (event.error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated. Attempting to reinitialize...');
        reinitializeExtension();
    }
});

console.log('YouTube content script loaded');


