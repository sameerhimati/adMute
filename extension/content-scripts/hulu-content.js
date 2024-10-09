let adObserver = null;
let isAdMuterEnabled = false;
let isMuted = false;
let isAdPlaying = false;
let adStartTime = 0;
let lastKnownVideoTime = 0;
let lastKnownVideoDuration = 0;
let consecutiveAdChecks = 0;
const AD_CHECK_THRESHOLD = 3;

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

function checkForHuluAds() {
    if (!isAdMuterEnabled) return;

    try {
        const adDetected = checkVisualAdMarkers() || 
                           checkPlayerStateChanges() || 
                           checkAudioLevels() ||
                           checkNetworkRequests();

        if (adDetected) {
            consecutiveAdChecks++;
            if (consecutiveAdChecks >= AD_CHECK_THRESHOLD && !isAdPlaying) {
                isAdPlaying = true;
                adStartTime = Date.now();
                handleAdStart();
            }
        } else {
            if (consecutiveAdChecks >= AD_CHECK_THRESHOLD && isAdPlaying) {
                isAdPlaying = false;
                handleAdEnd();
            }
            consecutiveAdChecks = 0;
        }

        console.log('Hulu ad check:', { adDetected, consecutiveAdChecks, isAdPlaying });
    } catch (error) {
        console.log('Error checking for Hulu ads:', error);
        handleExtensionError(error);
    }
}

function checkVisualAdMarkers() {
    const adMarkers = [
        '.ad-container', '.AdUnitView', '.ad-overlay', '.ad-progress-bar',
        '[data-automation-id="ad-unit"]', '[data-automationid="player-ad-notice"]',
        '.AdBanner', '.AdTag', '[data-ad-break-type]', '[data-ad-break-start]'
    ];
    return adMarkers.some(marker => document.querySelector(marker));
}

function checkPlayerStateChanges() {
    const videoElement = document.querySelector('video');
    if (!videoElement) return false;

    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;

    const durationChanged = Math.abs(duration - lastKnownVideoDuration) > 5;
    const unexpectedTimeJump = Math.abs(currentTime - lastKnownVideoTime) > 5 && 
                               Math.abs(currentTime - lastKnownVideoTime) < duration - 5;

    lastKnownVideoTime = currentTime;
    lastKnownVideoDuration = duration;

    return durationChanged || unexpectedTimeJump;
}

function checkAudioLevels() {
    // Placeholder for audio level analysis
    return false;
}

function checkNetworkRequests() {
    // Placeholder for network request analysis
    return false;
}

function handleAdStart() {
    console.log('Hulu ad detected, attempting to mute tab');
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
    console.log('Hulu ad ended, attempting to unmute tab');
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
        checkForHuluAds();
    });
    const config = { childList: true, subtree: true, attributes: true, characterData: true };

    function observePlayer() {
        const playerContainer = document.querySelector('#content-video-player') || document.body;
        if (playerContainer) {
            console.log('Player container found, initializing ad detection');
            adObserver.observe(playerContainer, config);
        } else {
            console.log('Player container not found, will retry');
            setTimeout(observePlayer, 1000); // Retry after 1 second
        }
    }

    observePlayer();

    console.log('Hulu ad detection initialized');

    // Set up periodic checks
    setInterval(checkForHuluAds, 1000);
}

function stopAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    console.log('Hulu ad detection stopped');
}

// Initialize on load
chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    isAdMuterEnabled = result.adMuterEnabled === true;
    if (isAdMuterEnabled) {
        initAdDetection();
    }
});

console.log('Hulu content script loaded');