import { encrypt, decrypt } from './utils/crypto-utils.js';
import { 
    getUserInfo, 
    getSubscriptionStatus, 
    refreshToken,
    updateUserMetrics
} from './api.js';

const SUPPORTED_SERVICES = [
    { domain: 'youtube.com', name: 'YouTube' },
    { domain: 'hulu.com', name: 'Hulu' },
    { domain: 'peacocktv.com', name: 'Peacock' },
    { domain: 'paramountplus.com', name: 'Paramount+' },
    { domain: 'hbomax.com', name: 'HBO Max' },
    { domain: 'twitch.tv', name: 'Twitch' }
];

let refreshTokenTimeout;

chrome.runtime.onInstalled.addListener(() => {
    console.log('Ad Muter extension installed');
    chrome.storage.sync.set({ adMuterEnabled: false }, () => {
        console.log('Ad Muter disabled by default');
    });
    initializeMetrics();
    checkAuthStatus();
});

function initializeMetrics() {
    chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
        if (result.timeMuted === undefined || result.adsMuted === undefined) {
            chrome.storage.sync.set({ timeMuted: 0, adsMuted: 0 }, () => {
                console.log('Metrics initialized');
            });
        }
    });
}

async function checkAuthStatus() {
    try {
        const token = await getAccessToken();
        if (token) {
            try {
                const userData = await getUserInfo();
                console.log('User authenticated:', userData);
                scheduleTokenRefresh();
                await checkSubscriptionStatus();
                // Fetch and set the metrics from the server
                const metrics = await getUserMetrics();
                chrome.storage.sync.set({ 
                    timeMuted: metrics.total_muted_time, 
                    adsMuted: metrics.total_ads_muted 
                });
            } catch (error) {
                console.error('Error fetching user info:', error);
                clearTokens();
            }
        } else {
            console.log('No valid token found, user needs to log in');
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

function scheduleTokenRefresh() {
    chrome.storage.local.get(['tokenExpiry'], (result) => {
        if (result.tokenExpiry) {
            const expiryTime = new Date(result.tokenExpiry).getTime();
            const currentTime = Date.now();
            const delay = expiryTime - currentTime - 300000; // Refresh 5 minutes before expiry
            clearTimeout(refreshTokenTimeout);
            refreshTokenTimeout = setTimeout(refreshAccessToken, delay);
        }
    });
}

async function checkSubscriptionStatus() {
    try {
        const subscriptionData = await getSubscriptionStatus();
        if (!subscriptionData) {
            throw new Error('Invalid response from subscription status endpoint');
        }
        chrome.storage.sync.set({ 
            subscriptionStatus: subscriptionData.status,
            subscriptionPlan: subscriptionData.plan,
            deviceLimit: subscriptionData.device_limit,
            subscriptionEnd: subscriptionData.current_period_end
        }, () => {
            console.log('Subscription status updated:', subscriptionData.status);
            chrome.runtime.sendMessage({ action: 'subscriptionUpdated' });
        });
        return subscriptionData.status === 'active';
    } catch (error) {
        console.error('Error checking subscription status:', error);
        return false;
    }
}

async function sendMetricsToServer() {
    try {
        const { timeMuted, adsMuted } = await new Promise((resolve) => 
            chrome.storage.sync.get(['timeMuted', 'adsMuted'], resolve)
        );
        
        await updateUserMetrics({ timeMuted, adsMuted });
        console.log('Metrics sent to server successfully');
    } catch (error) {
        console.error('Error sending metrics to server:', error);
    }
}

setInterval(sendMetricsToServer, 5 * 60 * 1000);

async function refreshAccessToken() {
    try {
        const { refreshToken: encryptedRefreshToken } = await new Promise((resolve) => 
            chrome.storage.local.get(['refreshToken'], resolve)
        );
        
        if (!encryptedRefreshToken) {
            throw new Error('No refresh token available');
        }
        
        const decryptedRefreshToken = decrypt(encryptedRefreshToken);
        console.log('Attempting to refresh token...');
        const newTokens = await refreshToken(decryptedRefreshToken);
        console.log('Refresh token response:', newTokens);
        
        if (!newTokens || !newTokens.access_token) {
            throw new Error('Invalid response from refresh token endpoint');
        }
        await storeTokens(newTokens.access_token, newTokens.refresh_token);
        scheduleTokenRefresh();
        console.log('Token refreshed and stored successfully');
        return newTokens.access_token;
    } catch (error) {
        console.error('Error refreshing token:', error);
        clearTokens();
        notifyUserReauthentication();
        return null;
    }
}


async function storeTokens(accessToken, refreshToken) {
    const expiryTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    return new Promise((resolve) => 
        chrome.storage.local.set({
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: expiryTime
        }, () => {
            console.log('Tokens stored successfully');
            resolve();
        })
    );
}

function clearTokens() {
    chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiry'], () => {
        console.log('Tokens cleared due to refresh failure');
    });
}

function notifyUserReauthentication() {
    if (chrome.notifications) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Ad Muter: Reauthentication Required',
            message: 'Please log in again to continue using Ad Muter.'
        });
    } else {
        console.warn('Chrome notifications API is not available');
    }
}

