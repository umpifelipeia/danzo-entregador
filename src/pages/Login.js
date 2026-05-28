// src/pages/Login.js
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [whatsappLoja, setWhatsappLoja] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const usuario = await login(whatsapp, senha, whatsappLoja);
      if (usuario.tipo !== 'entregador') {
        setErro('Acesso permitido apenas para entregadores.');
        return;
      }
      navigate('/');
    } catch (err) {
      setErro(err.response?.data?.message || 'Usuário ou senha incorretos.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🛵</div>
        <h1 style={styles.titulo}>Danzo Entregas</h1>
        <p style={styles.subtitulo}>Área do Entregador</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.campo}>
            <label style={styles.label}>WhatsApp da Loja</label>
            <input
              type="tel"
              value={whatsappLoja}
              onChange={(e) => setWhatsappLoja(e.target.value)}
              style={styles.input}
              placeholder="11999999999"
              required
            />
          </div>

          <div style={styles.campo}>
            <label style={styles.label}>WhatsApp</label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              style={styles.input}
              placeholder="11999999999"
              required
            />
          </div>

          <div style={styles.campo}>
            <label style={styles.label}>Senha</label>
            <div style={styles.senhaWrapper}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                style={{ ...styles.input, paddingRight: 44 }}
                placeholder="••••••"
                required
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                style={styles.olho}
              >
                {mostrarSenha ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {erro && <p style={styles.erro}>{erro}</p>}

          <button type="submit" style={styles.botao} disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={styles.esqueci}>
          Esqueceu a senha? Fale com o dono da loja.
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: 36,
    width: '100%',
    maxWidth: 380,
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(30,41,59,0.12), 0 2px 8px rgba(30,41,59,0.07)',
  },
  logo: { fontSize: 48, marginBottom: 8 },
  titulo: { color: '#1e293b', fontFamily: 'Sora, sans-serif', fontSize: 24, margin: 0, fontWeight: 700 },
  subtitulo: { color: '#64748b', fontSize: 14, marginBottom: 28, marginTop: 4 },
  form: { textAlign: 'left' },
  campo: { marginBottom: 16 },
  label: { color: '#475569', fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 500 },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1.5px solid #e2e8f0',
    background: '#f8fafc',
    color: '#1e293b',
    fontSize: 15,
    boxSizing: 'border-box',
    outline: 'none',
  },
  senhaWrapper: { position: 'relative' },
  olho: {
    position: 'absolute', right: 12, top: '50%',
    transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
  },
  erro: { color: '#ef4444', fontSize: 13, marginBottom: 12 },
  botao: {
    width: '100%', padding: '14px',
    background: '#1AABCF', color: '#fff',
    border: 'none', borderRadius: 12,
    fontSize: 16, fontWeight: 600, cursor: 'pointer',
    marginTop: 4,
    boxShadow: '0 4px 14px rgba(26,171,207,0.35)',
  },
  esqueci: { color: '#94a3b8', fontSize: 12, marginTop: 20 },
};
