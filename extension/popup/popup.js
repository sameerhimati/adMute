import { encrypt, decrypt } from '../utils/crypto-utils.js';
import { 
    getUserInfo, 
    getSubscriptionStatus, 
    login, 
    register, 
    refreshToken,
    getDevices,
    registerDevice,
    createCheckoutSession, 
    verifySubscription
} from '../api.js';

// Event Listeners
document.addEventListener('DOMContentLoaded', initializePopup);

// Initialization
async function initializePopup() {
    setupEventListeners();
    await checkAuthStatus();
    initializeAdMuter();
}

function setupEventListeners() {
    document.getElementById('showRegister').addEventListener('click', () => showView('registerView'));
    document.getElementById('showLogin').addEventListener('click', () => showView('loginView'));
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    document.getElementById('adMuterToggle').addEventListener('change', handleToggle);
    document.getElementById('subscribeBtn').addEventListener('click', showSubscriptionOptions);
    document.querySelectorAll('.plan-option').forEach(option => {
        option.addEventListener('click', handlePlanSelection);
    });
}

// Authentication
async function checkAuthStatus() {
    try {
        const token = await getAccessToken();
        if (!token) {
            showView('loginView');
            return;
        }
        const userData = await getUserInfo();
        showUserInfo(userData);
        await onSuccessfulLogin();
    } catch (error) {
        console.error('Error checking auth status:', error);
        showView('loginView');
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
        showView('loginView');
    });
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

// Subscription
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

function showSubscriptionOptions() {
    document.getElementById('subscriptionOptions').classList.remove('hidden');
}

async function handlePlanSelection(event) {
    const selectedPlan = event.currentTarget.dataset.plan;
    if (!selectedPlan) {
        console.error('No plan selected');
        return;
    }

    try {
        const { url } = await createCheckoutSession(selectedPlan);
        const checkoutWindow = window.open(url, '_blank');
        
        window.addEventListener('message', async function(event) {
            if (event.data.type === 'subscription_success') {
                const success_token = event.data.success_token;
                try {
                    const subscriptionData = await verifySubscription(success_token);
                    updateSubscriptionStatus(subscriptionData);
                    checkoutWindow.close();
                } catch (error) {
                    console.error('Error verifying subscription:', error);
                    showError('Failed to verify subscription. Please try again or contact support.');
                }
            }
        }, false);
    } catch (error) {
        console.error('Error creating checkout session:', error);
        showError('Failed to start subscription process. Please try again.');
    }
}

function updateSubscriptionStatus(data) {
    chrome.storage.local.set({
        subscriptionStatus: data.status,
        subscriptionPlan: data.plan,
        deviceLimit: data.device_limit,
        subscriptionEnd: data.current_period_end
    }, function() {
        updateUI();
        chrome.runtime.sendMessage({ action: 'subscriptionUpdated' });
    });
}

// UI Updates
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function showUserInfo(userData) {
    document.getElementById('username').textContent = userData.username;
    showView('userView');
}

function updateUI() {
    updateSubscriptionUI();
    updateToggleUI();
    updateMetrics();
}

function updateSubscriptionUI() {
    chrome.storage.local.get(['subscriptionStatus', 'subscriptionPlan', 'deviceLimit', 'subscriptionEnd'], (result) => {
        const subscriptionInfo = document.getElementById('subscriptionInfo');
        const subscribeBtn = document.getElementById('subscribeBtn');
        
        if (result.subscriptionStatus === 'active') {
            subscriptionInfo.innerHTML = `
                <p>Plan: ${result.subscriptionPlan}</p>
                <p>Status: Active</p>
                <p>Device Limit: ${result.deviceLimit}</p>
                <p>Renewal Date: ${new Date(result.subscriptionEnd).toLocaleDateString()}</p>
            `;
            subscribeBtn.classList.add('hidden');
        } else {
            subscriptionInfo.innerHTML = `<p>No active subscription</p>`;
            subscribeBtn.classList.remove('hidden');
        }
    });
}

function updateToggleUI() {
    chrome.storage.local.get(['subscriptionStatus', 'adMuterEnabled'], (result) => {
        const adMuterToggle = document.getElementById('adMuterToggle');
        const statusText = document.getElementById('statusText');
        const statusIndicator = document.getElementById('statusIndicator');
        
        if (result.subscriptionStatus === 'active') {
            adMuterToggle.disabled = false;
            adMuterToggle.checked = result.adMuterEnabled;
            statusText.textContent = result.adMuterEnabled ? 'Active' : 'Inactive';
            statusIndicator.style.backgroundColor = result.adMuterEnabled ? '#4CAF50' : '#F44336';
        } else {
            adMuterToggle.disabled = true;
            adMuterToggle.checked = false;
            statusText.textContent = 'Subscription Required';
            statusIndicator.style.backgroundColor = '#F44336';
        }
    });
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

// Ad Muter
function initializeAdMuter() {
    chrome.storage.sync.get(['adMuterEnabled'], (result) => {
        const enabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : false;
        chrome.storage.sync.set({ adMuterEnabled: enabled }, () => {
            updateToggleUI();
        });
    });
}

function handleToggle() {
    const enabled = document.getElementById('adMuterToggle').checked;
    chrome.storage.sync.set({ adMuterEnabled: enabled }, () => {
        console.log('Ad Muter state saved:', enabled);
        updateToggleUI();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleAdMuter', enabled });
            }
        });
    });
}

// Utilities
async function getAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['accessToken', 'tokenExpiry', 'refreshToken'], async (result) => {
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

async function fetchDevices() {
    try {
        const data = await getDevices();
        updateDevicesUI(data);
    } catch (error) {
        showError('Failed to fetch device information');
    }
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

function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    document.body.appendChild(errorElement);
    setTimeout(() => {
        errorElement.remove();
    }, 3000);
}