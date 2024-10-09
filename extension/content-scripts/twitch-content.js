let adObserver = null;
let isAdMuterEnabled = false;
let isMuted = false;
let isAdPlaying = false;
let adStartTime = 0;
const AD_CHECK_INTERVAL = 500;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateAdMuterState') {
        isAdMuterEnabled = request.enabled;
        if (isAdMuterEnabled) {
            initAdDetection();
        } else {
            stopAdDetection();
        }
        sendResponse({ success: true });
    } else if (request.action === 'initializeAdDetection') {
        chrome.storage.sync.get(['adMuterEnabled'], (result) => {
            isAdMuterEnabled = result.adMuterEnabled;
            if (isAdMuterEnabled) {
                initAdDetection();
            }
            sendResponse({ success: true });
        });
    }
    return true;
});

function checkForTwitchAds() {
    if (!isAdMuterEnabled) return;

    const adDetected = checkVisualAdMarkers();

    if (adDetected && !isAdPlaying) {
        isAdPlaying = true;
        adStartTime = Date.now();
        handleAdStart();
    } else if (!adDetected && isAdPlaying) {
        isAdPlaying = false;
        handleAdEnd();
    }

    console.log('Twitch ad check:', { adDetected, isAdPlaying });
}

function checkVisualAdMarkers() {
    const adMarkers = [
        '[aria-label="Ad"]',
        '[data-a-target="video-ad-label"]',
        '.video-player__overlay[data-a-target="player-overlay-ad-alert"]'
    ];
    return adMarkers.some(marker => document.querySelector(marker));
}

function handleAdStart() {
    console.log('Twitch ad detected, attempting to mute tab');
    chrome.runtime.sendMessage({ action: 'muteTab' })
        .then(response => {
            if (response && response.success) {
                console.log('Tab muted successfully');
                isMuted = true;
            } else {
                console.log('Failed to mute tab:', response ? response.error : 'Unknown error');
            }
        })
        .catch(error => {
            console.log('Error sending mute message:', error);
            handleExtensionError(error);
        });
}

function handleAdEnd() {
    console.log('Twitch ad ended, attempting to unmute tab');
    chrome.runtime.sendMessage({ action: 'unmuteTab' })
        .then(response => {
            if (response && response.success) {
                console.log('Tab unmuted successfully');
                isMuted = false;
                updateMetrics();
            } else {
                console.log('Failed to unmute tab:', response ? response.error : 'Unknown error');
            }
        })
        .catch(error => {
            console.log('Error sending unmute message:', error);
            handleExtensionError(error);
        });
}

function updateMetrics() {
    const muteDuration = Math.round((Date.now() - adStartTime) / 1000);
    chrome.runtime.sendMessage({
        action: 'updateMetrics',
        muteDuration: muteDuration
    });
}

function handleExtensionError(error) {
    console.log('Handling extension error:', error);
    if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated. Reloading ad detection.');
        stopAdDetection();
        setTimeout(() => {
            initAdDetection();
        }, 1000);
    } else if (error.message.includes('Permission denied')) {
        console.log('Permission denied error. This may affect some functionality.');
    }
}

function initAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
    }
    adObserver = new MutationObserver(() => {
        checkForTwitchAds();
    });
    const config = { childList: true, subtree: true, attributes: true, characterData: true };

    const playerContainer = document.querySelector('.video-player') || document.body;
    adObserver.observe(playerContainer, config);
    console.log('Twitch ad detection initialized');

    // Set up periodic checks
    setInterval(checkForTwitchAds, AD_CHECK_INTERVAL);
}

function stopAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    console.log('Twitch ad detection stopped');
}

// Initialize on load
chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    isAdMuterEnabled = result.adMuterEnabled === true;
    if (isAdMuterEnabled) {
        initAdDetection();
    }
});

console.log('Twitch content script loaded');