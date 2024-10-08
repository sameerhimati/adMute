import { encrypt, decrypt } from '../utils/crypto-utils.js';
import { 
    getUserInfo, 
    getSubscriptionStatus, 
    login, 
    register, 
    refreshToken,
    getDevices,
    registerDevice
} from '../api.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');
    const userView = document.getElementById('userView');
    
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutButton = document.getElementById('logoutButton');
    const toggleButton = document.getElementById('adMuterToggle');
    
    showRegisterLink.addEventListener('click', () => showView(registerView));
    showLoginLink.addEventListener('click', () => showView(loginView));
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    logoutButton.addEventListener('click', handleLogout);
    toggleButton.addEventListener('change', handleToggle);
    document.getElementById('subscribeBtn').addEventListener('click', handleSubscribe);
    
    checkAuthStatus();
    initializeAdMuter();
});

function showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    view.classList.add('active');
}

async function checkAuthStatus() {
    try {
        const token = await getAccessToken();
        if (!token) {
            showView(document.getElementById('loginView'));
            return;
        }

        const userData = await getUserInfo();
        showUserInfo(userData);
        await onSuccessfulLogin();
    } catch (error) {
        console.error('Error checking auth status:', error);
        showView(document.getElementById('loginView'));
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const data = await login(username, password);
        await storeTokens(data.access_token, data.refresh_token);
        await onSuccessfulLogin();
        showUserInfo({ username });
    } catch (error) {
        console.error('Login error:', error);
        showError('An error occurred during login');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const data = await register(username, email, password);
        await storeTokens(data.access_token, data.refresh_token);
        await onSuccessfulLogin();
        showUserInfo({ username });
    } catch (error) {
        console.error('Registration error:', error);
        showError('An error occurred during registration');
    }
}

function handleLogout() {
    chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiry'], () => {
        clearUserData();
        showView(document.getElementById('loginView'));
    });
}

function showUserInfo(userData) {
    document.getElementById('username').textContent = userData.username;
    showView(document.getElementById('userView'));
}

function initializeAdMuter() {
    chrome.storage.sync.get(['adMuterEnabled'], (result) => {
        const enabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
        document.getElementById('adMuterToggle').checked = enabled;
        document.getElementById('statusText').textContent = enabled ? 'Active' : 'Inactive';
        document.getElementById('statusIndicator').style.backgroundColor = enabled ? '#4CAF50' : '#F44336';
    });
}

function handleToggle() {
    const enabled = document.getElementById('adMuterToggle').checked;
    const statusText = document.getElementById('statusText');
    
    if (!document.getElementById('adMuterToggle').disabled) {
        statusText.textContent = enabled ? 'Active' : 'Inactive';
        document.getElementById('statusIndicator').style.backgroundColor = enabled ? '#4CAF50' : '#F44336';

        chrome.storage.sync.set({ adMuterEnabled: enabled }, () => {
            console.log('Ad Muter state saved:', enabled);
        });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleAdMuter', enabled }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Error:', chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log('Ad Muter toggled successfully');
                        updateMetrics();
                    }
                });
            } else {
                console.log('No active tabs found.');
            }
        });
    }
}

async function checkSubscriptionStatus() {
    try {
      const data = await getSubscriptionStatus();
      updateSubscriptionUI(data);
      return data.status === 'active';
    } catch (error) {
      console.error('Error checking subscription status:', error);
      updateSubscriptionUI(null);
      return false;
    }
}

function updateSubscriptionUI(data) {
    const subscriptionInfo = document.getElementById('subscriptionInfo');
    const adMuterToggle = document.getElementById('adMuterToggle');
    const statusText = document.getElementById('statusText');
    const subscribeBtn = document.getElementById('subscribeBtn');
    
    if (subscriptionInfo && adMuterToggle && statusText && subscribeBtn) {
        if (data && data.status === 'active') {
            subscriptionInfo.innerHTML = `
                <p>Plan: ${data.plan}</p>
                <p>Status: Active</p>
                <p>Device Limit: ${data.device_limit}</p>
                <p>Renewal Date: ${new Date(data.current_period_end).toLocaleDateString()}</p>
            `;
            adMuterToggle.disabled = false;
            statusText.textContent = adMuterToggle.checked ? 'Active' : 'Inactive';
            subscribeBtn.classList.add('hidden');
        } else {
            subscriptionInfo.innerHTML = `<p>No active subscription</p>`;
            adMuterToggle.disabled = true;
            adMuterToggle.checked = false;
            statusText.textContent = 'Subscription Required';
            subscribeBtn.classList.remove('hidden');
        }
    }
}

