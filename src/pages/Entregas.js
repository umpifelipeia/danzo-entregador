// src/pages/Entregas.js — Histórico de entregas concluídas do entregador.
// Agrupa por dia e mostra quanto ele fez em taxas de entrega em cada dia.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// Agrupa as entregas por dia (data local do celular)
function agruparPorDia(entregas) {
  const grupos = new Map();
  for (const e of entregas) {
    const d = new Date(e.entregue_em);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!grupos.has(chave)) grupos.set(chave, { chave, data: d, entregas: [], totalTaxas: 0 });
    const g = grupos.get(chave);
    g.entregas.push(e);
    g.totalTaxas += Number(e.taxa_entrega || 0);
  }
  // Mais recente primeiro
  return [...grupos.values()].sort((a, b) => b.chave.localeCompare(a.chave));
}

function rotuloDia(data) {
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(data, hoje)) return 'Hoje';
  if (mesmoDia(data, ontem)) return 'Ontem';
  const rotulo = data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

function horaDe(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function Entregas() {
  const navigate = useNavigate();
  const [entregas, setEntregas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    async function buscar() {
      try {
        const { data } = await api.get('/entregadores/minhas-entregas');
        setEntregas(data.entregas || []);
      } catch (err) {
        setErro('Não foi possível carregar suas entregas. Verifique a conexão.');
      } finally {
        setCarregando(false);
      }
    }
    buscar();

    const aoFicarOnline = () => setOnline(true);
    const aoFicarOffline = () => setOnline(false);
    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);
    return () => {
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
    };
  }, []);

  const grupos = agruparPorDia(entregas);

  return (
    <div style={s.container}>
      {!online && (
        <div style={{ background: '#E8611A', color: '#fff', textAlign: 'center', padding: '8px', fontSize: 13, fontWeight: 600 }}>
          📡 Sem conexão — modo offline
        </div>
      )}
      <div style={s.header}>
        <button onClick={() => navigate('/')} style={s.btnVoltar}>← Voltar</button>
      </div>

      <p style={s.titulo}>📋 Minhas entregas</p>
      <p style={s.subtitulo}>Entregas concluídas nos últimos 30 dias</p>

      {carregando ? (
        <p style={s.aviso}>Carregando...</p>
      ) : erro ? (
        <p style={{ ...s.aviso, color: '#ef4444' }}>{erro}</p>
      ) : entregas.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <p style={{ fontSize: 48, margin: 0 }}>📦</p>
          <p style={s.aviso}>Nenhuma entrega concluída ainda.</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Suas entregas aparecerão aqui.</p>
        </div>
      ) : (
        grupos.map(grupo => (
          <div key={grupo.chave} style={{ marginBottom: 24 }}>
            <div style={s.diaHeader}>
              <span style={s.diaRotulo}>{rotuloDia(grupo.data)}</span>
              <div style={{ textAlign: 'right' }}>
                <p style={s.diaTotal} translate="no">R$ {grupo.totalTaxas.toFixed(2)}</p>
                <p style={s.diaQtd}>{grupo.entregas.length} entrega{grupo.entregas.length > 1 ? 's' : ''}</p>
              </div>
            </div>

            {grupo.entregas.map(e => (
              <div key={e.id} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#1AABCF', fontWeight: 700, fontSize: 15 }} translate="no">
                    #{e.numero} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>· {horaDe(e.entregue_em)}</span>
                  </span>
                  <span style={{ color: '#E8611A', fontWeight: 700, fontSize: 15 }} translate="no">
                    R$ {Number(e.taxa_entrega).toFixed(2)}
                  </span>
                </div>
                <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0' }} translate="no">👤 {e.cliente_nome}</p>
                <p style={{ color: '#1e293b', fontSize: 13, margin: '2px 0', fontWeight: 500 }} translate="no">📍 {e.endereco_entrega}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ color: '#94a3b8', fontSize: 12 }} translate="no">Pedido: R$ {Number(e.total).toFixed(2)}</span>
                  {e.acertado ? (
                    <span style={{ ...s.badge, background: '#dcfce7', color: '#15803d' }}>✓ Taxa acertada</span>
                  ) : (
                    <span style={{ ...s.badge, background: '#fef9c3', color: '#a16207' }}>Taxa a receber</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', padding: 20, color: '#1e293b', fontFamily: 'Inter, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  btnVoltar: { background: 'none', border: 'none', color: '#1AABCF', fontSize: 15, cursor: 'pointer', padding: 0 },
  titulo: { fontSize: 22, fontWeight: 700, color: '#1e293b', fontFamily: 'Sora, sans-serif', margin: '0 0 4px' },
  subtitulo: { fontSize: 13, color: '#64748b', margin: '0 0 20px' },
  aviso: { color: '#64748b', fontSize: 16, textAlign: 'center', marginTop: 8 },
  diaHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '10px 14px', background: 'rgba(26,171,207,0.07)', border: '1.5px solid rgba(26,171,207,0.25)', borderRadius: 12 },
  diaRotulo: { fontSize: 14, fontWeight: 700, color: '#1AABCF', fontFamily: 'Sora, sans-serif' },
  diaTotal: { fontSize: 16, fontWeight: 700, color: '#E8611A', margin: 0 },
  diaQtd: { fontSize: 11, color: '#94a3b8', margin: 0 },
  card: { background: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderLeft: '4px solid #22c55e', boxShadow: '0 4px 16px rgba(30,41,59,0.08)' },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 },
};
