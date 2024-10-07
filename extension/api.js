const API_URL = 'http://localhost:5000';

async function getAuthenticatedRequest(endpoint, options = {}) {
  const { accessToken } = await new Promise((resolve) => 
    chrome.storage.local.get(['accessToken'], resolve)
  );

  if (!accessToken) {
    throw new Error('No access token available');
  }

  const headers = new Headers(options.headers || {});
  headers.append('Authorization', `Bearer ${accessToken}`);

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });
}

export async function getUserInfo() {
  const response = await getAuthenticatedRequest('/auth/user');
  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }
  return response.json();
}

export async function updateUserMetrics(metrics) {
  const response = await getAuthenticatedRequest('/user/metrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metrics)
  });
  if (!response.ok) {
    throw new Error('Failed to update user metrics');
  }
  return response.json();
}

// Add more API calls as needed