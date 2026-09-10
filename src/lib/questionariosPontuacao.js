/**
 * Templates de check-in com pontuação por seção — transcritos dos PDFs de
 * referência que a Isabelle usa (Rastreamento Metabólico e Questionário de
 * Frequência Alimentar). Usam o tipo de pergunta `pontuacao` (ver
 * checkinDefault.js), oferecidos como ponto de partida em Checkins.jsx →
 * Templates → "Usar este modelo" — depois de criados, editáveis normalmente
 * (JSON) como qualquer outro template.
 */

// Legenda oficial do Rastreamento Metabólico (0 a 4), passada pela Isabelle.
const OPCOES_SINTOMA = [
  { label: 'Nunca ou quase nunca teve o sintoma', valor: 0 },
  { label: 'Ocasionalmente teve, efeito não foi severo', valor: 1 },
  { label: 'Ocasionalmente teve, efeito foi severo', valor: 2 },
  { label: 'Frequentemente teve, efeito não foi severo', valor: 3 },
  { label: 'Frequentemente teve, efeito foi severo', valor: 4 },
];

// Texto de partida pra frequência do QFA (0/2/5/8/10) — editável depois.
const OPCOES_FREQUENCIA = [
  { label: 'Nunca', valor: 0 },
  { label: '1x por semana', valor: 2 },
  { label: '2-3x por semana', valor: 5 },
  { label: 'Quase todo dia', valor: 8 },
  { label: 'Todo dia ou mais', valor: 10 },
];

let _seq = 0;
function sintoma(secao, pergunta) {
  _seq += 1;
  return { id: `rm_${_seq}`, secao, tipo: 'pontuacao', pergunta, opcoes: OPCOES_SINTOMA };
}
function alimento(secao, pergunta) {
  _seq += 1;
  return { id: `qfa_${_seq}`, secao, tipo: 'pontuacao', pergunta, opcoes: OPCOES_FREQUENCIA };
}

export const RASTREAMENTO_METABOLICO = {
  nome: 'Rastreamento metabólico',
  mostrar_pontuacao: true,
  faixas_resultado: [
    { ate: 50, texto: 'Saudável' },
    { ate: 70, texto: 'Possível sensibilidade' },
    { ate: 264, texto: 'Muita sensibilidade' }, // 264 = pontuação máxima possível (66 perguntas × 4) — cobre qualquer total acima de 70
  ],
  perguntas: [
    ...['Dor de cabeça', 'Sensação de desmaio', 'Tonturas', 'Insônia']
      .map(p => sintoma('Cabeça', p)),
    ...['Olhos lacrimejantes ou coçando', 'Olhos inchados, vermelhos ou com cílios colando',
        'Bolsas ou olheiras abaixo dos olhos', 'Visão borrada ou em túnel (não incluiu miopia ou astigmatismo)']
      .map(p => sintoma('Olhos', p)),
    ...['Coceira nos ouvidos', 'Dores de ouvido, infecções auditivas',
        'Retirada de fluido purulento de ouvido', 'Zunido, perda de audição']
      .map(p => sintoma('Ouvidos', p)),
    ...['Nariz entupido', 'Problemas de seios nasais (Sinusite)',
        'Corrimento nasal, espirros, lacrimejamento e coceira dos olhos (juntos)',
        'Ataques de espirros', 'Excessiva formação de muco']
      .map(p => sintoma('Nariz', p)),
    ...['Tosse crônica', 'Frequente necessidade de limpar a garganta',
        'Dor de garganta, ronquidão ou perda de voz',
        'Língua, gengivas ou lábios inchados / descoloridos', 'Aftas']
      .map(p => sintoma('Boca e Garganta', p)),
    ...['Acne', 'Feridas que coçam, erupções, pele seca', 'Perda de cabelo',
        'Vermelhidão na pele, calorões', 'Suor excessivo']
      .map(p => sintoma('Pele', p)),
    ...['Batimentos cardíacos irregulares ou falhando', 'Batimentos cardíacos rápidos demais', 'Dor no peito']
      .map(p => sintoma('Coração', p)),
    ...['Congestão no peito', 'Asma, bronquite', 'Pouco fôlego', 'Dificuldade para respirar']
      .map(p => sintoma('Pulmões', p)),
    ...['Náuseas, vômito', 'Diarréia', 'Constipação / prisão de ventre',
        'Sente-se inchado / com abdômem distendido', 'Arrotos e/ou gases intestinais',
        'Azia/Pirose', 'Dor estomacal / intestinal']
      .map(p => sintoma('Trato digestivo', p)),
    ...['Dores articulares', 'Artrite / artrose', 'Rigidez ou limitação dos movimentos',
        'Dores musculares', 'Sensação de fraqueza ou cansaço']
      .map(p => sintoma('Articulações / Músculos', p)),
    ...['Fadiga, moleza', 'Apatia, letargia', 'Hiperatividade', 'Dificuldade em descansar, relaxar']
      .map(p => sintoma('Energia / Atividade', p)),
    ...['Memória ruim', 'Confusão mental, compreensão ruim', 'Concentração ruim',
        'Fraca coordenação motora', 'Dificuldade de tomar decisões',
        'Fala com repetição de sons ou palavras, com várias pausas involuntárias',
        'Pronuncia palavras de forma indistinta, confusa', 'Problemas de aprendizagem']
      .map(p => sintoma('Mente', p)),
    ...['Mudanças de humor / mau humor matinal', 'Ansiedade, medo, nervosismo',
        'Raiva, irritabilidade, agressividade', 'Depressão']
      .map(p => sintoma('Emoções', p)),
    ...['Frequentemente doente', 'Frequentemente ou urgente vontade de urinar',
        'Coceira genital ou corrimento', 'Edema / Inchaço - Pés / Pernas / Mãos']
      .map(p => sintoma('Outros', p)),
  ],
};

