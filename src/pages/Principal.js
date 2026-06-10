import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { iniciarGpsBackground, pararGpsBackground } from '../services/gpsBackground';
import { bolhaDisponivel, temPermissaoBolha, pedirPermissaoBolha, mostrarBolha, esconderBolha } from '../services/floatingBubble';
import { registrarTokenPush } from '../services/pushNotifications';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// Cache de geocodificação para evitar requests repetidos
const geoCache = new Map();

async function geocodificar(endereco) {
  if (!endereco) return null;
  const cacheKey = endereco.toLowerCase().trim();
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey);
  try {
    const res = await fetch(`${NOMINATIM}/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'DanzoEntregador/1.0' }
    });
    const data = await res.json();
    if (data?.length > 0) {
      const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      geoCache.set(cacheKey, coords);
      return coords;
    }
  } catch {}
  return null;
}

// Fórmula de Haversine - retorna distância em km
function distanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function swPostMessage(type) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type });
  }
}

async function pedirPermissaoNotificacao() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

export default function Principal() {
  const navigate = useNavigate();
  const { usuario, logout } = useAuth();
  const [disponivel, setDisponivel] = useState(() => {
    const v = localStorage.getItem('danzo_disponivel');
    return v === null ? true : v === '1';
  });
  const [pedidos, setPedidos] = useState([]);
  const [emRota, setEmRota] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [pedidoDetalhe, setPedidoDetalhe] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [obsConfirmacao, setObsConfirmacao] = useState('');
  const [mostrarObs, setMostrarObs] = useState(false);

  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const gpsCoordRef = useRef(null);
  const ultimaAtualizacaoRef = useRef(null);
  const saudavelTimerRef = useRef(null);
  const reiniciarTimerRef = useRef(null);

  async function adquirirWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      if (wakeLockRef.current) return;
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch {}
  }

  const iniciarGPS = useCallback(async () => {
    // App nativo (Android): usa o serviço de GPS em segundo plano (foreground service).
    // Funciona com o app minimizado/fechado. Se iniciar, não usa o watchPosition.
    try {
      const usouNativo = await iniciarGpsBackground((coords) => {
        gpsCoordRef.current = coords;
        ultimaAtualizacaoRef.current = Date.now();
      });
      if (usouNativo) return;
    } catch (e) {
      console.error('GPS background indisponível, usando watchPosition:', e.message);
    }

    if (!navigator.geolocation) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearTimeout(reiniciarTimerRef.current);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        gpsCoordRef.current = coords;
        ultimaAtualizacaoRef.current = Date.now();
        try {
          await api.patch('/entregadores/meu-gps', { lat: coords.lat, lng: coords.lon });
        } catch (err) {
          console.error('Erro ao enviar GPS:', err.message);
        }
      },
      (err) => {
        console.error('Erro watchPosition:', err.message);
        reiniciarTimerRef.current = setTimeout(iniciarGPS, 6000);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pedirPermissaoNotificacao();

    buscarPedidos();
    // Intervalo vira rede de segurança (45s) — o tempo real cobre o resto.
    const intervalo = setInterval(buscarPedidos, 45000);

    // Tempo real (SSE): refaz a busca na hora quando muda algum pedido
    let es = null;
    try {
      const token = localStorage.getItem('danzo_entregador_token');
      const base = process.env.REACT_APP_API_URL || 'https://danzo-erp-production.up.railway.app';
      if (token) {
        es = new EventSource(`${base}/events?token=${encodeURIComponent(token)}`);
        es.addEventListener('pedidos', () => buscarPedidos());
      }
    } catch {}

    function aoFicarOnline() {
      setOnline(true);
      processarFilaOffline();
      buscarPedidos();
    }
    function aoFicarOffline() { setOnline(false); }
    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);

    iniciarGPS();
    adquirirWakeLock();

    // Bolinha flutuante (app nativo): pede a permissao de sobreposicao uma vez.
    (async () => {
      if (!bolhaDisponivel()) return;
      const ok = await temPermissaoBolha();
      if (!ok && !localStorage.getItem('danzo_bolha_solicitada')) {
        localStorage.setItem('danzo_bolha_solicitada', '1');
        await pedirPermissaoBolha();
      }
    })();

    // Push FCM (app nativo): pede permissao de notificacao e registra o token.
    registrarTokenPush();

    navigator.serviceWorker?.ready.then(() => {
      swPostMessage('SHOW_TRACKING');
    });

    saudavelTimerRef.current = setInterval(() => {
      const ultima = ultimaAtualizacaoRef.current;
      if (ultima && Date.now() - ultima > 90000) {
        console.warn('GPS inativo há 90s, reiniciando...');
        iniciarGPS();
      }
    }, 30000);

    function aoMudarVisibilidade() {
      if (document.visibilityState === 'visible') {
        adquirirWakeLock();
        esconderBolha(); // app em primeiro plano: esconde a bolinha
        const ultima = ultimaAtualizacaoRef.current;
        if (!ultima || Date.now() - ultima > 30000) {
          iniciarGPS();
        }
        navigator.serviceWorker?.ready.then(() => {
          swPostMessage('SHOW_TRACKING');
        });
      } else {
        mostrarBolha(); // app minimizado: mostra a bolinha por cima dos outros apps
      }
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      clearInterval(intervalo);
      if (es) es.close();
      clearInterval(saudavelTimerRef.current);
      clearTimeout(reiniciarTimerRef.current);
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      pararGpsBackground();
      esconderBolha();
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      swPostMessage('HIDE_TRACKING');
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
    const coords = gpsCoordRef.current;
    if (!coords || lista.length <= 1) return lista;
    const comDistancia = await Promise.all(lista.map(async p => {
      if (!p.endereco_entrega || p.endereco_entrega === 'Endereço não informado') {
        return { ...p, distancia: 9999 };
      }
      const dest = await geocodificar(p.endereco_entrega);
      if (!dest) return { ...p, distancia: 9999 };
      const dist = distanciaHaversine(coords.lat, coords.lon, dest.lat, dest.lon);
      return { ...p, distancia: dist };
    }));
    return comDistancia.sort((a, b) => a.distancia - b.distancia);
  }

  async function alternarDisponibilidade() {
    try {
      const novo = !disponivel;
      await api.patch('/entregadores/disponibilidade', { disponivel: novo });
      setDisponivel(novo);
      localStorage.setItem('danzo_disponivel', novo ? '1' : '0');
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
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Erro ao confirmar entrega. Tente novamente.';
      alert(msg);
    } finally {
      setConfirmando(false);
    }
  }

  async function confirmarCancelamento(pedidoId) {
    try {
      await api.post(`/entregadores/confirmar-cancelamento/${pedidoId}`);
      setPedidos(prev => prev.filter(p => p.id !== pedidoId));
      buscarPedidos();
    } catch {
      alert('Erro ao confirmar. Tente novamente.');
    }
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

  const pedidosCancelados = pedidos.filter(p => p.cancelado);
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

        <p style={s.titulo} translate="no">Pedido #{pedidoDetalhe.numero}</p>
        <span style={{ ...s.badge, background: pedidoDetalhe.status === 'em_rota' ? '#1AABCF' : '#E8A000' }}>
          {pedidoDetalhe.status === 'em_rota' ? '🛵 Em rota' : '⏳ Aguardando início da rota'}
        </span>

        <div style={s.card} translate="no">
          <Row label="👤 Cliente" val={pedidoDetalhe.cliente_nome} />
          <Row label="📍 Endereço" val={pedidoDetalhe.endereco_entrega} />
          {Number(pedidoDetalhe.taxa_entrega) > 0 ? (
            <>
              <Row label="🛒 Pedido" val={`R$ ${Math.max(0, Number(pedidoDetalhe.total) - Number(pedidoDetalhe.taxa_entrega)).toFixed(2)}`} />
              <Row label="🛵 Frete" val={`R$ ${Number(pedidoDetalhe.taxa_entrega).toFixed(2)}`} />
            </>
          ) : null}
          {pedidoDetalhe.observacoes && <Row label="📝 Observação" val={pedidoDetalhe.observacoes} />}
          <Row label="💰 Total" val={`R$ ${Number(pedidoDetalhe.total).toFixed(2)}`} destaque />
          <Row
            label="💳 Pagamento"
            val={
              pedidoDetalhe.forma_pagamento +
              (pedidoDetalhe.troco_para
                ? ` — R$ ${Number(pedidoDetalhe.troco_para).toFixed(2)}  troco: R$ ${Math.max(0, Number(pedidoDetalhe.troco_para) - Number(pedidoDetalhe.total)).toFixed(2)}`
                : '')
            }
          />
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
          <button onClick={() => abrirWaze(pedidoDetalhe.endereco_entrega)} style={{ ...s.botaoNav, flex: 1, borderColor: '#00AAFF', color: '#00AAFF', background: 'rgba(0,170,255,0.07)' }}>🚗 Waze</button>
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
                  style={{ ...s.botaoPrimario, background: confirmando ? '#94a3b8' : '#22c55e', marginBottom: 0, boxShadow: confirmando ? 'none' : '0 4px 14px rgba(34,197,94,0.3)' }}>
                  {confirmando ? 'Confirmando...' : '✅ Confirmar Entrega'}
                </button>
                <button onClick={() => setMostrarObs(true)}
                  style={{ width: '100%', padding: 10, background: 'none', border: '1.5px solid #e2e8f0', borderRadius: 10, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>
                  Observação
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={obsConfirmacao} onChange={e => setObsConfirmacao(e.target.value)}
                  placeholder="Observação opcional (ex: deixei na portaria)"
                  style={{ width: '100%', padding: 12, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, color: '#1e293b', fontSize: 13, resize: 'none', height: 80, boxSizing: 'border-box' }} />
                <button onClick={() => confirmarEntrega(pedidoDetalhe.id, obsConfirmacao)} disabled={confirmando}
                  style={{ ...s.botaoPrimario, background: confirmando ? '#94a3b8' : '#22c55e', marginBottom: 0, boxShadow: confirmando ? 'none' : '0 4px 14px rgba(34,197,94,0.3)' }}>
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
          <p style={s.saudacao} translate="no">Olá, {usuario?.nome?.split(' ')[0]}! 👋</p>
          <p style={s.subheader}>{emRota ? '🛵 Em rota de entrega' : 'Aguardando pedidos'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/entregas')} style={{ ...s.sair, color: '#1AABCF', borderColor: '#1AABCF' }}>📋 Entregas</button>
          <button onClick={logout} style={s.sair}>Sair</button>
        </div>
      </div>

      <div style={s.toggleCard}>
        <span style={s.toggleLabel}>{disponivel ? '🟢 Disponível' : '🔴 Indisponível'}</span>
        <div onClick={alternarDisponibilidade} style={{ ...s.toggle, background: disponivel ? '#1AABCF' : '#cbd5e1' }}>
          <div style={{ ...s.toggleBolinha, marginLeft: disponivel ? 22 : 2 }} />
        </div>
      </div>

      {carregando ? (
        <p style={s.aviso}>Carregando...</p>
      ) : pedidos.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <p style={{ fontSize: 48, margin: 0 }}>📦</p>
          <p style={s.aviso}>Nenhum pedido atribuído no momento.</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Aguarde, avisaremos quando chegar!</p>
          <button onClick={buscarPedidos} style={{ ...s.botaoSec, marginTop: 20 }}>Atualizar</button>
        </div>
      ) : (
        <div>
          {pedidosCancelados.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {pedidosCancelados.map(p => (
                <CardCancelado key={p.id} pedido={p} onConfirmar={() => confirmarCancelamento(p.id)} />
              ))}
            </div>
          )}

          {pedidosAguardando.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={s.secaoTitulo}>⏳ Aguardando iniciar rota</p>
              {!emRota && (
                <button onClick={iniciarEntregas} style={s.botaoPrimario}>
                  🛵 Iniciar Entregas ({pedidosAguardando.length} pedido{pedidosAguardando.length > 1 ? 's' : ''})
                </button>
              )}
              {pedidosAguardando.map(p => (
                <CardPedido key={p.id} pedido={p} onClick={() => abrirDetalhe(p)} onMaps={() => abrirMaps(p.endereco_entrega)} onWaze={() => abrirWaze(p.endereco_entrega)} cor="#E8A000" />
              ))}
            </div>
          )}

          {pedidosEmRota.length > 0 && (
            <div>
              <p style={s.secaoTitulo}>🛵 Em rota</p>
              {pedidosEmRota.map(p => (
                <CardPedido key={p.id} pedido={p} onClick={() => abrirDetalhe(p)} onMaps={() => abrirMaps(p.endereco_entrega)} onWaze={() => abrirWaze(p.endereco_entrega)} onConfirmar={() => confirmarEntrega(p.id)} cor="#1AABCF" />
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ color: '#64748b', fontSize: 13, minWidth: 110 }}>{label}</span>
      <span style={{ color: destaque ? '#E8611A' : '#1e293b', fontSize: 13, textAlign: 'right', flex: 1, fontWeight: destaque ? 700 : 400 }}>{val}</span>
    </div>
  );
}

function CardCancelado({ pedido, onConfirmar }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderLeft: '4px solid #ef4444', boxShadow: '0 4px 16px rgba(239,68,68,0.18)' }}>
      <div style={{ display: 'inline-block', background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: 12, padding: '4px 12px', borderRadius: 20, marginBottom: 10 }}>
        ❌ Pedido cancelado
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#1e293b', fontWeight: 700, fontSize: 16 }} translate="no">#{pedido.numero}</span>
        <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14, textDecoration: 'line-through' }}>R$ {Number(pedido.total).toFixed(2)}</span>
      </div>
      <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0' }} translate="no">👤 {pedido.cliente_nome}</p>
      <p style={{ color: '#1e293b', fontSize: 13, margin: '2px 0', fontWeight: 500 }} translate="no">📍 {pedido.endereco_entrega}</p>
      {pedido.motivo_cancelamento && (
        <p style={{ color: '#b91c1c', fontSize: 13, margin: '8px 0 0', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
          Motivo: {pedido.motivo_cancelamento}
        </p>
      )}
      <p style={{ color: '#94a3b8', fontSize: 12, margin: '10px 0 12px' }}>
        Não saia para esta entrega. Confirme abaixo que você viu o cancelamento.
      </p>
      <button onClick={onConfirmar} style={{ width: '100%', padding: 14, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(239,68,68,0.3)' }}>
        ✓ Confirmar que vi o cancelamento
      </button>
    </div>
  );
}

function CardPedido({ pedido, onClick, onMaps, onWaze, onConfirmar, cor }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderLeft: `4px solid ${cor}`, boxShadow: '0 4px 16px rgba(30,41,59,0.08)' }}>
      <div onClick={onClick} style={{ cursor: 'pointer', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#1AABCF', fontWeight: 700, fontSize: 16 }}>#{pedido.numero}</span>
          <span style={{ color: '#E8611A', fontWeight: 700, fontSize: 16 }}>R$ {Number(pedido.total).toFixed(2)}</span>
        </div>
        <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0' }} translate="no">👤 {pedido.cliente_nome}</p>
        <p style={{ color: '#1e293b', fontSize: 13, margin: '2px 0', fontWeight: 500 }} translate="no">📍 {pedido.endereco_entrega}</p>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '2px 0' }}>
          💳 {pedido.forma_pagamento}{pedido.troco ? ` — Troco para ${pedido.troco}` : ''}
        </p>
        <p style={{ color: cor, fontSize: 11, textAlign: 'right', margin: '6px 0 0' }}>Ver detalhes →</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onMaps} style={{ flex: 1, padding: '10px 0', background: 'rgba(26,171,207,0.07)', color: '#1AABCF', border: '1.5px solid #1AABCF', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗺️ Maps</button>
        <button onClick={onWaze} style={{ flex: 1, padding: '10px 0', background: 'rgba(0,170,255,0.07)', color: '#00AAFF', border: '1.5px solid #00AAFF', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🚗 Waze</button>
        {onConfirmar && (
          <button onClick={onConfirmar} style={{ flex: 2, padding: '10px 0', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✅ Confirmar</button>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', padding: 20, color: '#1e293b', fontFamily: 'Inter, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  saudacao: { fontSize: 20, fontWeight: 700, color: '#1AABCF', margin: 0, fontFamily: 'Sora, sans-serif' },
  subheader: { fontSize: 13, color: '#64748b', margin: 0 },
  sair: { background: 'none', border: '1.5px solid #e2e8f0', color: '#64748b', padding: '6px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  btnVoltar: { background: 'none', border: 'none', color: '#1AABCF', fontSize: 15, cursor: 'pointer', padding: 0 },
  titulo: { fontSize: 22, fontWeight: 700, color: '#1e293b', fontFamily: 'Sora, sans-serif', margin: '0 0 8px' },
  badge: { fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, color: '#fff', display: 'inline-block', marginBottom: 16 },
  toggleCard: { background: '#fff', borderRadius: 16, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, boxShadow: '0 4px 16px rgba(30,41,59,0.08)' },
  toggleLabel: { fontSize: 15, fontWeight: 600, color: '#1e293b' },
  toggle: { width: 48, height: 26, borderRadius: 13, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' },
  toggleBolinha: { width: 22, height: 22, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, transition: 'margin 0.2s', boxShadow: '0 1px 4px rgba(30,41,59,0.2)' },
  aviso: { color: '#64748b', fontSize: 16, textAlign: 'center', marginTop: 8 },
  secaoTitulo: { fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  botaoPrimario: { width: '100%', padding: 16, background: '#1AABCF', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12, boxShadow: '0 4px 14px rgba(26,171,207,0.3)' },
  botaoSec: { padding: '10px 24px', background: '#fff', color: '#1AABCF', border: '1.5px solid #1AABCF', borderRadius: 10, cursor: 'pointer', fontSize: 14 },
  botaoNav: { padding: 12, background: 'rgba(26,171,207,0.07)', color: '#1AABCF', border: '1.5px solid #1AABCF', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  card: { background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 4px 16px rgba(30,41,59,0.08)' },
  itemRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' },
  itemNome: { color: '#475569', fontSize: 13 },
  itemVal: { color: '#1e293b', fontSize: 13, fontWeight: 600 },
};
