import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import EditableCell from '../../components/EditableCell.jsx';

const ORIGENS = ['Instagram', 'Indicação', 'Parceria', 'Tráfego pago', 'Site', 'WhatsApp', 'Outro'];

const STATUS_LIST = [
  { id: 'novo_contato',       label: 'Novo contato' },
  { id: 'sc_agendada',        label: 'SC agendada' },
  { id: 'sc_realizada',       label: 'SC realizada' },
  { id: 'consulta_agendada',  label: 'Consulta agendada' },
  { id: 'ganho',              label: 'Ganho' },
  { id: 'perdido',            label: 'Perdido' },
];
// Status que já indicam que pelo menos a Sessão Clareza foi encaminhada —
// usado só pra calcular "Conversão de consulta" (ver stats abaixo).
const STATUS_COM_SC = ['sc_agendada', 'sc_realizada', 'consulta_agendada', 'ganho'];

const PROXIMAS_ACOES = ['Agendar SC', 'Confirmar SC', 'Fazer follow-up', 'Agendar consulta', 'Enviar proposta', 'Nenhuma'];
const MOTIVOS_PERDA = ['Preço', 'Parou de responder', 'Não é o momento', 'Escolheu outro profissional', 'Outro'];
const MOTIVOS_GANHO = ['Preço', 'Clareza', 'Indicação/recomendação', 'Bom atendimento', 'Confiança na nutricionista', 'Resultado prometido', 'Outro'];

const TEMPERATURAS = [
  { id: 'quente', label: 'Quente', emoji: '🔥' },
  { id: 'morno',  label: 'Morno',  emoji: '🙂' },
  { id: 'frio',   label: 'Frio',   emoji: '❄️' },
];

const PERIODOS = [
  { id: '7',     label: 'Últimos 7 dias' },
  { id: '30',    label: 'Últimos 30 dias' },
  { id: '90',    label: 'Últimos 90 dias' },
  { id: 'todos', label: 'Todos' },
];

function maisComum(valores) {
  const contagem = {};
  valores.forEach(v => { if (v) contagem[v] = (contagem[v] ?? 0) + 1; });
  const entradas = Object.entries(contagem);
  if (!entradas.length) return null;
  return entradas.sort((a, b) => b[1] - a[1])[0][0];
}

