/**
 * Template padrão do check-in semanal Lapidare (14 perguntas em 6 seções).
 *
 * Tipos de pergunta:
 *  - emoji_scale: { opcoes: [{ emoji, label, valor }] }            → resposta: número
 *  - slider:      { min, max, default, unit?, esquerda?, direita? } → resposta: número
 *  - single:      { opcoes: [string] }                              → resposta: string
 *  - multi:       { opcoes: [string] }                              → resposta: [string]
 *  - habitos:     { opcoes: [{ emoji, label }] }                    → resposta: [string]
 *  - texto:       { placeholder?, rows? }                           → resposta: string
 */

export const TEMPLATE_PADRAO = {
  nome: 'Check-in semanal',
  perguntas: [
    // ── Seção 1: Bem-estar geral ──
    {
      id: 'humor',
      secao: 'Bem-estar geral',
      tipo: 'emoji_scale',
      pergunta: 'Como você se sentiu emocionalmente esta semana?',
      opcoes: [
        { emoji: '😞', label: 'Difícil', valor: 1 },
        { emoji: '😕', label: 'Meh',     valor: 2 },
        { emoji: '😐', label: 'Ok',      valor: 3 },
        { emoji: '🙂', label: 'Bem',     valor: 4 },
        { emoji: '😄', label: 'Ótima!',  valor: 5 },
      ],
    },
    {
      id: 'energia',
      secao: 'Bem-estar geral',
      tipo: 'slider',
      pergunta: 'Seu nível de energia no geral foi...',
      min: 1, max: 10, default: 5,
      esquerda: 'Esgotada', direita: 'Com energia',
    },
    {
      id: 'sono',
      secao: 'Bem-estar geral',
      tipo: 'single',
      pergunta: 'Como foi seu sono esta semana?',
      opcoes: [
        'Dormi muito bem, acordei descansada',
        'Sono ok, mas poderia ser melhor',
        'Acordei cansada na maioria dos dias',
        'Dificuldade para dormir ou dormi pouco',
      ],
    },

    // ── Seção 2: Alimentação ──
    {
      id: 'adesao',
      secao: 'Alimentação',
      tipo: 'slider',
      pergunta: 'Em quantos dias você conseguiu seguir o plano alimentar?',
      min: 0, max: 7, default: 4, unit: 'dias',
      esquerda: 'Nenhum', direita: 'Todos os 7',
    },
    {
      id: 'dificuldades',
      secao: 'Alimentação',
      tipo: 'multi',
      pergunta: 'Teve alguma dificuldade com o plano?',
      sub: 'Pode marcar mais de uma opção.',
      opcoes: [
        'Compulsão alimentar em algum momento',
        'Falta de tempo para preparar as refeições',
        'Comidas fora de casa / eventos sociais',
        'Ansiedade ou estresse levou a comer fora do plano',
        'Não gostei de algum alimento do plano',
        'Nenhuma dificuldade 🎉',
      ],
    },
    {
      id: 'agua',
      secao: 'Alimentação',
      tipo: 'single',
      pergunta: 'Você atingiu a meta de hidratação na maioria dos dias?',
      opcoes: [
        'Sim, bebi minha meta diária ✅',
        'Mais ou menos — uns dias sim, outros não',
        'Não, tive dificuldade de beber água',
      ],
    },

    // ── Seção 3: Hábitos da semana ──
    {
      id: 'habitos',
      secao: 'Hábitos da semana',
      tipo: 'habitos',
      pergunta: 'Quais hábitos você conseguiu manter esta semana?',
      sub: 'Marque todos que conseguiu.',
      opcoes: [
        { emoji: '🍽️', label: 'Café da manhã todos os dias' },
        { emoji: '🚶‍♀️', label: 'Caminhada ou movimento diário' },
        { emoji: '💊', label: 'Suplementação em dia' },
        { emoji: '📵', label: 'Sem celular antes de dormir' },
        { emoji: '🌙', label: 'Dormi antes da meia-noite' },
        { emoji: '🧘‍♀️', label: 'Momento de autocuidado' },
      ],
    },

    // ── Seção 4: Corpo & ciclo ──
    {
      id: 'inchaco',
      secao: 'Corpo & ciclo',
      tipo: 'single',
      pergunta: 'Você se sentiu inchada esta semana?',
      opcoes: [
        'Não, me senti bem no corpo',
        'Um pouco, mas passou',
        'Sim, me senti bastante inchada',
      ],
    },
    {
      id: 'ciclo',
      secao: 'Corpo & ciclo',
      tipo: 'single',
      pergunta: 'Em que fase do ciclo você está?',
      sub: 'Isso me ajuda a entender seu corpo e ajustar o plano.',
      opcoes: [
        '🩸 Menstruação',
        '🌱 Fase folicular (pós-menstruação)',
        '🌸 Ovulação',
        '🌙 Fase lútea (pré-menstruação)',
        'Não sei / Não tenho ciclo regular',
      ],
    },

    // ── Seção 5: Saúde intestinal ──
    {
      id: 'frequencia',
      secao: 'Saúde intestinal',
      tipo: 'single',
      pergunta: 'Com que frequência seu intestino funcionou esta semana?',
      opcoes: [
        'Todos os dias ✅',
        '1 vez a cada 2 dias',
        '2 a 3 vezes na semana',
        '1 vez ou menos na semana',
        'Intestino solto / mais de 3x por dia',
      ],
    },
    {
      id: 'consistencia',
      secao: 'Saúde intestinal',
      tipo: 'single',
      pergunta: 'Como foi a consistência das fezes na maioria dos dias?',
      sub: 'Isso me ajuda a entender sua saúde intestinal e ajustar fibras e hidratação.',
      opcoes: [
        'Normal — firme, fácil de evacuar',
        'Ressecada — com esforço ou fragmentada',
        'Amolecida — pastosa ou com urgência',
        'Variou muito ao longo da semana',
      ],
    },
    {
      id: 'sintomas',
      secao: 'Saúde intestinal',
      tipo: 'multi',
      pergunta: 'Teve algum desses sintomas digestivos esta semana?',
      sub: 'Pode marcar mais de uma opção.',
      opcoes: [
        '🫧 Gases excessivos',
        '🤰 Distensão abdominal (barriga inchada)',
        '😣 Dor ou cólica abdominal',
        '🤢 Náusea ou azia',
        'Nenhum sintoma 🎉',
      ],
    },

    // ── Seção 6: Espaço livre ──
    {
      id: 'espaco_livre',
      secao: 'Espaço livre',
      tipo: 'texto',
      pergunta: 'Tem algo que quer compartilhar comigo?',
      sub: 'Dificuldades, conquistas, dúvidas — pode falar à vontade.',
      placeholder: 'Escreva aqui...',
      rows: 4,
    },
    {
      id: 'restricao',
      secao: 'Espaço livre',
      tipo: 'texto',
      pergunta: 'Tem alguma restrição nova que eu deva saber?',
      sub: 'Mudança de rotina, intolerância, preferência alimentar…',
      placeholder: 'Ex: Parei de comer glúten, viagem semana que vem…',
      rows: 3,
    },
  ],
};

