// src/pages/Principal.js
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function Principal() {
  const { usuario, logout } = useAuth();
  const [disponivel, setDisponivel] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [emRota, setEmRota] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const gpsRef = useRef(null);

  useEffect(() => {
    buscarPedidos();
    const intervalo = setInterval(buscarPedidos, 15000);

    if (!navigator.geolocation) return;
    gpsRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await api.patch(`/entregadores/${usuario.id}/gps`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        } catch (err) {
          console.error('Erro ao enviar GPS:', err.message);
        }
      },
      (err) => console.error('Erro GPS:', err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );

    return () => {
      clearInterval(intervalo);
      if (gpsRef.current !== null) {
        navigator.geolocation.clearWatch(gpsRef.current);
        gpsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscarPedidos() {
    try {
      const { data } = await api.get('/entregadores/meus-pedidos');
      setPedidos(data.pedidos || []);
      setEmRota(data.em_rota || false);
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function alternarDisponibilidade() {
    try {
      await api.patch('/entregadores/disponibilidade', { disponivel: !disponivel });
      setDisponivel(!disponivel);
    } catch (err) {
      alert('Erro ao alterar disponibilidade.');
    }
  }

  async function iniciarEntregas() {
    try {
      await api.post('/entregadores/iniciar-rota');
      setEmRota(true);
      buscarPedidos();
    } catch (err) {
      alert('Erro ao iniciar entregas.');
    }
  }

  async function confirmarEntrega(pedidoId) {
    try {
      await api.post(`/entregadores/confirmar-entrega/${pedidoId}`);
      buscarPedidos();
    } catch (err) {
      alert('Erro ao confirmar entrega.');
    }
  }

  function abrirRota(endereco) {
    const enc = encodeURIComponent(endereco);
    window.open(`https://www.google.com/maps/search/?api=1&query=${enc}`, '_blank');
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <p style={styles.saudacao}>Olá, {usuario?.nome?.split(' ')[0]}! 👋</p>
          <p style={styles.subheader}>{emRota ? '🛵 Em rota de entrega' : 'Aguardando pedidos'}</p>
        </div>
        <button onClick={logout} style={styles.sair}>Sair</button>
      </div>

      {/* Toggle disponibilidade */}
      <div style={styles.toggleCard}>
        <span style={styles.toggleLabel}>
          {disponivel ? '🟢 Disponível' : '🔴 Indisponível'}
        </span>
        <div
          onClick={alternarDisponibilidade}
          style={{ ...styles.toggle, background: disponivel ? '#1AABCF' : '#444' }}
        >
          <div style={{ ...styles.toggleBolinha, marginLeft: disponivel ? 22 : 2 }} />
        </div>
      </div>

      {/* Conteúdo */}
      {carregando ? (
        <p style={styles.aviso}>Carregando...</p>
      ) : pedidos.length === 0 ? (
        <div style={styles.semPedidos}>
          <p style={styles.emoji}>📦</p>
          <p style={styles.aviso}>Nenhum pedido atribuído no momento.</p>
          <p style={styles.avisoSub}>Aguarde, avisaremos quando chegar!</p>
          <button onClick={buscarPedidos} style={styles.botaoSecundario}>
            Atualizar
          </button>
        </div>
      ) : (
        <div>
          {!emRota && (
            <button onClick={iniciarEntregas} style={styles.botaoPrimario}>
              🛵 Iniciar Entregas ({pedidos.length} pedido{pedidos.length > 1 ? 's' : ''})
            </button>
          )}

          {pedidos.map((pedido) => (
            <div key={pedido.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.numeroPedido}>Pedido #{pedido.numero}</span>
                <span style={styles.valor}>R$ {Number(pedido.total).toFixed(2)}</span>
              </div>

              <p style={styles.cliente}>👤 {pedido.cliente_nome}</p>
              <p style={styles.endereco}>📍 {pedido.endereco_entrega}</p>
              <p style={styles.pagamento}>
                💳 {pedido.forma_pagamento}
                {pedido.troco ? ` — Troco para R$ ${Number(pedido.troco).toFixed(2)}` : ''}
              </p>

              {emRota && (
                <div style={styles.botoes}>
                  <button onClick={() => abrirRota(pedido.endereco_entrega)} style={styles.botaoMapa}>
                    🗺️ Abrir Rota
                  </button>
                  <button onClick={() => confirmarEntrega(pedido.id)} style={styles.botaoConfirmar}>
                    ✅ Confirmar Entrega
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: '#0f1117', padding: 20, color: '#fff', fontFamily: 'Inter, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  saudacao: { fontSize: 20, fontWeight: 700, color: '#1AABCF', margin: 0, fontFamily: 'Sora, sans-serif' },
  subheader: { fontSize: 13, color: '#888', margin: 0 },
  sair: { background: 'none', border: '1px solid #333', color: '#888', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  toggleCard: { background: '#1a1d27', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  toggleLabel: { fontSize: 15, fontWeight: 600 },
  toggle: { width: 48, height: 26, borderRadius: 13, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' },
  toggleBolinha: { width: 22, height: 22, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, transition: 'margin 0.2s' },
  semPedidos: { textAlign: 'center', marginTop: 60 },
  emoji: { fontSize: 48, margin: 0 },
  aviso: { color: '#ccc', fontSize: 16 },
  avisoSub: { color: '#666', fontSize: 13 },
  botaoPrimario: { width: '100%', padding: 16, background: '#1AABCF', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 16 },
  botaoSecundario: { padding: '10px 24px', background: '#1a1d27', color: '#1AABCF', border: '1px solid #1AABCF', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  card: { background: '#1a1d27', borderRadius: 12, padding: 18, marginBottom: 14 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 10 },
  numeroPedido: { color: '#1AABCF', fontWeight: 700, fontSize: 16 },
  valor: { color: '#E8611A', fontWeight: 700, fontSize: 16 },
  cliente: { color: '#ccc', fontSize: 14, margin: '4px 0' },
  endereco: { color: '#fff', fontSize: 14, margin: '4px 0', fontWeight: 500 },
  pagamento: { color: '#aaa', fontSize: 13, margin: '4px 0 12px' },
  botoes: { display: 'flex', gap: 10 },
  botaoMapa: { flex: 1, padding: 12, background: '#1a2a35', color: '#1AABCF', border: '1px solid #1AABCF', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  botaoConfirmar: { flex: 1, padding: 12, background: '#1AABCF', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
};