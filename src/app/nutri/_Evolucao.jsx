import { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { formatarResposta, calcularPontuacaoSecoes, faixaResultado } from '../../lib/checkinDefault.js';
import { EXAMES_PARAMS, EXAMES_STATUS } from '../../lib/examesDefault.js';
import GraficoBarrasDuplas from '../../components/GraficoBarrasDuplas.jsx';

const TIPOS_FOTO = [
  { id: 'frente',          label: 'Frente' },
  { id: 'perfil_direito',  label: 'Perfil direito' },
  { id: 'perfil_esquerdo', label: 'Perfil esquerdo' },
  { id: 'costas',          label: 'Costas' },
  { id: 'livre',           label: 'Livre' },
];

// Ângulos que entram no comparativo "antes e depois" (fotos "livre" ficam de fora)
const ANGULOS_COMPARACAO = ['frente', 'costas', 'perfil_direito', 'perfil_esquerdo'];

// Campos de circunferência (cm) somados no card "Circunferências" do Modo Apresentação
const CIRCUNFERENCIAS_SOMA = ['cintura_cm', 'quadril_cm', 'braco_cm', 'coxa_cm', 'torax_cm', 'abdomen_cm', 'panturrilha_cm'];

const TIPOS_QUESTIONARIO = [
  { id: 'frequencia_alimentar',    label: 'Frequência alimentar' },
  { id: 'rastreamento_metabolico', label: 'Rastreamento metabólico' },
];

// Cache de signed URLs (5 min)
const urlCache = new Map();
async function signedUrl(path) {
  const cached = urlCache.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data } = await supabase.storage.from('fotos_evolucao').createSignedUrl(path, 300);
  if (!data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 280_000 });
  return data.signedUrl;
}

const urlCacheQuest = new Map();
async function signedUrlQuestionario(path) {
  const cached = urlCacheQuest.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data } = await supabase.storage.from('questionarios_evolucao').createSignedUrl(path, 300);
  if (!data) return null;
  urlCacheQuest.set(path, { url: data.signedUrl, exp: Date.now() + 280_000 });
  return data.signedUrl;
}