/** Retorna a lista de seções únicas na ordem em que aparecem em `perguntas`. */
export function listarSecoes(perguntas) {
  const out = [];
  for (const p of perguntas ?? []) {
    if (!out.includes(p.secao)) out.push(p.secao);
  }
  return out;
}

/** Valor inicial vazio para cada pergunta — usado no estado da paciente. */
export function respostasIniciais(perguntas) {
  const r = {};
  for (const p of perguntas ?? []) {
    if (p.tipo === 'slider') r[p.id] = p.default ?? p.min ?? 0;
    else if (p.tipo === 'multi' || p.tipo === 'habitos') r[p.id] = [];
    else r[p.id] = null;
  }
  return r;
}

/**
 * Valida a estrutura de um template importado via JSON.
 * Retorna { ok: true } ou { ok: false, erro }.
 */
const TIPOS_VALIDOS = ['emoji_scale', 'slider', 'single', 'multi', 'habitos', 'texto'];

export function validarTemplate(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'JSON inválido — esperado objeto.' };
  if (!obj.nome || typeof obj.nome !== 'string') return { ok: false, erro: 'Faltou o campo "nome" (string).' };
  if (!Array.isArray(obj.perguntas) || obj.perguntas.length === 0) {
    return { ok: false, erro: 'Faltou o campo "perguntas" (array com pelo menos 1 pergunta).' };
  }
  const ids = new Set();
  for (let i = 0; i < obj.perguntas.length; i++) {
    const p = obj.perguntas[i];
    if (!p?.id) return { ok: false, erro: `Pergunta #${i + 1} precisa do campo "id".` };
    if (ids.has(p.id)) return { ok: false, erro: `Pergunta #${i + 1} tem id duplicado: "${p.id}".` };
    ids.add(p.id);
    if (!p.pergunta) return { ok: false, erro: `Pergunta "${p.id}" precisa do campo "pergunta".` };
    if (!p.secao) return { ok: false, erro: `Pergunta "${p.id}" precisa do campo "secao".` };
    if (!TIPOS_VALIDOS.includes(p.tipo)) {
      return { ok: false, erro: `Pergunta "${p.id}" tem tipo inválido "${p.tipo}". Tipos: ${TIPOS_VALIDOS.join(', ')}.` };
    }
    if (['emoji_scale', 'single', 'multi', 'habitos'].includes(p.tipo)) {
      if (!Array.isArray(p.opcoes) || p.opcoes.length === 0) {
        return { ok: false, erro: `Pergunta "${p.id}" do tipo ${p.tipo} precisa de "opcoes" (array).` };
      }
    }
    if (p.tipo === 'slider') {
      if (typeof p.min !== 'number' || typeof p.max !== 'number') {
        return { ok: false, erro: `Pergunta "${p.id}" do tipo slider precisa de "min" e "max" numéricos.` };
      }
    }
  }
  return { ok: true };
}

