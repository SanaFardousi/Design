// Import axios library to handle HTTP requests
import axios from 'axios';

// Base URL of the backend API
// This is the IP address + backend port + /api route
const API_BASE_URL = 'http://localhost:5000/api';

// Create a reusable axios instance
// This prevents repeating baseURL and headers in every request
const api = axios.create({
  baseURL: API_BASE_URL, // All requests will automatically use this base URL
  headers: {
    'Content-Type': 'application/json', // Send data in JSON format
  },
});

// Add an interceptor to attach authentication token automatically
// This runs BEFORE every request is sent to the server
api.interceptors.request.use((config) => {

  // Get token from browser localStorage
  const token = localStorage.getItem('token');

  // If token exists, attach it to Authorization header
  // This allows protected routes on backend to verify the user
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Return updated config so request continues
  return config;
});

// Login function
// Sends email and password to backend
// Backend validates user and returns token
export const login = async (email, password) => {

  // POST request to /auth/login
  const response = await api.post('/auth/login', { email, password });

  // Return only response data (not full axios response object)
  return response.data;
};

// Export the configured axios instance
// So it can be reused in other files for API calls
export default api;