// src/App.js
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Principal from './pages/Principal';
import TrocarSenha from './pages/TrocarSenha';

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
              <Principal />
            </RotaProtegida>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;