import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
});

let tokenProvider = () => null;

export const configureAuthTokenProvider = (provider) => {
  tokenProvider = provider;
};

http.interceptors.request.use((config) => {
  const token = tokenProvider();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const unwrap = (response) => response.data?.data;

