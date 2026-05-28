// src/contexts/AuthContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('danzo_entregador_token');
    const usuarioSalvo = localStorage.getItem('danzo_entregador_usuario');
    if (token && usuarioSalvo) {
      try {
        setUsuario(JSON.parse(usuarioSalvo));
      } catch {
        localStorage.removeItem('danzo_entregador_usuario');
      }
    }
    setCarregando(false);
  }, []);

  async function login(whatsapp, senha, whatsappLoja) {
    const { data } = await api.post('/auth/entregador/login', { whatsapp, senha, whatsapp_loja: whatsappLoja });
    localStorage.setItem('danzo_entregador_token', data.token);
    localStorage.setItem('danzo_entregador_usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
    return data.usuario;
  }

  function logout() {
    localStorage.removeItem('danzo_entregador_token');
    localStorage.removeItem('danzo_entregador_usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, setUsuario, login, logout, carregando }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}