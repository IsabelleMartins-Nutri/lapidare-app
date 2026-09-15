import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';

export default function Oportunidades() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [leads, setLeads] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('leads')
        .select('*').eq('nutri_id', user.id).order('data_primeiro_contato', { ascending: false });
      setLeads(data ?? []);
    })();
  }, [user]);

  if (leads === null) {
    return (
      <>
        <div className="page-title">Oportunidades</div>
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      </>
    );
  }

  // Alertas calculados no momento, direto a partir dos leads carregados —
  // não existe nenhuma tabela de "alerta" salva, mesmo padrão já usado no
  // resumo de acompanhamento de pacientes (Visao.jsx).
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alertas = [];
  for (const lead of leads) {
    if (['ganho', 'perdido'].includes(lead.status)) continue;
    const followUps = [lead.follow_up_1, lead.follow_up_2, lead.follow_up_3].filter(Boolean).sort();
    const proximo = followUps.find(d => new Date(d + 'T00:00:00') >= hoje) ?? followUps[followUps.length - 1] ?? null;

    if (proximo && new Date(proximo + 'T00:00:00') < hoje) {
      const dias = Math.floor((hoje - new Date(proximo + 'T00:00:00')) / 86_400_000);
      alertas.push({
        lead, emoji: '⏰', cor: 'var(--red)',
        titulo: `${lead.nome} · Follow-up atrasado`,
        descricao: `Previsto pra ${dataBR(proximo)} — ${dias} dia${dias === 1 ? '' : 's'} atrás`,
        prioridade: 1,
      });
    } else if (!proximo) {
      alertas.push({
        lead, emoji: '🔕', cor: 'var(--orange)',
        titulo: `${lead.nome} · Sem follow-up agendado`,
        descricao: `Status: ${lead.status === 'novo_contato' ? 'Novo contato' : lead.status}`,
        prioridade: 2,
      });
    }
  }
  alertas.sort((a, b) => a.prioridade - b.prioridade);

  return (
    <>
      <div className="page-title">Oportunidades</div>
      <div className="page-sub">
        Leads que precisam de atenção — sem follow-up marcado ou com follow-up já vencido.
      </div>

      {alertas.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-confetti empty-icon" style={{ color: 'var(--green)' }} aria-hidden="true"></i>
          <div className="empty-title">Tudo em dia!</div>
          <div className="empty-sub">Nenhum lead em aberto está sem follow-up agendado.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 10, marginBottom: 18,
        }}>
          {alertas.map((a, i) => (
            <button key={i}
              onClick={() => navigate('/nutri/comercial')}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: 14, borderRadius: 12,
                background: 'var(--white)',
                border: '0.5px solid var(--border)',
                borderLeft: `3px solid ${a.cor}`,
                cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-sans)',
                transition: 'all .15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--white)'}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{a.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)', marginBottom: 2 }}>
                  {a.titulo}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {a.descricao}
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--text3)', marginTop: 4 }} aria-hidden="true"></i>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
