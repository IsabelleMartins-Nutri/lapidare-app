import { Fragment, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import {
  dataBR, iniciais,
  validarPlano, validarLista, validarSubstituicoes, contarItensLista, normalizarPlano,
  omitColunasFaltantes,
} from '../../lib/utils.js';
import { TEMPLATE_PADRAO, formatarResposta } from '../../lib/checkinDefault.js';
import CheckinForm from '../../components/CheckinForm.jsx';
import Evolucao from './_Evolucao.jsx';
import FollowUp from './_FollowUp.jsx';
import Suplementacao from './_Suplementacao.jsx';
import Habitos from './_Habitos.jsx';
import Anamnese from './_Anamnese.jsx';
import DicaJSON from '../../components/DicaJSON.jsx';
import PlanoView from '../../components/PlanoView.jsx';
import PlanoEditor from '../../components/PlanoEditor.jsx';

const CONDICAO_CATEGORIAS = [
  { id: 'diagnostico', label: 'Diagnóstico',         pillClass: 'pill-b' },
  { id: 'medicacao',   label: 'Medicação',            pillClass: 'pill-g' },
  { id: 'alergia',     label: 'Alergia/Restrição',    pillClass: 'pill-r' },
  { id: 'atencao',     label: 'Atenção',              pillClass: 'pill-a' },
];

export default function PacientePerfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [paciente, setPaciente] = useState(null);
  const [tab, setTab] = useState('plano');
  const [editandoNasc, setEditandoNasc] = useState(false);
  const [novoNasc, setNovoNasc] = useState('');
  const [salvandoNasc, setSalvandoNasc] = useState(false);
  const [salvandoSexo, setSalvandoSexo] = useState(false);
  const [salvandoCondicoes, setSalvandoCondicoes] = useState(false);
  const [novaCondicaoTexto, setNovaCondicaoTexto] = useState(null);

  async function carregar() {
    const { data } = await supabase
      .from('pacientes').select('*').eq('id', id).maybeSingle();
    setPaciente(data);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from('pacientes').select('*').eq('id', id).maybeSingle();
      if (!active) return;
      setPaciente(data);
    }
    load();
    return () => { active = false; };
  }, [id]);

  async function enviarRedefinicaoSenha() {
    if (!paciente?.email) return;
    const ok = window.confirm(
      `Enviar email de redefinição de senha para ${paciente.email}?\n\n` +
      `A paciente vai receber um link válido por 1 hora pra criar uma nova senha. ` +
      `Você não precisa fazer mais nada.`
    );
    if (!ok) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(paciente.email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) {
        if (/rate limit/i.test(error.message)) {
          alert('Limite de emails atingido (3/hora no plano grátis do Supabase). Tente de novo daqui a pouco ou configure SMTP próprio em Project Settings → Authentication → SMTP.');
        } else {
          alert('Erro ao enviar: ' + error.message);
        }
        return;
      }
      alert(`✅ Email enviado pra ${paciente.email}!\n\nPede pra paciente verificar a caixa de entrada (e o spam). O link funciona por 1 hora.`);
    } catch (err) {
      alert('Erro inesperado: ' + (err?.message || 'tente de novo'));
    }
  }

  async function salvarNascimento() {
    setSalvandoNasc(true);
    const { error } = await supabase.from('pacientes')
      .update({ nascimento: novoNasc || null }).eq('id', id);
    setSalvandoNasc(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setEditandoNasc(false);
    carregar();
  }

  async function salvarSexo(novoSexo) {
    if (!['feminino', 'masculino'].includes(novoSexo)) return;
    setSalvandoSexo(true);
    const { error } = await supabase.from('pacientes')
      .update({ sexo: novoSexo }).eq('id', id);
    setSalvandoSexo(false);
    if (error) {
      if (/sexo.*schema cache|Could not find.*sexo/i.test(error.message)) {
        alert(
          'Seu Supabase ainda não foi atualizado pra v1.11.0 — a coluna "sexo" não existe.\n\n' +
          'Rode o SQL atualizado:\n' +
          'github.com/danielasoares-rd/lapidare-app/blob/main/supabase/delta-v1.11.0.sql'
        );
      } else {
        alert('Erro ao atualizar sexo: ' + error.message);
      }
      return;
    }
    carregar();
  }

  function iniciarCondicao() {
    const texto = window.prompt('Nova condição/flag (ex: Endometriose, GLP-1, Hipotireoidismo):');
    const limpo = texto?.trim();
    if (!limpo) return;
    const atuais = paciente.condicoes ?? [];
    if (atuais.some(c => c.texto.toLowerCase() === limpo.toLowerCase())) return;
    setNovaCondicaoTexto(limpo);
  }

  async function confirmarCondicao(categoria) {
    const atuais = paciente.condicoes ?? [];
    setSalvandoCondicoes(true);
    const { error } = await supabase.from('pacientes')
      .update({ condicoes: [...atuais, { texto: novaCondicaoTexto, categoria }] }).eq('id', id);
    setSalvandoCondicoes(false);
    setNovaCondicaoTexto(null);
    if (error) {
      if (/condicoes.*schema cache|Could not find.*column/i.test(error.message)) {
        alert(
          'Seu Supabase ainda não foi atualizado — a coluna "condicoes" está desatualizada.\n\n' +
          'Rode o SQL: supabase/delta-v1.20.0.sql'
        );
      } else {
        alert('Erro ao salvar: ' + error.message);
      }
      return;
    }
    carregar();
  }

  async function removerCondicao(item) {
    const atuais = paciente.condicoes ?? [];
    setSalvandoCondicoes(true);
    const { error } = await supabase.from('pacientes')
      .update({ condicoes: atuais.filter(c => c.texto !== item.texto) }).eq('id', id);
    setSalvandoCondicoes(false);
    if (error) { alert('Erro: ' + error.message); return; }
    carregar();
  }

  function calcularIdade(iso) {
    if (!iso) return null;
    const n = new Date(iso + 'T12:00:00');
    const h = new Date();
    let idade = h.getFullYear() - n.getFullYear();
    const m = h.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < n.getDate())) idade--;
    return idade;
  }

  if (paciente === null) {
    return (
      <div className="card empty-card">
        <div className="empty-sub">Carregando…</div>
      </div>
    );
  }

  if (!paciente) {
    return (
      <>
        <div className="page-title">Paciente não encontrada</div>
        <div className="card empty-card">
          <div className="empty-sub">Talvez tenha sido removida ou o link esteja desatualizado.</div>
          <button className="btn" onClick={() => navigate('/nutri/pacientes')}>Voltar à lista</button>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => navigate('/nutri/pacientes')}
        style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <i className="ti ti-arrow-left" aria-hidden="true"></i> Pacientes
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--amber)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 600, color: 'var(--dark)',
        }}>{iniciais(paciente.nome)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="page-title" style={{ marginBottom: 2 }}>{paciente.nome}</div>
          <div className="page-sub" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{paciente.email} · {paciente.sexo === 'masculino' ? 'cadastrado' : 'cadastrada'} em {dataBR(paciente.created_at)}</span>
            <button onClick={enviarRedefinicaoSenha}
              title="Envia um email pra paciente com link de redefinição de senha"
              style={{
                background: 'transparent', border: '0.5px solid var(--border)',
                borderRadius: 6, padding: '3px 9px', fontSize: 11,
                color: 'var(--gold-deep)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <i className="ti ti-key" aria-hidden="true" style={{ fontSize: 13 }}></i>
              Enviar redefinição de senha
            </button>
          </div>
          {editandoNasc ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="date" value={novoNasc} onChange={e => setNovoNasc(e.target.value)}
                style={{
                  padding: '4px 8px', fontSize: 12, margin: 0,
                  border: '0.5px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--font-sans)',
                }} />
              <button onClick={salvarNascimento} disabled={salvandoNasc}
                style={{
                  background: 'var(--dark)', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                }}>{salvandoNasc ? '…' : 'Salvar'}</button>
              <button onClick={() => setEditandoNasc(false)} style={{
                background: 'none', border: '0.5px solid var(--border)',
                borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              }}>Cancelar</button>
            </div>
          ) : paciente.nascimento ? (
            <button onClick={() => { setNovoNasc(paciente.nascimento); setEditandoNasc(true); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--text3)', padding: 0,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-sans)',
              }}>
              🎂 {dataBR(paciente.nascimento)}
              {(() => {
                const i = calcularIdade(paciente.nascimento);
                return i !== null ? ` · ${i} anos` : '';
              })()}
              <i className="ti ti-edit" style={{ fontSize: 12, marginLeft: 4, opacity: .6 }} aria-hidden="true"></i>
            </button>
          ) : (
            <button onClick={() => { setNovoNasc(''); setEditandoNasc(true); }}
              style={{
                background: 'none', border: '0.5px dashed var(--border)',
                borderRadius: 6, padding: '3px 10px', fontSize: 11,
                color: 'var(--text3)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}>
              + Adicionar data de nascimento
            </button>
          )}

          {/* Sexo — select inline, salva ao mudar */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 10, fontSize: 12, color: 'var(--text3)' }}>
            <span style={{ opacity: 0.6 }}>·</span>
            <span>{paciente.sexo === 'masculino' ? '♂' : '♀'}</span>
            <select
              value={paciente.sexo ?? 'feminino'}
              onChange={e => salvarSexo(e.target.value)}
              disabled={salvandoSexo}
              title="Sexo da paciente — controla concordância de gênero no app"
              style={{
                padding: '2px 6px', fontSize: 12, margin: 0,
                border: '0.5px solid var(--border)', borderRadius: 6,
                background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', color: 'var(--text3)',
              }}>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
            </select>
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: novaCondicaoTexto ? 6 : 16 }}>
        {(paciente.condicoes ?? []).map(c => {
          const cat = CONDICAO_CATEGORIAS.find(k => k.id === c.categoria);
          return (
            <span key={c.texto} className={`pill ${cat?.pillClass ?? ''}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 4,
            }}>
              {c.texto}
              <button onClick={() => removerCondicao(c)} disabled={salvandoCondicoes}
                title="Remover"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
                  padding: 0, display: 'inline-flex', opacity: 0.7,
                }}>
                <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true"></i>
              </button>
            </span>
          );
        })}
        {!novaCondicaoTexto && (
          <button onClick={iniciarCondicao} disabled={salvandoCondicoes}
            style={{
              background: 'none', border: '0.5px dashed var(--border)', borderRadius: 20,
              padding: '2px 10px', fontSize: 11, color: 'var(--text3)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}>
            + Condição
          </button>
        )}
      </div>

      {novaCondicaoTexto && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16, fontSize: 11 }}>
          <span style={{ color: 'var(--text3)' }}>Categoria de "{novaCondicaoTexto}":</span>
          {CONDICAO_CATEGORIAS.map(cat => (
            <button key={cat.id} onClick={() => confirmarCondicao(cat.id)} disabled={salvandoCondicoes}
              className={`pill ${cat.pillClass}`}
              style={{ border: 'none', cursor: 'pointer' }}>
              {cat.label}
            </button>
          ))}
          <button onClick={() => setNovaCondicaoTexto(null)} disabled={salvandoCondicoes}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontFamily: 'var(--font-sans)',
            }}>
            cancelar
          </button>
        </div>
      )}

      <div className="g3">
        <div className="stat">
          <div className="stat-lbl">Objetivo</div>
          <div className="stat-val" style={{ fontSize: 18 }}>{paciente.objetivo ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="stat-lbl">Tipo de plano</div>
          <div className="stat-val" style={{ fontSize: 18 }}>{paciente.tipo_plano ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="stat-lbl">Modalidade</div>
          <div className="stat-val" style={{ fontSize: 18 }}>{paciente.modalidade ?? '—'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 16,
        overflowX: 'auto', scrollbarWidth: 'thin',
      }}>
        {[
          { id: 'evolucao',    label: 'Evolução',     icon: 'chart-line' },
          { id: 'anamnese',    label: 'Atendimento',  icon: 'clipboard-text' },
          { id: 'followup',    label: 'Follow-up',    icon: 'notebook' },
          { id: 'plano',          label: 'Plano',          icon: 'salad' },
          { id: 'substituicoes', label: 'Substituições',  icon: 'switch-horizontal' },
          { id: 'compras',     label: 'Compras',      icon: 'shopping-cart' },
          { id: 'suplementacao', label: 'Suplementação', icon: 'pill' },
          { id: 'habitos',       label: 'Hábitos',       icon: 'checklist' },
          { id: 'prescricoes', label: 'Prescrições',  icon: 'file-text' },
          { id: 'ebooks',      label: 'E-books',      icon: 'book-2' },
          { id: 'avaliacao',   label: 'Avaliação',    icon: 'ruler-measure' },
          { id: 'exames',      label: 'Exames',       icon: 'flask' },
          { id: 'exames_imagem', label: 'Exames de imagem', icon: 'radioactive' },
          { id: 'pedido_exame', label: 'Pedido de exame', icon: 'clipboard-plus' },
          { id: 'checkin',     label: 'Check-in',     icon: 'clipboard-check' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: '0 0 auto',
              padding: '7px 12px', fontSize: 13, fontWeight: 500,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--dark)' : 'var(--text3)',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              boxShadow: tab === t.id ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,.05))' : 'none',
              fontFamily: 'var(--font-sans)',
              whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <i className={`ti ti-${t.icon}`} style={{ fontSize: 14 }} aria-hidden="true"></i>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'evolucao' && <Evolucao pacienteId={paciente.id} paciente={paciente} nutriId={user.id} />}
      {tab === 'anamnese' && <Anamnese pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
      {tab === 'followup' && <FollowUp pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
      {tab === 'suplementacao' && <Suplementacao pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
      {tab === 'habitos' && <Habitos pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
      {tab === 'plano' && <PublicarPlano pacienteId={paciente.id} nutriId={user.id} />}
      {tab === 'substituicoes' && <PublicarSubstituicoes pacienteId={paciente.id} nutriId={user.id} />}
      {tab === 'compras' && <PublicarLista pacienteId={paciente.id} nutriId={user.id} />}
      {tab === 'prescricoes' && <EnviarPrescricao pacienteId={paciente.id} nutriId={user.id} />}
      {tab === 'ebooks' && <EbooksDaPaciente pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
      {tab === 'avaliacao' && <RegistrarAvaliacao pacienteId={paciente.id} nutriId={user.id} />}
      {tab === 'exames' && <RegistrarExames pacienteId={paciente.id} nutriId={user.id} />}
      {tab === 'exames_imagem' && <RegistrarExamesImagem pacienteId={paciente.id} nutriId={user.id} />}
      {tab === 'pedido_exame' && <PedidoExame pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
      {tab === 'checkin' && <CheckinPersonalizado pacienteId={paciente.id} nutriId={user.id} pacienteNome={paciente.nome} />}
    </>
  );
}

/* ============================================================
   CHECK-IN — envio rápido + histórico desta paciente
   (gerenciamento de templates fica em /nutri/checkins)
   ============================================================ */
function escapeHtmlCheckin(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tabela evolutiva: uma linha por check-in respondido, uma coluna por
 * pergunta. As colunas são montadas dinamicamente a partir do que foi
 * de fato perguntado/respondido — não depende de nenhum template fixo,
 * então continua funcionando mesmo se a nutri trocar o questionário.
 */
function TabelaEvolucaoCheckins({ envios, pacienteNome }) {
  const respondidos = envios.filter(e => e.respondido_em);
  if (respondidos.length === 0) return null;

  // Monta {id -> label} a partir do mais antigo pro mais novo, pra
  // usar sempre a versão mais recente do texto da pergunta no cabeçalho.
  const colunas = new Map();
  [...respondidos].reverse().forEach(e => {
    (e.perguntas ?? []).forEach(p => colunas.set(p.id, p.pergunta || p.id));
  });
  const colunasList = [...colunas.entries()];

  function imprimir() {
    const linhasHtml = respondidos.map(e => {
      const celulas = colunasList.map(([id]) => {
        const pergunta = (e.perguntas ?? []).find(p => p.id === id);
        const valor = pergunta ? formatarResposta(pergunta, e.respostas?.[id]) : '—';
        return `<td style="padding:8px 10px; border-bottom:1px solid #e3dcce; font-size:12px;">${escapeHtmlCheckin(valor)}</td>`;
      }).join('');
      return `<tr><td style="padding:8px 10px; border-bottom:1px solid #e3dcce; font-size:12px; font-weight:600; white-space:nowrap;">${escapeHtmlCheckin(dataBR(e.respondido_em))}</td>${celulas}</tr>`;
    }).join('');
    const cabecalhoHtml = colunasList.map(([, label]) =>
      `<th style="padding:8px 10px; border-bottom:2px solid #c9a96e; font-size:11px; text-align:left;">${escapeHtmlCheckin(label)}</th>`
    ).join('');

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Evolução dos check-ins · ${escapeHtmlCheckin(pacienteNome)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #2b2b2b; padding: 10px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #888; margin-bottom: 18px; }
    table { border-collapse: collapse; width: 100%; }
  </style>
</head>
<body>
  <h1>Evolução dos check-ins</h1>
  <div class="meta">Paciente: <strong>${escapeHtmlCheckin(pacienteNome)}</strong> · ${respondidos.length} check-ins respondidos</div>
  <table>
    <thead><tr><th style="padding:8px 10px; border-bottom:2px solid #c9a96e; font-size:11px; text-align:left;">Data</th>${cabecalhoHtml}</tr></thead>
    <tbody>${linhasHtml}</tbody>
  </table>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups pra gerar o PDF.'); return; }
    win.document.write(html);
    win.document.close();
  }

  return (
    <>
      <div className="section-label" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Evolução dos check-ins ({respondidos.length})</span>
        <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={imprimir}>
          <i className="ti ti-printer" aria-hidden="true"></i> Imprimir / PDF
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ whiteSpace: 'nowrap' }}>Data</th>
              {colunasList.map(([id, label]) => (
                <th key={id} title={label} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {respondidos.map(e => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{dataBR(e.respondido_em)}</td>
                {colunasList.map(([id]) => {
                  const pergunta = (e.perguntas ?? []).find(p => p.id === id);
                  const valor = pergunta ? formatarResposta(pergunta, e.respostas?.[id]) : '—';
                  return (
                    <td key={id} title={valor} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {valor}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CheckinPersonalizado({ pacienteId, nutriId, pacienteNome }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [templateSel, setTemplateSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState(null);

  async function carregar() {
    const [tplRes, envRes] = await Promise.all([
      supabase.from('checkin_templates').select('*')
        .eq('nutri_id', nutriId)
        .or(`paciente_id.is.null,paciente_id.eq.${pacienteId}`)
        .neq('tipo', 'atendimento')
        .order('created_at'),
      supabase.from('checkin_envios')
        .select('id, enviado_em, respondido_em, lembrete_enviado_em, perguntas, respostas')
        .eq('paciente_id', pacienteId)
        .neq('tipo', 'atendimento')
        .order('enviado_em', { ascending: false })
        .limit(26),
    ]);
    setTemplates(tplRes.data ?? []);
    setEnvios(envRes.data ?? []);
    // pré-seleciona: personalizado dessa paciente > is_padrao > primeiro
    const sel = (tplRes.data ?? []).find(t => t.paciente_id === pacienteId)
             ?? (tplRes.data ?? []).find(t => t.is_padrao)
             ?? (tplRes.data ?? [])[0];
    setTemplateSel(sel?.id ?? '');
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  async function enviar() {
    setAviso(null);
    const tpl = templates.find(t => t.id === templateSel);
    if (!tpl) return setAviso({ tipo: 'erro', msg: 'Selecione um template.' });
    setBusy(true);
    // Inclui nome + tipo (herdado do template) — antes vinha só perguntas,
    // resultando em título genérico na tela da paciente e categorização errada.
    const { error } = await supabase.from('checkin_envios').insert({
      nutri_id: nutriId,
      paciente_id: pacienteId,
      nome: tpl.nome ?? 'Questionário',
      tipo: tpl.tipo === 'pre_consulta' ? 'pre_consulta' : 'recorrente',
      perguntas: tpl.perguntas,
    });
    setBusy(false);
    if (error) return setAviso({ tipo: 'erro', msg: error.message });
    setAviso({ tipo: 'ok', msg: `Questionário "${tpl.nome}" enviado para ${pacienteNome.split(' ')[0]}.` });
    carregar();
  }

  async function reenviarLembrete(envio) {
    const { error } = await supabase
      .from('checkin_envios')
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq('id', envio.id);
    if (error) return setAviso({ tipo: 'erro', msg: error.message });
    setAviso({ tipo: 'ok', msg: 'Lembrete enviado.' });
    carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Enviar check-in rápido</div>
            <div className="card-sub">
              Templates ficam em <strong>Check-ins → Templates</strong>. Aqui você só escolhe e envia para {pacienteNome.split(' ')[0]}.
            </div>
          </div>
          <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => navigate('/nutri/checkins')}>
            <i className="ti ti-settings" aria-hidden="true"></i> Gerenciar
          </button>
        </div>
        <div className="card-body">
          {templates.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--text3)' }}>
              Nenhum template disponível. Crie em <strong>Check-ins → Templates</strong>.
            </div>
          ) : (
            <>
              <label className="field-label">Template</label>
              <select value={templateSel} onChange={e => setTemplateSel(e.target.value)}>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.perguntas?.length ?? 0} perguntas)
                    {t.is_padrao ? ' · padrão' : ''}
                    {t.paciente_id === pacienteId ? ' · personalizado' : ''}
                  </option>
                ))}
              </select>

              {aviso && (
                <div style={{
                  marginTop: 10,
                  background: aviso.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
                  color: aviso.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
                  padding: '8px 12px', borderRadius: 6, fontSize: 13,
                }}>{aviso.msg}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn" onClick={enviar} disabled={busy}>
                  <i className="ti ti-send" aria-hidden="true"></i> {busy ? '...' : 'Enviar agora'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section-label">Últimos check-ins ({envios.length})</div>
      {envios.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nada enviado para esta paciente ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {envios.map((e, i) => {
            const respondeu = !!e.respondido_em;
            const lembrado = !!e.lembrete_enviado_em;
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderBottom: i === envios.length - 1 ? 'none' : '0.5px solid #f5f0e8',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: respondeu ? 'var(--green-bg)' : (lembrado ? 'var(--orange-bg)' : 'var(--red-bg)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <i className={`ti ti-${respondeu ? 'check' : (lembrado ? 'bell' : 'clock')}`} style={{
                    fontSize: 18,
                    color: respondeu ? 'var(--green)' : (lembrado ? 'var(--orange)' : 'var(--red)'),
                  }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {respondeu ? `Respondeu em ${dataBR(e.respondido_em)}` : (lembrado ? 'Lembrete enviado' : 'Aguardando resposta')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    Enviado em {dataBR(e.enviado_em)} · {e.perguntas?.length ?? 0} perguntas
                  </div>
                </div>
                {!respondeu && !lembrado && (
                  <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--orange)', borderColor: 'var(--orange)' }}
                    onClick={() => reenviarLembrete(e)}>
                    <i className="ti ti-bell" aria-hidden="true"></i> Lembrete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TabelaEvolucaoCheckins envios={envios} pacienteNome={pacienteNome} />
    </>
  );
}

/* ============================================================
   AVALIAÇÃO ANTROPOMÉTRICA
   ============================================================ */
const FORMULAS_DOBRA = ['Pollock 3', 'Pollock 7', 'Petroski', 'Guedes', 'Durnin', 'Faulkner', 'Nenhuma'];

const DOBRAS_LIST = [
  { key: 'dobra_tricipital',    label: 'Tricipital' },
  { key: 'dobra_bicipital',     label: 'Bicipital' },
  { key: 'dobra_abdominal',     label: 'Abdominal' },
  { key: 'dobra_subescapular',  label: 'Subescapular' },
  { key: 'dobra_axilar_media',  label: 'Axilar média' },
  { key: 'dobra_coxa',          label: 'Coxa' },
  { key: 'dobra_toracica',      label: 'Torácica' },
  { key: 'dobra_suprailiaca',   label: 'Suprailíaca' },
  { key: 'dobra_panturrilha',   label: 'Panturrilha' },
  { key: 'dobra_supraespinhal', label: 'Supraespinhal' },
];

const METRICAS_AVALIACAO = [
  { key: 'kg',               label: 'Peso',             unidade: 'kg', dec: 1 },
  { key: 'cintura_cm',       label: 'Cintura',          unidade: 'cm', dec: 1 },
  { key: 'quadril_cm',       label: 'Quadril',          unidade: 'cm', dec: 1 },
  { key: 'pgc',              label: '% gordura',        unidade: '%',  dec: 1 },
  { key: 'mm_kg',            label: 'Massa magra',      unidade: 'kg', dec: 1 },
  { key: 'agua_corporal',    label: 'Água corporal',    unidade: '%',  dec: 1 },
  { key: 'gordura_visceral', label: 'Gordura visceral', unidade: '',   dec: 1 },
  { key: 'tmb',              label: 'TMB',              unidade: 'kcal', dec: 0 },
];

function GraficoAvaliacao({ historico }) {
  const [metrica, setMetrica] = useState('kg');
  const registros = [...historico].reverse(); // carregar() traz desc; gráfico precisa asc

  const metricasDisponiveis = METRICAS_AVALIACAO.filter(m => registros.some(r => r[m.key] != null));
  const dados = registros.filter(r => r[metrica] != null).map(r => ({ ...r, valor: Number(r[metrica]) }));

  if (metricasDisponiveis.length === 0 || dados.length < 2) return null;

  const metricaAtual = METRICAS_AVALIACAO.find(m => m.key === metrica) ?? metricasDisponiveis[0];
  const min = Math.min(...dados.map(p => p.valor)) - 0.5;
  const max = Math.max(...dados.map(p => p.valor)) + 0.5;
  const range = max - min || 1;
  const points = dados.map((p, i) => ({
    x: (i / (dados.length - 1)) * 100,
    y: 100 - ((p.valor - min) / range) * 100,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = path + ' L 100 100 L 0 100 Z';
  const atual = dados[dados.length - 1];
  const inicial = dados[0];
  const dif = atual.valor - inicial.valor;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {metricasDisponiveis.map(m => (
            <button key={m.key} onClick={() => setMetrica(m.key)}
              style={{
                padding: '5px 10px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
                background: m.key === metrica ? 'var(--dark)' : 'transparent',
                color: m.key === metrica ? '#fff' : 'var(--text3)',
                border: m.key === metrica ? 'none' : '0.5px solid var(--border)',
                fontFamily: 'var(--font-sans)',
              }}>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 26, fontWeight: 600 }}>
            {atual.valor.toFixed(metricaAtual.dec).replace('.', ',')}{metricaAtual.unidade}
          </span>
          {dif !== 0 && (
            <span className={`pill ${dif < 0 ? 'pill-g' : 'pill-r'}`}>
              {dif > 0 ? '+' : '−'}{Math.abs(dif).toFixed(metricaAtual.dec).replace('.', ',')}{metricaAtual.unidade}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>desde {dataBR(inicial.data)}</span>
        </div>

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 140 }}>
          <defs>
            <linearGradient id="avalFade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#c4a882" stopOpacity=".3" />
              <stop offset="100%" stopColor="#c4a882" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map(y => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e6dfd3" strokeWidth=".3" strokeDasharray="1,1" />
          ))}
          <path d={area} fill="url(#avalFade)" />
          <path d={path} fill="none" stroke="#1c1712" strokeWidth=".7"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1.2" fill="#c4a882" stroke="#1c1712" strokeWidth=".4" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
          <span>{dataBR(dados[0]?.data)}</span>
          <span>{dataBR(dados[dados.length - 1]?.data)}</span>
        </div>
      </div>
    </div>
  );
}

function RegistrarAvaliacao({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [form, setForm] = useState(novaAvaliacao());
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [expandidos, setExpandidos] = useState({});

  function novaAvaliacao() {
    return {
      data: new Date().toISOString().slice(0, 10),
      kg: '', altura_cm: '', cintura_cm: '', quadril_cm: '',
      braco_cm: '', coxa_cm: '', pgc: '', mm_kg: '',
      agua_corporal: '', gordura_visceral: '', tmb: '',
      dobra_formula: '',
      dobra_tricipital: '', dobra_bicipital: '', dobra_abdominal: '', dobra_subescapular: '',
      dobra_axilar_media: '', dobra_coxa: '', dobra_toracica: '', dobra_suprailiaca: '',
      dobra_panturrilha: '', dobra_supraespinhal: '',
      obs: '',
    };
  }

  async function carregar() {
    const { data } = await supabase
      .from('peso_registros')
      .select(`id, data, kg, altura_cm, cintura_cm, quadril_cm, braco_cm, coxa_cm, pgc, mm_kg,
        agua_corporal, gordura_visceral, tmb, dobra_formula,
        dobra_tricipital, dobra_bicipital, dobra_abdominal, dobra_subescapular,
        dobra_axilar_media, dobra_coxa, dobra_toracica, dobra_suprailiaca,
        dobra_panturrilha, dobra_supraespinhal, obs, pdf_url`)
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false });
    setHistorico(data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  function num(v) {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }

  async function salvar() {
    setFeedback(null);
    // Permite registrar com peso OU PDF (pelo menos um). Útil quando a nutri
    // usa Shaped/sistema externo e quer só anexar o PDF da avaliação sem
    // re-digitar os números.
    if (!form.data) return setFeedback({ tipo: 'erro', msg: 'A data é obrigatória.' });
    if (!form.kg && !pdfFile) {
      return setFeedback({ tipo: 'erro', msg: 'Preencha o peso OU anexe um PDF (pelo menos um).' });
    }
    setBusy(true);
    let pdfUrl = null;
    try {
      pdfUrl = await uploadDocumento(pdfFile, { nutriId, pacienteId, tipo: 'avaliacao' });
    } catch (e) {
      setBusy(false);
      return setFeedback({ tipo: 'erro', msg: e.message });
    }
    const payload = {
      paciente_id: pacienteId,
      nutri_id: nutriId,
      data: form.data,
      kg: num(form.kg),
      altura_cm: num(form.altura_cm),
      cintura_cm: num(form.cintura_cm),
      quadril_cm: num(form.quadril_cm),
      braco_cm: num(form.braco_cm),
      coxa_cm: num(form.coxa_cm),
      pgc: num(form.pgc),
      mm_kg: num(form.mm_kg),
      agua_corporal: num(form.agua_corporal),
      gordura_visceral: num(form.gordura_visceral),
      tmb: num(form.tmb),
      dobra_formula: form.dobra_formula || null,
      dobra_tricipital: num(form.dobra_tricipital),
      dobra_bicipital: num(form.dobra_bicipital),
      dobra_abdominal: num(form.dobra_abdominal),
      dobra_subescapular: num(form.dobra_subescapular),
      dobra_axilar_media: num(form.dobra_axilar_media),
      dobra_coxa: num(form.dobra_coxa),
      dobra_toracica: num(form.dobra_toracica),
      dobra_suprailiaca: num(form.dobra_suprailiaca),
      dobra_panturrilha: num(form.dobra_panturrilha),
      dobra_supraespinhal: num(form.dobra_supraespinhal),
      obs: form.obs.trim() || null,
      pdf_url: pdfUrl,
    };
    const { error, omitidos } = await omitColunasFaltantes(
      payload, [
        'pdf_url', 'agua_corporal', 'gordura_visceral', 'tmb', 'dobra_formula',
        'dobra_tricipital', 'dobra_bicipital', 'dobra_abdominal', 'dobra_subescapular',
        'dobra_axilar_media', 'dobra_coxa', 'dobra_toracica', 'dobra_suprailiaca',
        'dobra_panturrilha', 'dobra_supraespinhal',
      ],
      (p) => supabase.from('peso_registros').insert(p),
    );
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    const msgOmitido = omitidos.length
      ? ` (${omitidos.join(', ')} não salvo — rode os SQLs mais recentes na pasta supabase/)`
      : (pdfUrl ? ' PDF anexado.' : '');
    setFeedback({ tipo: omitidos.length ? 'erro' : 'ok', msg: `Avaliação registrada.${msgOmitido}` });
    setForm(novaAvaliacao());
    setPdfFile(null);
    carregar();
  }

  async function remover(id) {
    if (!window.confirm('Remover esta avaliação?')) return;
    await supabase.from('peso_registros').delete().eq('id', id);
    carregar();
  }

  // IMC calculado em tempo real
  const imcPreview = (() => {
    const k = num(form.kg);
    const a = num(form.altura_cm);
    if (!k || !a) return null;
    return (k / Math.pow(a / 100, 2)).toFixed(1);
  })();

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Nova avaliação antropométrica</div>
            <div className="card-sub">Preencha peso/medidas OU anexe um PDF (ex: avaliação do Shaped) — pelo menos um dos dois</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">Data</label>
              <input type="date" value={form.data} onChange={set('data')} />
            </div>
            <div>
              <label className="field-label">Peso (kg) *</label>
              <input inputMode="decimal" placeholder="ex: 76,5" value={form.kg} onChange={set('kg')} />
            </div>
            <div>
              <label className="field-label">Altura (cm)</label>
              <input inputMode="decimal" placeholder="ex: 162" value={form.altura_cm} onChange={set('altura_cm')} />
            </div>
          </div>

          {imcPreview && (
            <div style={{
              marginTop: 8, fontSize: 13, color: 'var(--text2)',
              background: 'var(--bg2)', padding: '6px 10px', borderRadius: 6, display: 'inline-block',
            }}>
              IMC calculado: <strong>{imcPreview}</strong> kg/m²
            </div>
          )}

          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Circunferências (cm)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">Cintura</label>
              <input inputMode="decimal" value={form.cintura_cm} onChange={set('cintura_cm')} />
            </div>
            <div>
              <label className="field-label">Quadril</label>
              <input inputMode="decimal" value={form.quadril_cm} onChange={set('quadril_cm')} />
            </div>
            <div>
              <label className="field-label">Braço</label>
              <input inputMode="decimal" value={form.braco_cm} onChange={set('braco_cm')} />
            </div>
            <div>
              <label className="field-label">Coxa</label>
              <input inputMode="decimal" value={form.coxa_cm} onChange={set('coxa_cm')} />
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Composição corporal (bioimpedância)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">% gordura corporal</label>
              <input inputMode="decimal" placeholder="ex: 28,5" value={form.pgc} onChange={set('pgc')} />
            </div>
            <div>
              <label className="field-label">Massa magra (kg)</label>
              <input inputMode="decimal" placeholder="ex: 48,2" value={form.mm_kg} onChange={set('mm_kg')} />
            </div>
            <div>
              <label className="field-label">Água corporal (%)</label>
              <input inputMode="decimal" placeholder="ex: 52" value={form.agua_corporal} onChange={set('agua_corporal')} />
            </div>
            <div>
              <label className="field-label">Gordura visceral</label>
              <input inputMode="decimal" placeholder="ex: 7" value={form.gordura_visceral} onChange={set('gordura_visceral')} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 10, maxWidth: '24%' }}>
            <div>
              <label className="field-label">TMB (kcal)</label>
              <input inputMode="decimal" placeholder="ex: 1450" value={form.tmb} onChange={set('tmb')} />
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Dobras cutâneas (mm)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {FORMULAS_DOBRA.map(f => (
              <button key={f} type="button" onClick={() => setForm(v => ({ ...v, dobra_formula: f }))}
                style={{
                  padding: '4px 10px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
                  background: form.dobra_formula === f ? 'var(--dark)' : 'transparent',
                  color: form.dobra_formula === f ? '#fff' : 'var(--text3)',
                  border: form.dobra_formula === f ? 'none' : '0.5px solid var(--border)',
                  fontFamily: 'var(--font-sans)',
                }}>
                {f}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {DOBRAS_LIST.map(d => (
              <div key={d.key}>
                <label className="field-label">{d.label}</label>
                <input inputMode="decimal" value={form[d.key]} onChange={set(d.key)} />
              </div>
            ))}
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Observação (opcional)</label>
          <textarea rows="2" value={form.obs} onChange={set('obs')}
            placeholder="Ex: avaliação após 30 dias de plano, paciente relata melhora de energia." />

          <UploadPdfField
            pdfFile={pdfFile}
            setPdfFile={setPdfFile}
            pdfUrlAtual={historico[0]?.pdf_url}
            tipo="avaliacao"
          />

          {feedback && <FeedbackInline f={feedback} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn" onClick={salvar} disabled={busy || (!form.kg && !pdfFile)}>
              <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Registrar avaliação'}
            </button>
          </div>
        </div>
      </div>

      <GraficoAvaliacao historico={historico} />

      <div className="section-label">Histórico ({historico.length})</div>
      {historico.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma avaliação registrada ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Peso</th>
                <th>Cintura</th>
                <th>Quadril</th>
                <th>% gordura</th>
                <th>M. magra</th>
                <th>Água</th>
                <th>Visceral</th>
                <th>Dobras</th>
                <th>PDF</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historico.map(a => {
                const dobrasPreenchidas = DOBRAS_LIST.filter(d => a[d.key] != null);
                const expandido = expandidos[a.id];
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td>{dataBR(a.data)}</td>
                      <td><strong>{a.kg ? `${a.kg} kg` : '—'}</strong></td>
                      <td>{a.cintura_cm ? `${a.cintura_cm} cm` : '—'}</td>
                      <td>{a.quadril_cm ? `${a.quadril_cm} cm` : '—'}</td>
                      <td>{a.pgc ? `${a.pgc}%` : '—'}</td>
                      <td>{a.mm_kg ? `${a.mm_kg} kg` : '—'}</td>
                      <td>{a.agua_corporal ? `${a.agua_corporal}%` : '—'}</td>
                      <td>{a.gordura_visceral ?? '—'}</td>
                      <td>
                        {dobrasPreenchidas.length > 0 ? (
                          <button onClick={() => setExpandidos(v => ({ ...v, [a.id]: !v[a.id] }))}
                            style={{
                              background: 'none', border: '0.5px solid var(--border)', borderRadius: 6,
                              padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text2)',
                            }}>
                            {expandido ? 'Ocultar' : `Ver (${dobrasPreenchidas.length})`}
                          </button>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td>
                        {a.pdf_url ? (
                          <a href={a.pdf_url} target="_blank" rel="noopener noreferrer"
                             title="Abrir PDF"
                             style={{ color: 'var(--gold-deep)', display: 'inline-flex', alignItems: 'center' }}>
                            <i className="ti ti-file-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
                          </a>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => remover(a.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                          title="Remover">
                          <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                        </button>
                      </td>
                    </tr>
                    {expandido && (
                      <tr>
                        <td colSpan={11} style={{ background: 'var(--bg2)', fontSize: 12 }}>
                          {a.dobra_formula && (
                            <strong style={{ marginRight: 10 }}>Fórmula: {a.dobra_formula}</strong>
                          )}
                          {dobrasPreenchidas.map(d => (
                            <span key={d.key} style={{ marginRight: 14, color: 'var(--text2)' }}>
                              {d.label}: <strong>{a[d.key]} mm</strong>
                            </span>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ============================================================
   EXAMES LABORATORIAIS
   ============================================================ */
const EXAMES_PARAMS = [
  // Glicêmico
  { key: 'glicemia_jejum',   label: 'Glicemia de jejum',            unidade: 'mg/dL',      categoria: 'Glicêmico' },
  { key: 'hba1c',            label: 'Hemoglobina glicada (HbA1c)',  unidade: '%',          categoria: 'Glicêmico' },
  { key: 'insulina',         label: 'Insulina',                     unidade: 'µU/mL',      categoria: 'Glicêmico' },

  // Perfil lipídico
  { key: 'colesterol_total', label: 'Colesterol total',             unidade: 'mg/dL',      categoria: 'Perfil lipídico' },
  { key: 'hdl',              label: 'HDL',                          unidade: 'mg/dL',      categoria: 'Perfil lipídico' },
  { key: 'ldl',              label: 'LDL',                          unidade: 'mg/dL',      categoria: 'Perfil lipídico' },
  { key: 'vldl',             label: 'VLDL',                         unidade: 'mg/dL',      categoria: 'Perfil lipídico' },
  { key: 'triglicerideos',   label: 'Triglicerídeos',               unidade: 'mg/dL',      categoria: 'Perfil lipídico' },

  // Tireoide
  { key: 'tsh',              label: 'TSH',                          unidade: 'µUI/mL',     categoria: 'Tireoide' },
  { key: 't4_livre',         label: 'T4 livre',                     unidade: 'ng/dL',      categoria: 'Tireoide' },
  { key: 't3',               label: 'T3',                           unidade: 'ng/dL',      categoria: 'Tireoide' },

  // Marcadores inflamatórios
  { key: 'ferritina',        label: 'Ferritina',                    unidade: 'ng/mL',      categoria: 'Marcadores inflamatórios' },
  { key: 'homocisteina',     label: 'Homocisteína',                 unidade: 'µmol/L',     categoria: 'Marcadores inflamatórios' },
  { key: 'pcr',              label: 'Proteína C reativa (PCR)',     unidade: 'mg/L',       categoria: 'Marcadores inflamatórios' },

  // Vitaminas
  { key: 'vitamina_a',       label: 'Vitamina A',                   unidade: 'µg/dL',      categoria: 'Vitaminas' },
  { key: 'vitamina_b1',      label: 'Vitamina B1 (Tiamina)',        unidade: 'ng/mL',      categoria: 'Vitaminas' },
  { key: 'vitamina_b2',      label: 'Vitamina B2 (Riboflavina)',    unidade: 'µg/dL',      categoria: 'Vitaminas' },
  { key: 'vitamina_b6',      label: 'Vitamina B6 (Piridoxina)',     unidade: 'ng/mL',      categoria: 'Vitaminas' },
  { key: 'vitamina_b12',     label: 'Vitamina B12',                 unidade: 'pg/mL',      categoria: 'Vitaminas' },
  { key: 'acido_folico',     label: 'Ácido fólico (Vitamina B9)',   unidade: 'ng/mL',      categoria: 'Vitaminas' },
  { key: 'vitamina_c',       label: 'Vitamina C',                   unidade: 'mg/dL',      categoria: 'Vitaminas' },
  { key: 'vitamina_d',       label: 'Vitamina D',                   unidade: 'ng/mL',      categoria: 'Vitaminas' },
  { key: 'vitamina_e',       label: 'Vitamina E',                   unidade: 'mg/L',       categoria: 'Vitaminas' },
  { key: 'vitamina_k',       label: 'Vitamina K',                   unidade: 'ng/mL',      categoria: 'Vitaminas' },

  // Minerais
  { key: 'ferro_serico',     label: 'Ferro sérico',                 unidade: 'µg/dL',      categoria: 'Minerais' },
  { key: 'calcio',           label: 'Cálcio',                       unidade: 'mg/dL',      categoria: 'Minerais' },
  { key: 'magnesio',         label: 'Magnésio',                     unidade: 'mg/dL',      categoria: 'Minerais' },
  { key: 'zinco',            label: 'Zinco',                        unidade: 'µg/dL',      categoria: 'Minerais' },
  { key: 'potassio',         label: 'Potássio',                     unidade: 'mEq/L',      categoria: 'Minerais' },
  { key: 'sodio',            label: 'Sódio',                        unidade: 'mEq/L',      categoria: 'Minerais' },
  { key: 'fosforo',          label: 'Fósforo',                      unidade: 'mg/dL',      categoria: 'Minerais' },
  { key: 'selenio',          label: 'Selênio',                      unidade: 'µg/L',       categoria: 'Minerais' },
  { key: 'cobre',            label: 'Cobre',                        unidade: 'µg/dL',      categoria: 'Minerais' },

  // Hemograma completo
  { key: 'hemacias',         label: 'Hemácias',                     unidade: 'milhões/mm³', categoria: 'Hemograma completo' },
  { key: 'hemoglobina',      label: 'Hemoglobina',                  unidade: 'g/dL',       categoria: 'Hemograma completo' },
  { key: 'hematocrito',      label: 'Hematócrito',                  unidade: '%',          categoria: 'Hemograma completo' },
  { key: 'vcm',              label: 'VCM',                          unidade: 'fL',         categoria: 'Hemograma completo' },
  { key: 'hcm',              label: 'HCM',                          unidade: 'pg',         categoria: 'Hemograma completo' },
  { key: 'chcm',             label: 'CHCM',                         unidade: 'g/dL',       categoria: 'Hemograma completo' },
  { key: 'rdw',              label: 'RDW',                          unidade: '%',          categoria: 'Hemograma completo' },
  { key: 'leucocitos',       label: 'Leucócitos',                   unidade: '/mm³',       categoria: 'Hemograma completo' },
  { key: 'neutrofilos',      label: 'Neutrófilos',                  unidade: '%',          categoria: 'Hemograma completo' },
  { key: 'linfocitos',       label: 'Linfócitos',                   unidade: '%',          categoria: 'Hemograma completo' },
  { key: 'monocitos',        label: 'Monócitos',                    unidade: '%',          categoria: 'Hemograma completo' },
  { key: 'eosinofilos',      label: 'Eosinófilos',                  unidade: '%',          categoria: 'Hemograma completo' },
  { key: 'basofilos',        label: 'Basófilos',                    unidade: '%',          categoria: 'Hemograma completo' },
  { key: 'plaquetas',        label: 'Plaquetas',                    unidade: '/mm³',       categoria: 'Hemograma completo' },

  // Função hepática
  { key: 'tgo',              label: 'TGO (AST)',                    unidade: 'U/L',        categoria: 'Função hepática' },
  { key: 'tgp',              label: 'TGP (ALT)',                    unidade: 'U/L',        categoria: 'Função hepática' },
  { key: 'ggt',              label: 'Gama GT',                      unidade: 'U/L',        categoria: 'Função hepática' },
  { key: 'fosfatase_alcalina', label: 'Fosfatase alcalina',         unidade: 'U/L',        categoria: 'Função hepática' },
  { key: 'bilirrubina_total', label: 'Bilirrubina total',           unidade: 'mg/dL',      categoria: 'Função hepática' },

  // Função renal
  { key: 'ureia',            label: 'Ureia',                        unidade: 'mg/dL',      categoria: 'Função renal' },
  { key: 'creatinina',       label: 'Creatinina',                   unidade: 'mg/dL',      categoria: 'Função renal' },
  { key: 'acido_urico',      label: 'Ácido úrico',                  unidade: 'mg/dL',      categoria: 'Função renal' },

  // Intolerâncias
  { key: 'lactose',          label: 'Teste de intolerância à lactose', unidade: '',         categoria: 'Intolerâncias' },
  { key: 'gluten',           label: 'Anticorpo antitransglutaminase (glúten)', unidade: 'U/mL', categoria: 'Intolerâncias' },
];

const EXAMES_STATUS = [
  { id: 'baixo',     label: 'Baixo',     fg: 'var(--red)',    bg: 'var(--red-soft)' },
  { id: 'limitrofe', label: 'Limítrofe', fg: 'var(--orange)', bg: 'var(--orange-soft)' },
  { id: 'normal',    label: 'Normal',    fg: 'var(--green)',  bg: 'var(--green-soft)' },
  { id: 'alto',      label: 'Alto',      fg: 'var(--red)',    bg: 'var(--red-soft)' },
];

function RegistrarExames({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valores, setValores] = useState({});
  const [obs, setObs] = useState('');
  const [busca, setBusca] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function carregar() {
    const { data: rows } = await supabase
      .from('exames_registros')
      .select('id, data, valores, obs, pdf_url')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false });
    setHistorico(rows ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  function setParam(key, campo, val) {
    setValores(v => ({ ...v, [key]: { ...v[key], [campo]: val } }));
  }

  function editar(registro) {
    setEditingId(registro.id);
    setData(registro.data);
    setValores(registro.valores ?? {});
    setObs(registro.obs ?? '');
    setPdfFile(null);
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    setEditingId(null);
    setData(new Date().toISOString().slice(0, 10));
    setValores({});
    setObs('');
    setPdfFile(null);
    setFeedback(null);
  }

  const paramsFiltrados = EXAMES_PARAMS.filter(p =>
    p.label.toLowerCase().includes(busca.trim().toLowerCase())
  );
  const categoriasFiltradas = [...new Set(paramsFiltrados.map(p => p.categoria))];

  async function salvar() {
    setFeedback(null);
    if (!data) return setFeedback({ tipo: 'erro', msg: 'A data é obrigatória.' });
    const valoresLimpos = Object.fromEntries(
      Object.entries(valores).filter(([, v]) => v?.valor != null && v.valor !== '')
    );
    const registroAtual = editingId ? historico.find(h => h.id === editingId) : null;
    if (Object.keys(valoresLimpos).length === 0 && !pdfFile && !registroAtual?.pdf_url) {
      return setFeedback({ tipo: 'erro', msg: 'Preencha ao menos um exame OU anexe o PDF do laboratório.' });
    }
    setBusy(true);
    let pdfUrl = registroAtual?.pdf_url ?? null;
    try {
      const novoPdfUrl = await uploadDocumento(pdfFile, { nutriId, pacienteId, tipo: 'exame' });
      if (novoPdfUrl) pdfUrl = novoPdfUrl;
    } catch (e) {
      setBusy(false);
      return setFeedback({ tipo: 'erro', msg: e.message });
    }
    const payload = {
      paciente_id: pacienteId,
      nutri_id: nutriId,
      data,
      valores: Object.keys(valoresLimpos).length ? valoresLimpos : null,
      obs: obs.trim() || null,
      pdf_url: pdfUrl,
    };
    const { error } = editingId
      ? await supabase.from('exames_registros').update(payload).eq('id', editingId)
      : await supabase.from('exames_registros').insert(payload);
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: editingId ? 'Registro atualizado.' : 'Exame registrado.' });
    setEditingId(null);
    setValores({});
    setObs('');
    setPdfFile(null);
    carregar();
  }

  async function remover(id) {
    if (!window.confirm('Remover este registro de exames?')) return;
    await supabase.from('exames_registros').delete().eq('id', id);
    if (editingId === id) cancelarEdicao();
    carregar();
  }

  // Parâmetros que aparecem em pelo menos um registro (pra montar a tabela de evolução)
  const paramsComDados = EXAMES_PARAMS.filter(p =>
    historico.some(h => h.valores?.[p.key]?.valor != null)
  );

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{editingId ? 'Editar registro de exames' : 'Novo registro de exames'}</div>
            <div className="card-sub">Preencha os valores OU anexe o PDF do laboratório — pelo menos um dos dois</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, maxWidth: 220 }}>
            <div>
              <label className="field-label">Data da coleta</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Parâmetros</div>
          <input
            type="text"
            placeholder="Buscar exame..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '0.5px solid var(--hair)', borderRadius: 10 }}>
            {categoriasFiltradas.map(categoria => (
              <div key={categoria}>
                <div style={{
                  padding: '6px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '.03em',
                  textTransform: 'uppercase', color: 'var(--muted)', background: 'var(--bg2)',
                  position: 'sticky', top: 0,
                }}>
                  {categoria}
                </div>
                {paramsFiltrados.filter(p => p.categoria === categoria).map(p => {
                  const v = valores[p.key] ?? {};
                  return (
                    <div key={p.key} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      borderBottom: '0.5px solid var(--hair-soft)', flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: '1 1 220px', fontSize: 13 }}>
                        {p.label} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({p.unidade})</span>
                      </div>
                      <input
                        inputMode="decimal"
                        placeholder="Valor"
                        value={v.valor ?? ''}
                        onChange={e => setParam(p.key, 'valor', e.target.value)}
                        style={{ width: 90, flex: '0 0 auto' }}
                      />
                      {EXAMES_STATUS.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setParam(p.key, 'status', s.id)}
                          style={{
                            flex: '0 0 auto', padding: '5px 10px', fontSize: 11, borderRadius: 6,
                            border: '0.5px solid var(--hair)',
                            background: v.status === s.id ? s.bg : 'transparent',
                            color: v.status === s.id ? s.fg : 'var(--muted)',
                            fontWeight: v.status === s.id ? 600 : 400,
                          }}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Observação (opcional)</label>
          <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
            placeholder="Ex: paciente em jejum de 12h, coleta pela manhã." />

          <UploadPdfField
            pdfFile={pdfFile}
            setPdfFile={setPdfFile}
            pdfUrlAtual={editingId ? historico.find(h => h.id === editingId)?.pdf_url : historico[0]?.pdf_url}
            tipo="exame"
          />

          {feedback && <FeedbackInline f={feedback} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            {editingId && (
              <button className="btn-outline" onClick={cancelarEdicao} disabled={busy}>
                Cancelar edição
              </button>
            )}
            <button className="btn" onClick={salvar} disabled={busy}>
              <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : (editingId ? 'Salvar alterações' : 'Registrar exames')}
            </button>
          </div>
        </div>
      </div>

      {paramsComDados.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Evolução</div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Parâmetro</th>
                  {historico.map(h => <th key={h.id}>{dataBR(h.data)}</th>)}
                </tr>
              </thead>
              <tbody>
                {paramsComDados.map(p => (
                  <tr key={p.key}>
                    <td>{p.label} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({p.unidade})</span></td>
                    {historico.map(h => {
                      const v = h.valores?.[p.key];
                      const cor = EXAMES_STATUS.find(s => s.id === v?.status);
                      return (
                        <td key={h.id}>
                          {v?.valor != null ? (
                            <span style={{
                              color: cor ? cor.fg : 'inherit',
                              fontWeight: cor && cor.id !== 'normal' ? 600 : 400,
                            }}>
                              {v.valor}
                            </span>
                          ) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-label" style={{ marginTop: 20 }}>Histórico ({historico.length})</div>
      {historico.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum exame registrado ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Parâmetros preenchidos</th>
                <th>PDF</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historico.map(h => (
                <tr key={h.id}>
                  <td>{dataBR(h.data)}</td>
                  <td>{h.valores ? Object.keys(h.valores).length : 0}</td>
                  <td>
                    {h.pdf_url ? (
                      <a href={h.pdf_url} target="_blank" rel="noopener noreferrer"
                         title="Abrir PDF"
                         style={{ color: 'var(--gold-deep)', display: 'inline-flex', alignItems: 'center' }}>
                        <i className="ti ti-file-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
                      </a>
                    ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => editar(h)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-deep)', padding: 4 }}
                      title="Editar">
                      <i className="ti ti-pencil" style={{ fontSize: 15 }} aria-hidden="true"></i>
                    </button>
                    <button onClick={() => remover(h.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                      title="Remover">
                      <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ============================================================
   EXAMES DE IMAGEM (ultrassom, raio-x, densitometria, etc.)
   ============================================================ */
function RegistrarExamesImagem({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function carregar() {
    const { data: rows } = await supabase
      .from('exames_imagem')
      .select('id, data, titulo, texto, pdf_url')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false });
    setHistorico(rows ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  function limpar() {
    setEditingId(null);
    setData(new Date().toISOString().slice(0, 10));
    setTitulo('');
    setTexto('');
    setPdfFile(null);
    setFeedback(null);
  }

  function editar(registro) {
    setEditingId(registro.id);
    setData(registro.data);
    setTitulo(registro.titulo);
    setTexto(registro.texto ?? '');
    setPdfFile(null);
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar() {
    setFeedback(null);
    if (!data) return setFeedback({ tipo: 'erro', msg: 'A data é obrigatória.' });
    if (!titulo.trim()) return setFeedback({ tipo: 'erro', msg: 'Dê um título ao exame (ex: "Ultrassom abdominal").' });
    setBusy(true);
    const registroAtual = editingId ? historico.find(h => h.id === editingId) : null;
    let pdfUrl = registroAtual?.pdf_url ?? null;
    try {
      const novoPdfUrl = await uploadDocumento(pdfFile, { nutriId, pacienteId, tipo: 'exame_imagem' });
      if (novoPdfUrl) pdfUrl = novoPdfUrl;
    } catch (e) {
      setBusy(false);
      return setFeedback({ tipo: 'erro', msg: e.message });
    }
    const payload = {
      paciente_id: pacienteId,
      nutri_id: nutriId,
      data,
      titulo: titulo.trim(),
      texto: texto.trim() || null,
      pdf_url: pdfUrl,
    };
    const { error } = editingId
      ? await supabase.from('exames_imagem').update(payload).eq('id', editingId)
      : await supabase.from('exames_imagem').insert(payload);
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: editingId ? 'Registro atualizado.' : 'Exame de imagem registrado.' });
    limpar();
    carregar();
  }

  async function remover(id) {
    if (!window.confirm('Remover este exame de imagem?')) return;
    await supabase.from('exames_imagem').delete().eq('id', id);
    if (editingId === id) limpar();
    carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{editingId ? 'Editar exame de imagem' : 'Novo exame de imagem'}</div>
            <div className="card-sub">Ultrassom, raio-x, densitometria, ressonância, etc. — anote sua leitura do laudo</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label className="field-label">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Título *</label>
              <input type="text" placeholder="Ex: Ultrassom abdominal total"
                value={titulo} onChange={e => setTitulo(e.target.value)} />
            </div>
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Suas anotações</label>
          <textarea rows="5" value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Ex: esteatose hepática grau I, sem outras alterações. Reforçar orientação de redução de gordura visceral." />

          <UploadPdfField
            pdfFile={pdfFile}
            setPdfFile={setPdfFile}
            pdfUrlAtual={editingId ? historico.find(h => h.id === editingId)?.pdf_url : null}
            tipo="exame_imagem"
          />

          {feedback && <FeedbackInline f={feedback} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            {editingId && (
              <button className="btn-outline" onClick={limpar} disabled={busy}>
                Cancelar edição
              </button>
            )}
            <button className="btn" onClick={salvar} disabled={busy}>
              <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : (editingId ? 'Salvar alterações' : 'Registrar')}
            </button>
          </div>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 20 }}>Histórico ({historico.length})</div>
      {historico.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum exame de imagem registrado ainda.</div>
        </div>
      ) : (
        historico.map(h => (
          <div key={h.id} className="card" style={{ marginBottom: 10 }}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{h.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{dataBR(h.data)}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
                  {h.pdf_url && (
                    <a href={h.pdf_url} target="_blank" rel="noopener noreferrer"
                       title="Abrir PDF"
                       style={{ color: 'var(--gold-deep)', padding: 4, display: 'inline-flex' }}>
                      <i className="ti ti-file-download" style={{ fontSize: 15 }} aria-hidden="true"></i>
                    </a>
                  )}
                  <button onClick={() => editar(h)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-deep)', padding: 4 }}
                    title="Editar">
                    <i className="ti ti-pencil" style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </button>
                  <button onClick={() => remover(h.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                    title="Remover">
                    <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              {h.texto && <div style={{ fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap' }}>{h.texto}</div>}
            </div>
          </div>
        ))
      )}
    </>
  );
}

/* ============================================================
   PEDIDO DE EXAME (gera PDF pra paciente levar ao laboratório)
   ============================================================ */
function gerarPdfPedidoExame({ pacienteNome, data, exames, obs }) {
  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(16);
  doc.text('Pedido de exames laboratoriais', 15, y);
  y += 10;

  doc.setFontSize(11);
  doc.text(`Paciente: ${pacienteNome}`, 15, y);
  y += 7;
  doc.text(`Data: ${dataBR(data)}`, 15, y);
  y += 12;

  doc.setFontSize(12);
  doc.text('Exames solicitados:', 15, y);
  y += 8;
  doc.setFontSize(11);
  exames.forEach(nome => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(`•  ${nome}`, 20, y);
    y += 7;
  });

  if (obs?.trim()) {
    y += 5;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text('Observações:', 15, y);
    y += 8;
    doc.setFontSize(11);
    const linhas = doc.splitTextToSize(obs.trim(), 175);
    linhas.forEach(linha => {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(linha, 15, y);
      y += 6;
    });
  }

  return doc.output('blob');
}

function PedidoExame({ pacienteId, nutriId, pacienteNome }) {
  const [historico, setHistorico] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [selecionados, setSelecionados] = useState({});
  const [outros, setOutros] = useState('');
  const [obs, setObs] = useState('');
  const [busca, setBusca] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function carregar() {
    const { data: rows } = await supabase
      .from('pedidos_exame')
      .select('id, data, exames, obs, pdf_url')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false });
    setHistorico(rows ?? []);
  }
  async function carregarModelos() {
    const { data: rows } = await supabase
      .from('pedidos_exame_modelos')
      .select('id, nome, exames, obs')
      .eq('nutri_id', nutriId)
      .order('nome');
    setModelos(rows ?? []);
  }
  useEffect(() => { carregar(); carregarModelos(); }, [pacienteId]);

  function toggle(label) {
    setSelecionados(s => ({ ...s, [label]: !s[label] }));
  }

  function usarModelo(modelo) {
    const novaSelecao = {};
    (modelo.exames ?? []).forEach(nome => { novaSelecao[nome] = true; });
    setSelecionados(novaSelecao);
    setObs(modelo.obs ?? '');
    setFeedback(null);
  }

  async function salvarModelo() {
    const escolhidos = Object.entries(selecionados).filter(([, v]) => v).map(([k]) => k);
    const extras = outros.split(',').map(s => s.trim()).filter(Boolean);
    const exames = [...escolhidos, ...extras];
    if (exames.length === 0) {
      return setFeedback({ tipo: 'erro', msg: 'Selecione ao menos um exame antes de salvar como modelo.' });
    }
    const nome = window.prompt('Nome do modelo (ex: "Check-up padrão"):');
    if (!nome?.trim()) return;
    const { error } = await supabase.from('pedidos_exame_modelos').insert({
      nutri_id: nutriId,
      nome: nome.trim(),
      exames,
      obs: obs.trim() || null,
    });
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: `Modelo "${nome.trim()}" salvo.` });
    carregarModelos();
  }

  async function removerModelo(id) {
    if (!window.confirm('Remover este modelo favorito?')) return;
    await supabase.from('pedidos_exame_modelos').delete().eq('id', id);
    carregarModelos();
  }

  const paramsFiltrados = EXAMES_PARAMS.filter(p =>
    p.label.toLowerCase().includes(busca.trim().toLowerCase())
  );
  const categoriasFiltradas = [...new Set(paramsFiltrados.map(p => p.categoria))];

  async function gerarEsalvar() {
    setFeedback(null);
    const escolhidos = Object.entries(selecionados).filter(([, v]) => v).map(([k]) => k);
    const extras = outros.split(',').map(s => s.trim()).filter(Boolean);
    const exames = [...escolhidos, ...extras];
    if (exames.length === 0) {
      return setFeedback({ tipo: 'erro', msg: 'Selecione ao menos um exame (ou digite em "outros exames").' });
    }
    if (!data) return setFeedback({ tipo: 'erro', msg: 'A data é obrigatória.' });
    setBusy(true);
    try {
      const blob = gerarPdfPedidoExame({ pacienteNome, data, exames, obs });
      const file = new File([blob], `pedido-exame-${data}.pdf`, { type: 'application/pdf' });
      const pdfUrl = await uploadDocumento(file, { nutriId, pacienteId, tipo: 'pedido_exame' });
      const { error } = await supabase.from('pedidos_exame').insert({
        paciente_id: pacienteId,
        nutri_id: nutriId,
        data,
        exames,
        obs: obs.trim() || null,
        pdf_url: pdfUrl,
      });
      if (error) throw new Error(error.message);

      // Também manda uma cópia pra aba "Prescrições" da paciente, que é
      // onde o app dela já mostra documentos (tipo "exame") — assim ela
      // vê o pedido sem a nutri precisar reenviar por fora.
      const pathPaciente = `${pacienteId}/${Date.now()}-pedido_exame.pdf`;
      const { error: uploadPacienteErr } = await supabase.storage
        .from('prescricoes')
        .upload(pathPaciente, file, { contentType: 'application/pdf' });
      if (!uploadPacienteErr) {
        await supabase.from('prescricoes').insert({
          paciente_id: pacienteId,
          nutri_id: nutriId,
          tipo: 'exame',
          titulo: `Pedido de exame — ${dataBR(data)}`,
          storage_path: pathPaciente,
          nota: obs.trim() || null,
        });
      }

      setFeedback({
        tipo: 'ok',
        msg: uploadPacienteErr
          ? 'Pedido gerado! (Não consegui enviar automaticamente pra aba Prescrições da paciente — baixe o PDF abaixo e envie por fora.)'
          : 'Pedido gerado e já apareceu na aba Prescrições do app da paciente!',
      });
      setSelecionados({});
      setOutros('');
      setObs('');
      carregar();
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: e.message });
    }
    setBusy(false);
  }

  async function remover(id) {
    if (!window.confirm('Remover este pedido de exame?')) return;
    await supabase.from('pedidos_exame').delete().eq('id', id);
    carregar();
  }

  return (
    <>
      {modelos.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body">
            <div className="section-label" style={{ marginBottom: 8 }}>Modelos favoritos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {modelos.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  border: '0.5px solid var(--hair)', borderRadius: 8,
                  padding: '5px 6px 5px 12px', fontSize: 12,
                }}>
                  <button type="button" onClick={() => usarModelo(m)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dark)', fontWeight: 500 }}>
                    ⭐ {m.nome} <span style={{ color: 'var(--muted)' }}>({(m.exames ?? []).length})</span>
                  </button>
                  <button type="button" onClick={() => removerModelo(m.id)}
                    title="Remover modelo"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '2px 4px' }}>
                    <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Novo pedido de exame</div>
            <div className="card-sub">Selecione os exames — a paciente leva o PDF ao laboratório</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, maxWidth: 220 }}>
            <div>
              <label className="field-label">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Exames</div>
          <input
            type="text"
            placeholder="Buscar exame..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '0.5px solid var(--hair)', borderRadius: 10 }}>
            {categoriasFiltradas.map(categoria => (
              <div key={categoria}>
                <div style={{
                  padding: '6px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '.03em',
                  textTransform: 'uppercase', color: 'var(--muted)', background: 'var(--bg2)',
                }}>
                  {categoria}
                </div>
                {paramsFiltrados.filter(p => p.categoria === categoria).map(p => (
                  <label key={p.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    borderBottom: '0.5px solid var(--hair-soft)', fontSize: 13, cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={!!selecionados[p.label]}
                      onChange={() => toggle(p.label)}
                      style={{
                        width: 16, height: 16, flex: '0 0 auto',
                        padding: 0, border: '0.5px solid var(--hair)',
                        borderRadius: 4, background: 'var(--paper)',
                      }}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            ))}
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Outros exames (opcional, separados por vírgula)</label>
          <input type="text" value={outros} onChange={e => setOutros(e.target.value)}
            placeholder="Ex: Curva glicêmica, USG de abdômen" />

          <label className="field-label" style={{ marginTop: 14 }}>Observações / instruções (opcional)</label>
          <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
            placeholder="Ex: coletar em jejum de 12h." />

          {feedback && <FeedbackInline f={feedback} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn-outline" type="button" onClick={salvarModelo} disabled={busy}>
              <i className="ti ti-star" aria-hidden="true"></i> Salvar como modelo
            </button>
            <button className="btn" onClick={gerarEsalvar} disabled={busy}>
              <i className="ti ti-file-download" aria-hidden="true"></i> {busy ? 'Gerando...' : 'Gerar PDF do pedido'}
            </button>
          </div>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 20 }}>Histórico ({historico.length})</div>
      {historico.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum pedido de exame gerado ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Exames</th>
                <th>PDF</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historico.map(h => (
                <tr key={h.id}>
                  <td>{dataBR(h.data)}</td>
                  <td style={{ fontSize: 12 }}>{(h.exames ?? []).join(', ')}</td>
                  <td>
                    {h.pdf_url ? (
                      <a href={h.pdf_url} target="_blank" rel="noopener noreferrer"
                         title="Baixar PDF"
                         style={{ color: 'var(--gold-deep)', display: 'inline-flex', alignItems: 'center' }}>
                        <i className="ti ti-file-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
                      </a>
                    ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => remover(h.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                      title="Remover">
                      <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ============================================================
   PUBLICAR PLANO
   ============================================================ */
const DADOS_VAZIO = { macros: {}, refeicoes: [] };

function PublicarPlano({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [dados, setDados] = useState(DADOS_VAZIO); // fonte principal — editor visual
  const [json, setJson] = useState(''); // só usado no modo avançado
  const [modoAvancado, setModoAvancado] = useState(false);
  const [alimentosBase, setAlimentosBase] = useState([]);
  const [validade, setValidade] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [verJson, setVerJson] = useState(null);
  const [preview, setPreview] = useState(null); // { dados, validade, pdfPlano } — usado tanto pra prévia do form quanto do histórico
  const [editandoId, setEditandoId] = useState(null); // id do plano sendo editado, null = plano novo

  async function carregar() {
    const { data } = await supabase
      .from('planos')
      .select('id, dados, validade, pdf_url, publicado_em, ativo')
      .eq('paciente_id', pacienteId)
      .order('publicado_em', { ascending: false })
      .limit(5);
    setHistorico(data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  // Base de alimentos pra busca do editor visual — carrega uma vez só
  // (independe da paciente aberta).
  useEffect(() => {
    supabase.from('alimentos')
      .select('id, nome, medida_padrao, kcal, prot_g, cho_g, lip_g')
      .order('nome')
      .then(({ data }) => setAlimentosBase(data ?? []));
  }, []);

  function temAlgumConteudo() {
    return modoAvancado ? json.trim().length > 0 : (dados.refeicoes ?? []).length > 0;
  }

  // Permite publicar com plano montado (visual ou JSON) OU só PDF (pelo
  // menos um dos dois). Se a nutri quer mandar só o PDF (vindo de uma
  // avaliação externa) sem montar o plano estruturado, salva com dados vazios.
  function prepararDados() {
    if (modoAvancado) {
      const temJson = json.trim().length > 0;
      if (!temJson) return { dados: { somente_pdf: true } };
      let obj;
      try { obj = JSON.parse(json); }
      catch (e) { return { erro: 'JSON inválido: ' + e.message }; }
      // Normaliza aliases (proteinas_g → prot_g, quantidade → qty, etc.) antes
      // de validar e salvar — evita quebrar planos gerados por prompts antigos.
      obj = normalizarPlano(obj);
      const v = validarPlano(obj);
      if (!v.ok) return { erro: v.erro };
      return { dados: obj };
    }
    if ((dados.refeicoes ?? []).length === 0) return { dados: { somente_pdf: true } };
    const normalizado = normalizarPlano(dados);
    const v = validarPlano(normalizado);
    if (!v.ok) return { erro: v.erro };
    return { dados: normalizado };
  }

  function prever() {
    setFeedback(null);
    const { dados: d, erro } = prepararDados();
    if (erro) return setFeedback({ tipo: 'erro', msg: erro });
    setPreview({
      dados: d,
      validade: validade || d.validade || null,
      pdfPlano: pdfFile ? URL.createObjectURL(pdfFile) : (historico.find(h => h.id === editandoId)?.pdf_url ?? null),
    });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setDados(DADOS_VAZIO);
    setJson('');
    setModoAvancado(false);
    setValidade('');
    setPdfFile(null);
  }

  function editar(p) {
    setFeedback(null);
    setEditandoId(p.id);
    setDados(p.dados?.refeicoes ? p.dados : DADOS_VAZIO);
    setModoAvancado(false);
    setValidade(p.validade ? p.validade.slice(0, 10) : '');
    setPdfFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Alterna pro modo "colar JSON" (avançado) — serializa o que já foi
  // montado no editor visual, pra não perder nada ao trocar de modo.
  function ativarModoAvancado() {
    setJson(JSON.stringify(dados, null, 2));
    setModoAvancado(true);
  }

  // Volta pro editor visual — reinterpreta o JSON atual do textarea
  // como o novo estado do editor. Se o JSON estiver quebrado, avisa e
  // mantém no modo avançado (não perde o que a nutri digitou).
  function voltarModoVisual() {
    if (json.trim()) {
      try {
        setDados(normalizarPlano(JSON.parse(json)));
      } catch (e) {
        setFeedback({ tipo: 'erro', msg: 'Não consegui interpretar esse JSON pra voltar ao editor visual: ' + e.message });
        return;
      }
    }
    setModoAvancado(false);
  }

  async function publicar() {
    setFeedback(null);
    if (!temAlgumConteudo() && !pdfFile) {
      return setFeedback({ tipo: 'erro', msg: 'Monte o plano OU anexe um PDF (pelo menos um dos dois).' });
    }
    const { dados, erro } = prepararDados();
    if (erro) return setFeedback({ tipo: 'erro', msg: erro });

    setBusy(true);
    let pdfUrl = null;
    try {
      pdfUrl = await uploadDocumento(pdfFile, { nutriId, pacienteId, tipo: 'plano' });
    } catch (e) {
      setBusy(false);
      return setFeedback({ tipo: 'erro', msg: e.message });
    }

    // Desativa o plano ativo anterior antes de inserir o novo — evita colidir
    // com o índice único (só 1 "ativo" por vez) e garante que a paciente
    // sempre vê o plano recém-publicado.
    await supabase.from('planos').update({ ativo: false }).eq('paciente_id', pacienteId).eq('ativo', true);

    const planoPayload = {
      paciente_id: pacienteId,
      nutri_id: nutriId,
      dados,
      validade: validade || dados.validade || null,
      pdf_url: pdfUrl,
      ativo: true,
    };
    const { error, omitidos } = await omitColunasFaltantes(
      planoPayload, ['pdf_url', 'ativo'],
      (p) => supabase.from('planos').insert(p),
    );
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    const aviso = omitidos.length
      ? ` ATENÇÃO: PDF não foi salvo. Rode o SQL: github.com/danielasoares-rd/lapidare-app/blob/main/supabase/delta-v1.10.0.sql`
      : (pdfUrl ? ' PDF anexado.' : '');
    setFeedback({ tipo: omitidos.length ? 'erro' : 'ok', msg: `Plano publicado!${aviso} A paciente verá agora.` });
    cancelarEdicao();
    carregar();
  }

  async function atualizarPlano() {
    setFeedback(null);
    const { dados, erro } = prepararDados();
    if (erro) return setFeedback({ tipo: 'erro', msg: erro });

    setBusy(true);
    let pdfUrl = historico.find(h => h.id === editandoId)?.pdf_url ?? null;
    if (pdfFile) {
      try { pdfUrl = await uploadDocumento(pdfFile, { nutriId, pacienteId, tipo: 'plano' }); }
      catch (e) {
        setBusy(false);
        return setFeedback({ tipo: 'erro', msg: e.message });
      }
    }
    const { error } = await supabase.from('planos').update({
      dados,
      validade: validade || dados.validade || null,
      pdf_url: pdfUrl,
    }).eq('id', editandoId);
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: 'Plano atualizado.' });
    cancelarEdicao();
    carregar();
  }

  async function ativarPlano(p) {
    if (p.ativo) return;
    setBusy(true);
    const atual = historico.find(h => h.ativo);
    if (atual) {
      await supabase.from('planos').update({ ativo: false }).eq('id', atual.id);
    }
    const { error } = await supabase.from('planos').update({ ativo: true }).eq('id', p.id);
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: 'Plano ativado. A paciente verá este agora.' });
    carregar();
  }

  async function excluirPlano(p) {
    const data = dataBR(p.publicado_em);
    if (!window.confirm(`Excluir plano publicado em ${data}?\n\nA paciente não verá mais este plano. Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('planos').delete().eq('id', p.id);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    if (editandoId === p.id) cancelarEdicao();
    setFeedback({ tipo: 'ok', msg: 'Plano excluído.' });
    carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              {editandoId ? 'Editando plano publicado' : 'Publicar novo plano alimentar'}
            </div>
            <div className="card-sub">
              {editandoId
                ? 'Ajuste o plano abaixo e escolha se quer salvar como um plano novo ou atualizar este mesmo plano.'
                : 'Monte o plano refeição por refeição OU anexe um PDF — pelo menos um dos dois'}
            </div>
          </div>
          <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={modoAvancado ? voltarModoVisual : ativarModoAvancado}>
            {modoAvancado ? 'Voltar pro editor visual' : 'Avançado: colar JSON'}
          </button>
        </div>
        <div className="card-body">
          {modoAvancado ? (
            <>
              <label className="field-label">JSON do plano (opcional se anexar PDF)</label>
              <textarea
                value={json}
                onChange={e => setJson(e.target.value)}
                rows={10}
                placeholder='{"macros": {"kcal": 1500, ...}, "refeicoes": [...]}'
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
              />

              <DicaJSON
                exemploPrompt='Anexei o PDF do plano alimentar que já montei pra essa paciente. Transforme EXATAMENTE esse plano (os mesmos alimentos, quantidades e observações que já estão no PDF — não invente nem troque por exemplos genéricos) num JSON com esses nomes de campo EXATOS (não traduza): { "macros": { "kcal": 1500, "prot_g": 90, "cho_g": 150, "lip_g": 50, "agua_l": 2.5, "fibras_g": 25 }, "refeicoes": [ { "nome": "Café da manhã", "horario": "07:30", "emoji": "☕", "kcal": 350, "alimentos": [ { "nome": "Pão integral", "qty": "2 fatias", "kcal": 140, "prot_g": 6, "subs": ["Tapioca · 2 col sopa", "Aveia · 3 col sopa"] } ], "obs": "beber 1 copo de água antes" } ] }. IMPORTANTE: "subs" deve ser array de STRINGS (não objetos). Use "prot_g", "cho_g", "lip_g" (não "proteinas_g"). Use "qty" (não "quantidade").' />
            </>
          ) : (
            <PlanoEditor dados={dados} onChange={setDados} alimentosBase={alimentosBase} />
          )}

          <UploadPdfField
            pdfFile={pdfFile}
            setPdfFile={setPdfFile}
            pdfUrlAtual={editandoId ? historico.find(h => h.id === editandoId)?.pdf_url : historico[0]?.pdf_url}
            tipo="plano"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 10 }}>
            <div>
              <label className="field-label">Validade (opcional)</label>
              <input type="date" value={validade} onChange={e => setValidade(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-outline" onClick={prever} disabled={!temAlgumConteudo() && !pdfFile}>
                <i className="ti ti-eye" aria-hidden="true"></i> Pré-visualizar
              </button>
              {editandoId && (
                <button className="btn-outline" onClick={atualizarPlano} disabled={busy}>
                  <i className="ti ti-refresh" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Atualizar este plano'}
                </button>
              )}
              <button className="btn" onClick={publicar} disabled={busy || (!temAlgumConteudo() && !pdfFile)}>
                <i className="ti ti-send" aria-hidden="true"></i>
                {busy ? 'Publicando...' : editandoId ? 'Salvar como novo plano' : 'Publicar plano'}
              </button>
              {editandoId && (
                <button className="btn-outline" onClick={cancelarEdicao} disabled={busy}>
                  Cancelar edição
                </button>
              )}
            </div>
          </div>

          {feedback && <FeedbackInline f={feedback} />}
        </div>
      </div>

      <HistoricoLista
        titulo="Planos publicados"
        items={historico}
        onDelete={excluirPlano}
        renderItem={(p) => (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.dados?.macros?.kcal ? `${p.dados.macros.kcal} kcal · ` : ''}
                {p.dados?.refeicoes?.length ?? 0} refeições
                {p.ativo && (
                  <span className="pill" style={{ fontSize: 10, background: 'var(--green-bg, #e6f4ea)', color: 'var(--green, #1e7a34)' }}>
                    Ativo
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Publicado em {dataBR(p.publicado_em)}
                {p.validade && ` · válido até ${dataBR(p.validade)}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {!p.ativo && (
                <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => ativarPlano(p)} disabled={busy}>
                  <i className="ti ti-check" aria-hidden="true"></i> Ativar este plano
                </button>
              )}
              <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setPreview({ dados: p.dados, validade: p.validade, pdfPlano: p.pdf_url })}>
                <i className="ti ti-eye" aria-hidden="true"></i> Visualizar
              </button>
              <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => editar(p)}>
                <i className="ti ti-pencil" aria-hidden="true"></i> Editar
              </button>
              <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setVerJson(p)}>
                <i className="ti ti-code" aria-hidden="true"></i> JSON
              </button>
            </div>
          </>
        )}
      />

      {verJson && (
        <VerJsonModal item={verJson} dados={verJson.dados} onClose={() => setVerJson(null)} />
      )}

      {preview && (
        <PreviewPlanoModal
          dados={preview.dados}
          validade={preview.validade}
          pdfPlano={preview.pdfPlano}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

function PreviewPlanoModal({ dados, validade, pdfPlano, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--paper, var(--white))', borderRadius: 12,
        width: 420, maxWidth: '100%', maxHeight: '90vh',
        border: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', borderBottom: '0.5px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>Prévia — o que a paciente vê</div>
          <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onClose}>
            Fechar
          </button>
        </div>
        <div style={{ overflow: 'auto', padding: '12px 0' }}>
          <PlanoView dados={dados} validade={validade} pdfPlano={pdfPlano} pdfSubs={null} subsExternas={null} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PUBLICAR SUBSTITUIÇÕES
   Tabela separada do plano alimentar — a nutri pode atualizar as
   substituições sem mexer no plano publicado. A paciente vê as
   substituições ao tocar num alimento do plano (lookup pelo nome).
   ============================================================ */
function PublicarSubstituicoes({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [json, setJson] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [verJson, setVerJson] = useState(null);

  async function carregar() {
    const { data } = await supabase
      .from('substituicoes')
      .select('id, dados, pdf_url, publicado_em')
      .eq('paciente_id', pacienteId)
      .order('publicado_em', { ascending: false })
      .limit(5);
    setHistorico(data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function publicar() {
    setFeedback(null);
    const temJson = json.trim().length > 0;
    if (!temJson && !pdfFile) {
      return setFeedback({ tipo: 'erro', msg: 'Cole o JSON OU anexe um PDF (pelo menos um dos dois).' });
    }

    let dados = [];
    if (temJson) {
      try { dados = JSON.parse(json); }
      catch (e) { return setFeedback({ tipo: 'erro', msg: 'JSON inválido: ' + e.message }); }
      const v = validarSubstituicoes(dados);
      if (!v.ok) return setFeedback({ tipo: 'erro', msg: v.erro });
    }

    setBusy(true);
    let pdfUrl = null;
    try {
      pdfUrl = await uploadDocumento(pdfFile, { nutriId, pacienteId, tipo: 'substituicoes' });
    } catch (e) {
      setBusy(false);
      return setFeedback({ tipo: 'erro', msg: e.message });
    }

    const subsPayload = {
      paciente_id: pacienteId,
      nutri_id: nutriId,
      dados,
      pdf_url: pdfUrl,
    };
    const { error, omitidos } = await omitColunasFaltantes(
      subsPayload, ['pdf_url'],
      (p) => supabase.from('substituicoes').insert(p),
    );
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    const aviso = omitidos.length
      ? ` ATENÇÃO: PDF não foi salvo. Rode o SQL: github.com/danielasoares-rd/lapidare-app/blob/main/supabase/delta-v1.10.0.sql`
      : (pdfUrl ? ' PDF anexado.' : '');
    const detalhe = Array.isArray(dados) && dados.length > 0
      ? ` ${dados.length} alimentos com opções de troca.`
      : '';
    setFeedback({ tipo: omitidos.length ? 'erro' : 'ok', msg: `Substituições publicadas!${aviso}${detalhe}` });
    setJson('');
    setPdfFile(null);
    carregar();
  }

  async function excluirSubstituicao(s) {
    const data = dataBR(s.publicado_em);
    if (!window.confirm(`Excluir substituições publicadas em ${data}?\n\nA paciente não verá mais as substituições.`)) return;
    const { error } = await supabase.from('substituicoes').delete().eq('id', s.id);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: 'Substituições excluídas.' });
    carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Publicar lista de substituições</div>
            <div className="card-sub">
              Cole o JSON OU anexe um PDF — pelo menos um dos dois. Com JSON,
              a paciente vê substituições ao tocar nos alimentos do plano.
            </div>
          </div>
        </div>
        <div className="card-body">
          <label className="field-label">JSON das substituições</label>
          <textarea
            value={json}
            onChange={e => setJson(e.target.value)}
            rows={12}
            placeholder='[{"alimento": "Arroz integral", "medida": "4 col sopa", "substituicoes": ["Quinoa cozida · 4 col sopa", "Batata doce · 1 un média"]}]'
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
          />

          <DicaJSON
            exemploPrompt='Gere um JSON com substituições para cada alimento deste plano alimentar [cole o plano da paciente aqui]. Formato exato: array de objetos, cada um com 3 campos — "alimento" (nome igual ao do plano), "medida" (a quantidade do plano) e "substituicoes" (array de strings com 3 a 5 opções equivalentes nutricionalmente, cada uma já incluindo a quantidade). Exemplo: [{"alimento": "Arroz integral", "medida": "4 col sopa", "substituicoes": ["Quinoa cozida · 4 col sopa", "Batata doce · 1 un média"]}]. IMPORTANTE: cada item em "substituicoes" precisa ser uma string simples, NÃO um objeto.' />

          <UploadPdfField
            pdfFile={pdfFile}
            setPdfFile={setPdfFile}
            pdfUrlAtual={historico[0]?.pdf_url}
            tipo="substituicoes"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn" onClick={publicar} disabled={busy || (!json.trim() && !pdfFile)}>
              <i className="ti ti-send" aria-hidden="true"></i> {busy ? 'Publicando...' : 'Publicar substituições'}
            </button>
          </div>

          {feedback && <FeedbackInline f={feedback} />}
        </div>
      </div>

      <HistoricoLista
        titulo="Substituições publicadas"
        items={historico}
        onDelete={excluirSubstituicao}
        renderItem={(s) => (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {Array.isArray(s.dados) ? `${s.dados.length} alimentos` : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Publicado em {dataBR(s.publicado_em)}
              </div>
            </div>
            <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setVerJson(s)}>
              <i className="ti ti-code" aria-hidden="true"></i> JSON
            </button>
          </>
        )}
      />

      {verJson && (
        <VerJsonModal item={verJson} dados={verJson.dados} onClose={() => setVerJson(null)} />
      )}
    </>
  );
}

/* ============================================================
   PUBLICAR LISTA DE COMPRAS
   ============================================================ */
function PublicarLista({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [json, setJson] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [verJson, setVerJson] = useState(null);

  async function carregar() {
    const { data } = await supabase
      .from('listas_compras')
      .select('id, dados, pdf_url, publicado_em')
      .eq('paciente_id', pacienteId)
      .order('publicado_em', { ascending: false })
      .limit(5);
    setHistorico(data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function publicar() {
    setFeedback(null);
    const temJson = json.trim().length > 0;
    if (!temJson && !pdfFile) {
      return setFeedback({ tipo: 'erro', msg: 'Cole o JSON OU anexe um PDF (pelo menos um dos dois).' });
    }

    let dados = { somente_pdf: true };
    if (temJson) {
      try { dados = JSON.parse(json); }
      catch (e) { return setFeedback({ tipo: 'erro', msg: 'JSON inválido: ' + e.message }); }
      const v = validarLista(dados);
      if (!v.ok) return setFeedback({ tipo: 'erro', msg: v.erro });
    }

    setBusy(true);
    let pdfUrl = null;
    try {
      pdfUrl = await uploadDocumento(pdfFile, { nutriId, pacienteId, tipo: 'compras' });
    } catch (e) {
      setBusy(false);
      return setFeedback({ tipo: 'erro', msg: e.message });
    }

    const listaPayload = {
      paciente_id: pacienteId,
      nutri_id: nutriId,
      dados,
      pdf_url: pdfUrl,
    };
    const { error, omitidos } = await omitColunasFaltantes(
      listaPayload, ['pdf_url'],
      (p) => supabase.from('listas_compras').insert(p),
    );
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    const aviso = omitidos.length
      ? ` ATENÇÃO: PDF não foi salvo. Rode o SQL: github.com/danielasoares-rd/lapidare-app/blob/main/supabase/delta-v1.10.0.sql`
      : (pdfUrl ? ' PDF anexado.' : '');
    setFeedback({ tipo: omitidos.length ? 'erro' : 'ok', msg: `Lista publicada!${aviso} A paciente verá agora.` });
    setJson('');
    setPdfFile(null);
    carregar();
  }

  async function excluirLista(l) {
    const data = dataBR(l.publicado_em);
    if (!window.confirm(`Excluir lista de compras publicada em ${data}?\n\nA paciente não verá mais esta lista.`)) return;
    const { error } = await supabase.from('listas_compras').delete().eq('id', l.id);
    if (error) return setFeedback({ tipo: 'erro', msg: error.message });
    setFeedback({ tipo: 'ok', msg: 'Lista excluída.' });
    carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Publicar nova lista de compras</div>
            <div className="card-sub">Cole o JSON da Skill 7 OU anexe um PDF — pelo menos um dos dois</div>
          </div>
        </div>
        <div className="card-body">
          <label className="field-label">JSON da lista</label>
          <textarea
            value={json}
            onChange={e => setJson(e.target.value)}
            rows={10}
            placeholder='{"lista": [{"categoria": "Hortifruti", "itens": ["banana", "maçã"]}]}'
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
          />

          <DicaJSON
            exemploPrompt='gera um JSON de lista de compras pra paciente, agrupando os itens por categoria (Hortifruti, Proteínas, Grãos e cereais, Laticínios, Mercearia, Outros). Inclui só os nomes dos itens (sem quantidade). Estrutura: { "lista": [{ "categoria": "Hortifruti", "emoji": "🥦", "itens": ["banana", "maçã", "alface", "tomate"] }, ...] }' />

          <UploadPdfField
            pdfFile={pdfFile}
            setPdfFile={setPdfFile}
            pdfUrlAtual={historico[0]?.pdf_url}
            tipo="compras"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn" onClick={publicar} disabled={busy || (!json.trim() && !pdfFile)}>
              <i className="ti ti-send" aria-hidden="true"></i> {busy ? 'Publicando...' : 'Publicar lista'}
            </button>
          </div>

          {feedback && <FeedbackInline f={feedback} />}
        </div>
      </div>

      <HistoricoLista
        titulo="Listas publicadas"
        items={historico}
        onDelete={excluirLista}
        renderItem={(l) => (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {contarItensLista(l.dados)} itens em {l.dados?.lista?.length ?? 0} categorias
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Publicada em {dataBR(l.publicado_em)}
              </div>
            </div>
            <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setVerJson(l)}>
              <i className="ti ti-code" aria-hidden="true"></i> JSON
            </button>
          </>
        )}
      />

      {verJson && (
        <VerJsonModal item={verJson} dados={verJson.dados} onClose={() => setVerJson(null)} />
      )}
    </>
  );
}

/* ============================================================
   ENVIAR PRESCRIÇÃO (upload PDF)
   ============================================================ */
function EnviarPrescricao({ pacienteId, nutriId }) {
  const [historico, setHistorico] = useState([]);
  const [tipo, setTipo] = useState('exame');
  const [titulo, setTitulo] = useState('');
  const [nota, setNota] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function carregar() {
    const { data } = await supabase
      .from('prescricoes')
      .select('id, tipo, titulo, storage_path, nota, created_at')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    setHistorico(data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function enviar() {
    setFeedback(null);
    if (!arquivo) return setFeedback({ tipo: 'erro', msg: 'Selecione um arquivo PDF.' });
    if (!titulo.trim()) return setFeedback({ tipo: 'erro', msg: 'Informe um título.' });

    setBusy(true);
    const ext = arquivo.name.split('.').pop() || 'pdf';
    const path = `${pacienteId}/${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('prescricoes')
      .upload(path, arquivo, { contentType: arquivo.type });
    if (uploadErr) {
      setBusy(false);
      return setFeedback({ tipo: 'erro', msg: 'Upload falhou: ' + uploadErr.message });
    }

    const { error: insertErr } = await supabase.from('prescricoes').insert({
      paciente_id: pacienteId,
      nutri_id: nutriId,
      tipo, titulo: titulo.trim(),
      storage_path: path,
      nota: nota.trim() || null,
    });
    setBusy(false);
    if (insertErr) {
      // tenta limpar o arquivo subido se o insert falhou
      await supabase.storage.from('prescricoes').remove([path]);
      return setFeedback({ tipo: 'erro', msg: 'Erro ao registrar: ' + insertErr.message });
    }
    setFeedback({ tipo: 'ok', msg: 'Prescrição enviada!' });
    setTitulo(''); setNota(''); setArquivo(null);
    const fileInput = document.getElementById('prescricao-file');
    if (fileInput) fileInput.value = '';
    carregar();
  }

  async function abrirDocumento(path) {
    const { data, error } = await supabase.storage
      .from('prescricoes').createSignedUrl(path, 60);
    if (error) return alert('Não foi possível abrir: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remover(item) {
    if (!window.confirm(`Remover "${item.titulo}"?`)) return;
    await supabase.storage.from('prescricoes').remove([item.storage_path]);
    await supabase.from('prescricoes').delete().eq('id', item.id);
    carregar();
  }

  const TIPO_PILL = {
    exame:   { bg: 'var(--blue-bg)',   color: 'var(--blue)',   label: 'Exame' },
    laudo:   { bg: 'var(--green-bg)',  color: 'var(--green)',  label: 'Laudo' },
    receita: { bg: 'var(--orange-bg)', color: 'var(--orange)', label: 'Receita' },
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Enviar prescrição</div>
            <div className="card-sub">PDF de exame, laudo ou receita — a paciente verá em "Prescrições"</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="exame">Exame (pedido)</option>
                <option value="laudo">Laudo</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div>
              <label className="field-label">Título</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="Ex: Pedido de exame T4 livre" />
            </div>
          </div>

          <label className="field-label" style={{ marginTop: 10 }}>Arquivo PDF</label>
          <input
            id="prescricao-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={e => setArquivo(e.target.files?.[0] ?? null)}
            style={{ padding: 6 }}
          />

          <label className="field-label" style={{ marginTop: 10 }}>Observação (opcional)</label>
          <textarea rows="2" value={nota} onChange={e => setNota(e.target.value)}
            placeholder="Ex: trazer este pedido na próxima consulta" />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn" onClick={enviar} disabled={busy || !arquivo || !titulo.trim()}>
              <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Enviar prescrição'}
            </button>
          </div>

          {feedback && <FeedbackInline f={feedback} />}
        </div>
      </div>

      <div className="section-label">Documentos enviados ({historico.length})</div>
      {historico.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma prescrição enviada ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {historico.map((d, i) => {
            const p = TIPO_PILL[d.tipo] ?? { bg: 'var(--bg2)', color: 'var(--text3)', label: d.tipo };
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderBottom: i === historico.length - 1 ? 'none' : '0.5px solid #f5f0e8',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: p.bg, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <i className="ti ti-file-text" style={{ fontSize: 17, color: p.color }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{d.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {p.label} · {dataBR(d.created_at)}
                  </div>
                  {d.nota && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>
                      "{d.nota}"
                    </div>
                  )}
                </div>
                <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => abrirDocumento(d.storage_path)}>
                  <i className="ti ti-eye" aria-hidden="true"></i> Ver
                </button>
                <button onClick={() => remover(d)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                  title="Remover">
                  <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ============================================================
   COMPONENTES AUXILIARES
   ============================================================ */
/**
 * Campo opcional pra subir um PDF junto com Plano/Substituições/Lista.
 * - tipo: 'plano' | 'substituicoes' | 'compras'  (vira pasta no bucket)
 * - pdfUrlAtual: URL salvada no banco (se já existe). Mostra link "Ver atual".
 * - onArquivoSelecionado: callback (file | null) — pai guarda no estado.
 */
function UploadPdfField({ pdfFile, setPdfFile, pdfUrlAtual, tipo }) {
  const rotulo = {
    plano: 'PDF do plano (opcional)',
    substituicoes: 'PDF das substituições (opcional)',
    compras: 'PDF da lista de compras (opcional)',
    exame: 'PDF do laboratório (opcional)',
    exame_imagem: 'PDF/laudo do exame (opcional)',
  }[tipo] ?? 'PDF (opcional)';

  return (
    <div style={{ marginTop: 12 }}>
      <label className="field-label">{rotulo}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: 13 }}
        />
        {pdfFile && (
          <button
            type="button"
            onClick={() => setPdfFile(null)}
            className="btn-outline"
            style={{ fontSize: 11, padding: '4px 8px' }}>
            <i className="ti ti-x" aria-hidden="true"></i> Remover seleção
          </button>
        )}
        {!pdfFile && pdfUrlAtual && (
          <a href={pdfUrlAtual} target="_blank" rel="noopener noreferrer"
             className="btn-outline" style={{ fontSize: 11, padding: '4px 8px' }}>
            <i className="ti ti-file-download" aria-hidden="true"></i> Ver PDF atual
          </a>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        A paciente vai ver um botão "Baixar PDF" na tela. Máximo 10 MB.
      </div>
    </div>
  );
}

/**
 * Faz upload de um File pro bucket 'documentos' e retorna a URL pública.
 * Path: {nutriId}/{pacienteId}/{tipo}/{timestamp}-{filename}
 * Volta null se file estiver vazio. Lança erro se upload falhar.
 */
async function uploadDocumento(file, { nutriId, pacienteId, tipo }) {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('PDF muito grande (máx 10 MB).');
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${nutriId}/${pacienteId}/${tipo}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('documentos').upload(path, file, {
    contentType: file.type || 'application/pdf',
  });
  if (error) throw new Error('Falha no upload do PDF: ' + error.message);
  const { data } = supabase.storage.from('documentos').getPublicUrl(path);
  return data.publicUrl;
}

function FeedbackInline({ f }) {
  const ok = f.tipo === 'ok';
  return (
    <div style={{
      marginTop: 10,
      background: ok ? 'var(--green-bg)' : 'var(--red-bg)',
      color: ok ? 'var(--green)' : 'var(--red)',
      padding: '8px 12px', borderRadius: 6, fontSize: 13,
    }}>
      <i className={`ti ti-${ok ? 'check' : 'alert-circle'}`} style={{ marginRight: 5 }} aria-hidden="true"></i>
      {f.msg}
    </div>
  );
}

function HistoricoLista({ titulo, items, renderItem, onDelete }) {
  return (
    <>
      <div className="section-label">{titulo} ({items.length})</div>
      {items.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nada publicado ainda.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {items.map((it, i) => (
            <div key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px',
              borderBottom: i === items.length - 1 ? 'none' : '0.5px solid #f5f0e8',
            }}>
              {renderItem(it)}
              {onDelete && (
                <button onClick={() => onDelete(it)}
                  title="Excluir"
                  style={{
                    background: 'none', border: '0.5px solid var(--red)',
                    borderRadius: 6, padding: '4px 8px',
                    color: 'var(--red)', cursor: 'pointer',
                  }}>
                  <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true"></i>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function VerJsonModal({ item, dados, onClose }) {
  const pretty = JSON.stringify(dados, null, 2);
  async function copiar() {
    try { await navigator.clipboard.writeText(pretty); alert('Copiado!'); }
    catch (e) { alert('Não foi possível copiar.'); }
  }
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 600, maxWidth: '90vw', maxHeight: '85vh',
        border: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>JSON publicado</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={copiar}>
              <i className="ti ti-copy" aria-hidden="true"></i> Copiar
            </button>
            <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
        <pre style={{
          background: 'var(--bg2)', padding: 12, borderRadius: 8,
          fontSize: 12, lineHeight: 1.5, overflow: 'auto', flex: 1,
          fontFamily: 'monospace', color: 'var(--dark)',
        }}>{pretty}</pre>
      </div>
    </div>
  );
}


/* ============================================================
   E-BOOKS DA PACIENTE
   ============================================================ */
const EBOOK_TAGS = [
  { id: 'receitas',      label: 'Receitas'       },
  { id: 'guia',          label: 'Guia'           },
  { id: 'protocolo',     label: 'Protocolo'      },
  { id: 'suplementacao', label: 'Suplementação'  },
  { id: 'outro',         label: 'Outro'          },
];

function EbooksDaPaciente({ pacienteId, nutriId, pacienteNome }) {
  const [todos, setTodos] = useState([]);          // todos os ebooks da nutri
  const [atribuidosIds, setAtribuidosIds] = useState(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busca, setBusca] = useState('');

  async function carregar() {
    const [ebRes, atRes] = await Promise.all([
      supabase.from('ebooks').select('*').eq('nutri_id', nutriId).order('created_at', { ascending: false }),
      supabase.from('ebooks_pacientes').select('ebook_id').eq('paciente_id', pacienteId),
    ]);
    setTodos(ebRes.data ?? []);
    setAtribuidosIds(new Set((atRes.data ?? []).map(a => a.ebook_id)));
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  async function toggle(ebookId) {
    if (atribuidosIds.has(ebookId)) {
      await supabase.from('ebooks_pacientes').delete()
        .eq('ebook_id', ebookId).eq('paciente_id', pacienteId);
    } else {
      await supabase.from('ebooks_pacientes').insert({
        ebook_id: ebookId, paciente_id: pacienteId,
      });
    }
    carregar();
  }

  async function abrir(eb) {
    const { data, error } = await supabase.storage
      .from('ebooks').createSignedUrl(eb.storage_path, 120);
    if (error) return alert('Não foi possível abrir: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const atribuidos = todos.filter(e => atribuidosIds.has(e.id));
  const disponiveis = todos.filter(e => !atribuidosIds.has(e.id))
    .filter(e => {
      if (!busca.trim()) return true;
      const q = busca.trim().toLowerCase();
      return (e.titulo ?? '').toLowerCase().includes(q)
        || (e.descricao ?? '').toLowerCase().includes(q);
    });

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">E-books de {pacienteNome.split(' ')[0]}</div>
            <div className="card-sub">Marque os materiais da biblioteca que ela pode acessar, ou suba um novo direto</div>
          </div>
          <button className="btn" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-upload" aria-hidden="true"></i> Subir novo
          </button>
        </div>
        <div className="card-body">
          <div style={{
            fontSize: 10, letterSpacing: 1, color: 'var(--text3)',
            textTransform: 'uppercase', fontWeight: 500, marginBottom: 8,
          }}>
            Materiais atribuídos ({atribuidos.length})
          </div>
          {atribuidos.length === 0 ? (
            <div style={{
              padding: '12px 14px', borderRadius: 8, background: 'var(--bg2)',
              fontSize: 12, color: 'var(--text3)', marginBottom: 14,
            }}>
              Nenhum e-book atribuído ainda. Marque um da biblioteca abaixo ou suba um novo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {atribuidos.map(eb => (
                <div key={eb.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: 10, borderRadius: 8,
                  background: 'var(--green-bg, var(--bg2))',
                  border: '0.5px solid var(--green, var(--border))',
                }}>
                  <i className="ti ti-check" style={{ fontSize: 16, color: 'var(--green)' }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{eb.titulo}</div>
                    {eb.descricao && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{eb.descricao}</div>
                    )}
                  </div>
                  <button onClick={() => abrir(eb)} className="btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                  </button>
                  <button onClick={() => toggle(eb.id)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '4px 8px',
                      color: 'var(--red)', cursor: 'pointer',
                    }}
                    title="Remover acesso">
                    <i className="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Disponíveis na biblioteca */}
          <div style={{
            fontSize: 10, letterSpacing: 1, color: 'var(--text3)',
            textTransform: 'uppercase', fontWeight: 500, marginBottom: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Disponíveis na biblioteca ({todos.length - atribuidos.length})</span>
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar..."
              style={{ width: 180, padding: '4px 8px', fontSize: 11, margin: 0 }}
            />
          </div>
          {todos.length === 0 ? (
            <div style={{
              padding: '12px 14px', borderRadius: 8, background: 'var(--bg2)',
              fontSize: 12, color: 'var(--text3)',
            }}>
              Sua biblioteca está vazia. Suba o primeiro e-book pelo menu "Biblioteca" ou pelo botão acima.
            </div>
          ) : disponiveis.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0' }}>
              Nenhum e-book disponível com esses filtros.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {disponiveis.map(eb => {
                const tag = EBOOK_TAGS.find(t => t.id === (eb.tag ?? 'outro'));
                return (
                  <div key={eb.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: 10, borderRadius: 8,
                    background: 'var(--white)',
                    border: '0.5px solid var(--border)',
                  }}>
                    <i className="ti ti-file-text" style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true"></i>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{eb.titulo}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {tag?.label ?? 'Outro'}{eb.descricao && ` · ${eb.descricao.slice(0, 60)}${eb.descricao.length > 60 ? '...' : ''}`}
                      </div>
                    </div>
                    <button onClick={() => abrir(eb)} className="btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="ti ti-eye" aria-hidden="true"></i> Ver
                    </button>
                    <button onClick={() => toggle(eb.id)} className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="ti ti-plus" aria-hidden="true"></i> Atribuir
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {uploadOpen && (
        <ModalUploadEbookPaciente
          nutriId={nutriId} pacienteId={pacienteId}
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); carregar(); }}
        />
      )}
    </>
  );
}


function ModalUploadEbookPaciente({ nutriId, pacienteId, onClose, onSaved }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tag, setTag] = useState('guia');
  const [arquivo, setArquivo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione um arquivo PDF.');
    if (!titulo.trim()) return setErro('Informe um título.');
    setBusy(true);
    const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${nutriId}/${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ebooks')
      .upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) { setBusy(false); return setErro('Upload falhou: ' + upErr.message); }

    const { data: insData, error: insErr } = await supabase.from('ebooks').insert({
      nutri_id: nutriId,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tag, storage_path: path,
    }).select().single();
    if (insErr) {
      await supabase.storage.from('ebooks').remove([path]);
      setBusy(false);
      return setErro('Erro: ' + insErr.message);
    }
    // Já atribui à paciente atual
    await supabase.from('ebooks_pacientes').insert({
      ebook_id: insData.id, paciente_id: pacienteId,
    });
    setBusy(false);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 480, width: '100%', maxHeight: '90vh',
        overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Subir e-book pra essa paciente</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Vai pra biblioteca e já atribui automaticamente
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <label className="form-lbl">Arquivo (PDF)</label>
        <input type="file" accept="application/pdf" onChange={e => setArquivo(e.target.files?.[0] ?? null)}
          style={{ padding: 6 }} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {arquivo ? `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB` : 'Nenhum arquivo selecionado'}
        </div>

        <label className="form-lbl" style={{ marginTop: 12 }}>Título</label>
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Cardápio especial low-carb" />

        <label className="form-lbl" style={{ marginTop: 12 }}>Categoria</label>
        <select value={tag} onChange={e => setTag(e.target.value)}>
          {EBOOK_TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <label className="form-lbl" style={{ marginTop: 12 }}>Descrição (opcional)</label>
        <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 64 }} />

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo}>
            <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Subir e atribuir'}
          </button>
        </div>
      </div>
    </div>
  );
}
