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
    background: '#0f1117',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    background: '#1a1d27',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 380,
    textAlign: 'center',
  },
  logo: { fontSize: 48, marginBottom: 8 },
  titulo: { color: '#1AABCF', fontFamily: 'Sora, sans-serif', fontSize: 24, margin: 0 },
  subtitulo: { color: '#888', fontSize: 14, marginBottom: 28 },
  form: { textAlign: 'left' },
  campo: { marginBottom: 16 },
  label: { color: '#ccc', fontSize: 13, display: 'block', marginBottom: 6 },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: '1.5px solid #2e3245',
    background: '#0f1117',
    color: '#fff',
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
  erro: { color: '#ff4d4d', fontSize: 13, marginBottom: 12 },
  botao: {
    width: '100%', padding: '14px',
    background: '#1AABCF', color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 16, fontWeight: 600, cursor: 'pointer',
    marginTop: 4,
  },
  esqueci: { color: '#666', fontSize: 12, marginTop: 20 },
};