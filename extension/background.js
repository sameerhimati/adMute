import { decrypt, encrypt } from './crypto-utils.js';

const API_URL = 'http://localhost:5000';
let userId;
let refreshTokenTimeout;

// List of supported streaming services
const SUPPORTED_SERVICES = [
    { domain: 'youtube.com', name: 'YouTube' },
    { domain: 'hulu.com', name: 'Hulu' },
    { domain: 'peacocktv.com', name: 'Peacock' },
    { domain: 'paramountplus.com', name: 'Paramount+' },
    { domain: 'hbomax.com', name: 'HBO Max' },
    { domain: 'twitch.tv', name: 'Twitch' }
];

chrome.runtime.onInstalled.addListener(() => {
    console.log('Ad Muter extension installed');
    userId = generateUserId();
    chrome.storage.sync.set({ adMuterEnabled: true, userId: userId }, () => {
        console.log('Ad Muter enabled by default, user ID set');
    });
    initializeMetrics();
    checkAuthStatus();
});

function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function initializeMetrics() {
    chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
        if (result.timeMuted === undefined || result.adsMuted === undefined) {
            chrome.storage.sync.set({ timeMuted: 0, adsMuted: 0 }, () => {
                console.log('Metrics initialized');
            });
        }
    });
}

function checkAuthStatus() {
    chrome.storage.local.get(['accessToken', 'tokenExpiry'], (result) => {
        if (result.accessToken && result.tokenExpiry) {
            const currentTime = Date.now();
            const expiryTime = new Date(result.tokenExpiry).getTime();
            
            if (currentTime < expiryTime) {
                // Token is still valid
                scheduleTokenRefresh(expiryTime - currentTime);
            } else {
                // Token has expired, attempt to refresh
                refreshToken();
            }
        }
    });
}

function scheduleTokenRefresh(delay) {
    clearTimeout(refreshTokenTimeout);
    refreshTokenTimeout = setTimeout(refreshToken, delay);
}

async function refreshToken() {
    try {
        const { refreshToken } = await new Promise((resolve) => chrome.storage.local.get(['refreshToken'], resolve));
        const decryptedRefreshToken = decrypt(refreshToken);

        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: decryptedRefreshToken }),
        });

        if (response.ok) {
            const data = await response.json();
            const expiryTime = new Date(Date.now() + data.expires_in * 1000).toISOString();
            
            storeTokens(data.access_token, data.refresh_token, expiryTime);
            scheduleTokenRefresh(data.expires_in * 1000);
        } else {
            console.log('Failed to refresh token');
            clearTokens();
            notifyUserReauthentication();
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
        clearTokens();
        notifyUserReauthentication();
    }
}

function storeTokens(accessToken, refreshToken, expiryTime) {
    chrome.storage.local.set({
        accessToken: accessToken,
        refreshToken: encrypt(refreshToken),
        tokenExpiry: expiryTime
    }, () => {
        console.log('Tokens stored securely');
    });
}

function clearTokens() {
    chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiry'], () => {
        console.log('Tokens cleared due to refresh failure');
    });
}

function notifyUserReauthentication() {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Ad Muter: Reauthentication Required',
        message: 'Please log in again to continue using Ad Muter.'
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getAuthStatus') {
        chrome.storage.local.get(['accessToken', 'tokenExpiry'], (result) => {
            const isAuthenticated = !!(result.accessToken && result.tokenExpiry && new Date(result.tokenExpiry) > new Date());
            sendResponse({ isAuthenticated });
        });
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === 'muteTab') {
        if (sender.tab) {
            chrome.tabs.update(sender.tab.id, { muted: true })
                .then(() => {
                    console.log('Tab muted successfully');
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.log('Error muting tab:', error);
                    sendResponse({ success: false, error: error.message });
                });
        } else {
            console.log('Sender tab not available for mute action.');
            sendResponse({ success: false, error: 'Sender tab not available' });
        }
        return true;
    } else if (request.action === 'unmuteTab') {
        if (sender.tab) {
            chrome.tabs.update(sender.tab.id, { muted: false })
                .then(() => {
                    console.log('Tab unmuted successfully');
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.log('Error unmuting tab:', error);
                    sendResponse({ success: false, error: error.message });
                });
        } else {
            console.log('Sender tab not available for unmute action.');
            sendResponse({ success: false, error: 'Sender tab not available' });
        }
        return true;
    } else if (request.action === 'updateMetrics') {
        chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
            const newTimeMuted = (result.timeMuted || 0) + request.muteDuration;
            const newAdsMuted = (result.adsMuted || 0) + 1;
            chrome.storage.sync.set({ timeMuted: newTimeMuted, adsMuted: newAdsMuted }, () => {
                console.log('Metrics updated:', { timeMuted: newTimeMuted, adsMuted: newAdsMuted });
                sendResponse({ success: true });
            });
        });
        return true;
    } else if (request.action === 'getMetrics') {
        chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
            sendResponse({ timeMuted: result.timeMuted || 0, adsMuted: result.adsMuted || 0 });
        });
        return true;
    } else if (request.action === 'sendFeedback') {
        chrome.storage.sync.get(['userId'], (data) => {
            fetch(`${API_URL}/api/data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: data.userId,
                    feedback: request.feedback,
                }),
            })
            .then(response => response.json())
            .then(result => {
                console.log('Feedback sent successfully:', result);
                sendResponse({success: true});
            })
            .catch(error => {
                console.error('Error sending feedback:', error);
                sendResponse({success: false, error: error.message});
            });
        });
        return true;
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const service = SUPPORTED_SERVICES.find(s => tab.url.includes(s.domain));
        if (service) {
            chrome.tabs.sendMessage(tabId, { action: 'checkForAds', service: service.name })
                .then(() => console.log(`Sent checkForAds message to tab for ${service.name}`))
                .catch(error => console.log(`Error sending message to tab for ${service.name}:`, error));
        }
    }
});

console.log('Background script loaded');