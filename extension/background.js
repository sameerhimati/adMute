import { decrypt } from './utils/crypto-utils.js';
import { 
    getUserInfo, 
    getSubscriptionStatus, 
    refreshToken,
    registerDevice,
    updateDeviceActivity
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
    chrome.storage.sync.set({ adMuterEnabled: true }, () => {
        console.log('Ad Muter enabled by default');
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
            const userData = await getUserInfo();
            console.log('User authenticated:', userData);
            scheduleTokenRefresh();
            checkDeviceRegistration();
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
      return subscriptionData.status === 'active';
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return false;
    }
  }

async function refreshAccessToken() {
    try {
      const { refreshToken: encryptedRefreshToken } = await new Promise((resolve) => 
        chrome.storage.local.get(['refreshToken'], resolve)
      );
      
      if (!encryptedRefreshToken) {
        throw new Error('No refresh token available');
      }
      
      const decryptedRefreshToken = decrypt(encryptedRefreshToken);
      const newTokens = await refreshToken(decryptedRefreshToken);
      await storeTokens(newTokens.access_token, newTokens.refresh_token);
      scheduleTokenRefresh();
    } catch (error) {
      console.error('Error refreshing token:', error);
      clearTokens();
      notifyUserReauthentication();
    }
  }

async function storeTokens(accessToken, refreshToken) {
    const expiryTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    await new Promise((resolve) => 
        chrome.storage.local.set({
            accessToken: accessToken,
            refreshToken: refreshToken,
            tokenExpiry: expiryTime
        }, resolve)
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
      // You might want to implement an alternative notification method here
    }
  }

async function checkDeviceRegistration() {
    const deviceId = await getDeviceId();
    const isRegistered = await getLocalStorage('isDeviceRegistered');
    if (!isRegistered) {
        const isSubscribed = await checkSubscriptionStatus();
        if (isSubscribed) {
            try {
                await registerDevice(deviceId, navigator.platform);
                await setLocalStorage('isDeviceRegistered', true);
                console.log('Device registered successfully');
            } catch (error) {
                console.error('Failed to register device:', error);
            }
        } else {
            console.log('No active subscription. Device registration not attempted.');
        }
    } else {
        try {
            await updateDeviceActivity(deviceId);
            console.log('Device activity updated');
        } catch (error) {
            console.error('Failed to update device activity:', error);
        }
    }
}

async function getDeviceId() {
    let deviceId = await getLocalStorage('deviceId');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
        await setLocalStorage('deviceId', deviceId);
    }
    return deviceId;
}

async function getLocalStorage(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key]);
        });
    });
}

async function setLocalStorage(key, value) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
    });
}

async function getAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['accessToken', 'tokenExpiry'], async (result) => {
            if (result.accessToken && result.tokenExpiry) {
                if (new Date(result.tokenExpiry) > new Date()) {
                    resolve(result.accessToken);
                } else {
                    try {
                        const newTokens = await refreshAccessToken();
                        resolve(newTokens.access_token);
                    } catch (error) {
                        console.error('Error refreshing token:', error);
                        resolve(null);
                    }
                }
            } else {
                resolve(null);
            }
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getAuthStatus') {
        chrome.storage.local.get(['accessToken', 'tokenExpiry'], (result) => {
            const isAuthenticated = !!(result.accessToken && result.tokenExpiry && new Date(result.tokenExpiry) > new Date());
            sendResponse({ isAuthenticated });
        });
        return true;
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