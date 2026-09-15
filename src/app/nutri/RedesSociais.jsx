import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import ModalConteudoPerformance from './_ConteudoPerformance.jsx';

const PLATAFORMAS = ['Instagram', 'TikTok', 'YouTube'];

const PERIODOS = [
  { id: '7',     label: 'Últimos 7 dias' },
  { id: '30',    label: 'Últimos 30 dias' },
  { id: '90',    label: 'Últimos 90 dias' },
  { id: 'todos', label: 'Todos' },
];

function engajamento(post) {
  const alcance = Number(post.alcance) || 0;
  if (!alcance) return null;
  const acoes = (Number(post.curtidas) || 0) + (Number(post.comentarios) || 0) + (Number(post.salvamentos) || 0);
  return (acoes / alcance) * 100;
}

export default function RedesSociais() {
  const { user } = useSession();
  const [posts, setPosts] = useState(null);
  const [periodo, setPeriodo] = useState('30');
  const [novoOpen, setNovoOpen] = useState(false);
  const [editarPost, setEditarPost] = useState(null);

  async function carregar() {
    if (!user) return;
    const { data } = await supabase.from('posts_performance')
      .select('*').eq('nutri_id', user.id).order('data', { ascending: false });
    setPosts(data ?? []);
  }
  useEffect(() => { carregar(); }, [user]);

  const postsPeriodo = useMemo(() => {
    if (!posts) return [];
    if (periodo === 'todos') return posts;
    const dias = Number(periodo);
    const corte = new Date(); corte.setHours(0, 0, 0, 0); corte.setDate(corte.getDate() - dias);
    return posts.filter(p => p.data && new Date(p.data + 'T00:00:00') >= corte);
  }, [posts, periodo]);

  const engajamentoPorRede = useMemo(() => {
    const mapa = {};
    PLATAFORMAS.forEach(rede => {
      const doRede = postsPeriodo.filter(p => p.rede_social === rede);
      const somaAcoes = doRede.reduce((a, p) => a + (Number(p.curtidas) || 0) + (Number(p.comentarios) || 0) + (Number(p.salvamentos) || 0), 0);
      const somaAlcance = doRede.reduce((a, p) => a + (Number(p.alcance) || 0), 0);
      mapa[rede] = { n: doRede.length, engajamento: somaAlcance > 0 ? (somaAcoes / somaAlcance) * 100 : null };
    });
    return mapa;
  }, [postsPeriodo]);

  async function excluir(post) {
    if (!window.confirm(`Excluir o registro "${post.titulo}"?`)) return;
    await supabase.from('posts_performance').delete().eq('id', post.id);
    carregar();
  }

  return (
    <>
      <div className="page-title">Redes Sociais</div>
      <div className="page-sub">Engajamento e desempenho do conteúdo publicado</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ margin: 0, width: 'auto' }}>
          {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="btn" onClick={() => setNovoOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true"></i> Adicionar conteúdo
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {PLATAFORMAS.map(rede => {
          const info = engajamentoPorRede[rede];
          return (
            <div key={rede} className="stat-card">
              <div className="stat-label">Engajamento {rede}</div>
              <div className="stat-val">{info?.engajamento != null ? `${info.engajamento.toFixed(1).replace('.', ',')}%` : '—'}</div>
              <div className="stat-sub">
                {info?.n > 0 ? `${info.n} conteúdo${info.n === 1 ? '' : 's'} no período` : 'Nenhum conteúdo no período'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-title" style={{ marginBottom: 10 }}>Conteúdos do período</div>

      {postsPeriodo === null || posts === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : postsPeriodo.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-share empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhum conteúdo registrado nesse período</div>
          <div className="empty-sub">Registre o desempenho de um post pela Agenda Editorial ou clique em "Adicionar conteúdo".</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {postsPeriodo.map(post => {
            const eng = engajamento(post);
            return (
              <div key={post.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {post.rede_social && (
                      <span className="pill pill-b" style={{ fontSize: 10 }}>{post.rede_social}</span>
                    )}
                    {post.formato && (
                      <span className="pill" style={{ fontSize: 10, background: 'var(--bg2)', color: 'var(--text2)' }}>{post.formato}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{dataBR(post.data)}</span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)', lineHeight: 1.4 }}>{post.titulo}</div>

                <div style={{ display: 'flex', gap: 14 }}>
                  <MetricaGrande label="Engajamento" valor={eng != null ? `${eng.toFixed(1).replace('.', ',')}%` : '—'} />
                  <MetricaGrande label="Alcance" valor={post.alcance ?? 0} />
                  <MetricaGrande label="Views" valor={post.views ?? 0} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10 }}>
                  <span>{post.curtidas ?? 0} curtidas</span>
                  <span>{post.comentarios ?? 0} coment.</span>
                  <span>{post.salvamentos ?? 0} salvos</span>
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button className="btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => setEditarPost(post)}>
                    <i className="ti ti-edit" aria-hidden="true"></i> Editar
                  </button>
                  <button onClick={() => excluir(post)} title="Excluir" style={{
                    background: 'none', border: '0.5px solid var(--red)',
                    borderRadius: 6, padding: '4px 10px', color: 'var(--red)', cursor: 'pointer',
                  }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {novoOpen && (
        <ModalConteudoPerformance
          post={{ novo: true, agenda_id: null, data: new Date().toISOString().slice(0, 10) }}
          nutriId={user.id}
          onClose={() => setNovoOpen(false)}
          onSaved={() => { setNovoOpen(false); carregar(); }}
        />
      )}
      {editarPost && (
        <ModalConteudoPerformance
          post={editarPost}
          nutriId={user.id}
          onClose={() => setEditarPost(null)}
          onSaved={() => { setEditarPost(null); carregar(); }}
        />
      )}
    </>
  );
}

function MetricaGrande({ label, valor }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dark)' }}>{valor}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{label}</div>
    </div>
  );
}
