let adObserver = null;
let isEnabled = true;
let isMuted = false;
let isAdPlaying = false;
let adStartTime = 0;
let consecutiveAdChecks = 0;
const AD_CHECK_THRESHOLD = 3;

chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    isEnabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
    if (isEnabled) {
        initAdDetection();
    }
});

function checkForParamountAds() {
    if (!isEnabled) return;

    try {
        const adDetected = checkVisualAdMarkers() || 
                           checkPlayerStateChanges() || 
                           checkAudioLevels();

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

        console.log('Paramount+ ad check:', { adDetected, consecutiveAdChecks, isAdPlaying });
    } catch (error) {
        console.log('Error checking for Paramount+ ads:', error);
        handleExtensionError(error);
    }
}

function checkVisualAdMarkers() {
    const adMarkers = [
        '.ad-container', '.ad-overlay', '.ad-banner',
        '[data-testid="ad-overlay"]', '[data-testid="ad-banner"]'
    ];
    return adMarkers.some(marker => document.querySelector(marker));
}

function checkPlayerStateChanges() {
    // Implement Paramount+-specific player state checks
    return false;
}

function checkAudioLevels() {
    // Implement Paramount+-specific audio level checks
    return false;
}

function handleAdStart() {
    console.log('Paramount+ ad detected, attempting to mute tab');
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
    console.log('Paramount+ ad ended, attempting to unmute tab');
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
        checkForParamountAds();
    });
    const config = { childList: true, subtree: true, attributes: true, characterData: true };

    function observePlayer() {
        const playerContainer = document.querySelector('#video-player') || document.body;
        adObserver.observe(playerContainer, config);
        console.log('Observing Paramount+ player container');
        checkForParamountAds(); // Initial check
        console.log('Paramount+ ad detection initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observePlayer);
    } else {
        observePlayer();
    }

    // Set up periodic checks
    setInterval(checkForParamountAds, 1000);
}

function stopAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    console.log('Paramount+ ad detection stopped');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleAdMuter') {
        isEnabled = request.enabled;
        console.log('Ad Muter toggled on Paramount+:', isEnabled);
        if (isEnabled) {
            initAdDetection();
        } else {
            stopAdDetection();
        }
        sendResponse({ success: true });
    }
    return true;
});

initAdDetection();

console.log('Paramount+ content script loaded');