export default function Evolucao({ pacienteId, paciente, nutriId }) {
  const [carregando, setCarregando] = useState(true);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [checkins, setCheckins] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [prescricoes, setPrescricoes] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [apresentacao, setApresentacao] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [comparar, setComparar] = useState({});
  const [questionarios, setQuestionarios] = useState([]);
  const [qUrls, setQUrls] = useState({});
  const [uploadQuestOpen, setUploadQuestOpen] = useState(false);
  const [feedPratosCount, setFeedPratosCount] = useState(0);
  const [checkinsEnviados, setCheckinsEnviados] = useState(0);
  const [verCheckin, setVerCheckin] = useState(null);
  const [examesLab, setExamesLab] = useState([]);
  const [examesImagem, setExamesImagem] = useState([]);
  const [verExameLab, setVerExameLab] = useState(null);
  const [verExameImagem, setVerExameImagem] = useState(null);
  const [habitosRelatados, setHabitosRelatados] = useState([]);
  const [registrarHabito, setRegistrarHabito] = useState(null); // null = fechado, { item } = aberto (item pré-preenchido opcional)

  // Cleanup: quando pacienteId muda antes do fetch antigo terminar, o `active`
  // flag garante que resultados obsoletos não sobrescrevam o estado da paciente
  // nova (antes: dados da paciente A apareciam no perfil da B).
  useEffect(() => {
    let active = true;
    async function carregar() {
      const [avRes, ftRes, ckRes, plRes, prRes, csRes, ehRes, qeRes, fpRes, ceRes, elRes, eiRes] = await Promise.all([
        supabase.from('peso_registros').select('*').eq('paciente_id', pacienteId).order('data'),
        supabase.from('fotos_evolucao').select('*').eq('paciente_id', pacienteId).order('data_foto'),
        supabase.from('checkin_envios').select('id, perguntas, respostas, respondido_em, enviado_em, mostrar_pontuacao, faixas_resultado, metas_secao').eq('paciente_id', pacienteId).not('respondido_em', 'is', null).order('respondido_em'),
        supabase.from('planos').select('id, dados, publicado_em').eq('paciente_id', pacienteId).order('publicado_em'),
        supabase.from('prescricoes').select('id, tipo, titulo, created_at').eq('paciente_id', pacienteId).order('created_at'),
        supabase.from('consultas').select('id, tipo, data_hora, status').eq('paciente_id', pacienteId).order('data_hora'),
        supabase.from('evolucao_habitos').select('*').eq('paciente_id', pacienteId).order('data'),
        supabase.from('questionarios_evolucao').select('*').eq('paciente_id', pacienteId).order('data'),
        supabase.from('feed_pratos').select('id', { count: 'exact', head: true }).eq('paciente_id', pacienteId),
        supabase.from('checkin_envios').select('id', { count: 'exact', head: true }).eq('paciente_id', pacienteId),
        supabase.from('exames_registros').select('id, data, valores, obs, pdf_url').eq('paciente_id', pacienteId).order('data'),
        supabase.from('exames_imagem').select('id, data, titulo, texto, pdf_url').eq('paciente_id', pacienteId).order('data'),
      ]);
      if (!active) return;
      setAvaliacoes(avRes.data ?? []);
      setFotos(ftRes.data ?? []);
      setCheckins(ckRes.data ?? []);
      setPlanos(plRes.data ?? []);
      setPrescricoes(prRes.data ?? []);
      setConsultas(csRes.data ?? []);
      setHabitosRelatados(ehRes.data ?? []);
      setQuestionarios(qeRes.data ?? []);
      setFeedPratosCount(fpRes.count ?? 0);
      setCheckinsEnviados(ceRes.count ?? 0);
      setExamesLab(elRes.data ?? []);
      setExamesImagem(eiRes.data ?? []);

      // pré-fetch signed URLs
      const novasUrls = {};
      for (const f of ftRes.data ?? []) {
        if (!active) return;
        const u = await signedUrl(f.storage_path);
        if (u) novasUrls[f.id] = u;
      }
      if (!active) return;
      setUrls(novasUrls);

      const novasQUrls = {};
      for (const q of qeRes.data ?? []) {
        if (!active) return;
        const u = await signedUrlQuestionario(q.storage_path);
        if (u) novasQUrls[q.id] = u;
      }
      if (!active) return;
      setQUrls(novasQUrls);

      // por padrão, comparativo de cada ângulo = primeira foto vs última daquele ângulo
      const porTipo = {};
      for (const tipo of ANGULOS_COMPARACAO) {
        const doTipo = (ftRes.data ?? []).filter(f => f.tipo === tipo);
        if (doTipo.length >= 2) {
          porTipo[tipo] = { a: doTipo[0].id, b: doTipo[doTipo.length - 1].id };
        } else if (doTipo.length === 1) {
          porTipo[tipo] = { a: doTipo[0].id, b: null };
        }
      }
      setComparar(porTipo);

      setCarregando(false);
    }
    carregar();
    return () => { active = false; };
  }, [pacienteId]);

  // Wrapper pra manter compat com handlers que chamam carregar() explicitamente.
  async function carregar() {
    const [avRes, ftRes, ckRes, plRes, prRes, csRes, ehRes, qeRes, fpRes, ceRes, elRes, eiRes] = await Promise.all([
      supabase.from('peso_registros').select('*').eq('paciente_id', pacienteId).order('data'),
      supabase.from('fotos_evolucao').select('*').eq('paciente_id', pacienteId).order('data_foto'),
      supabase.from('checkin_envios').select('id, perguntas, respostas, respondido_em, enviado_em, mostrar_pontuacao, faixas_resultado, metas_secao').eq('paciente_id', pacienteId).not('respondido_em', 'is', null).order('respondido_em'),
      supabase.from('planos').select('id, dados, publicado_em').eq('paciente_id', pacienteId).order('publicado_em'),
      supabase.from('prescricoes').select('id, tipo, titulo, created_at').eq('paciente_id', pacienteId).order('created_at'),
      supabase.from('consultas').select('id, tipo, data_hora, status').eq('paciente_id', pacienteId).order('data_hora'),
      supabase.from('evolucao_habitos').select('*').eq('paciente_id', pacienteId).order('data'),
      supabase.from('questionarios_evolucao').select('*').eq('paciente_id', pacienteId).order('data'),
      supabase.from('feed_pratos').select('id', { count: 'exact', head: true }).eq('paciente_id', pacienteId),
      supabase.from('checkin_envios').select('id', { count: 'exact', head: true }).eq('paciente_id', pacienteId),
      supabase.from('exames_registros').select('id, data, valores, obs, pdf_url').eq('paciente_id', pacienteId).order('data'),
      supabase.from('exames_imagem').select('id, data, titulo, texto, pdf_url').eq('paciente_id', pacienteId).order('data'),
    ]);
    setAvaliacoes(avRes.data ?? []);
    setFotos(ftRes.data ?? []);
    setCheckins(ckRes.data ?? []);
    setPlanos(plRes.data ?? []);
    setPrescricoes(prRes.data ?? []);
    setConsultas(csRes.data ?? []);
    setHabitosRelatados(ehRes.data ?? []);
    setQuestionarios(qeRes.data ?? []);
    setFeedPratosCount(fpRes.count ?? 0);
    setCheckinsEnviados(ceRes.count ?? 0);
    setExamesLab(elRes.data ?? []);
    setExamesImagem(eiRes.data ?? []);

    const novasUrls = {};
    for (const f of ftRes.data ?? []) {
      const u = await signedUrl(f.storage_path);
      if (u) novasUrls[f.id] = u;
    }
    setUrls(novasUrls);

    const novasQUrls = {};
    for (const q of qeRes.data ?? []) {
      const u = await signedUrlQuestionario(q.storage_path);
      if (u) novasQUrls[q.id] = u;
    }
    setQUrls(novasQUrls);

    setCarregando(false);
  }

  async function excluirHabitoRelatado(h) {
    if (!window.confirm(`Excluir esse relato de "${h.item}"?`)) return;
    await supabase.from('evolucao_habitos').delete().eq('id', h.id);
    carregar();
  }

  // Abre a tela grande do evento clicado na timeline — cada tipo de exame
  // vem com o registro ANTERIOR (mesmo tipo) pra comparação, quando existir.
  function abrirEvento(ev) {
    if (ev.checkinId) return setVerCheckin(ev.checkin);
    if (ev.exameLabId) {
      const idx = examesLab.findIndex(e => e.id === ev.exameLabId);
      if (idx === -1) return;
      return setVerExameLab({ registro: examesLab[idx], anterior: examesLab[idx - 1] ?? null });
    }
    if (ev.exameImagemId) {
      const idx = examesImagem.findIndex(e => e.id === ev.exameImagemId);
      if (idx === -1) return;
      return setVerExameImagem({ registro: examesImagem[idx], anterior: examesImagem[idx - 1] ?? null });
    }
  }

  // Agrupa os relatos por item (nome normalizado — trim + minúsculo evita
  // duplicar "Intestino" e "intestino " como cards diferentes), mantendo o
  // rótulo original do primeiro relato de cada grupo pra exibir.
  const gruposHabitos = useMemo(() => {
    const mapa = new Map();
    for (const h of habitosRelatados) {
      const chave = h.item.trim().toLowerCase();
      if (!mapa.has(chave)) mapa.set(chave, { item: h.item.trim(), relatos: [] });
      mapa.get(chave).relatos.push(h);
    }
    for (const g of mapa.values()) g.relatos.sort((a, b) => a.data.localeCompare(b.data));
    return [...mapa.values()].sort((a, b) => a.item.localeCompare(b.item));
  }, [habitosRelatados]);

  const itensExistentes = useMemo(
    () => [...new Set(habitosRelatados.map(h => h.item.trim()))].sort(),
    [habitosRelatados],
  );

  // Questionários agrupados por tipo, ordenados por data — usado tanto na
  // listagem normal quanto no comparativo primeiro x último do Modo Apresentação
  const questionariosPorTipo = useMemo(() => {
    return TIPOS_QUESTIONARIO.map(t => ({
      ...t,
      itens: questionarios.filter(q => q.tipo === t.id).sort((a, b) => a.data.localeCompare(b.data)),
    })).filter(g => g.itens.length > 0);
  }, [questionarios]);

  async function excluirFoto(foto) {
    if (!window.confirm(`Excluir foto de ${dataBR(foto.data_foto)}? Esta ação não pode ser desfeita.`)) return;
    await supabase.storage.from('fotos_evolucao').remove([foto.storage_path]);
    await supabase.from('fotos_evolucao').delete().eq('id', foto.id);
    // se a foto excluída estava em algum comparativo, limpa só aquele lado
    setComparar(c => {
      const next = { ...c };
      for (const tipo of Object.keys(next)) {
        const par = next[tipo];
        if (par && (par.a === foto.id || par.b === foto.id)) {
          next[tipo] = {
            a: par.a === foto.id ? null : par.a,
            b: par.b === foto.id ? null : par.b,
          };
        }
      }
      return next;
    });
    carregar();
  }

  async function excluirQuestionario(q) {
    if (!window.confirm(`Excluir esse print de ${dataBR(q.data)}? Esta ação não pode ser desfeita.`)) return;
    await supabase.storage.from('questionarios_evolucao').remove([q.storage_path]);
    await supabase.from('questionarios_evolucao').delete().eq('id', q.id);
    carregar();
  }

  // ESC pra sair do modo apresentação
  useEffect(() => {
    if (!apresentacao) return;
    const onKey = (e) => { if (e.key === 'Escape') setApresentacao(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apresentacao]);

  // ─── Highlights ───
  const primeira = avaliacoes[0];
  const ultima   = avaliacoes[avaliacoes.length - 1];
  const totalDias = primeira && ultima
    ? Math.round((new Date(ultima.data) - new Date(primeira.data)) / 86_400_000)
    : 0;

  const delta = (campo) => {
    if (!primeira || !ultima || primeira.id === ultima.id) return null;
    const a = Number(primeira[campo] ?? 0);
    const b = Number(ultima[campo] ?? 0);
    if (!a || !b) return null;
    return { de: a, para: b, dif: b - a };
  };

  const deltaPeso = delta('kg');
  const deltaPgc = delta('pgc');
  const deltaMassaMagra = delta('mm_kg');
  const deltaAguaCorporal = delta('agua_corporal');
  const deltaGorduraVisceral = delta('gordura_visceral');

  // Soma da perda (primeira - última) de todas as circunferências que tiverem
  // as duas medições — cada campo ausente é simplesmente ignorado na soma.
  const somaCircunferencias = (() => {
    if (!primeira || !ultima || primeira.id === ultima.id) return null;
    let soma = 0, count = 0;
    for (const campo of CIRCUNFERENCIAS_SOMA) {
      const a = Number(primeira[campo]);
      const b = Number(ultima[campo]);
      if (!a || !b) continue;
      soma += a - b;
      count++;
    }
    return count > 0 ? soma : null;
  })();

  // ─── Timeline consolidada ───
  const eventos = useMemo(() => {
    const lst = [];
    for (const a of avaliacoes) {
      lst.push({
        data: new Date(a.data + 'T12:00:00').toISOString(),
        tipo: 'avaliacao', icon: 'scale', cor: '#1a5a8c',
        titulo: 'Avaliação antropométrica',
        desc: [
          a.kg && `${Number(a.kg).toFixed(1).replace('.', ',')} kg`,
          a.cintura_cm && `cintura ${a.cintura_cm}cm`,
          a.pgc && `${a.pgc}% gordura`,
        ].filter(Boolean).join(' · ') || 'Registrada',
      });
    }
    for (const f of fotos) {
      lst.push({
        data: new Date(f.data_foto + 'T12:00:00').toISOString(),
        tipo: 'foto', icon: 'camera', cor: 'var(--gold-deep, #a08456)',
        titulo: `Foto · ${TIPOS_FOTO.find(t => t.id === f.tipo)?.label ?? f.tipo}`,
        desc: f.obs ?? 'Foto de evolução enviada',
        fotoId: f.id,
      });
    }
    for (const c of checkins) {
      lst.push({
        data: c.respondido_em,
        tipo: 'checkin', icon: 'clipboard-check', cor: 'var(--green)',
        titulo: 'Check-in respondido',
        desc: `${c.perguntas?.length ?? 0} perguntas`,
        checkinId: c.id,
        checkin: c,
      });
    }
    for (const p of planos) {
      lst.push({
        data: p.publicado_em,
        tipo: 'plano', icon: 'salad', cor: 'var(--amber)',
        titulo: 'Plano alimentar publicado',
        desc: `${p.dados?.macros?.kcal ?? '—'} kcal · ${p.dados?.refeicoes?.length ?? 0} refeições`,
      });
    }
    for (const p of prescricoes) {
      lst.push({
        data: p.created_at,
        tipo: 'prescricao', icon: 'file-text', cor: 'var(--blue)',
        titulo: `Prescrição · ${p.tipo}`,
        desc: p.titulo,
      });
    }
    for (const c of consultas.filter(c => c.status === 'realizada')) {
      lst.push({
        data: c.data_hora,
        tipo: 'consulta', icon: 'calendar-check', cor: 'var(--green)',
        titulo: 'Consulta realizada',
        desc: `Tipo: ${c.tipo}`,
      });
    }
    for (const e of examesLab) {
      const n = Object.keys(e.valores ?? {}).length;
      lst.push({
        data: new Date(e.data + 'T12:00:00').toISOString(),
        tipo: 'exame_lab', icon: 'flask', cor: 'var(--blue, #2563a8)',
        titulo: 'Exames laboratoriais',
        desc: n > 0 ? `${n} parâmetro${n === 1 ? '' : 's'} preenchido${n === 1 ? '' : 's'}` : 'PDF anexado',
        exameLabId: e.id,
      });
    }
    for (const e of examesImagem) {
      lst.push({
        data: new Date(e.data + 'T12:00:00').toISOString(),
        tipo: 'exame_imagem', icon: 'radioactive', cor: 'var(--blue, #2563a8)',
        titulo: `Exame de imagem · ${e.titulo}`,
        desc: e.texto ?? 'Laudo anexado',
        exameImagemId: e.id,
      });
    }
    return lst.sort((a, b) => b.data.localeCompare(a.data));  // mais recente primeiro
  }, [avaliacoes, fotos, checkins, planos, prescricoes, consultas, examesLab, examesImagem]);

  // ─── Renders auxiliares ───
  function HighlightCard({ titulo, atual, delta, unidade, melhorMenor = true }) {
    if (!atual) {
      return (
        <div className="stat-card" style={{ opacity: .5 }}>
          <div className="stat-label">{titulo}</div>
          <div className="stat-val">—</div>
          <div className="stat-sub">sem registro</div>
        </div>
      );
    }
    let corDelta = 'var(--text3)';
    let setaDelta = '';
    if (delta) {
      const desejado = melhorMenor ? delta.dif < 0 : delta.dif > 0;
      corDelta = desejado ? 'var(--green)' : (delta.dif === 0 ? 'var(--text3)' : 'var(--red)');
      setaDelta = delta.dif > 0 ? '↑' : delta.dif < 0 ? '↓' : '—';
    }
    return (
      <div className="stat-card">
        <div className="stat-label">{titulo}</div>
        <div className="stat-val">{Number(atual).toFixed(1).replace('.', ',')}{unidade && <span style={{ fontSize: 14, color: 'var(--text3)', marginLeft: 3 }}>{unidade}</span>}</div>
        <div className="stat-sub" style={{ color: corDelta, fontWeight: 500 }}>
          {delta
            ? <>{setaDelta} {Math.abs(delta.dif).toFixed(1).replace('.', ',')}{unidade} vs início</>
            : 'só uma avaliação'}
        </div>
      </div>
    );
  }

  if (carregando) {
    return <div className="card empty-card"><div className="empty-sub">Carregando linha do tempo…</div></div>;
  }

  if (eventos.length === 0) {
    return (
      <div className="card empty-card">
        <i className="ti ti-history empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Sem registros de evolução ainda</div>
        <div className="empty-sub">
          Conforme você registrar avaliações antropométricas, enviar fotos e a paciente responder check-ins,
          tudo vai aparecer aqui em ordem cronológica.
        </div>
      </div>
    );
  }

  // comparativos prontos, um por ângulo (só entram os que têm pelo menos uma foto escolhida)
  const comparativos = ANGULOS_COMPARACAO
    .map(tipo => {
      const par = comparar[tipo];
      if (!par) return null;
      const fotoA = fotos.find(f => f.id === par.a);
      const fotoB = fotos.find(f => f.id === par.b);
      if (!fotoA && !fotoB) return null;
      return { tipo, label: TIPOS_FOTO.find(t => t.id === tipo)?.label ?? tipo, fotoA, fotoB };
    })
    .filter(Boolean);

  // ─── Modo apresentação ───
  if (apresentacao) {
    return (
      <ModoApresentacao
        paciente={paciente}
        avaliacoes={avaliacoes}
        deltaPeso={deltaPeso}
        deltaMassaMagra={deltaMassaMagra}
        deltaAguaCorporal={deltaAguaCorporal}
        deltaGorduraVisceral={deltaGorduraVisceral}
        deltaPgc={deltaPgc}
        somaCircunferencias={somaCircunferencias}
        totalDias={totalDias}
        comparativos={comparativos}
        urls={urls}
        questionariosPorTipo={questionariosPorTipo}
        qUrls={qUrls}
        feedPratosCount={feedPratosCount}
        checkinsRespondidos={checkins.length}
        checkinsEnviados={checkinsEnviados}
        examesLab={examesLab}
        examesImagem={examesImagem}
        gruposHabitos={gruposHabitos}
        onClose={() => setApresentacao(false)}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {totalDias > 0 && <>Acompanhamento de <strong style={{ color: 'var(--dark)' }}>{totalDias} dia{totalDias === 1 ? '' : 's'}</strong> · </>}
          {eventos.length} evento{eventos.length === 1 ? '' : 's'} no histórico
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-camera-plus" aria-hidden="true"></i> Adicionar foto
          </button>
          <button className="btn" onClick={() => setApresentacao(true)}>
            <i className="ti ti-presentation" aria-hidden="true"></i> Modo apresentação
          </button>
        </div>
      </div>

      {/* Highlights */}
      <div className="stats-grid">
        <HighlightCard titulo="Peso atual"      atual={ultima?.kg}         delta={deltaPeso}     unidade=" kg" />
        <HighlightCard titulo="% gordura atual" atual={ultima?.pgc}        delta={deltaPgc}      unidade="%" />
        <div className="stat-card">
          <div className="stat-label">Circunferências totais</div>
          <div className="stat-val">
            {somaCircunferencias != null
              ? `${somaCircunferencias > 0 ? '−' : somaCircunferencias < 0 ? '+' : ''}${Math.abs(somaCircunferencias).toFixed(1).replace('.', ',')} cm`
              : '—'}
          </div>
          <div className="stat-sub">
            {somaCircunferencias != null
              ? (somaCircunferencias >= 0 ? 'reduzidos desde o início' : 'a mais desde o início')
              : 'sem medidas suficientes'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Adesão check-ins</div>
          <div className="stat-val">{checkins.length}/{checkinsEnviados}</div>
          <div className="stat-sub">respondidos de enviados</div>
        </div>
      </div>

      {/* Comparativo de fotos */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Comparativo · antes e depois</div>
        {fotos.length >= 2 && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            Escolha quais comparar nos seletores
          </span>
        )}
      </div>
      {fotos.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-camera empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem fotos ainda</div>
          <div className="empty-sub">Adicione a primeira foto pra começar o histórico visual.</div>
          <button className="btn" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-camera-plus" aria-hidden="true"></i> Adicionar foto
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          {ANGULOS_COMPARACAO.filter(tipo => fotos.some(f => f.tipo === tipo)).map(tipo => {
            const fotosDoTipo = fotos.filter(f => f.tipo === tipo);
            const par = comparar[tipo] ?? { a: null, b: null };
            const fotoA = fotosDoTipo.find(f => f.id === par.a);
            const fotoB = fotosDoTipo.find(f => f.id === par.b);
            return (
              <div key={tipo} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', marginBottom: 10 }}>
                  {TIPOS_FOTO.find(t => t.id === tipo)?.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { key: 'a', foto: fotoA, label: 'Antes' },
                    { key: 'b', foto: fotoB, label: 'Depois' },
                  ].map(({ key, foto, label }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontWeight: 500, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                        {label}
                      </div>
                      <select value={par[key] ?? ''}
                        onChange={e => setComparar(c => ({ ...c, [tipo]: { ...(c[tipo] ?? { a: null, b: null }), [key]: e.target.value || null } }))}
                        style={{ marginBottom: 8 }}>
                        <option value="">— Selecionar —</option>
                        {fotosDoTipo.map(f => (
                          <option key={f.id} value={f.id}>{dataBR(f.data_foto)}</option>
                        ))}
                      </select>
                      <div style={{
                        background: 'var(--bg2)', borderRadius: 8,
                        aspectRatio: '3/4', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', position: 'relative',
                      }}>
                        {foto && urls[foto.id] ? (
                          <img src={urls[foto.id]} alt={label}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <i className="ti ti-photo" style={{ fontSize: 36, color: 'var(--text3)' }} aria-hidden="true"></i>
                        )}
                        {foto && (
                          <button
                            onClick={() => excluirFoto(foto)}
                            title="Excluir foto"
                            style={{
                              position: 'absolute', top: 8, right: 8,
                              width: 30, height: 30, borderRadius: '50%',
                              background: 'rgba(0,0,0,.7)', color: 'white',
                              border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 14, padding: 0,
                            }}>
                            <i className="ti ti-trash" aria-hidden="true"></i>
                          </button>
                        )}
                      </div>
                      {foto && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
                          {dataBR(foto.data_foto)}
                          {foto.obs && <> · <em>"{foto.obs}"</em></>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Mini galeria de todas as fotos */}
          {fotos.length > 0 && (
            <>
              <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginTop: 16, marginBottom: 8, fontWeight: 500 }}>
                Todas as fotos ({fotos.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                {fotos.map(f => {
                  const jaEscolhida = ANGULOS_COMPARACAO.some(tipo => {
                    const par = comparar[tipo];
                    return par && (par.a === f.id || par.b === f.id);
                  });
                  return (
                  <div key={f.id}
                    onClick={() => {
                      // ignora fotos "livre" (não entram no comparativo) e as já escolhidas
                      if (!ANGULOS_COMPARACAO.includes(f.tipo) || jaEscolhida) return;
                      // substitui o "Depois" do ângulo dessa foto
                      setComparar(c => ({ ...c, [f.tipo]: { ...(c[f.tipo] ?? { a: null, b: null }), b: f.id } }));
                    }}
                    style={{
                      aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                      background: 'var(--bg2)', cursor: ANGULOS_COMPARACAO.includes(f.tipo) ? 'pointer' : 'default',
                      position: 'relative',
                      outline: jaEscolhida ? '2px solid var(--amber)' : 'none',
                    }}>
                    {urls[f.id] && (
                      <img src={urls[f.id]} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); excluirFoto(f); }}
                      title="Excluir foto"
                      style={{
                        position: 'absolute', top: 3, right: 3,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'rgba(0,0,0,.65)', color: 'white',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, padding: 0,
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,.55)', color: 'white',
                      fontSize: 8, padding: '2px 4px', textAlign: 'center',
                    }}>
                      {dataBR(f.data_foto)}
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Questionários (frequência alimentar / rastreamento metabólico) */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Questionários</div>
        <button className="btn-outline" onClick={() => setUploadQuestOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true"></i> Anexar print
        </button>
      </div>
      {questionariosPorTipo.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-clipboard-text empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhum print anexado ainda</div>
          <div className="empty-sub">
            Anexe o print do resultado de frequência alimentar ou rastreamento metabólico (ex: webdiet) a cada
            consulta — o primeiro x último de cada tipo aparece comparado no Modo apresentação.
          </div>
          <button className="btn" onClick={() => setUploadQuestOpen(true)}>
            <i className="ti ti-plus" aria-hidden="true"></i> Anexar primeiro print
          </button>
        </div>
      ) : (
        questionariosPorTipo.map(g => (
          <div key={g.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)', marginBottom: 10 }}>{g.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {g.itens.map(q => (
                <div key={q.id} style={{ position: 'relative' }}>
                  <div style={{
                    aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden',
                    background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {qUrls[q.id] ? (
                      <img src={qUrls[q.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <i className="ti ti-photo" style={{ fontSize: 28, color: 'var(--text3)' }} aria-hidden="true"></i>
                    )}
                    <button
                      onClick={() => excluirQuestionario(q)}
                      title="Excluir"
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'rgba(0,0,0,.65)', color: 'white',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, padding: 0,
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, textAlign: 'center' }}>
                    {dataBR(q.data)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Hábitos e sintomas relatados */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Hábitos e sintomas relatados</div>
        <button className="btn-outline" onClick={() => setRegistrarHabito({ item: '' })}>
          <i className="ti ti-plus" aria-hidden="true"></i> Registrar relato
        </button>
      </div>
      {gruposHabitos.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-message-2 empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nada registrado ainda</div>
          <div className="empty-sub">
            Anote o que a paciente for relatando a cada consulta (ex: intestino, inchaço, sono) — o histórico
            de cada item fica agrupado aqui e aparece no Modo apresentação.
          </div>
          <button className="btn" onClick={() => setRegistrarHabito({ item: '' })}>
            <i className="ti ti-plus" aria-hidden="true"></i> Registrar primeiro relato
          </button>
        </div>
      ) : (
        gruposHabitos.map(g => (
          <div key={g.item} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dark)' }}>{g.item}</div>
              <button className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setRegistrarHabito({ item: g.item })}>
                <i className="ti ti-plus" aria-hidden="true"></i> Novo relato
              </button>
            </div>
            {g.relatos.map(h => (
              <div key={h.id} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '8px 0', borderTop: '0.5px solid #f5f0e8',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, width: 76 }}>
                  {dataBR(h.data)}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>{h.nota}</div>
                <button onClick={() => excluirHabitoRelatado(h)} title="Excluir"
                  style={{
                    background: 'none', border: '0.5px solid var(--red)',
                    borderRadius: 6, padding: '3px 7px', color: 'var(--red)', cursor: 'pointer', flexShrink: 0,
                  }}>
                  <i className="ti ti-trash" style={{ fontSize: 12 }} aria-hidden="true"></i>
                </button>
              </div>
            ))}
          </div>
        ))
      )}

      {/* Timeline */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Linha do tempo</div>
        <span className="card-sub">mais recente primeiro</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 28, marginTop: 8 }}>
        {/* Linha vertical */}
        <div style={{
          position: 'absolute', left: 11, top: 0, bottom: 0,
          width: 2, background: 'var(--border)',
        }} />
        {eventos.map((ev, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            {/* Ponto */}
            <div style={{
              position: 'absolute', left: -22, top: 14,
              width: 16, height: 16, borderRadius: '50%',
              background: ev.cor,
              border: '2px solid var(--white)',
              boxShadow: '0 0 0 1px var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className={`ti ti-${ev.icon}`} style={{ fontSize: 9, color: 'var(--white)' }} aria-hidden="true"></i>
            </div>
            {/* Card do evento */}
            <div
              className="card"
              style={{
                padding: '12px 14px', marginBottom: 0,
                cursor: (ev.checkinId || ev.exameLabId || ev.exameImagemId) ? 'pointer' : 'default',
              }}
              onClick={() => abrirEvento(ev)}>
              <div style={{
                fontSize: 10, color: ev.cor, letterSpacing: '.5px',
                textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
              }}>
                {dataBR(ev.data)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>{ev.titulo}</div>
              {ev.desc && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{ev.desc}</div>
              )}
              {ev.checkinId && (
                <div style={{ fontSize: 10, color: 'var(--gold-deep, #a08456)', marginTop: 4 }}>
                  toque para ver respostas →
                </div>
              )}
              {(ev.exameLabId || ev.exameImagemId) && (
                <div style={{ fontSize: 10, color: 'var(--gold-deep, #a08456)', marginTop: 4 }}>
                  toque para ver em tela grande →
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {registrarHabito && (
        <ModalRegistrarHabito
          pacienteId={pacienteId}
          nutriId={nutriId}
          itemInicial={registrarHabito.item}
          itensExistentes={itensExistentes}
          onClose={() => setRegistrarHabito(null)}
          onSaved={async () => { setRegistrarHabito(null); await carregar(); }}
        />
      )}

      {uploadOpen && (
        <UploadFoto
          pacienteId={pacienteId}
          nutriId={nutriId}
          onClose={() => setUploadOpen(false)}
          onSaved={async () => { setUploadOpen(false); await carregar(); }}
        />
      )}

      {uploadQuestOpen && (
        <UploadQuestionario
          pacienteId={pacienteId}
          nutriId={nutriId}
          onClose={() => setUploadQuestOpen(false)}
          onSaved={async () => { setUploadQuestOpen(false); await carregar(); }}
        />
      )}

      {verCheckin && (
        <VerCheckinModal envio={verCheckin} onClose={() => setVerCheckin(null)} />
      )}

      {verExameLab && (
        <VerExameLabModal registro={verExameLab.registro} anterior={verExameLab.anterior}
          onClose={() => setVerExameLab(null)} />
      )}

      {verExameImagem && (
        <VerExameImagemModal registro={verExameImagem.registro} anterior={verExameImagem.anterior}
          onClose={() => setVerExameImagem(null)} />
      )}
    </>
  );
}

/* ============================================================
   UPLOAD DE FOTO
   ============================================================ */
function UploadFoto({ pacienteId, nutriId, onClose, onSaved }) {
  const [tipo, setTipo] = useState('frente');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rot, setRot] = useState(0);        // 0/90/180/270
  const [flip, setFlip] = useState(false);  // espelhamento horizontal
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  function escolherArquivo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    setPreview(URL.createObjectURL(f));
    setRot(0);
    setFlip(false);
  }

  // Aplica rotação + flip no arquivo via canvas. Retorna um Blob.
  async function transformarArquivo() {
    if (rot === 0 && !flip) return arquivo;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const swap = rot === 90 || rot === 270;
        const w = swap ? img.height : img.width;
        const h = swap ? img.width  : img.height;
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.translate(w / 2, h / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas falhou')),
          arquivo.type || 'image/jpeg', 0.92);
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione uma foto.');
    setBusy(true);
    let blob;
    try {
      blob = await transformarArquivo();
    } catch (e) {
      setBusy(false);
      return setErro('Erro ao processar: ' + e.message);
    }
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${pacienteId}/${Date.now()}-${tipo}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('fotos_evolucao').upload(path, blob, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }
    const { error: insErr } = await supabase.from('fotos_evolucao').insert({
      paciente_id: pacienteId,
      nutri_id: nutriId,
      storage_path: path,
      tipo, data_foto: data,
      obs: obs.trim() || null,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('fotos_evolucao').remove([path]);
      return setErro('Erro: ' + insErr.message);
    }
    onSaved();
  }

  const swap = rot === 90 || rot === 270;
  const transform = `${flip ? 'scaleX(-1) ' : ''}rotate(${rot}deg)`;

  return (
    <ModalShell title="Adicionar foto de evolução"
      subtitle="A foto fica privada — só você e a paciente veem"
      onClose={onClose}>
      <label className="form-lbl">Foto</label>
      <input type="file" accept="image/*" capture="environment" onChange={escolherArquivo}
        style={{ padding: 6 }} />
      {preview && (
        <>
          <div style={{
            marginTop: 8, borderRadius: 8, overflow: 'hidden',
            background: '#000',
            height: 320,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={preview} alt="prévia"
              style={{
                maxWidth: swap ? '320px' : '100%',
                maxHeight: swap ? '100%' : '320px',
                objectFit: 'contain',
                transform,
                transition: 'transform .18s ease',
              }} />
          </div>
          <div style={{
            display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            <button type="button" className="btn-outline"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setRot(r => (r + 270) % 360)}>
              <i className="ti ti-rotate-2" aria-hidden="true"></i> Girar esquerda
            </button>
            <button type="button" className="btn-outline"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setRot(r => (r + 90) % 360)}>
              <i className="ti ti-rotate-clockwise-2" aria-hidden="true"></i> Girar direita
            </button>
            <button type="button" className="btn-outline"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setFlip(f => !f)}>
              <i className="ti ti-flip-horizontal" aria-hidden="true"></i> Espelhar
            </button>
            {(rot !== 0 || flip) && (
              <button type="button" className="btn-outline"
                style={{ fontSize: 11, padding: '4px 10px', color: 'var(--text3)' }}
                onClick={() => { setRot(0); setFlip(false); }}>
                <i className="ti ti-refresh" aria-hidden="true"></i> Resetar
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-lbl">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS_FOTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-lbl">Data da foto</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <label className="form-lbl">Observação (opcional)</label>
      <input value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: 30 dias de acompanhamento" />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Salvar foto'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   UPLOAD DE PRINT DE QUESTIONÁRIO (frequência alimentar / rastreamento)
   ============================================================ */
function UploadQuestionario({ pacienteId, nutriId, onClose, onSaved }) {
  const [tipo, setTipo] = useState(TIPOS_QUESTIONARIO[0].id);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  function escolherArquivo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    setPreview(URL.createObjectURL(f));
  }

  // Cola direto da área de transferência (print copiado, ex: Cmd+Shift+4 no Mac) —
  // evita ter que salvar o print como arquivo antes de anexar.
  useEffect(() => {
    function onPaste(e) {
      const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
      if (!item) return;
      const f = item.getAsFile();
      if (!f) return;
      e.preventDefault();
      setArquivo(f);
      setPreview(URL.createObjectURL(f));
      setErro(null);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione ou cole (Ctrl+V) a imagem do print.');
    setBusy(true);
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${pacienteId}/${Date.now()}-${tipo}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('questionarios_evolucao').upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }
    const { error: insErr } = await supabase.from('questionarios_evolucao').insert({
      paciente_id: pacienteId,
      nutri_id: nutriId,
      storage_path: path,
      tipo, data,
      obs: obs.trim() || null,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('questionarios_evolucao').remove([path]);
      return setErro('Erro: ' + insErr.message);
    }
    onSaved();
  }

  return (
    <ModalShell title="Anexar print de questionário"
      subtitle="Print do resultado (ex: webdiet) — fica privado, só você e a paciente veem"
      onClose={onClose}>
      <label className="form-lbl">Imagem do print</label>
      <input type="file" accept="image/*" onChange={escolherArquivo} style={{ padding: 6 }} />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        ou copie o print e cole aqui com Ctrl+V (Cmd+V no Mac) — sem precisar salvar o arquivo antes
      </div>
      {preview && (
        <div style={{
          marginTop: 8, borderRadius: 8, overflow: 'hidden',
          background: '#000', height: 240,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={preview} alt="prévia" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-lbl">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS_QUESTIONARIO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-lbl">Data</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <label className="form-lbl">Observação (opcional)</label>
      <input value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: 1ª consulta" />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Salvar print'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   REGISTRAR RELATO DE HÁBITO/SINTOMA
   ============================================================ */
function ModalRegistrarHabito({ pacienteId, nutriId, itemInicial, itensExistentes, onClose, onSaved }) {
  const [item, setItem] = useState(itemInicial ?? '');
  const [nota, setNota] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!item.trim()) return setErro('Informe o item (ex: Intestino, Sono, Inchaço).');
    if (!nota.trim()) return setErro('Escreva o que a paciente relatou.');
    setBusy(true);
    const { error } = await supabase.from('evolucao_habitos').insert({
      paciente_id: pacienteId,
      nutri_id: nutriId,
      item: item.trim(),
      nota: nota.trim(),
      data,
    });
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    onSaved();
  }

  return (
    <ModalShell title="Registrar relato"
      subtitle="Anotação sua — não aparece no app da paciente"
      onClose={onClose}>
      <label className="form-lbl" style={{ marginTop: 0 }}>Item</label>
      <input value={item} onChange={e => setItem(e.target.value)}
        placeholder="Ex: Intestino, Sono, Inchaço abdominal"
        list="itens-habitos-existentes" />
      {itensExistentes.length > 0 && (
        <datalist id="itens-habitos-existentes">
          {itensExistentes.map(i => <option key={i} value={i} />)}
        </datalist>
      )}

      <label className="form-lbl">Data</label>
      <input type="date" value={data} onChange={e => setData(e.target.value)} />

      <label className="form-lbl">O que ela relatou</label>
      <textarea rows={4} value={nota} onChange={e => setNota(e.target.value)}
        placeholder="Ex: Intestino funcionando 3x por semana, sem mais inchaço depois das refeições" />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Salvar relato'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   MODO APRESENTAÇÃO (fullscreen pra consulta)
   ============================================================ */
function ModoApresentacao({ paciente, avaliacoes, deltaPeso, deltaMassaMagra, deltaPgc, deltaAguaCorporal, deltaGorduraVisceral, somaCircunferencias, totalDias, comparativos, urls, questionariosPorTipo, qUrls, feedPratosCount, checkinsRespondidos, checkinsEnviados, examesLab, examesImagem, gruposHabitos, onClose }) {
  const primeira = avaliacoes[0];
  const ultima   = avaliacoes[avaliacoes.length - 1];
  const questionariosComparaveis = questionariosPorTipo.filter(g => g.itens.length >= 2);

  // Exames laboratoriais que mudaram entre o primeiro e o último registro —
  // só os parâmetros que a nutri realmente preencheu (ignora os ~70 vazios).
  const primeiroExameLab = examesLab[0];
  const ultimoExameLab = examesLab[examesLab.length - 1];
  const examesLabComparaveis = (primeiroExameLab && ultimoExameLab && primeiroExameLab.id !== ultimoExameLab.id)
    ? EXAMES_PARAMS
      .filter(p => primeiroExameLab.valores?.[p.key]?.valor != null && ultimoExameLab.valores?.[p.key]?.valor != null)
      .map(p => {
        const de = primeiroExameLab.valores[p.key];
        const para = ultimoExameLab.valores[p.key];
        const cor = EXAMES_STATUS.find(s => s.id === para.status);
        return { ...p, de: de.valor, para: para.valor, delta: deltaExame(para.valor, de.valor), cor };
      })
    : [];

  // Exame de imagem mais antigo x mais recente (só se houver pelo menos 2)
  const examesImagemComparaveis = examesImagem.length >= 2
    ? { primeiro: examesImagem[0], ultimo: examesImagem[examesImagem.length - 1] }
    : null;
  const conteudoRef = useRef(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  async function gerarPdf() {
    if (!conteudoRef.current) return;
    setGerandoPdf(true);
    try {
      const canvas = await html2canvas(conteudoRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`Evolucao - ${paciente?.nome ?? 'paciente'}.pdf`);
    } catch (e) {
      alert('Erro ao gerar PDF: ' + e.message);
    } finally {
      setGerandoPdf(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      zIndex: 200,
      overflow: 'auto',
      padding: '40px 32px',
    }}>
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 201, display: 'flex', gap: 8 }}>
        <button onClick={gerarPdf} disabled={gerandoPdf} style={{
          background: 'var(--white)', color: 'var(--dark)',
          border: '0.5px solid var(--border)', borderRadius: 8, padding: '8px 14px',
          cursor: gerandoPdf ? 'default' : 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          opacity: gerandoPdf ? .7 : 1,
        }}>
          <i className="ti ti-file-download" aria-hidden="true"></i> {gerandoPdf ? 'Gerando PDF...' : 'Gerar PDF'}
        </button>
        <button onClick={onClose} style={{
          background: 'var(--dark)', color: 'var(--white)',
          border: 'none', borderRadius: 8, padding: '8px 14px',
          cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-x" aria-hidden="true"></i> Sair (ESC)
        </button>
      </div>

      <div ref={conteudoRef} style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase',
          color: 'var(--gold-deep, #a08456)', marginBottom: 8,
        }}>
          Evolução
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 500,
          color: 'var(--dark)', marginBottom: 4, lineHeight: 1.1,
        }}>
          {paciente?.nome}
        </h1>
        {(totalDias > 0 || feedPratosCount > 0 || checkinsEnviados > 0) && (
          <div style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 32, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {totalDias > 0 && <span>{totalDias} dias de acompanhamento</span>}
            {feedPratosCount > 0 && (
              <span>{feedPratosCount} foto{feedPratosCount === 1 ? '' : 's'} enviada{feedPratosCount === 1 ? '' : 's'} no feed de pratos</span>
            )}
            {checkinsEnviados > 0 && (
              <span>{checkinsRespondidos} de {checkinsEnviados} check-ins respondidos</span>
            )}
          </div>
        )}

        {/* Stats grandes */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14, marginBottom: 36,
        }}>
          {[
            { label: 'Peso',        atual: ultima?.kg,        delta: deltaPeso,       un: 'kg', melhorMenor: true },
            { label: '% gordura',   atual: ultima?.pgc,       delta: deltaPgc,        un: '%',  melhorMenor: true },
            { label: 'Massa magra', atual: ultima?.mm_kg,     delta: deltaMassaMagra, un: 'kg', melhorMenor: false },
            { label: 'Água corporal', atual: ultima?.agua_corporal, delta: deltaAguaCorporal,   un: '%', melhorMenor: false },
            { label: 'Gordura visceral', atual: ultima?.gordura_visceral, delta: deltaGorduraVisceral, un: '', melhorMenor: true },
          ].map((s, i) => {
            if (!s.atual) return null;
            const corDelta = s.delta
              ? (s.melhorMenor ? s.delta.dif < 0 : s.delta.dif > 0) ? 'var(--green)' : 'var(--red)'
              : 'var(--text3)';
            return (
              <div key={i} style={{
                background: 'var(--white)', border: '0.5px solid var(--border)',
                borderRadius: 14, padding: '24px 28px',
              }}>
                <div style={{
                  fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                  color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
                }}>{s.label}</div>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 600,
                  color: 'var(--dark)', lineHeight: 1,
                }}>
                  {Number(s.atual).toFixed(1).replace('.', ',')}
                  <span style={{ fontSize: 22, color: 'var(--text3)', marginLeft: 6 }}>{s.un}</span>
                </div>
                {s.delta && (
                  <div style={{
                    fontSize: 18, fontWeight: 500, color: corDelta,
                    marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {s.delta.dif > 0 ? '↑' : s.delta.dif < 0 ? '↓' : '—'}{' '}
                    {Math.abs(s.delta.dif).toFixed(1).replace('.', ',')}{s.un}
                    <span style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 6, fontWeight: 400 }}>
                      desde {dataBR(primeira?.data)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {somaCircunferencias != null && (
            <div style={{
              background: 'var(--white)', border: '0.5px solid var(--border)',
              borderRadius: 14, padding: '24px 28px',
            }}>
              <div style={{
                fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
              }}>Circunferências</div>
              <div style={{
                fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 600,
                color: somaCircunferencias > 0 ? 'var(--green)' : somaCircunferencias < 0 ? 'var(--red)' : 'var(--dark)',
                lineHeight: 1,
              }}>
                {somaCircunferencias > 0 ? '−' : somaCircunferencias < 0 ? '+' : ''}
                {Math.abs(somaCircunferencias).toFixed(1).replace('.', ',')}
                <span style={{ fontSize: 22, color: 'var(--text3)', marginLeft: 6 }}>cm</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12, fontWeight: 400 }}>
                {somaCircunferencias >= 0 ? 'reduzidos' : 'a mais'} no total desde {dataBR(primeira?.data)}
              </div>
            </div>
          )}
        </div>

        {/* Fotos antes/depois grandes, uma seção por ângulo */}
        {comparativos.length > 0 && (
          <>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500,
              color: 'var(--dark)', marginBottom: 18,
            }}>
              Antes e depois
            </h2>
            {comparativos.map(c => (
              <div key={c.tipo} style={{ marginBottom: 28 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase',
                  color: 'var(--gold-deep, #a08456)', marginBottom: 14,
                }}>
                  {c.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  {[{ foto: c.fotoA, label: 'Antes' }, { foto: c.fotoB, label: 'Depois' }].map((x, i) => (
                    <div key={i}>
                      <div style={{
                        fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                        color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
                      }}>{x.label}</div>
                      <div style={{
                        background: 'var(--bg2)', borderRadius: 14,
                        aspectRatio: '3/4', overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {x.foto && urls[x.foto.id] ? (
                          <img src={urls[x.foto.id]} alt={x.label} crossOrigin="anonymous"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ color: 'var(--text3)', fontSize: 14 }}>Sem foto</span>
                        )}
                      </div>
                      {x.foto && (
                        <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 10, textAlign: 'center' }}>
                          {dataBR(x.foto.data_foto)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Questionários — primeiro x último de cada tipo */}
        {questionariosComparaveis.length > 0 && (
          <>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500,
              color: 'var(--dark)', marginBottom: 18,
            }}>
              Questionários — evolução
            </h2>
            {questionariosComparaveis.map(g => {
              const prim = g.itens[0];
              const ult = g.itens[g.itens.length - 1];
              return (
                <div key={g.id} style={{ marginBottom: 28 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase',
                    color: 'var(--gold-deep, #a08456)', marginBottom: 14,
                  }}>
                    {g.label}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {[{ item: prim, label: 'Antes' }, { item: ult, label: 'Depois' }].map((x, i) => (
                      <div key={i}>
                        <div style={{
                          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                          color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
                        }}>{x.label}</div>
                        <div style={{
                          background: 'var(--bg2)', borderRadius: 14, height: 320,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                        }}>
                          {qUrls[x.item.id] ? (
                            <img src={qUrls[x.item.id]} alt={x.label} crossOrigin="anonymous"
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ color: 'var(--text3)', fontSize: 14 }}>Sem imagem</span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 10, textAlign: 'center' }}>
                          {dataBR(x.item.data)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Exames — evolução (só os parâmetros preenchidos, laboratoriais + imagem) */}
        {(examesLabComparaveis.length > 0 || examesImagemComparaveis) && (
          <>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500,
              color: 'var(--dark)', marginBottom: 18,
            }}>
              Exames — evolução
            </h2>

            {examesLabComparaveis.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 14, marginBottom: examesImagemComparaveis ? 28 : 0,
              }}>
                {examesLabComparaveis.map(p => (
                  <div key={p.key} style={{
                    background: 'var(--white)', border: '0.5px solid var(--border)',
                    borderRadius: 14, padding: '18px 20px',
                  }}>
                    <div style={{
                      fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
                      color: 'var(--text3)', marginBottom: 8, fontWeight: 500,
                    }}>{p.label}</div>
                    <div style={{
                      fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 600,
                      color: p.cor ? p.cor.fg : 'var(--dark)', lineHeight: 1,
                    }}>
                      {p.para}
                      <span style={{ fontSize: 15, color: 'var(--text3)', marginLeft: 4 }}>{p.unidade}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 8 }}>
                      {p.de}{p.unidade} desde {dataBR(primeiroExameLab.data)}
                      {p.delta != null && p.delta !== 0 && (
                        <span style={{ marginLeft: 4 }}>
                          ({p.delta > 0 ? '+' : ''}{p.delta.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {examesImagemComparaveis && (
              <div>
                <div style={{
                  fontSize: 13, fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase',
                  color: 'var(--gold-deep, #a08456)', marginBottom: 14,
                }}>
                  Exames de imagem
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  {[
                    { item: examesImagemComparaveis.primeiro, label: 'Antes' },
                    { item: examesImagemComparaveis.ultimo, label: 'Depois' },
                  ].map((x, i) => (
                    <div key={i} style={{
                      background: 'var(--white)', border: '0.5px solid var(--border)',
                      borderRadius: 14, padding: '18px 20px',
                    }}>
                      <div style={{
                        fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                        color: 'var(--text3)', marginBottom: 8, fontWeight: 500,
                      }}>{x.label} · {dataBR(x.item.data)}</div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--dark)', marginBottom: 6 }}>
                        {x.item.titulo}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                        {x.item.texto ?? 'Sem laudo digitado.'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Hábitos e sintomas relatados */}
        {gruposHabitos.length > 0 && (
          <>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500,
              color: 'var(--dark)', marginBottom: 18,
            }}>
              Evolução relatada
            </h2>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 14, marginBottom: 32,
            }}>
              {gruposHabitos.map(g => (
                <div key={g.item} style={{
                  background: 'var(--white)', border: '0.5px solid var(--border)',
                  borderRadius: 14, padding: '22px 26px',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--dark)',
                    marginBottom: 14,
                  }}>
                    {g.item}
                  </div>
                  {g.relatos.map((h, i) => (
                    <div key={h.id} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      paddingTop: i === 0 ? 0 : 12,
                      marginTop: i === 0 ? 0 : 12,
                      borderTop: i === 0 ? 'none' : '0.5px solid var(--border)',
                    }}>
                      <div style={{
                        fontSize: 12, color: 'var(--gold-deep, #a08456)', fontWeight: 500,
                        flexShrink: 0, width: 78,
                      }}>
                        {dataBR(h.data)}
                      </div>
                      <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.5 }}>{h.nota}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {avaliacoes.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            Sem avaliações antropométricas registradas ainda.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MODAL DE VER RESPOSTAS DO CHECK-IN
   ============================================================ */
function VerCheckinModal({ envio, onClose }) {
  const respostas = envio.respostas ?? {};
  const pontuacao = envio.mostrar_pontuacao
    ? calcularPontuacaoSecoes(envio.perguntas, respostas)
    : null;
  const conclusao = pontuacao ? faixaResultado(pontuacao.total, envio.faixas_resultado) : null;
  const dadosGrafico = envio.metas_secao && pontuacao
    ? Object.keys(envio.metas_secao).map(secao => ({
        label: secao,
        a: envio.metas_secao[secao],
        b: pontuacao.porSecao[secao]?.pontos ?? 0,
      }))
    : null;

  return (
    <ModalShell title="Respostas do check-in"
      subtitle={`Respondido em ${dataBR(envio.respondido_em)}`}
      onClose={onClose} large>

      {pontuacao && (
        <div style={{ background: 'var(--white)', border: '0.5px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--dark)' }}>Resultado geral:</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--dark)' }}>{pontuacao.total} pontos</span>
          </div>
          {conclusao && (
            <div style={{
              marginTop: 8, background: 'var(--orange-bg, #fdf1e3)', color: 'var(--orange, #b06a1e)',
              padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            }}>{conclusao}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {Object.entries(pontuacao.porSecao).map(([secao, { pontos, maximo }]) => (
              <div key={secao} style={{
                background: 'var(--bg2)', borderRadius: 8, padding: '6px 10px', fontSize: 12,
                display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text2)' }}>{secao}</span>
                <span style={{ fontWeight: 600, color: 'var(--dark)' }}>{pontos}/{maximo}</span>
              </div>
            ))}
          </div>
          {dadosGrafico && (
            <div style={{ marginTop: 18 }}>
              <GraficoBarrasDuplas dados={dadosGrafico} labelA="Recomendado" labelB="Consumido" />
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12 }}>
        {envio.perguntas?.map(p => (
          <div key={p.id} style={{
            padding: '10px 0',
            borderBottom: '0.5px solid #e3dcce',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {p.secao}
            </div>
            <div style={{ fontSize: 13, color: 'var(--dark)', fontWeight: 500, marginBottom: 4 }}>
              {p.pergunta}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft, #4a3828)', background: 'var(--white)', padding: '8px 10px', borderRadius: 6 }}>
              {formatarResposta(p, respostas[p.id])}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   VER EXAME LABORATORIAL EM TELA GRANDE (com comparação c/ anterior)
   ============================================================ */
function deltaExame(atual, anteriorValor) {
  if (atual == null || anteriorValor == null) return null;
  const a = parseFloat(String(atual).replace(',', '.'));
  const b = parseFloat(String(anteriorValor).replace(',', '.'));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a - b;
}

function VerExameLabModal({ registro, anterior, onClose }) {
  const paramsPreenchidos = EXAMES_PARAMS.filter(p => registro.valores?.[p.key]?.valor != null);
  return (
    <ModalShell title="Exames laboratoriais"
      subtitle={`Coleta em ${dataBR(registro.data)}${anterior ? ` · comparado com ${dataBR(anterior.data)}` : ''}`}
      onClose={onClose} wide>
      {paramsPreenchidos.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>
          Nenhum parâmetro digitado nesse registro{registro.pdf_url ? ' — só o PDF anexado.' : '.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Parâmetro</th>
                <th>Resultado</th>
                {anterior && <th>Anterior ({dataBR(anterior.data)})</th>}
              </tr>
            </thead>
            <tbody>
              {paramsPreenchidos.map(p => {
                const v = registro.valores[p.key];
                const vAnt = anterior?.valores?.[p.key];
                const cor = EXAMES_STATUS.find(s => s.id === v.status);
                const delta = vAnt ? deltaExame(v.valor, vAnt.valor) : null;
                return (
                  <tr key={p.key}>
                    <td>{p.label} <span style={{ color: 'var(--text3)', fontSize: 11 }}>({p.unidade})</span></td>
                    <td>
                      <span style={{
                        color: cor ? cor.fg : 'inherit',
                        fontWeight: cor && cor.id !== 'normal' ? 600 : 400, fontSize: 15,
                      }}>
                        {v.valor}
                      </span>
                      {cor && (
                        <span className="pill" style={{ marginLeft: 8, background: cor.bg, color: cor.fg, fontSize: 10 }}>
                          {cor.label}
                        </span>
                      )}
                    </td>
                    {anterior && (
                      <td style={{ color: 'var(--text3)' }}>
                        {vAnt?.valor != null ? (
                          <>
                            {vAnt.valor}
                            {delta != null && delta !== 0 && (
                              <span style={{ marginLeft: 6, fontSize: 11 }}>
                                ({delta > 0 ? '+' : ''}{delta.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')})
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {registro.obs && (
        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text2)' }}>
          <strong>Observação:</strong> {registro.obs}
        </div>
      )}
      {registro.pdf_url && (
        <div style={{ marginTop: 10 }}>
          <a href={registro.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-deep)', fontSize: 13 }}>
            <i className="ti ti-file-download" aria-hidden="true"></i> Abrir PDF do laboratório
          </a>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   VER EXAME DE IMAGEM EM TELA GRANDE
   ============================================================ */
function VerExameImagemModal({ registro, onClose }) {
  return (
    <ModalShell title={registro.titulo} subtitle={dataBR(registro.data)} onClose={onClose} wide>
      {registro.texto ? (
        <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--dark)', whiteSpace: 'pre-wrap' }}>
          {registro.texto}
        </div>
      ) : (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sem laudo digitado — veja o PDF anexado.</div>
      )}
      {registro.pdf_url && (
        <div style={{ marginTop: 16 }}>
          <a href={registro.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-deep)', fontSize: 13 }}>
            <i className="ti ti-file-download" aria-hidden="true"></i> Abrir PDF do laudo
          </a>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, children, onClose, large, wide }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: wide ? 920 : (large ? 600 : 460), maxWidth: '92vw',
        maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
