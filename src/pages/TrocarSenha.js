// src/pages/TrocarSenha.js
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function TrocarSenha() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrarSenhaAtual, setMostrarSenhaAtual] = useState(false);
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const { usuario, setUsuario } = useAuth();
  const navigate = useNavigate();

  async function handleTrocar(e) {
    e.preventDefault();
    setErro('');

    if (novaSenha.length < 6) {
      return setErro('A nova senha deve ter pelo menos 6 caracteres.');
    }
    if (novaSenha !== confirmar) {
      return setErro('As senhas não coincidem.');
    }

    try {
      setCarregando(true);
      await api.post('/entregadores/trocar-senha', {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });

      // Atualiza primeiro_acesso localmente
      const usuarioAtualizado = { ...usuario, primeiro_acesso: false };
      localStorage.setItem('usuario', JSON.stringify(usuarioAtualizado));
      setUsuario(usuarioAtualizado);

      navigate('/');
    } catch (err) {
      setErro(err.response?.data?.message || 'Erro ao trocar senha.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icone}>🔑</div>
        <h1 style={styles.titulo}>Crie sua senha</h1>
        <p style={styles.subtitulo}>
          Este é seu primeiro acesso. Troque a senha temporária para continuar.
        </p>

        <form onSubmit={handleTrocar} style={styles.form}>
          <div style={styles.campo}>
            <label style={styles.label}>Senha temporária</label>
            <div style={styles.senhaWrapper}>
              <input
                type={mostrarSenhaAtual ? 'text' : 'password'}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                style={{ ...styles.input, paddingRight: 44 }}
                placeholder="Os 4 últimos dígitos do seu WhatsApp"
                required
              />
              <button type="button" onClick={() => setMostrarSenhaAtual(!mostrarSenhaAtual)} style={styles.olho}>
                {mostrarSenhaAtual ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={styles.campo}>
            <label style={styles.label}>Nova senha</label>
            <div style={styles.senhaWrapper}>
              <input
                type={mostrarNovaSenha ? 'text' : 'password'}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                style={{ ...styles.input, paddingRight: 44 }}
                placeholder="Mínimo 6 caracteres"
                required
              />
              <button type="button" onClick={() => setMostrarNovaSenha(!mostrarNovaSenha)} style={styles.olho}>
                {mostrarNovaSenha ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={styles.campo}>
            <label style={styles.label}>Confirmar nova senha</label>
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              style={styles.input}
              placeholder="Repita a nova senha"
              required
            />
          </div>

          {erro && <p style={styles.erro}>{erro}</p>}

          <button type="submit" style={styles.botao} disabled={carregando}>
            {carregando ? 'Salvando...' : 'Salvar senha'}
          </button>
        </form>
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
  icone: { fontSize: 48, marginBottom: 8 },
  titulo: { color: '#1AABCF', fontFamily: 'Sora, sans-serif', fontSize: 22, margin: '0 0 8px' },
  subtitulo: { color: '#888', fontSize: 13, marginBottom: 28, lineHeight: 1.5 },
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
};