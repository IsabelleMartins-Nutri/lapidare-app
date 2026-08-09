import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';
import { validarTemplate, formatarResposta } from '../../lib/checkinDefault.js';
import { criarProntuarioSilencioso } from '../../lib/prontuario.js';
import CheckinForm from '../../components/CheckinForm.jsx';
import DicaJSON from '../../components/DicaJSON.jsx';

// Listas padrão usadas como fallback se a nutri não customizou ainda.
// As listas CUSTOMIZADAS ficam em nutris.{objetivos,tipos_plano,modalidades}
// (editáveis em /nutri/personalizacao).
const OBJETIVOS_DEFAULT   = ['Emagrecimento', 'Hipertrofia', 'Reeducação alimentar', 'Saúde geral', 'Performance esportiva'];
const TIPOS_PLANO_DEFAULT = ['Trimestral', 'Semestral', 'Consultoria', 'Acompanhamento'];
const MODALIDADES_DEFAULT = ['Presencial', 'Online', 'Híbrido'];
const SEXOS = [
  { v: 'feminino',  l: 'Feminino' },
  { v: 'masculino', l: 'Masculino' },
];

export default function Cadastrar() {
  const navigate = useNavigate();
  const { user, profile } = useSession();
  const [servicosAtivos, setServicosAtivos] = useState([]);
  const [criandoProntuario, setCriandoProntuario] = useState(null); // id do pendente em processamento

  // Listas customizadas pela nutri (caem pro default se não tiver lista
  // configurada ainda, ou se o Supabase dela não foi atualizado).
  const objetivosCustom = Array.isArray(profile?.objetivos) && profile.objetivos.length > 0
    ? profile.objetivos
    : OBJETIVOS_DEFAULT;
  // Tipos de plano: prioriza serviços ATIVOS cadastrados em /nutri/servicos
  // (era o que a nutri esperava — "se cadastrei serviços, devem aparecer aqui").
  // Se ela não tem serviços ainda, cai pra lista custom da Personalização,
  // depois pros defaults.
  const tiposPlanoCustom = servicosAtivos.length > 0
    ? servicosAtivos.map(s => s.nome)
    : (Array.isArray(profile?.tipos_plano) && profile.tipos_plano.length > 0
        ? profile.tipos_plano
        : TIPOS_PLANO_DEFAULT);
  const modalidadesCustom = Array.isArray(profile?.modalidades) && profile.modalidades.length > 0
    ? profile.modalidades
    : MODALIDADES_DEFAULT;

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [sexo, setSexo] = useState('feminino');
  const [objetivo, setObjetivo] = useState(OBJETIVOS_DEFAULT[0]);
  const [tipoPlano, setTipoPlano] = useState(TIPOS_PLANO_DEFAULT[0]);
  const [modalidade, setModalidade] = useState(MODALIDADES_DEFAULT[1]); // Online por default
  const [obs, setObs] = useState('');

  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(null);   // pendente criado (objeto)
  const [pendentes, setPendentes] = useState([]);
  const [intakePerguntas, setIntakePerguntas] = useState(null);
  const [editorIntakeAberto, setEditorIntakeAberto] = useState(false);
  const [expandidosIntake, setExpandidosIntake] = useState({});
  const [caixaEntrada, setCaixaEntrada] = useState([]);

  async function carregarIntake() {
    if (!user) return;
    const { data } = await supabase.from('nutris').select('intake_perguntas').eq('id', user.id).maybeSingle();
    setIntakePerguntas(data?.intake_perguntas ?? null);
  }
  useEffect(() => { carregarIntake(); }, [user]);

  async function carregarCaixaEntrada() {
    if (!user) return;
    const { data } = await supabase
      .from('pre_consulta_respostas')
      .select('id, tipo, nome, email, perguntas, respostas, created_at')
      .eq('nutri_id', user.id)
      .eq('cadastrada', false)
      .order('created_at', { ascending: false });
    setCaixaEntrada(data ?? []);
  }
  useEffect(() => { carregarCaixaEntrada(); }, [user]);

  function usarDadosDaSubmissao(s) {
    setNome(s.nome ?? '');
    setEmail(s.email ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function marcarComoCadastrada(s) {
    if (!window.confirm(`Marcar como já cadastrada? Some da caixa de entrada.`)) return;
    await supabase.from('pre_consulta_respostas').update({ cadastrada: true }).eq('id', s.id);
    carregarCaixaEntrada();
  }

  async function carregarPendentes() {
    if (!user) return;
    const { data } = await supabase
      .from('pacientes_pendentes')
      .select('*')
      .eq('nutri_id', user.id)
      .neq('status', 'ativado')
      .order('created_at', { ascending: false });
    setPendentes(data ?? []);
  }
  useEffect(() => { carregarPendentes(); }, [user]);

  // Carrega serviços ativos pra popular o select "Tipo de plano".
  // Tabela "servicos" existe desde fases antigas (não precisa SQL novo).
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('servicos')
        .select('nome, ativo')
        .eq('nutri_id', user.id)
        .eq('ativo', true)
        .order('ticket', { ascending: false });
      if (active) setServicosAtivos(data ?? []);
    })();
    return () => { active = false; };
  }, [user]);

  // Quando carregar profile (ou nutri trocar lista no Personalização),
  // garante que o "Objetivo" selecionado existe na lista — senão usa o 1º.
  useEffect(() => {
    // Quando carregar profile (ou nutri trocar lista no Personalização),
    // garante que o valor selecionado existe na lista — senão usa o 1º.
    if (objetivosCustom.length > 0 && !objetivosCustom.includes(objetivo)) {
      setObjetivo(objetivosCustom[0]);
    }
    if (tiposPlanoCustom.length > 0 && !tiposPlanoCustom.includes(tipoPlano)) {
      setTipoPlano(tiposPlanoCustom[0]);
    }
    if (modalidadesCustom.length > 0 && !modalidadesCustom.includes(modalidade)) {
      setModalidade(modalidadesCustom[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objetivosCustom.join('|'), tiposPlanoCustom.join('|'), modalidadesCustom.join('|')]);

  function resetForm() {
    setNome(''); setEmail(''); setNascimento(''); setSexo('feminino');
    setObjetivo(objetivosCustom[0] ?? OBJETIVOS_DEFAULT[0]);
    setTipoPlano(tiposPlanoCustom[0] ?? TIPOS_PLANO_DEFAULT[0]);
    setModalidade(modalidadesCustom[1] ?? modalidadesCustom[0] ?? MODALIDADES_DEFAULT[1]);
    setObs('');
  }

  async function salvar(e) {
    e?.preventDefault?.();
    setErro(null); setSucesso(null);
    if (!nome.trim()) return setErro('Informe o nome.');
    if (!email.trim()) return setErro('Informe o email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Email inválido.');

    setBusy(true);
    const payload = {
      nutri_id: user.id,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      nascimento: nascimento || null,
      sexo,
      objetivo,
      tipo_plano: tipoPlano,
      modalidade,
      obs: obs.trim() || null,
      status: 'pendente',
    };
    // Usa omitColunasFaltantes pra Supabase desatualizado — cobre sexo E
    // nascimento (antes só sexo). Se qualquer campo opcional não existir no
    // schema da nutri, retry sem ele.
    const { omitColunasFaltantes } = await import('../../lib/utils.js');
    let { data, error, omitidos } = await omitColunasFaltantes(
      payload,
      ['sexo', 'nascimento'],
      (p) => supabase
        .from('pacientes_pendentes')
        .upsert(p, { onConflict: 'nutri_id,email' })
        .select('*')
        .single(),
    );
    if (!error && omitidos && omitidos.length > 0) {
      setErro(
        `Atenção: cadastro feito, mas ${omitidos.join(', ')} não foi salvo porque seu Supabase ` +
        'ainda não foi atualizado. Rode o SQL atualizado: ' +
        'github.com/danielasoares-rd/lapidare-app/tree/main/supabase'
      );
    }

    setBusy(false);
    if (error) {
      // Erro de schema (ex: outras colunas faltando) — mensagem mais didática
      if (/schema cache|column.*does not exist/i.test(error.message)) {
        return setErro(
          'Seu Supabase está desatualizado. Rode o SQL mais recente pra resolver: ' +
          'github.com/danielasoares-rd/lapidare-app/tree/main/supabase'
        );
      }
      return setErro('Erro ao cadastrar: ' + error.message);
    }

    setSucesso(data);
    resetForm();
    carregarPendentes();
  }

  function linkDe(pendente) {
    return `${window.location.origin}/signup-paciente/${user.id}/${pendente.token}`;
  }

  function linkPreConsultaFixo(nutriId, tipo) {
    return `${window.location.origin}/pre-consulta/${nutriId}/${tipo}`;
  }

  async function copiarLinkFixo(tipo) {
    try {
      await navigator.clipboard.writeText(linkPreConsultaFixo(user.id, tipo));
      alert('Link copiado! Use sempre o mesmo pra qualquer paciente.');
    } catch {
      prompt('Copie o link abaixo:', linkPreConsultaFixo(user.id, tipo));
    }
  }

  function mensagemWhats(pendente) {
    const link = linkDe(pendente);
    const primeiroNome = pendente.nome.split(' ')[0];
    return encodeURIComponent(
      `Oi ${primeiroNome}! 😊\n\nPreparei seu acesso ao app de acompanhamento nutricional. Clica no link abaixo, cria sua senha e já entra:\n\n${link}\n\nQualquer dúvida, me chama por aqui!`
    );
  }

  async function copiarLink(pendente) {
    try {
      await navigator.clipboard.writeText(linkDe(pendente));
      alert('Link copiado!');
    } catch {
      prompt('Copie o link abaixo:', linkDe(pendente));
    }
  }

  async function excluirPendente(pendente) {
    if (!window.confirm(`Excluir cadastro pendente de "${pendente.nome}"?`)) return;
    await supabase.from('pacientes_pendentes').delete().eq('id', pendente.id);
    carregarPendentes();
  }

  async function criarProntuario(pendente) {
    const ok = window.confirm(
      `Criar o prontuário completo de "${pendente.nome}" agora?\n\n` +
      `Isso NÃO envia nenhum convite, email ou link pra ela — só te dá acesso ` +
      `imediato ao Plano, Exames, Avaliação e Atendimento, como qualquer outra paciente. ` +
      `Se um dia você quiser liberar o app pra ela, use "Enviar redefinição de senha" no perfil dela.`
    );
    if (!ok) return;
    setCriandoProntuario(pendente.id);
    try {
      const id = await criarProntuarioSilencioso(pendente);
      navigate(`/nutri/pacientes/${id}`);
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      setCriandoProntuario(null);
    }
  }

  return (
    <>
      <div className="page-title">Cadastrar paciente</div>
      <div className="page-sub">Preencha os dados da paciente — ela recebe um link pra criar só a senha</div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Links de pré-consulta</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Links fixos — sempre os mesmos, use pra qualquer pessoa. Ela preenche o próprio nome/email e as respostas caem na caixa de entrada aqui embaixo, antes de qualquer cadastro.
            </div>
          </div>
          <button className="btn-outline" onClick={() => setEditorIntakeAberto(true)}>
            <i className="ti ti-edit" aria-hidden="true"></i> {intakePerguntas?.length ? 'Editar perguntas (geral)' : 'Configurar perguntas (geral)'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Questionário geral</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                flex: 1, padding: '6px 8px', background: 'var(--bg2)', borderRadius: 6,
                fontSize: 10, fontFamily: 'monospace', color: 'var(--text2)',
                wordBreak: 'break-all', userSelect: 'all', cursor: 'text',
              }}>{linkPreConsultaFixo(user?.id, 'geral')}</div>
              <button className="btn-outline" onClick={() => copiarLinkFixo('geral')} style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}>
                <i className="ti ti-copy" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>QFA — frequência alimentar</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                flex: 1, padding: '6px 8px', background: 'var(--bg2)', borderRadius: 6,
                fontSize: 10, fontFamily: 'monospace', color: 'var(--text2)',
                wordBreak: 'break-all', userSelect: 'all', cursor: 'text',
              }}>{linkPreConsultaFixo(user?.id, 'qfa')}</div>
              <button className="btn-outline" onClick={() => copiarLinkFixo('qfa')} style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}>
                <i className="ti ti-copy" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {caixaEntrada.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>
            Caixa de entrada — pré-consulta ({caixaEntrada.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {caixaEntrada.map(s => (
              <div key={s.id} style={{ padding: 10, background: 'var(--bg2)', borderRadius: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{s.nome || 'Sem nome'}</strong> · {s.email || 'sem email'}
                    <span style={{
                      marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 999,
                      background: s.tipo === 'qfa' ? 'var(--blue-bg, #d4e8f5)' : 'var(--gold-soft)',
                      color: s.tipo === 'qfa' ? 'var(--blue, #1a5a8c)' : 'var(--gold-deep)',
                    }}>
                      {s.tipo === 'qfa' ? 'QFA' : 'Geral'}
                    </span>
                    <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>{dataBR(s.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => setExpandidosIntake(v => ({ ...v, [s.id]: !v[s.id] }))}>
                      {expandidosIntake[s.id] ? 'Ocultar' : 'Ver respostas'}
                    </button>
                    <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => usarDadosDaSubmissao(s)}>
                      Usar nome/email
                    </button>
                    <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--green)', borderColor: 'var(--green)' }}
                      onClick={() => marcarComoCadastrada(s)}>
                      <i className="ti ti-check" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
                {expandidosIntake[s.id] && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--hair, #e3dcce)' }}>
                    {(s.perguntas ?? []).map(p => (
                      <div key={p.id} style={{ marginBottom: 6 }}>
                        <div style={{ fontWeight: 500, color: 'var(--dark)' }}>{p.pergunta}</div>
                        <div style={{ color: 'var(--text2)' }}>{formatarResposta(p, s.respostas?.[p.id])}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>

        {/* ─── Formulário ─── */}
        <form onSubmit={salvar} className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Novo cadastro</div>

          <Field label="Nome completo *" value={nome} onChange={setNome} required autoFocus />
          <Field label="Email *" type="email" value={email} onChange={setEmail} required />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Data de nascimento" type="date" value={nascimento} onChange={setNascimento} />
            <SelectField label="Sexo" value={sexo} onChange={setSexo} options={SEXOS} />
          </div>

          <SelectField label="Objetivo" value={objetivo} onChange={setObjetivo} options={objetivosCustom} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SelectField label="Tipo de plano" value={tipoPlano} onChange={setTipoPlano} options={tiposPlanoCustom} />
            <SelectField label="Modalidade" value={modalidade} onChange={setModalidade} options={modalidadesCustom} />
          </div>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{
              display: 'block', fontSize: 11, color: 'var(--text3)',
              marginBottom: 5, fontWeight: 500,
            }}>Observação (opcional)</span>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Ex: indicada pela Camila"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none', fontFamily: 'var(--font-sans)',
                resize: 'vertical', boxSizing: 'border-box',
              }} />
          </label>

          {erro && (
            <div style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 6, marginBottom: 10,
              background: 'var(--red-bg)', color: 'var(--red)',
            }}>{erro}</div>
          )}

          <button type="submit" className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            <i className="ti ti-user-plus" aria-hidden="true"></i>
            {busy ? 'Cadastrando...' : 'Cadastrar e gerar link'}
          </button>
        </form>

        {/* ─── Painel direito: sucesso recente OU instruções ─── */}
        <div>
          {sucesso ? (
            <CartaoSucesso pendente={sucesso}
              link={linkDe(sucesso)}
              mensagemWhats={mensagemWhats(sucesso)}
              onCopiar={() => copiarLink(sucesso)}
              onDispensar={() => setSucesso(null)} />
          ) : (
            <div className="al-b" style={{ marginBottom: 12 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--blue)', marginTop: 1 }} aria-hidden="true"></i>
              <div>
                <div className="al-t" style={{ color: 'var(--blue)' }}>Como funciona</div>
                <div className="al-d">
                  Você preenche os dados administrativos (objetivo, plano, modalidade).
                  O sistema gera um link único, você envia pra paciente, e ela só precisa criar a senha.
                  Os dados já chegam pré-preenchidos pra ela — sem confusão.
                </div>
              </div>
            </div>
          )}

          {/* ─── Lista de pendentes ─── */}
          <div className="section-label" style={{ marginTop: 4 }}>
            Cadastros pendentes ({pendentes.length})
          </div>
          {pendentes.length === 0 ? (
            <div style={{
              padding: '14px 16px', fontSize: 12, color: 'var(--text3)',
              background: 'var(--bg2)', borderRadius: 8,
            }}>
              Nenhuma paciente aguardando — todas que você cadastrou já criaram conta.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendentes.map(p => (
                <div key={p.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {p.email} · cadastrada em {dataBR(p.created_at)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                        {p.objetivo} · {p.tipo_plano} · {p.modalidade}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: p.status === 'enviado' ? 'var(--green-bg)' : 'var(--orange-bg)',
                      color:      p.status === 'enviado' ? 'var(--green)'    : 'var(--orange)',
                      fontWeight: 500,
                    }}>
                      {p.status === 'enviado' ? '✓ Link enviado' : 'Aguardando envio'}
                    </span>
                  </div>
                  <div style={{
                    marginTop: 10, padding: '6px 8px',
                    background: 'var(--bg2)', borderRadius: 6,
                    fontSize: 10, fontFamily: 'monospace', color: 'var(--text2)',
                    wordBreak: 'break-all', userSelect: 'all', cursor: 'text',
                  }}>{linkDe(p)}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button className="btn-outline" onClick={() => copiarLink(p)}
                      style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="ti ti-copy" aria-hidden="true"></i> Copiar link
                    </button>
                    <a className="btn-outline"
                      href={`https://wa.me/?text=${mensagemWhats(p)}`}
                      target="_blank" rel="noreferrer"
                      onClick={async () => {
                        await supabase.from('pacientes_pendentes')
                          .update({ status: 'enviado' }).eq('id', p.id);
                        carregarPendentes();
                      }}
                      style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>
                      <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp
                    </a>
                    <button className="btn-outline" onClick={() => criarProntuario(p)}
                      disabled={criandoProntuario === p.id}
                      title="Cria o prontuário completo agora, sem enviar nenhum convite pra ela"
                      style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="ti ti-folder-plus" aria-hidden="true"></i>
                      {criandoProntuario === p.id ? ' Criando...' : ' Criar prontuário'}
                    </button>
                    <button onClick={() => excluirPendente(p)}
                      style={{
                        background: 'none', border: '0.5px solid var(--red)',
                        borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                        color: 'var(--red)', marginLeft: 'auto',
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editorIntakeAberto && (
        <IntakeEditorModal
          nutriId={user.id}
          perguntas={intakePerguntas}
          onClose={() => setEditorIntakeAberto(false)}
          onSaved={() => { setEditorIntakeAberto(false); carregarIntake(); }}
        />
      )}
    </>
  );
}


function CartaoSucesso({ pendente, link, mensagemWhats, onCopiar, onDispensar }) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'var(--green-bg, #ecfdf5)',
      border: '0.5px solid var(--green, #10b981)',
      borderLeft: '3px solid var(--green, #10b981)',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green, #10b981)', marginBottom: 4 }}>
            ✓ {pendente.nome.split(' ')[0]} cadastrada
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Agora envie o link abaixo. Ela só vai precisar criar a senha.
          </div>
        </div>
        <button onClick={onDispensar}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, color: 'var(--text3)', padding: 0,
          }}>
          <i className="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>
      <div style={{
        marginTop: 10, padding: '8px 10px',
        background: 'var(--white)', borderRadius: 6,
        fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-soft)',
        wordBreak: 'break-all',
      }}>{link}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="btn" onClick={onCopiar} style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
          <i className="ti ti-copy" aria-hidden="true"></i> Copiar link
        </button>
        <a className="btn-outline"
          href={`https://wa.me/?text=${mensagemWhats}`}
          target="_blank" rel="noreferrer"
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, textDecoration: 'none' }}>
          <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp
        </a>
      </div>
    </div>
  );
}


const INTAKE_EXEMPLO = [
  { id: 'objetivo_livre', secao: 'Sobre você', tipo: 'texto', pergunta: 'O que te trouxe até aqui? Conte um pouco do que você espera do acompanhamento.', placeholder: 'Escreva livremente...', rows: 4 },
  { id: 'historico_saude', secao: 'Sobre você', tipo: 'texto', pergunta: 'Tem algum diagnóstico, condição de saúde ou medicação em uso que eu deva saber?', placeholder: 'Ex: hipotireoidismo, uso de GLP-1...', rows: 3 },
  { id: 'refeicoes_hoje', secao: 'Rotina alimentar atual', tipo: 'texto', pergunta: 'Descreva o que você costuma comer num dia normal (café, almoço, lanche, jantar).', placeholder: 'Café da manhã: ...\nAlmoço: ...', rows: 5 },
];

function IntakeEditorModal({ nutriId, perguntas, onClose, onSaved }) {
  const [jsonText, setJsonText] = useState(
    JSON.stringify(perguntas?.length ? perguntas : INTAKE_EXEMPLO, null, 2)
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  const perguntasParsed = useMemo(() => {
    try {
      const arr = JSON.parse(jsonText);
      const v = validarTemplate({ nome: 'Pré-consulta', perguntas: arr });
      if (!v.ok) return null;
      return arr;
    } catch { return null; }
  }, [jsonText]);

  async function salvar() {
    setErro(null);
    let arr;
    try { arr = JSON.parse(jsonText); } catch (e) { return setErro('JSON inválido: ' + e.message); }
    const v = validarTemplate({ nome: 'Pré-consulta', perguntas: arr });
    if (!v.ok) return setErro(v.erro);

    setBusy(true);
    const { error } = await supabase.from('nutris').update({ intake_perguntas: arr }).eq('id', nutriId);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 620, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 4 }}>Questionário de pré-consulta</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Essas são as perguntas que a futura paciente responde antes de você fazer o cadastro dela — edite quantas vezes quiser.
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Perguntas (JSON)</label>
        <textarea rows={16} value={jsonText} onChange={e => setJsonText(e.target.value)}
          placeholder='[{ "id": "...", "secao": "...", "tipo": "...", "pergunta": "..." }]'
          style={{ fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }} />

        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
          Cada pergunta precisa de: <code>id</code>, <code>secao</code>, <code>tipo</code>, <code>pergunta</code>.
          Tipos válidos: emoji_scale, slider, single, multi, habitos, texto.
        </div>
        <DicaJSON
          exemploPrompt='gera um JSON (array de perguntas) pra um questionário de pré-consulta de nutrição, que a paciente responde antes da primeira consulta: perguntas abertas sobre objetivo/histórico de saúde (texto), e um recordatório alimentar atual (texto, perguntando o que come em cada refeição do dia). Estrutura: [{ "id": "...", "secao": "...", "tipo": "texto", "pergunta": "...", "placeholder": "...", "rows": 4 }]' />

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn-outline" onClick={() => setPreviewOpen(true)} disabled={!perguntasParsed}>
            <i className="ti ti-eye" aria-hidden="true"></i> Preview
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-outline" onClick={onClose}>Cancelar</button>
            <button className="btn" onClick={salvar} disabled={busy}>
              <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
            </button>
          </div>
        </div>

        {previewOpen && perguntasParsed && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(28,23,18,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120,
          }} onClick={() => setPreviewOpen(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--white)', borderRadius: 12, padding: 22,
              width: 540, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
              border: '0.5px solid var(--border)',
            }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>Preview</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>É assim que a futura paciente vai ver, sem precisar fazer login.</div>
              <div style={{ background: '#f7f3ee', borderRadius: 12, padding: '8px 0' }}>
                <CheckinForm perguntas={perguntasParsed} valores={{}} onChange={() => {}} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="btn-outline" onClick={() => setPreviewOpen(false)}>Fechar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, autoFocus }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, color: 'var(--text3)',
        marginBottom: 5, fontWeight: 500,
      }}>{label}</span>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        required={required} autoFocus={autoFocus}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          border: '0.5px solid var(--border)', borderRadius: 8,
          outline: 'none', fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  const opts = options.map(o => typeof o === 'string' ? { v: o, l: o } : o);
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, color: 'var(--text3)',
        marginBottom: 5, fontWeight: 500,
      }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          border: '0.5px solid var(--border)', borderRadius: 8,
          outline: 'none', fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
        }}>
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}
