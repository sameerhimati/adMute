let adObserver = null;
let isEnabled = false;
let isMuted = false;
let isAdPlaying = false;
let adStartTime = 0;

// Load the saved state
chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    isEnabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
    if (isEnabled) {
        initAdDetection();
    }
});

chrome.runtime.sendMessage({action: 'getAdMuterState'}, (response) => {
    isEnabled = response.isEnabled;
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
            newAdPlaying: newAdPlaying,
            currentAdPlayingState: isAdPlaying
        });

        if (newAdPlaying && !isAdPlaying) {
            isAdPlaying = true;
            adStartTime = Date.now();
            handleAdStart();
        } else if (!newAdPlaying && isAdPlaying) {
            isAdPlaying = false;
            handleAdEnd();
        }

        if (isAdPlaying && skipButton) {
            attemptSkipAd(skipButton);
        }
    } catch (error) {
        console.log('Error checking for YouTube ads:', error);
        handleExtensionError(error);
    }
}

function handleAdStart() {

    if (!isEnabled) return;

    
    console.log('Ad detected, attempting to mute tab');
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
    console.log('Ad ended, attempting to unmute tab');
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

function attemptSkipAd(skipButton) {
    if (skipButton && skipButton.offsetParent !== null) {
        console.log('Skip button detected, attempting to skip');
        
        const skipMethods = [
            () => skipButton.click(),
            () => skipButton.dispatchEvent(new MouseEvent('click', { bubbles: true })),
            () => {
                const rect = skipButton.getBoundingClientRect();
                skipButton.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                }));
            }
        ];

        let attemptCount = 0;
        const maxAttempts = 5;

        function trySkip() {
            if (attemptCount >= maxAttempts) {
                console.log('Max skip attempts reached. Unable to skip ad.');
                return;
            }

            const method = skipMethods[attemptCount % skipMethods.length];
            try {
                method();
                console.log('Skip attempt made');
            } catch (error) {
                console.log('Error during skip attempt:', error);
            }

            // Check if ad is still playing after a short delay
            setTimeout(() => {
                if (document.querySelector('.ad-showing')) {
                    console.log('Ad still playing. Retrying skip...');
                    attemptCount++;
                    trySkip();
                } else {
                    console.log('Ad skipped successfully');
                }
            }, 500);
        }

        trySkip();
    }
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
        checkForYouTubeAds();
    });
    const config = { childList: true, subtree: true };

    function observePlayer() {
        const playerContainer = document.querySelector('#player-container');
        if (playerContainer) {
            adObserver.observe(playerContainer, config);
            console.log('Observing player container');
        } else {
            console.log('Player container not found, observing body');
            adObserver.observe(document.body, config);
        }
        checkForYouTubeAds(); // Initial check
        console.log('Ad detection initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observePlayer);
    } else {
        observePlayer();
    }
}

function stopAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    console.log('Ad detection stopped');
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
initAdDetection();

// Check for ads every second as a fallback
setInterval(checkForYouTubeAds, 1000);

console.log('YouTube content script loaded');