async function onSuccessfulLogin() {
    try {
        const isSubscribed = await checkSubscriptionStatus();
        updateMetrics();
        if (isSubscribed) {
            await fetchDevices();
            const deviceId = await getDeviceId();
            await registerDevice(deviceId, navigator.platform);
            console.log('Login and device registration successful');
        } else {
            console.log('Login successful, but no active subscription');
        }
    } catch (error) {
        console.error('Error during login process:', error);
        showError(`An error occurred: ${error.message}. Please try again.`);
    }
}

function handleSubscribe() {
    const placeholderUrl = `http://localhost:5000/placeholder-subscribe?time=${Date.now()}`;
    window.open(placeholderUrl, '_blank');
}

async function fetchDevices() {
    try {
        const data = await getDevices();
        updateDevicesUI(data);
    } catch (error) {
        showError('Failed to fetch device information');
    }
}

function updateDevicesUI(data) {
    const deviceList = document.getElementById('deviceList');
    const deviceCount = document.getElementById('deviceCount');
    if (deviceList) {
        deviceList.innerHTML = '';
        data.devices.forEach(device => {
            const li = document.createElement('li');
            li.textContent = `${device.name} (Last active: ${new Date(device.last_active).toLocaleString()})`;
            deviceList.appendChild(li);
        });
    }
    if (deviceCount) {
        deviceCount.textContent = `${data.devices.length} / ${data.device_limit}`;
    }
}

function updateMetrics() {
    chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
        const timeMuted = result.timeMuted || 0;
        const adsMuted = result.adsMuted || 0;
        
        document.getElementById('timeMuted').textContent = formatTime(timeMuted);
        document.getElementById('adsMuted').textContent = adsMuted;
        document.getElementById('timeSaved').textContent = formatTime(Math.round(timeMuted * 0.8));
    });
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

function clearUserData() {
    document.getElementById('timeMuted').textContent = '0s';
    document.getElementById('adsMuted').textContent = '0';
    document.getElementById('timeSaved').textContent = '0s';
    if (document.getElementById('subscriptionInfo')) {
        document.getElementById('subscriptionInfo').innerHTML = '';
    }
    if (document.getElementById('deviceList')) {
        document.getElementById('deviceList').innerHTML = '';
    }
    if (document.getElementById('deviceCount')) {
        document.getElementById('deviceCount').textContent = '0 / 0';
    }
}

async function getAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['accessToken', 'tokenExpiry'], async (result) => {
            if (result.accessToken && result.tokenExpiry) {
                if (new Date(result.tokenExpiry) > new Date()) {
                    resolve(result.accessToken);
                } else {
                    try {
                        const newToken = await refreshToken(decrypt(result.refreshToken));
                        await storeTokens(newToken.access_token, newToken.refresh_token);
                        resolve(newToken.access_token);
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

async function storeTokens(accessToken, refreshToken) {
    const expiryTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    await new Promise((resolve) => 
        chrome.storage.local.set({
            accessToken: accessToken,
            refreshToken: encrypt(refreshToken),
            tokenExpiry: expiryTime
        }, resolve)
    );
}

function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    document.body.appendChild(errorElement);
    setTimeout(() => {
        errorElement.remove();
    }, 3000);
}

async function getDeviceId() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['deviceId'], (result) => {
            if (result.deviceId) {
                resolve(result.deviceId);
            } else {
                const newDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
                chrome.storage.local.set({ deviceId: newDeviceId }, () => {
                    resolve(newDeviceId);
                });
            }
        });
    });
}