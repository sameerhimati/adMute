import { encrypt, decrypt } from '../crypto-utils.js';

const API_URL = 'http://localhost:5000';  // Replace with your actual API URL

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const userInfo = document.getElementById('userInfo');
    const adMuterControls = document.getElementById('adMuterControls');
    
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    const loginButton = document.getElementById('loginButton');
    const registerButton = document.getElementById('registerButton');
    const logoutButton = document.getElementById('logoutButton');
    const toggleButton = document.getElementById('adMuterToggle');
    const statusSpan = document.getElementById('statusText');
    
    showRegisterLink.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });
    
    showLoginLink.addEventListener('click', () => {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });
    
    loginButton.addEventListener('click', handleLogin);
    registerButton.addEventListener('click', handleRegister);
    logoutButton.addEventListener('click', handleLogout);
    
    toggleButton.addEventListener('change', handleToggle);
    
    checkAuthStatus();
    checkAuthState();
    initializeAdMuter();
});

function checkAuthState() {
    chrome.storage.local.get(['accessToken', 'tokenExpiry'], (result) => {
        if (result.accessToken && result.tokenExpiry) {
            const currentTime = new Date();
            const expiryTime = new Date(result.tokenExpiry);
            
            if (currentTime < expiryTime) {
                fetchUserInfo(result.accessToken);
            } else {
                showLoginForm();
            }
        } else {
            showLoginForm();
        }
    });
}

function checkAuthStatus() {
    chrome.storage.local.get(['accessToken'], (result) => {
        if (result.accessToken) {
            fetchUserInfo(result.accessToken);
        } else {
            showLoginForm();
        }
    });
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('userInfo').classList.add('hidden');
    document.getElementById('adMuterControls').classList.add('hidden');
}

function showUserInfo(username) {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('adMuterControls').classList.remove('hidden');
    document.getElementById('username').textContent = username;
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

async function handleLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const expiryTime = new Date(Date.now() + 3600 * 1000).toISOString();
            storeTokens(data.access_token, data.refresh_token, expiryTime);
            fetchUserInfo(data.access_token);
        } else {
            alert(data.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('An error occurred during login');
    }
}

async function handleRegister() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const expiryTime = new Date(Date.now() + 3600 * 1000).toISOString();
            storeTokens(data.access_token, data.refresh_token, expiryTime);
            fetchUserInfo(data.access_token);
        } else {
            alert(data.message || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('An error occurred during registration');
    }
}

function handleLogout() {
    chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiry'], () => {
        showLoginForm();
    });
}

async function fetchUserInfo(token) {
    try {
        const response = await fetch(`${API_URL}/auth/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        
        if (response.ok) {
            const userData = await response.json();
            showUserInfo(userData.username);
        } else {
            throw new Error('Failed to fetch user info');
        }
    } catch (error) {
        console.error('Error fetching user info:', error);
        chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiry'], () => {
            showLoginForm();
        });
    }
}

function initializeAdMuter() {
    let enabled = true;
    const toggleButton = document.getElementById('adMuterToggle');
    const statusSpan = document.getElementById('statusText');

    chrome.storage.sync.get(['adMuterEnabled'], (result) => {
        enabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
        toggleButton.checked = enabled;
        statusSpan.textContent = enabled ? 'Active' : 'Inactive';
        updateMetrics();
    });

    toggleButton.addEventListener('change', handleToggle);
}

function handleToggle() {
    const enabled = document.getElementById('adMuterToggle').checked;
    const statusSpan = document.getElementById('statusText');
    statusSpan.textContent = enabled ? 'Active' : 'Inactive';

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