export default function Comercial() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [leads, setLeads] = useState(null);
  const [periodo, setPeriodo] = useState('30');
  const [busca, setBusca] = useState('');
  const [novoOpen, setNovoOpen] = useState(false);
  const [editarLead, setEditarLead] = useState(null);
  const [converterLead, setConverterLead] = useState(null);

  async function carregar() {
    if (!user) return;
    const { data } = await supabase.from('leads')
      .select('*').eq('nutri_id', user.id).order('data_primeiro_contato', { ascending: false });
    setLeads(data ?? []);
  }
  useEffect(() => { carregar(); }, [user]);

  async function salvarCampo(lead, campo, valor) {
    await supabase.from('leads').update({ [campo]: valor, updated_at: new Date().toISOString() }).eq('id', lead.id);
    setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, [campo]: valor } : l));
  }

  async function excluirLead(lead) {
    if (!window.confirm(`Excluir o contato "${lead.nome}"?`)) return;
    await supabase.from('leads').delete().eq('id', lead.id);
    carregar();
  }

  const leadsPeriodo = useMemo(() => {
    if (!leads) return [];
    if (periodo === 'todos') return leads;
    const dias = Number(periodo);
    const corte = new Date();
    corte.setHours(0, 0, 0, 0);
    corte.setDate(corte.getDate() - dias);
    return leads.filter(l => l.data_primeiro_contato && new Date(l.data_primeiro_contato + 'T00:00:00') >= corte);
  }, [leads, periodo]);

  const leadsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return leadsPeriodo;
    return leadsPeriodo.filter(l =>
      (l.nome ?? '').toLowerCase().includes(q)
      || (l.contato ?? '').toLowerCase().includes(q)
      || (l.objetivo ?? '').toLowerCase().includes(q)
    );
  }, [leadsPeriodo, busca]);

  const stats = useMemo(() => {
    const total = leadsPeriodo.length;
    const semAgendamento = leadsPeriodo.filter(l => l.status === 'novo_contato').length;

    const comSC = leadsPeriodo.filter(l => STATUS_COM_SC.includes(l.status)).length;
    const conversaoConsulta = total ? Math.round((comSC / total) * 100) : 0;

    const responderamPosSC = leadsPeriodo.filter(l => l.marcou_consulta_pos_sc != null);
    const converteramPosSC = responderamPosSC.filter(l => l.marcou_consulta_pos_sc === 'sim');
    const conversaoPosSC = responderamPosSC.length ? Math.round((converteramPosSC.length / responderamPosSC.length) * 100) : 0;

    const origemComum = maisComum(leadsPeriodo.map(l => l.origem));
    const perdaComum = maisComum(leadsPeriodo.filter(l => l.status === 'perdido').map(l => l.motivo_perda));
    const ganhoComum = maisComum(leadsPeriodo.filter(l => l.status === 'ganho').flatMap(l => l.motivos_ganho ?? []));

    return { total, semAgendamento, conversaoConsulta, conversaoPosSC, origemComum, perdaComum, ganhoComum };
  }, [leadsPeriodo]);

  return (
    <>
      <div className="page-title">Comercial</div>
      <div className="page-sub">Acompanhe os leads desde o primeiro contato até virarem pacientes</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ margin: 0, width: 'auto' }}>
          {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="btn" onClick={() => setNovoOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true"></i> Adicionar contato
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <div className="stat-label">Leads sem agendamento</div>
          <div className="stat-val">{stats.semAgendamento}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Conversão de consulta</div>
          <div className="stat-val">{stats.conversaoConsulta}%</div>
          <div className="stat-sub">leads que agendaram SC ou mais</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Conversão de consulta pós SC</div>
          <div className="stat-val">{stats.conversaoPosSC}%</div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Origem mais comum</div>
          <div className="stat-val" style={{ fontSize: 18 }}>{stats.origemComum ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Perda mais comum</div>
          <div className="stat-val" style={{ fontSize: 18 }}>{stats.perdaComum ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ganho mais comum</div>
          <div className="stat-val" style={{ fontSize: 18 }}>{stats.ganhoComum ?? '—'}</div>
        </div>
      </div>

      <div className="section-header">
        <div>
          <div className="section-title">Contatos</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Clique em qualquer campo pra editar direto na tabela.</div>
        </div>
        <input
          style={{ width: 220, margin: 0 }}
          className="input-field"
          placeholder="Buscar contato..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {leads === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : leadsFiltrados.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-briefcase empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhum contato ainda</div>
          <div className="empty-sub">Cadastre o primeiro lead que chegou até você.</div>
          <button className="btn" onClick={() => setNovoOpen(true)}>
            <i className="ti ti-plus" aria-hidden="true"></i> Adicionar contato
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contato</th>
                <th>Origem</th>
                <th>Data 1º contato</th>
                <th>Objetivo</th>
                <th>Temperatura</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leadsFiltrados.map(lead => (
                <tr key={lead.id}>
                  <td>
                    <EditableCell tipo="texto" value={lead.nome} onSave={v => salvarCampo(lead, 'nome', v)} />
                  </td>
                  <td>
                    <EditableCell tipo="texto" value={lead.contato} onSave={v => salvarCampo(lead, 'contato', v)} placeholder="telefone/whatsapp" />
                  </td>
                  <td>
                    <EditableCell tipo="select" value={lead.origem} opcoes={ORIGENS} onSave={v => salvarCampo(lead, 'origem', v)} />
                  </td>
                  <td>
                    <EditableCell tipo="data" value={lead.data_primeiro_contato} onSave={v => salvarCampo(lead, 'data_primeiro_contato', v)} />
                  </td>
                  <td>
                    <EditableCell tipo="texto" value={lead.objetivo} onSave={v => salvarCampo(lead, 'objetivo', v)} />
                  </td>
                  <td>
                    <EditableCell tipo="select" value={lead.temperatura}
                      opcoes={TEMPERATURAS.map(t => ({ id: t.id, label: `${t.emoji} ${t.label}` }))}
                      onSave={v => salvarCampo(lead, 'temperatura', v)} />
                  </td>
                  <td>
                    <EditableCell tipo="select" value={lead.status} opcoes={STATUS_LIST} onSave={v => salvarCampo(lead, 'status', v)} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {lead.status === 'ganho' && !lead.convertido_em && (
                        <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={() => setConverterLead(lead)}>
                          <i className="ti ti-user-plus" aria-hidden="true"></i> Converter
                        </button>
                      )}
                      <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => setEditarLead(lead)} title="Editar tudo">
                        <i className="ti ti-edit" aria-hidden="true"></i>
                      </button>
                      <button onClick={() => excluirLead(lead)} title="Excluir" style={{
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

      {novoOpen && (
        <ModalLead
          lead={{ novo: true, nome: '', contato: '', origem: '', data_primeiro_contato: new Date().toISOString().slice(0, 10),
            objetivo: '', temperatura: '', follow_up_1: '', follow_up_2: '', follow_up_3: '',
            proxima_acao: '', status: 'novo_contato', marcou_consulta_pos_sc: '', motivo_perda: '',
            motivos_ganho: [], observacao: '' }}
          nutriId={user.id}
          onClose={() => setNovoOpen(false)}
          onSaved={() => { setNovoOpen(false); carregar(); }}
        />
      )}

      {editarLead && (
        <ModalLead
          lead={editarLead}
          nutriId={user.id}
          onClose={() => setEditarLead(null)}
          onSaved={() => { setEditarLead(null); carregar(); }}
        />
      )}

      {converterLead && (
        <ModalConverterPaciente
          lead={converterLead}
          nutriId={user.id}
          onClose={() => setConverterLead(null)}
          onSaved={() => { setConverterLead(null); carregar(); }}
          onIrParaPacientes={() => navigate('/nutri/pacientes')}
        />
      )}
    </>
  );
}


/* ============================================================
   MODAL SHELL
   ============================================================ */
function ModalShell({ title, subtitle, onClose, children, width = 560 }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: width, width: '100%', maxHeight: '90vh',
        overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--dark)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
        {children}
      </div>
    </div>
  );
}


/* ============================================================
   MODAL: novo contato / editar contato
   ============================================================ */
function ModalLead({ lead, nutriId, onClose, onSaved }) {
  const [form, setForm] = useState({
    nome: lead.nome ?? '',
    contato: lead.contato ?? '',
    origem: lead.origem ?? '',
    data_primeiro_contato: lead.data_primeiro_contato ?? new Date().toISOString().slice(0, 10),
    objetivo: lead.objetivo ?? '',
    temperatura: lead.temperatura ?? '',
    follow_up_1: lead.follow_up_1 ?? '',
    follow_up_2: lead.follow_up_2 ?? '',
    follow_up_3: lead.follow_up_3 ?? '',
    proxima_acao: lead.proxima_acao ?? '',
    status: lead.status ?? 'novo_contato',
    marcou_consulta_pos_sc: lead.marcou_consulta_pos_sc ?? '',
    motivo_perda: lead.motivo_perda ?? '',
    motivos_ganho: lead.motivos_ganho ?? [],
    observacao: lead.observacao ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  function toggleMotivoGanho(m) {
    setForm(f => ({
      ...f,
      motivos_ganho: f.motivos_ganho.includes(m) ? f.motivos_ganho.filter(x => x !== m) : [...f.motivos_ganho, m],
    }));
  }

  async function salvar() {
    setErro(null);
    if (!form.nome.trim()) return setErro('Informe o nome.');
    if (!form.data_primeiro_contato) return setErro('Informe a data do primeiro contato.');
    setBusy(true);
    const payload = {
      nome: form.nome.trim(),
      contato: form.contato.trim() || null,
      origem: form.origem || null,
      data_primeiro_contato: form.data_primeiro_contato,
      objetivo: form.objetivo.trim() || null,
      temperatura: form.temperatura || null,
      follow_up_1: form.follow_up_1 || null,
      follow_up_2: form.follow_up_2 || null,
      follow_up_3: form.follow_up_3 || null,
      proxima_acao: form.proxima_acao || null,
      status: form.status,
      marcou_consulta_pos_sc: form.marcou_consulta_pos_sc || null,
      motivo_perda: form.motivo_perda || null,
      motivos_ganho: form.motivos_ganho,
      observacao: form.observacao.trim() || null,
    };
    const { error } = lead.novo
      ? await supabase.from('leads').insert({ ...payload, nutri_id: nutriId })
      : await supabase.from('leads').update(payload).eq('id', lead.id);
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    onSaved();
  }

  return (
    <ModalShell title={lead.novo ? 'Adicionar contato' : 'Editar contato'}
      subtitle="Registre o lead e vá acompanhando o andamento" onClose={onClose}>
      <label className="form-lbl" style={{ marginTop: 0 }}>Nome *</label>
      <input value={form.nome} onChange={set('nome')} placeholder="Nome do contato" />

      <label className="form-lbl">Contato (telefone ou WhatsApp)</label>
      <input value={form.contato} onChange={set('contato')} placeholder="(11) 99999-9999" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-lbl">Origem</label>
          <select value={form.origem} onChange={set('origem')}>
            <option value="">Não informado</option>
            {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="form-lbl">Data 1º contato *</label>
          <input type="date" value={form.data_primeiro_contato} onChange={set('data_primeiro_contato')} />
        </div>
      </div>

      <label className="form-lbl">Objetivo</label>
      <input value={form.objetivo} onChange={set('objetivo')} placeholder="Ex: Emagrecimento" />

      <label className="form-lbl">Temperatura</label>
      <select value={form.temperatura} onChange={set('temperatura')}>
        <option value="">Não informado</option>
        {TEMPERATURAS.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        <div>
          <label className="form-lbl">1º Follow-up</label>
          <input type="date" value={form.follow_up_1} onChange={set('follow_up_1')} />
        </div>
        <div>
          <label className="form-lbl">2º Follow-up</label>
          <input type="date" value={form.follow_up_2} onChange={set('follow_up_2')} />
        </div>
        <div>
          <label className="form-lbl">3º Follow-up</label>
          <input type="date" value={form.follow_up_3} onChange={set('follow_up_3')} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <div>
          <label className="form-lbl">Próxima ação</label>
          <select value={form.proxima_acao} onChange={set('proxima_acao')}>
            <option value="">Não informado</option>
            {PROXIMAS_ACOES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="form-lbl">Status</label>
          <select value={form.status} onChange={set('status')}>
            {STATUS_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <div>
          <label className="form-lbl">Marcou consulta pós SC</label>
          <select value={form.marcou_consulta_pos_sc} onChange={set('marcou_consulta_pos_sc')}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>
        <div>
          <label className="form-lbl">Motivo da perda</label>
          <select value={form.motivo_perda} onChange={set('motivo_perda')}>
            <option value="">Não informado</option>
            {MOTIVOS_PERDA.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <label className="form-lbl" style={{ marginTop: 12 }}>Motivos de ganho</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {MOTIVOS_GANHO.map(m => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
            <input type="checkbox" checked={form.motivos_ganho.includes(m)} onChange={() => toggleMotivoGanho(m)} style={{ margin: 0 }} />
            {m}
          </label>
        ))}
      </div>

      <label className="form-lbl" style={{ marginTop: 12 }}>Observação</label>
      <textarea rows="3" value={form.observacao} onChange={set('observacao')} style={{ resize: 'vertical' }} />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
        </button>
      </div>
    </ModalShell>
  );
}


/* ============================================================
   MODAL: converter lead em paciente (pré-cadastro)
   ============================================================ */
function ModalConverterPaciente({ lead, nutriId, onClose, onSaved, onIrParaPacientes }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function converter() {
    setErro(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setErro('Informe um e-mail válido — é obrigatório pra gerar o link de cadastro.');
    }
    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      nome: lead.nome,
      email: email.trim().toLowerCase(),
      objetivo: lead.objetivo || null,
      status: 'pendente',
    };
    const { omitColunasFaltantes } = await import('../../lib/utils.js');
    const { data, error, omitidos } = await omitColunasFaltantes(
      payload,
      [],
      (p) => supabase.from('pacientes_pendentes').upsert(p, { onConflict: 'nutri_id,email' }).select('id').single(),
    );
    if (error) {
      setBusy(false);
      return setErro('Erro: ' + error.message);
    }
    await supabase.from('leads').update({
      pendente_id: data?.id ?? null,
      convertido_em: new Date().toISOString(),
    }).eq('id', lead.id);
    setBusy(false);
    if (omitidos && omitidos.length > 0) {
      alert(`Convertido, mas ${omitidos.join(', ')} não foi salvo — Supabase desatualizado.`);
    }
    onSaved();
  }

  return (
    <ModalShell title="Converter em paciente" subtitle={`${lead.nome} vira um pré-cadastro em Pacientes`} onClose={onClose} width={440}>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
        Falta só o e-mail — o resto (nome, objetivo) já vem preenchido do lead. Depois é só ir em
        <strong> Pacientes</strong> e copiar o link de cadastro pra ela.
      </div>

      <label className="form-lbl" style={{ marginTop: 0 }}>E-mail *</label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={converter} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Converter'}
        </button>
      </div>
      <button className="btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 12 }}
        onClick={onIrParaPacientes}>
        Ir pra Pacientes
      </button>
    </ModalShell>
  );
}
