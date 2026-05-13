// src/contexts/AuthContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const usuarioSalvo = localStorage.getItem('usuario');
    if (token && usuarioSalvo) {
      setUsuario(JSON.parse(usuarioSalvo));
    }
    setCarregando(false);
  }, []);

  async function login(whatsapp, senha, lojaId) {
  const { data } = await api.post('/auth/entregador/login', { whatsapp, senha, loja_id: lojaId });
  localStorage.setItem('token', data.token);
  localStorage.setItem('usuario', JSON.stringify(data.usuario));
  setUsuario(data.usuario);
  return data.usuario;
}

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
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