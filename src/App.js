// src/App.js
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Principal from './pages/Principal';
import TrocarSenha from './pages/TrocarSenha';

function GpsGate({ children }) {
  const [gpsStatus, setGpsStatus] = useState('verificando');

  function solicitarGps() {
    setGpsStatus('verificando');
    navigator.geolocation.getCurrentPosition(
      () => setGpsStatus('concedido'),
      () => setGpsStatus('negado'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('negado'); return; }
    solicitarGps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gpsStatus === 'verificando') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <p style={{ fontSize: 56, marginBottom: 16 }}>📍</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1AABCF' }}>Verificando GPS...</p>
          <p style={{ fontSize: 13, color: '#888', marginTop: 8 }}>Aguarde a solicitação de localização</p>
        </div>
      </div>
    );
  }

  if (gpsStatus === 'negado') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: 340 }}>
          <p style={{ fontSize: 56, marginBottom: 16 }}>🚫</p>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#E8611A', marginBottom: 12, fontFamily: 'Sora, sans-serif' }}>
            Localização obrigatória
          </h2>
          <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.7, marginBottom: 8 }}>
            Para trabalhar como entregador é necessário autorizar o acesso à localização do celular.
          </p>
          <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6, marginBottom: 24 }}>
            <strong style={{ color: '#aaa' }}>Como ativar no Android:</strong><br />
            Toque no cadeado ou ícone ⓘ na barra do navegador → Permissões → Localização → Permitir<br /><br />
            <strong style={{ color: '#aaa' }}>Como ativar no iPhone:</strong><br />
            Configurações → Safari → Localização → Permitir
          </p>
          <button
            onClick={solicitarGps}
            style={{ width: '100%', background: '#1AABCF', color: '#fff', border: 'none', borderRadius: 12, padding: '16px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return children;
}

function RotaProtegida({ children }) {
  const { usuario, carregando } = useAuth();
  if (carregando) return <div style={{ color: '#fff', textAlign: 'center', marginTop: 100 }}>Carregando...</div>;
  if (!usuario) return <Navigate to="/login" />;
  if (usuario.primeiro_acesso) return <Navigate to="/trocar-senha" />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/trocar-senha" element={<TrocarSenha />} />
          <Route path="/" element={
            <RotaProtegida>
              <GpsGate>
                <Principal />
              </GpsGate>
            </RotaProtegida>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
