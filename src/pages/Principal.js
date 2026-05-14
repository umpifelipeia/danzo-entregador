import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';

async function geocodificar(endereco) {
  try {
    const res = await fetch(`${NOMINATIM}/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'DanzoEntregador/1.0' }
    });
    const data = await res.json();
    if (data?.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {}
  return null;
}

async function calcularDistancia(origemLat, origemLon, destinoLat, destinoLon) {
  try {
    const url = `${OSRM}/route/v1/driving/${origemLon},${origemLat};${destinoLon},${destinoLat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok') return data.routes[0].distance / 1000;
  } catch {}
  return 9999;
}

export default function Principal() {
  const { usuario, logout } = useAuth();
  const [disponivel, setDisponivel] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [emRota, setEmRota] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [pedidoDetalhe, setPedidoDetalhe] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [gpsAtual, setGpsAtual] = useState(null);
  const gpsRef = useRef(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [obsConfirmacao, setObsConfirmacao] = useState('');
  const [mostrarObs, setMostrarObs] = useState(false);
  const [pedidoConfirmando, setPedidoConfirmando] = useState(null);

  useEffect(() => {
    buscarPedidos();
    const intervalo = setInterval(buscarPedidos, 15000);

    function aoFicarOnline() {
      setOnline(true);
      processarFilaOffline();
      buscarPedidos();
    }
    function aoFicarOffline() { setOnline(false); }
    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);

    if (!navigator.geolocation) return;
    gpsRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setGpsAtual(coords);
        try {
          await api.patch(`/entregadores/${usuario.id}/gps`, {
            lat: coords.lat, lng: coords.lon,
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
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
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
      const lista = data.pedidos || [];
      const listaPorDistancia = await ordenarPorDistancia(lista);
setPedidos(listaPorDistancia);
      setEmRota(data.em_rota || false);
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function ordenarPorDistancia(lista) {
    if (!gpsAtual || lista.length <= 1) return lista;
    const comDistancia = await Promise.all(lista.map(async p => {
      if (!p.endereco_entrega || p.endereco_entrega === 'Endereço não informado') {
        return { ...p, distancia: 9999 };
      }
      const coords = await geocodificar(p.endereco_entrega);
      if (!coords) return { ...p, distancia: 9999 };
      const dist = await calcularDistancia(gpsAtual.lat, gpsAtual.lon, coords.lat, coords.lon);
      return { ...p, distancia: dist };
    }));
    return comDistancia.sort((a, b) => a.distancia - b.distancia);
  }

  async function alternarDisponibilidade() {
    try {
      await api.patch('/entregadores/disponibilidade', { disponivel: !disponivel });
      setDisponivel(!disponivel);
    } catch {
      alert('Erro ao alterar disponibilidade.');
    }
  }

  async function iniciarEntregas() {
    try {
      await api.post('/entregadores/iniciar-rota');
      setEmRota(true);
      buscarPedidos();
      if (pedidoDetalhe) setPedidoDetalhe(p => ({ ...p, status: 'em_rota' }));
    } catch {
      alert('Erro ao iniciar entregas.');
    }
  }

  async function confirmarEntrega(pedidoId) {
    try {
      setConfirmando(true);
      await api.post(`/entregadores/confirmar-entrega/${pedidoId}`);
      setPedidoDetalhe(null);
      buscarPedidos();
    } catch {
      alert('Erro ao confirmar entrega.');
    } finally {
      setConfirmando(false);
    }
  }

  async function processarFilaOffline() {
    try {
      const fila = JSON.parse(localStorage.getItem('danzo_fila_offline') || '[]');
      if (fila.length === 0) return;
      const restante = [];
      for (const item of fila) {
        try {
          await api.post(`/entregadores/confirmar-entrega/${item.pedidoId}`, { observacao: item.obs });
        } catch {
          restante.push(item);
        }
      }
      localStorage.setItem('danzo_fila_offline', JSON.stringify(restante));
      if (restante.length < fila.length) buscarPedidos();
    } catch {}
  }

  async function confirmarEntrega(pedidoId, obs = '') {
    if (!navigator.onLine) {
      const fila = JSON.parse(localStorage.getItem('danzo_fila_offline') || '[]');
      fila.push({ pedidoId, obs, at: new Date().toISOString() });
      localStorage.setItem('danzo_fila_offline', JSON.stringify(fila));
      setPedidos(prev => prev.filter(p => p.id !== pedidoId));
      setPedidoDetalhe(null);
      setMostrarObs(false);
      setObsConfirmacao('');
      alert('Sem conexão. Confirmação salva e será enviada ao reconectar.');
      return;
    }
    try {
      setConfirmando(true);
      await api.post(`/entregadores/confirmar-entrega/${pedidoId}`, { observacao: obs });
      setPedidoDetalhe(null);
      setMostrarObs(false);
      setObsConfirmacao('');
      buscarPedidos();
    } catch {
      alert('Erro ao confirmar entrega.');
    } finally {
      setConfirmando(false);
    }
  }

  function abrirOSM(endereco) {
    window.open(`https://www.openstreetmap.org/search?query=${encodeURIComponent(endereco)}`, '_blank');
  }

  function abrirMaps(endereco) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`, '_blank');
  }

  function abrirWaze(endereco) {
    window.open(`https://waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes`, '_blank');
  }

  async function abrirDetalhe(pedido) {
    setPedidoDetalhe(pedido);
  }

  const pedidosAguardando = pedidos.filter(p => p.status === 'entregador_atribuido');
  const pedidosEmRota = pedidos.filter(p => p.status === 'em_rota');

  // Tela de detalhe
  if (pedidoDetalhe) {
    const itens = pedidoDetalhe.itens_pedido || [];
    return (
      <div style={s.container}>
        {!online && (
          <div style={{ background: '#E8611A', color: '#fff', textAlign: 'center', padding: '8px', fontSize: 13, fontWeight: 600 }}>
            📡 Sem conexão — modo offline
          </div>
        )}
        <div style={s.header}>
          <button onClick={() => setPedidoDetalhe(null)} style={s.btnVoltar}>← Voltar</button>
          <button onClick={logout} style={s.sair}>Sair</button>
        </div>

        <p style={s.titulo}>Pedido #{pedidoDetalhe.numero}</p>
        <span style={{ ...s.badge, background: pedidoDetalhe.status === 'em_rota' ? '#1AABCF' : '#E8A000' }}>
          {pedidoDetalhe.status === 'em_rota' ? '🛵 Em rota' : '⏳ Aguardando início da rota'}
        </span>

        <div style={s.card}>
          <Row label="👤 Cliente" val={pedidoDetalhe.cliente_nome} />
          <Row label="📍 Endereço" val={pedidoDetalhe.endereco_entrega} />
          <Row label="💳 Pagamento" val={pedidoDetalhe.forma_pagamento} />
          {pedidoDetalhe.troco && <Row label="💵 Troco para" val={pedidoDetalhe.troco} />}
          {pedidoDetalhe.observacoes && <Row label="📝 Obs" val={pedidoDetalhe.observacoes} />}
          <Row label="💰 Total" val={`R$ ${Number(pedidoDetalhe.total).toFixed(2)}`} destaque />
        </div>

        {itens.length > 0 && (
          <div style={s.card}>
            <p style={s.secaoTitulo}>🛒 Itens do pedido</p>
            {itens.map((item, i) => (
              <div key={i} style={s.itemRow}>
                <span style={s.itemNome}>{item.quantidade}x {item.nome_produto}{item.nome_variacao ? ` (${item.nome_variacao})` : ''}</span>
                <span style={s.itemVal}>R$ {Number(item.subtotal).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={() => abrirMaps(pedidoDetalhe.endereco_entrega)} style={{ ...s.botaoNav, flex: 1 }}>🗺️ Maps</button>
          <button onClick={() => abrirWaze(pedidoDetalhe.endereco_entrega)} style={{ ...s.botaoNav, flex: 1, borderColor: '#00AAFF', color: '#00AAFF' }}>🚗 Waze</button>
          <button onClick={() => abrirOSM(pedidoDetalhe.endereco_entrega)} style={{ ...s.botaoNav, flex: 1, borderColor: '#22c55e', color: '#22c55e' }}>🌍 OSM</button>
        </div>

        {pedidoDetalhe.status === 'entregador_atribuido' && (
          <button onClick={iniciarEntregas} style={{ ...s.botaoPrimario, marginTop: 10 }}>
            🛵 Iniciar Rota
          </button>
        )}
        {pedidoDetalhe.status === 'em_rota' && (
          <div style={{ marginTop: 10 }}>
            {!mostrarObs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => confirmarEntrega(pedidoDetalhe.id)} disabled={confirmando}
                  style={{ ...s.botaoPrimario, background: confirmando ? '#555' : '#22c55e', marginBottom: 0 }}>
                  {confirmando ? 'Confirmando...' : '✅ Confirmar Entrega'}
                </button>
                <button onClick={() => setMostrarObs(true)}
                  style={{ width: '100%', padding: 10, background: 'none', border: '1px solid #444', borderRadius: 8, color: '#888', fontSize: 13, cursor: 'pointer' }}>
                  + Adicionar observação
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={obsConfirmacao} onChange={e => setObsConfirmacao(e.target.value)}
                  placeholder="Observação opcional (ex: deixei na portaria)"
                  style={{ width: '100%', padding: 12, background: '#1a1d27', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'none', height: 80, boxSizing: 'border-box' }} />
                <button onClick={() => confirmarEntrega(pedidoDetalhe.id, obsConfirmacao)} disabled={confirmando}
                  style={{ ...s.botaoPrimario, background: confirmando ? '#555' : '#22c55e', marginBottom: 0 }}>
                  {confirmando ? 'Confirmando...' : '✅ Confirmar Entrega'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Tela principal
  return (
    <div style={s.container}>
        {!online && (
          <div style={{ background: '#E8611A', color: '#fff', textAlign: 'center', padding: '8px', fontSize: 13, fontWeight: 600 }}>
            📡 Sem conexão — modo offline
          </div>
        )}
      <div style={s.header}>
        <div>
          <p style={s.saudacao}>Olá, {usuario?.nome?.split(' ')[0]}! 👋</p>
          <p style={s.subheader}>{emRota ? '🛵 Em rota de entrega' : 'Aguardando pedidos'}</p>
        </div>
        <button onClick={logout} style={s.sair}>Sair</button>
      </div>

      <div style={s.toggleCard}>
        <span style={s.toggleLabel}>{disponivel ? '🟢 Disponível' : '🔴 Indisponível'}</span>
        <div onClick={alternarDisponibilidade} style={{ ...s.toggle, background: disponivel ? '#1AABCF' : '#444' }}>
          <div style={{ ...s.toggleBolinha, marginLeft: disponivel ? 22 : 2 }} />
        </div>
      </div>

      {carregando ? (
        <p style={s.aviso}>Carregando...</p>
      ) : pedidos.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <p style={{ fontSize: 48, margin: 0 }}>📦</p>
          <p style={s.aviso}>Nenhum pedido atribuído no momento.</p>
          <p style={{ color: '#666', fontSize: 13 }}>Aguarde, avisaremos quando chegar!</p>
          <button onClick={buscarPedidos} style={s.botaoSec}>Atualizar</button>
        </div>
      ) : (
        <div>
          {pedidosAguardando.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={s.secaoTitulo}>⏳ Aguardando iniciar rota</p>
              {!emRota && (
                <button onClick={iniciarEntregas} style={s.botaoPrimario}>
                  🛵 Iniciar Entregas ({pedidosAguardando.length} pedido{pedidosAguardando.length > 1 ? 's' : ''})
                </button>
              )}
              {pedidosAguardando.map(p => (
                <CardPedido key={p.id} pedido={p} onClick={() => abrirDetalhe(p)} onMaps={() => abrirMaps(p.endereco_entrega)} onWaze={() => abrirWaze(p.endereco_entrega)} onOsm={() => abrirOSM(p.endereco_entrega)} cor="#E8A000" />
              ))}
            </div>
          )}

          {pedidosEmRota.length > 0 && (
            <div>
              <p style={s.secaoTitulo}>🛵 Em rota</p>
              {pedidosEmRota.map(p => (
                <CardPedido key={p.id} pedido={p} onClick={() => abrirDetalhe(p)} onMaps={() => abrirMaps(p.endereco_entrega)} onWaze={() => abrirWaze(p.endereco_entrega)} onOsm={() => abrirOSM(p.endereco_entrega)} onConfirmar={() => confirmarEntrega(p.id)} cor="#1AABCF" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, val, destaque }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #2a2d3a' }}>
      <span style={{ color: '#888', fontSize: 13, minWidth: 110 }}>{label}</span>
      <span style={{ color: destaque ? '#E8611A' : '#fff', fontSize: 13, textAlign: 'right', flex: 1, fontWeight: destaque ? 700 : 400 }}>{val}</span>
    </div>
  );
}

function CardPedido({ pedido, onClick, onMaps, onWaze, onOsm, onConfirmar, cor }) {
  return (
    <div style={{ background: '#1a1d27', borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: `4px solid ${cor}` }}>
      <div onClick={onClick} style={{ cursor: 'pointer', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#1AABCF', fontWeight: 700, fontSize: 16 }}>#{pedido.numero}</span>
          <span style={{ color: '#E8611A', fontWeight: 700, fontSize: 16 }}>R$ {Number(pedido.total).toFixed(2)}</span>
        </div>
        <p style={{ color: '#ccc', fontSize: 13, margin: '2px 0' }}>👤 {pedido.cliente_nome}</p>
        <p style={{ color: '#fff', fontSize: 13, margin: '2px 0', fontWeight: 500 }}>📍 {pedido.endereco_entrega}</p>
        <p style={{ color: '#aaa', fontSize: 12, margin: '2px 0' }}>
          💳 {pedido.forma_pagamento}{pedido.troco ? ` — Troco para ${pedido.troco}` : ''}
        </p>
        <p style={{ color: cor, fontSize: 11, textAlign: 'right', margin: '6px 0 0' }}>Ver detalhes →</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
       <button onClick={onMaps} style={{ flex: 1, padding: '10px 0', background: '#1a2a35', color: '#1AABCF', border: '1px solid #1AABCF', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗺️ Maps</button>
        <button onClick={onWaze} style={{ flex: 1, padding: '10px 0', background: '#1a2035', color: '#00AAFF', border: '1px solid #00AAFF', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🚗 Waze</button>
        <button onClick={onOsm} style={{ flex: 1, padding: '10px 0', background: '#1a2a1a', color: '#22c55e', border: '1px solid #22c55e', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🌍 OSM</button>
        {onConfirmar && (
          <button onClick={onConfirmar} style={{ flex: 2, padding: '10px 0', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✅ Confirmar</button>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: '#0f1117', padding: 20, color: '#fff', fontFamily: 'Inter, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  saudacao: { fontSize: 20, fontWeight: 700, color: '#1AABCF', margin: 0, fontFamily: 'Sora, sans-serif' },
  subheader: { fontSize: 13, color: '#888', margin: 0 },
  sair: { background: 'none', border: '1px solid #333', color: '#888', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  btnVoltar: { background: 'none', border: 'none', color: '#1AABCF', fontSize: 15, cursor: 'pointer', padding: 0 },
  titulo: { fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: 'Sora, sans-serif', margin: '0 0 8px' },
  badge: { fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, color: '#fff', display: 'inline-block', marginBottom: 16 },
  toggleCard: { background: '#1a1d27', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  toggleLabel: { fontSize: 15, fontWeight: 600 },
  toggle: { width: 48, height: 26, borderRadius: 13, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' },
  toggleBolinha: { width: 22, height: 22, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, transition: 'margin 0.2s' },
  aviso: { color: '#ccc', fontSize: 16, textAlign: 'center' },
  secaoTitulo: { fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  botaoPrimario: { width: '100%', padding: 16, background: '#1AABCF', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12 },
  botaoSec: { padding: '10px 24px', background: '#1a1d27', color: '#1AABCF', border: '1px solid #1AABCF', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  botaoNav: { padding: 12, background: '#1a2a35', color: '#1AABCF', border: '1px solid #1AABCF', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  card: { background: '#1a1d27', borderRadius: 12, padding: 16, marginBottom: 12 },
  itemRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2d3a' },
  itemNome: { color: '#ccc', fontSize: 13 },
  itemVal: { color: '#fff', fontSize: 13, fontWeight: 600 },
};