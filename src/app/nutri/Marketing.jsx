import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import EditableCell from '../../components/EditableCell.jsx';
import ModalConteudoPerformance from './_ConteudoPerformance.jsx';
import { FORMATOS_POST } from '../../lib/marketingDefault.js';

const PLATAFORMAS_ADS = ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Outro'];

const STATUS_AGENDA = [
  { id: 'em_branco',    label: 'Em branco',      bg: 'var(--bg2)',        color: 'var(--text3)' },
  { id: 'em_andamento', label: 'Em andamento',   bg: 'var(--orange-bg)',  color: 'var(--orange)' },
  { id: 'programado',   label: 'Programado',     bg: 'var(--blue-bg)',   color: 'var(--blue)' },
  { id: 'postado',      label: 'Postado',        bg: 'var(--green-bg)', color: 'var(--green)' },
  { id: 'nao_foi_ar',   label: 'Não foi ao ar',  bg: 'var(--red-bg)',   color: 'var(--red)' },
];

// Cada etapa do ISCAA com uma cor própria — não tem tag pronta pra tudo
// isso no app, então uso tons suaves na mesma linguagem visual (fundo
// pastel + texto forte) das que já existem.
const ISCAA_OPCOES = [
  { id: 'informacao',  label: 'Informação',  bg: 'var(--blue-bg)',   color: 'var(--blue)' },
  { id: 'solucao',     label: 'Solução',     bg: 'var(--green-bg)', color: 'var(--green)' },
  { id: 'conexao',     label: 'Conexão',     bg: '#f1e6fb',          color: '#7c4fb0' },
  { id: 'autoridade',  label: 'Autoridade',  bg: '#f7e3d3', color: '#8a4b23' },
  { id: 'acao',        label: 'Ação',        bg: 'var(--orange-bg)', color: 'var(--orange)' },
  { id: 'fura_bolha',  label: 'Fura-Bolha',  bg: 'var(--red-bg)',   color: 'var(--red)' },
];

const FORMATOS_AGENDA = [
  { id: 'Em branco', label: 'Em branco',  bg: 'var(--bg2)', color: 'var(--text3)' },
  ...FORMATOS_POST.map(f => ({ id: f, label: f, bg: '#e6f0fb', color: '#2f6fad' })),
];

const STATUS_IDEIA = [
  { id: 'ideia',        label: 'Ideia',        bg: 'var(--bg2)',       color: 'var(--text3)' },
  { id: 'roteirizado',  label: 'Roteirizado',  bg: '#f1e6fb',          color: '#7c4fb0' },
  { id: 'gravado',      label: 'Gravado',      bg: 'var(--orange-bg)', color: 'var(--orange)' },
  { id: 'editado',      label: 'Editado',      bg: 'var(--blue-bg)',   color: 'var(--blue)' },
  { id: 'pronto',       label: 'Pronto',       bg: 'var(--green-bg)',  color: 'var(--green)' },
];

const MKT_TABS = [
  { id: 'indicadores', label: 'Indicadores de Tráfego', icon: 'chart-line' },
  { id: 'campanhas',   label: 'Campanhas de Tráfego',   icon: 'speakerphone' },
  { id: 'agenda',      label: 'Agenda Editorial',       icon: 'calendar' },
  { id: 'ideias',      label: 'Banco de Ideias',        icon: 'bulb' },
];

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const PERIODOS = [
  { id: '7',     label: 'Últimos 7 dias' },
  { id: '30',    label: 'Últimos 30 dias' },
  { id: '90',    label: 'Últimos 90 dias' },
  { id: 'todos', label: 'Todos' },
];

function brl(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  return addDays(d, diff);
}

const AGENDA_VAZIA = { iscaa: null, status: 'em_branco', formato: null, conteudo: null, referencia: null, data_publicacao: null };