/**
 * Calcula a próxima data de envio a partir de uma data base e frequência.
 * fromDate: 'YYYY-MM-DD' (string) | Date
 * frequencia: 'semanal' | 'quinzenal' | 'mensal'
 * Retorna 'YYYY-MM-DD'.
 */
export function proximaDataAgendamento(fromDate, frequencia) {
  const base = typeof fromDate === 'string' ? new Date(fromDate + 'T00:00:00') : new Date(fromDate);
  if (frequencia === 'semanal') base.setDate(base.getDate() + 7);
  else if (frequencia === 'quinzenal') base.setDate(base.getDate() + 14);
  else if (frequencia === 'mensal') base.setMonth(base.getMonth() + 1);
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const FREQ_LABEL = { semanal: 'Toda semana', quinzenal: 'Quinzenal', mensal: 'Mensal' };
export function labelFrequencia(f) { return FREQ_LABEL[f] ?? f; }

/**
 * Renderiza uma resposta de forma legível (para o painel da nutri).
 */
export function formatarResposta(pergunta, valor) {
  if (valor == null || valor === '') return '—';
  if (pergunta.tipo === 'emoji_scale') {
    const opt = pergunta.opcoes?.find(o => o.valor === valor);
    return opt ? `${opt.emoji} ${opt.label}` : String(valor);
  }
  if (pergunta.tipo === 'slider') {
    return pergunta.unit ? `${valor} ${pergunta.unit}` : String(valor);
  }
  if (pergunta.tipo === 'multi' || pergunta.tipo === 'habitos') {
    if (!Array.isArray(valor) || valor.length === 0) return '—';
    return valor.join(' · ');
  }
  return String(valor);
}