async function getAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['accessToken', 'tokenExpiry'], async (result) => {
            if (result.accessToken && result.tokenExpiry) {
                if (new Date(result.tokenExpiry) > new Date()) {
                    resolve(result.accessToken);
                } else {
                    const newAccessToken = await refreshAccessToken();
                    resolve(newAccessToken);
                }
            } else {
                resolve(null);
            }
        });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getAccessToken') {
        getAccessToken().then(sendResponse);
        return true;
    } else if (message.action === 'refreshAccessToken') {
        refreshAccessToken().then(sendResponse);
        return true;
    } else if (message.action === 'getAuthStatus') {
        chrome.storage.local.get(['accessToken', 'tokenExpiry'], (result) => {
            const isAuthenticated = !!(result.accessToken && result.tokenExpiry && new Date(result.tokenExpiry) > new Date());
            sendResponse({ isAuthenticated });
        });
        return true;
    } else if (message.action === 'getAdMuterState') {
        chrome.storage.sync.get('adMuterEnabled', (data) => {
            sendResponse({ enabled: data.adMuterEnabled });
        });
        return true;
    } else if (message.action === 'setAdMuterState') {
        chrome.storage.sync.set({ adMuterEnabled: message.enabled }, () => {
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    chrome.tabs.sendMessage(tab.id, { action: 'updateAdMuterState', enabled: message.enabled })
                        .catch(() => {}); // Ignore errors for tabs that can't receive messages
                });
            });
            sendResponse({ success: true });
        });
        return true;
    } else if (message.action === 'subscriptionUpdated') {
        checkSubscriptionStatus()
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    } else if (message.action === 'contentScriptReady') {
        console.log(`Content script ready in tab ${sender.tab.id}`);
        sendResponse({ success: true });
    } else if (message.action === 'muteTab') {
        chrome.tabs.update(sender.tab.id, { muted: true }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error muting tab:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                console.log('Tab muted successfully');
                sendResponse({ success: true });
            }
        });
        return true;
    } else if (message.action === 'unmuteTab') {
        chrome.tabs.update(sender.tab.id, { muted: false }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error unmuting tab:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                console.log('Tab unmuted successfully');
                sendResponse({ success: true });
            }
        });
        return true;
    } else if (message.action === 'updateMetrics') {
        chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
            const newTimeMuted = (result.timeMuted || 0) + message.muteDuration;
            const newAdsMuted = (result.adsMuted || 0) + 1;
            chrome.storage.sync.set({ timeMuted: newTimeMuted, adsMuted: newAdsMuted }, () => {
                console.log('Metrics updated:', { timeMuted: newTimeMuted, adsMuted: newAdsMuted });
                sendResponse({ success: true });
            });
        });
        return true;
    } else if (message.action === 'logout') {
        sendMetricsToServer().then(() => {
            clearTokens();
            sendResponse({ success: true });
        }).catch((error) => {
            console.error('Error during logout:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true; // Indicate that we'll send a response asynchronously
    }
    // Return false if the message wasn't handled
    return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const service = SUPPORTED_SERVICES.find(s => tab.url.includes(s.domain));
        if (service) {
            chrome.storage.sync.get(['adMuterEnabled', 'subscriptionStatus'], (result) => {
                if (result.subscriptionStatus === 'active' && result.adMuterEnabled) {
                    // Wait for the content script to be ready
                    const checkContentScriptReady = () => {
                        chrome.tabs.sendMessage(tabId, { action: 'ping' }, response => {
                            if (chrome.runtime.lastError) {
                                // Content script not ready, try again after a short delay
                                setTimeout(checkContentScriptReady, 100);
                            } else {
                                // Content script is ready, send the initialization message
                                chrome.tabs.sendMessage(tabId, { action: 'initializeAdDetection', service: service.name }, response => {
                                    if (chrome.runtime.lastError) {
                                        console.error(`Error initializing ad detection for ${service.name} in tab ${tabId}:`, chrome.runtime.lastError);
                                    } else if (response && response.success) {
                                        console.log(`Ad detection initialized for ${service.name} in tab ${tabId}`);
                                    }
                                });
                            }
                        });
                    };

                    // Start checking if the content script is ready
                    checkContentScriptReady();
                }
            });
        }
    }
});

function isTabReady(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.get(tabId, (tab) => {
            resolve(tab && tab.status === 'complete');
        });
    });
}

console.log('Background script loaded');