export default function Marketing() {
  const { user } = useSession();
  const [tab, setTab] = useState('indicadores');
  const [periodo, setPeriodo] = useState('30');
  const [campanhas, setCampanhas] = useState(null);
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);
  const [editarCampanha, setEditarCampanha] = useState(null);

  const [segunda, setSegunda] = useState(getMonday(new Date()));
  const [agendaPorData, setAgendaPorData] = useState({});
  const [postsPorData, setPostsPorData] = useState({});
  const [performanceOpen, setPerformanceOpen] = useState(null);

  const [ideias, setIdeias] = useState(null);
  const [novaIdeiaOpen, setNovaIdeiaOpen] = useState(false);
  const [editarIdeia, setEditarIdeia] = useState(null);
  const [usarCalendarioIdeia, setUsarCalendarioIdeia] = useState(null);
  const [filtroStatusIdeia, setFiltroStatusIdeia] = useState('todos');

  const diasSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(segunda, i)), [segunda]);

  async function carregarCampanhas() {
    if (!user) return;
    const { data } = await supabase.from('campanhas_trafego')
      .select('*').eq('nutri_id', user.id).order('data_inicio', { ascending: false });
    setCampanhas(data ?? []);
  }
  useEffect(() => { carregarCampanhas(); }, [user]);

  async function carregarAgendaSemana() {
    if (!user) return;
    const de = fmtDate(diasSemana[0]), ate = fmtDate(diasSemana[6]);
    const [agRes, postRes] = await Promise.all([
      supabase.from('agenda_editorial').select('*').eq('nutri_id', user.id).gte('data', de).lte('data', ate),
      supabase.from('posts_performance').select('*').eq('nutri_id', user.id).gte('data', de).lte('data', ate),
    ]);
    const mapaAgenda = {};
    (agRes.data ?? []).forEach(a => { mapaAgenda[a.data] = a; });
    setAgendaPorData(mapaAgenda);
    const mapaPosts = {};
    (postRes.data ?? []).forEach(p => { mapaPosts[p.data] = p; });
    setPostsPorData(mapaPosts);
  }
  useEffect(() => { carregarAgendaSemana(); }, [user, segunda]);

  async function salvarCelulaAgenda(dataStr, campo, valor) {
    const atual = agendaPorData[dataStr] ?? AGENDA_VAZIA;
    const atualizado = { ...atual, [campo]: valor };
    const { data: salvo, error } = await supabase.from('agenda_editorial')
      .upsert({
        nutri_id: user.id,
        data: dataStr,
        iscaa: atualizado.iscaa,
        status: atualizado.status || 'em_branco',
        formato: atualizado.formato,
        conteudo: atualizado.conteudo,
        referencia: atualizado.referencia,
        data_publicacao: atualizado.data_publicacao,
      }, { onConflict: 'nutri_id,data' })
      .select('*').single();
    if (!error) setAgendaPorData(m => ({ ...m, [dataStr]: salvo }));
  }

  function abrirPerformance(dataStr) {
    const existente = postsPorData[dataStr];
    if (existente) {
      setPerformanceOpen(existente);
      return;
    }
    const diaAgenda = agendaPorData[dataStr];
    setPerformanceOpen({
      novo: true,
      agenda_id: diaAgenda?.id ?? null,
      data: dataStr,
      formato: diaAgenda?.formato && diaAgenda.formato !== 'Em branco' ? diaAgenda.formato : '',
      titulo: diaAgenda?.conteudo ?? '',
    });
  }

  const periodoDias = useMemo(() => {
    if (!campanhas) return [];
    if (periodo === 'todos') return campanhas;
    const dias = Number(periodo);
    const corte = new Date(); corte.setHours(0, 0, 0, 0); corte.setDate(corte.getDate() - dias);
    return campanhas.filter(c => c.data_inicio && new Date(c.data_inicio + 'T00:00:00') >= corte);
  }, [campanhas, periodo]);

  const indicadores = useMemo(() => {
    const valorTotal = periodoDias.reduce((a, c) => a + Number(c.valor_investido || 0), 0);
    const contatos = periodoDias.reduce((a, c) => a + Number(c.contatos_gerados || 0), 0);
    const seguidores = periodoDias.reduce((a, c) => a + Number(c.seguidores_gerados || 0), 0);
    return {
      valorTotal, contatos, seguidores,
      custoContato: contatos > 0 ? valorTotal / contatos : null,
      custoSeguidor: seguidores > 0 ? valorTotal / seguidores : null,
    };
  }, [periodoDias]);

  async function excluirCampanha(c) {
    if (!window.confirm(`Excluir a campanha "${c.nome}"?`)) return;
    await supabase.from('campanhas_trafego').delete().eq('id', c.id);
    carregarCampanhas();
  }

  async function carregarIdeias() {
    if (!user) return;
    const { data } = await supabase.from('ideias_conteudo')
      .select('*').eq('nutri_id', user.id).order('created_at', { ascending: false });
    setIdeias(data ?? []);
  }
  useEffect(() => { carregarIdeias(); }, [user]);

  async function excluirIdeia(ideia) {
    if (!window.confirm(`Excluir a ideia "${ideia.titulo}"?`)) return;
    await supabase.from('ideias_conteudo').delete().eq('id', ideia.id);
    carregarIdeias();
  }

  const ideiasFiltradas = useMemo(() => {
    if (!ideias) return [];
    if (filtroStatusIdeia === 'todos') return ideias;
    return ideias.filter(i => i.status === filtroStatusIdeia);
  }, [ideias, filtroStatusIdeia]);

  return (
    <>
      <div className="page-title">Marketing</div>
      <div className="page-sub">Tráfego pago e planejamento de conteúdo</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {MKT_TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'btn' : 'btn-outline'} onClick={() => setTab(t.id)}>
            <i className={`ti ti-${t.icon}`} aria-hidden="true"></i> {t.label}
          </button>
        ))}
      </div>

      {tab === 'indicadores' && (<>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <div className="section-title">Indicadores de Tráfego</div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ margin: 0, width: 'auto' }}>
          {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div className="stats-grid" style={{ marginBottom: 8 }}>
        <div className="stat-card">
          <div className="stat-label">Valor total investido</div>
          <div className="stat-val">{brl(indicadores.valorTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total contatos pagos</div>
          <div className="stat-val">{indicadores.contatos}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Média custo contato</div>
          <div className="stat-val">{indicadores.custoContato != null ? brl(indicadores.custoContato) : '—'}</div>
        </div>
      </div>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total seguidores pagos</div>
          <div className="stat-val">{indicadores.seguidores}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Média custo seguidor</div>
          <div className="stat-val">{indicadores.custoSeguidor != null ? brl(indicadores.custoSeguidor) : '—'}</div>
        </div>
      </div>
      </>)}

      {tab === 'campanhas' && (<>
      <div className="section-header">
        <div className="section-title">Campanhas de Tráfego</div>
        <button className="btn" onClick={() => setNovaCampanhaOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true"></i> Adicionar campanha
        </button>
      </div>

      {campanhas === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : campanhas.length === 0 ? (
        <div className="card empty-card" style={{ marginBottom: 20 }}>
          <i className="ti ti-speakerphone empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma campanha de tráfego cadastrada ainda</div>
          <div className="empty-sub">Clique em "Adicionar campanha" para começar a acompanhar seu tráfego pago.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Plataforma</th>
                <th>Investido</th>
                <th>Contatos</th>
                <th>Seguidores</th>
                <th>Início</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campanhas.map(c => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>{c.plataforma ?? '—'}</td>
                  <td>{brl(c.valor_investido)}</td>
                  <td>{c.contatos_gerados}</td>
                  <td>{c.seguidores_gerados}</td>
                  <td>{dataBR(c.data_inicio)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setEditarCampanha(c)}>
                        <i className="ti ti-edit" aria-hidden="true"></i>
                      </button>
                      <button onClick={() => excluirCampanha(c)} title="Excluir" style={{
                        background: 'none', border: '0.5px solid var(--red)',
                        borderRadius: 6, padding: '4px 7px', color: 'var(--red)', cursor: 'pointer',
                      }}>
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>)}

      {tab === 'agenda' && (<>
      <div className="section-header">
        <div>
          <div className="section-title">Agenda Editorial</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            Semana de {dataBR(fmtDate(diasSemana[0]))} a {dataBR(fmtDate(diasSemana[6]))} — clique em qualquer campo pra editar.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-outline" onClick={() => setSegunda(s => addDays(s, -7))}>
            <i className="ti ti-arrow-left" aria-hidden="true"></i> Semana anterior
          </button>
          <button className="btn-outline" onClick={() => setSegunda(getMonday(new Date()))}>Semana atual</button>
          <button className="btn-outline" onClick={() => setSegunda(s => addDays(s, 7))}>
            Próxima semana <i className="ti ti-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, minmax(160px, 1fr))', minWidth: 1250 }}>
          {/* Cabeçalho */}
          <div style={{ padding: '10px 12px' }}></div>
          {diasSemana.map((d, i) => (
            <div key={i} style={{
              padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', borderBottom: '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border)',
            }}>
              {DIAS_SEMANA[i]}
            </div>
          ))}

          {/* Data — o dia da semana fica fixo na coluna, mas a data em si é
              editável, pra registrar quando o conteúdo foi de fato postado
              (ex: planejado pra terça, mas só saiu quarta). */}
          <LinhaLabel texto="Data" />
          {diasSemana.map((d, i) => {
            const dataStr = fmtDate(d);
            return (
              <Celula key={i}>
                <EditableCell tipo="data" value={agendaPorData[dataStr]?.data_publicacao ?? dataStr}
                  onSave={v => salvarCelulaAgenda(dataStr, 'data_publicacao', v)} />
              </Celula>
            );
          })}

          {/* ISCAA */}
          <LinhaLabel texto="ISCAA" />
          {diasSemana.map((d, i) => {
            const dataStr = fmtDate(d);
            return (
              <Celula key={i}>
                <EditableCell tipo="select" value={agendaPorData[dataStr]?.iscaa} opcoes={ISCAA_OPCOES}
                  onSave={v => salvarCelulaAgenda(dataStr, 'iscaa', v)} />
              </Celula>
            );
          })}

          {/* Status */}
          <LinhaLabel texto="Status" />
          {diasSemana.map((d, i) => {
            const dataStr = fmtDate(d);
            return (
              <Celula key={i}>
                <EditableCell tipo="select" value={agendaPorData[dataStr]?.status ?? 'em_branco'} opcoes={STATUS_AGENDA}
                  onSave={v => salvarCelulaAgenda(dataStr, 'status', v || 'em_branco')} />
              </Celula>
            );
          })}

          {/* Formato */}
          <LinhaLabel texto="Formato" />
          {diasSemana.map((d, i) => {
            const dataStr = fmtDate(d);
            return (
              <Celula key={i}>
                <EditableCell tipo="select" value={agendaPorData[dataStr]?.formato} opcoes={FORMATOS_AGENDA}
                  onSave={v => salvarCelulaAgenda(dataStr, 'formato', v)} />
              </Celula>
            );
          })}

          {/* Conteúdo */}
          <LinhaLabel texto="Conteúdo" />
          {diasSemana.map((d, i) => {
            const dataStr = fmtDate(d);
            return (
              <Celula key={i}>
                <EditableCell tipo="textarea" value={agendaPorData[dataStr]?.conteudo} placeholder="—"
                  onSave={v => salvarCelulaAgenda(dataStr, 'conteudo', v)} />
              </Celula>
            );
          })}

          {/* Referência */}
          <LinhaLabel texto="Referência" />
          {diasSemana.map((d, i) => {
            const dataStr = fmtDate(d);
            return (
              <Celula key={i}>
                <EditableCell tipo="texto" value={agendaPorData[dataStr]?.referencia} placeholder="—"
                  onSave={v => salvarCelulaAgenda(dataStr, 'referencia', v)} />
              </Celula>
            );
          })}

          {/* Desempenho */}
          <LinhaLabel texto="Desempenho" ultima />
          {diasSemana.map((d, i) => {
            const dataStr = fmtDate(d);
            const jaTem = !!postsPorData[dataStr];
            return (
              <Celula key={i} ultima>
                <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px', width: '100%', justifyContent: 'center' }}
                  onClick={() => abrirPerformance(dataStr)}>
                  <i className={`ti ti-${jaTem ? 'edit' : 'chart-bar'}`} aria-hidden="true"></i> {jaTem ? 'Editar desempenho' : 'Registrar desempenho'}
                </button>
              </Celula>
            );
          })}
        </div>
      </div>
      </>)}

      {tab === 'ideias' && (<>
      <div className="section-header">
        <div>
          <div className="section-title">Banco de Ideias</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Guarde ideias de post soltas e use na Agenda Editorial quando quiser.</div>
        </div>
        <button className="btn" onClick={() => setNovaIdeiaOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true"></i> Nova ideia
        </button>
      </div>

      {ideias !== null && ideias.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[{ id: 'todos', label: 'Todos' }, ...STATUS_IDEIA].map(s => {
            const qtd = s.id === 'todos' ? ideias.length : ideias.filter(i => i.status === s.id).length;
            const ativo = filtroStatusIdeia === s.id;
            return (
              <button key={s.id} onClick={() => setFiltroStatusIdeia(s.id)} style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                border: ativo ? '1px solid var(--dark)' : '0.5px solid var(--border)',
                background: ativo ? 'var(--dark)' : 'var(--white)',
                color: ativo ? 'var(--white)' : 'var(--text2)',
                fontFamily: 'var(--font-sans)',
              }}>
                {s.label} ({qtd})
              </button>
            );
          })}
        </div>
      )}

      {ideias === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : ideias.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-bulb empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma ideia guardada ainda</div>
          <div className="empty-sub">Anote título, ideia e referência pra não perder nada — depois é só usar na Agenda Editorial.</div>
          <button className="btn" onClick={() => setNovaIdeiaOpen(true)}>
            <i className="ti ti-plus" aria-hidden="true"></i> Criar primeira ideia
          </button>
        </div>
      ) : ideiasFiltradas.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma ideia com esse status.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {ideiasFiltradas.map(idea => {
            const statusInfo = STATUS_IDEIA.find(s => s.id === idea.status) ?? STATUS_IDEIA[0];
            const objetivoInfo = ISCAA_OPCOES.find(o => o.id === idea.objetivo);
            return (
              <div key={idea.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-block', fontSize: 11, fontWeight: 500,
                      padding: '3px 9px', borderRadius: 20,
                      background: statusInfo.bg, color: statusInfo.color,
                    }}>{statusInfo.label}</span>
                    {objetivoInfo && (
                      <span style={{
                        display: 'inline-block', fontSize: 11, fontWeight: 500,
                        padding: '3px 9px', borderRadius: 20,
                        background: objetivoInfo.bg, color: objetivoInfo.color,
                      }}>{objetivoInfo.label}</span>
                    )}
                  </div>
                  {idea.data_uso && (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>Usada em {dataBR(idea.data_uso)}</span>
                  )}
                </div>

                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>{idea.titulo}</div>
                {idea.ideia && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{idea.ideia}</div>
                )}
                {idea.referencia && (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Referência: {idea.referencia}</div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  {!idea.data_uso && (
                    <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                      onClick={() => setUsarCalendarioIdeia(idea)}>
                      <i className="ti ti-calendar-plus" aria-hidden="true"></i> Usar no calendário
                    </button>
                  )}
                  <button className="btn-outline" style={{ flex: idea.data_uso ? 1 : 'unset', justifyContent: 'center', fontSize: 12 }}
                    onClick={() => setEditarIdeia(idea)}>
                    <i className="ti ti-edit" aria-hidden="true"></i>
                  </button>
                  <button onClick={() => excluirIdeia(idea)} title="Excluir" style={{
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
      </>)}

      {novaCampanhaOpen && (
        <ModalCampanha nutriId={user.id} campanha={{ novo: true, nome: '', plataforma: '', valor_investido: '', contatos_gerados: '', seguidores_gerados: '', data_inicio: new Date().toISOString().slice(0, 10), data_fim: '', obs: '' }}
          onClose={() => setNovaCampanhaOpen(false)} onSaved={() => { setNovaCampanhaOpen(false); carregarCampanhas(); }} />
      )}
      {editarCampanha && (
        <ModalCampanha nutriId={user.id} campanha={editarCampanha}
          onClose={() => setEditarCampanha(null)} onSaved={() => { setEditarCampanha(null); carregarCampanhas(); }} />
      )}
      {performanceOpen && (
        <ModalConteudoPerformance post={performanceOpen} nutriId={user.id}
          onClose={() => setPerformanceOpen(null)}
          onSaved={() => { setPerformanceOpen(null); carregarAgendaSemana(); }} />
      )}
      {novaIdeiaOpen && (
        <ModalIdeia nutriId={user.id} idea={{ novo: true, titulo: '', ideia: '', referencia: '', objetivo: '', status: 'ideia' }}
          onClose={() => setNovaIdeiaOpen(false)} onSaved={() => { setNovaIdeiaOpen(false); carregarIdeias(); }} />
      )}
      {editarIdeia && (
        <ModalIdeia nutriId={user.id} idea={editarIdeia}
          onClose={() => setEditarIdeia(null)} onSaved={() => { setEditarIdeia(null); carregarIdeias(); }} />
      )}
      {usarCalendarioIdeia && (
        <ModalUsarCalendario idea={usarCalendarioIdeia} nutriId={user.id} dataPadrao={fmtDate(segunda)}
          onClose={() => setUsarCalendarioIdeia(null)}
          onSaved={() => { setUsarCalendarioIdeia(null); carregarIdeias(); carregarAgendaSemana(); }} />
      )}
    </>
  );
}

function LinhaLabel({ texto, ultima }) {
  return (
    <div style={{
      padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
      textTransform: 'uppercase', borderTop: '0.5px solid var(--border)',
      borderBottom: ultima ? 'none' : undefined,
      display: 'flex', alignItems: 'center',
    }}>
      {texto}
    </div>
  );
}
function Celula({ children, ultima }) {
  return (
    <div style={{
      padding: '6px 10px', borderTop: '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border)',
      borderBottom: ultima ? 'none' : undefined,
      display: 'flex', alignItems: 'center', minHeight: 34,
    }}>
      {children}
    </div>
  );
}


/* ============================================================
   MODAL: campanha de tráfego
   ============================================================ */
function ModalCampanha({ campanha, nutriId, onClose, onSaved }) {
  const [form, setForm] = useState({
    nome: campanha.nome ?? '',
    plataforma: campanha.plataforma ?? '',
    valor_investido: campanha.valor_investido != null ? String(campanha.valor_investido) : '',
    contatos_gerados: campanha.contatos_gerados != null ? String(campanha.contatos_gerados) : '',
    seguidores_gerados: campanha.seguidores_gerados != null ? String(campanha.seguidores_gerados) : '',
    data_inicio: campanha.data_inicio ?? new Date().toISOString().slice(0, 10),
    data_fim: campanha.data_fim ?? '',
    obs: campanha.obs ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  async function salvar() {
    setErro(null);
    if (!form.nome.trim()) return setErro('Informe o nome da campanha.');
    setBusy(true);
    const payload = {
      nome: form.nome.trim(),
      plataforma: form.plataforma || null,
      valor_investido: Number(String(form.valor_investido).replace(',', '.')) || 0,
      contatos_gerados: Number(form.contatos_gerados) || 0,
      seguidores_gerados: Number(form.seguidores_gerados) || 0,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      obs: form.obs.trim() || null,
    };
    const { error } = campanha.novo
      ? await supabase.from('campanhas_trafego').insert({ ...payload, nutri_id: nutriId })
      : await supabase.from('campanhas_trafego').update(payload).eq('id', campanha.id);
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, maxWidth: 480, width: '100%',
        maxHeight: '90vh', overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{campanha.novo ? 'Adicionar campanha' : 'Editar campanha'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Nome da campanha</label>
        <input value={form.nome} onChange={set('nome')} placeholder="Ex: Campanha Setembro - Instagram" />

        <label className="form-lbl">Plataforma</label>
        <select value={form.plataforma} onChange={set('plataforma')}>
          <option value="">Não informado</option>
          {PLATAFORMAS_ADS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label className="form-lbl">Valor investido (R$)</label>
            <input inputMode="decimal" value={form.valor_investido} onChange={set('valor_investido')} placeholder="0,00" />
          </div>
          <div>
            <label className="form-lbl">Contatos gerados</label>
            <input inputMode="numeric" value={form.contatos_gerados} onChange={set('contatos_gerados')} placeholder="0" />
          </div>
          <div>
            <label className="form-lbl">Seguidores gerados</label>
            <input inputMode="numeric" value={form.seguidores_gerados} onChange={set('seguidores_gerados')} placeholder="0" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="form-lbl">Data início</label>
            <input type="date" value={form.data_inicio} onChange={set('data_inicio')} />
          </div>
          <div>
            <label className="form-lbl">Data fim (opcional)</label>
            <input type="date" value={form.data_fim} onChange={set('data_fim')} />
          </div>
        </div>

        <label className="form-lbl">Observação</label>
        <textarea rows={2} value={form.obs} onChange={set('obs')} style={{ resize: 'vertical' }} />

        {erro && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10 }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   MODAL: ideia de conteúdo
   ============================================================ */
function ModalIdeia({ idea, nutriId, onClose, onSaved }) {
  const [form, setForm] = useState({
    titulo: idea.titulo ?? '',
    ideia: idea.ideia ?? '',
    referencia: idea.referencia ?? '',
    objetivo: idea.objetivo ?? '',
    status: idea.status ?? 'ideia',
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  async function salvar() {
    setErro(null);
    if (!form.titulo.trim()) return setErro('Informe o título.');
    setBusy(true);
    const payload = {
      titulo: form.titulo.trim(),
      ideia: form.ideia.trim() || null,
      referencia: form.referencia.trim() || null,
      objetivo: form.objetivo || null,
      status: form.status,
    };
    const { error } = idea.novo
      ? await supabase.from('ideias_conteudo').insert({ ...payload, nutri_id: nutriId })
      : await supabase.from('ideias_conteudo').update(payload).eq('id', idea.id);
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, maxWidth: 480, width: '100%',
        maxHeight: '90vh', overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{idea.novo ? 'Nova ideia' : 'Editar ideia'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Título</label>
        <input value={form.titulo} onChange={set('titulo')} placeholder="Ex: 5 erros que atrasam seu emagrecimento" />

        <label className="form-lbl">Ideia</label>
        <textarea rows={3} value={form.ideia} onChange={set('ideia')}
          placeholder="Do que se trata, o que quer passar nesse conteúdo..." style={{ resize: 'vertical' }} />

        <label className="form-lbl">Referência</label>
        <input value={form.referencia} onChange={set('referencia')} placeholder="Link, print, inspiração..." />

        <label className="form-lbl">Status</label>
        <select value={form.status} onChange={set('status')}>
          {STATUS_IDEIA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        {erro && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10 }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   MODAL: usar ideia no calendário
   ============================================================ */
function ModalUsarCalendario({ idea, nutriId, dataPadrao, onClose, onSaved }) {
  const [data, setData] = useState(dataPadrao);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function usar() {
    setErro(null);
    if (!data) return setErro('Escolha uma data.');
    setBusy(true);
    // Upsert parcial: só grava conteúdo/referência — se o dia já tiver
    // outros campos preenchidos (status, formato, ISCAA), eles continuam
    // intactos, já que não fazem parte do payload.
    const { error: agError } = await supabase.from('agenda_editorial').upsert({
      nutri_id: nutriId,
      data,
      conteudo: idea.titulo,
      referencia: idea.referencia || null,
    }, { onConflict: 'nutri_id,data' });
    if (agError) {
      setBusy(false);
      return setErro('Erro: ' + agError.message);
    }
    await supabase.from('ideias_conteudo').update({ data_uso: data }).eq('id', idea.id);
    setBusy(false);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 110, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, maxWidth: 420, width: '100%',
        padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Usar no calendário</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>"{idea.titulo}"</div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Em que dia?</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} />

        {erro && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10 }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={usar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Usar nessa data'}
          </button>
        </div>
      </div>
    </div>
  );
}