export const QFA_PONTUACAO = {
  nome: 'Frequência alimentar',
  mostrar_pontuacao: true,
  // Meta de porções recomendadas por grupo (referência: Cálculos Nutricionais
  // — Análise e Planejamento Dietético, 1ª ed., Fraga & Galisa).
  metas_secao: {
    'Leites e Derivados': 21,
    'Carnes e Ovos': 14,
    'Óleos': 7,
    'Cereais e Leguminosas': 42,
    'Frutas/Verduras/Legumes': 42,
    'Petiscos, Embutidos e Enlatados': 7,
    'Sobremesas e Doces': 7,
    'Bebidas': 7,
  },
  perguntas: [
    ...['Leite (copo de requeijão)', 'Iogurte natural (copo de requeijão)',
        'Queijos (1/2 fatia)', 'Requeijão / Crême de ricota etc (1,5 colher de sopa)']
      .map(p => alimento('Leites e Derivados', p)),
    ...['Ovo cozido / mexido (2 unidades)', 'Carnes vermelhas (1 unidade)',
        'Carnes de Porco (1 fatia)', 'Frango - filé, sobrecoxa, peito (1 unidade)',
        'Peixe fresco / Frutos do Mar (1 unidade)']
      .map(p => alimento('Carnes e Ovos', p)),
    ...['Azeite (1 colher de sopa)', 'Bacon e toucinho / banha (1/2 fatia)', 'Frituras',
        'Manteiga / Margarina (1/2 colher de sopa)', 'Maionese (1/2 colher de sopa)',
        'Óleos vegetais (1 colher de sopa)']
      .map(p => alimento('Óleos', p)),
    ...['Arroz Branco / Integral (4 colheres de sopa)', 'Aveia (4 colheres de sopa)',
        'Pão francês / Integral / Forma (1 unidade)', 'Macarrão (3 colheres e 1/2 de sopa)',
        'Bolos caseiros (1 fatia pequena)', 'Leguminosas (1 concha)', 'Soja (1 colher de servir)',
        'Oleaginosas (castanha/nozes/amendoim) (1 colher de sopa)']
      .map(p => alimento('Cereais e Leguminosas', p)),
    ...['Fruta in natura (1 unidade/fatia)', 'Folhosos (10 folhas)',
        'Tubérculos (batatas/cenoura/beterraba) (2 colheres de sopa)',
        'Legumes (abobora/chuchu/tomate/pepino) (2 colheres de sopa)']
      .map(p => alimento('Frutas/Verduras/Legumes', p)),
    ...['Snacks - salgadinhos, bolachas, pizza, amendoim (1 pacote)',
        'Macarrão instantâneo / lazanha / Nuggets (1 pacote)',
        'Embutidos em geral (presunto, mortadela etc) (2 fatias)',
        'Enlatados (milho, ervilha, palmito, azeitona) (2 colheres de sopa)']
      .map(p => alimento('Petiscos, Embutidos e Enlatados', p)),
    ...['Sorvete (1 unidade ou 2 bolas)', 'Tortas e Doces Elaborados (1 fatia)',
        'Chocolates (1 unidade)', 'Balas (1 unidade)']
      .map(p => alimento('Sobremesas e Doces', p)),
    ...['Água (1 garrafa 510 ml)', 'Café sem açúcar (1 xícara café)',
        'Suco Natural / Chás sem açúcar (copo de requeijão)', 'Refrigerante normal (copo de requeijão)',
        'Café / Chá com açúcar (1 xícara café)', 'Suco Natural Adoçado (copo de requeijão)',
        'Sucos de Caixinha (copo de requeijão)']
      .map(p => alimento('Bebidas', p)),
  ],
};
