// src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://danzo-erp-production.up.railway.app'

// Alerta em dev se a URL vier do fallback hardcoded
if (process.env.NODE_ENV === 'development' && !process.env.REACT_APP_API_URL) {
  console.warn('[api] REACT_APP_API_URL não definida — usando URL de produção em dev')
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Interceptor — adiciona token em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('danzo_entregador_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor — trata erros globais
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('danzo_entregador_token');
      localStorage.removeItem('danzo_entregador_usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;