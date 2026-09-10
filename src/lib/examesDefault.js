// Parâmetros e status de exames laboratoriais — compartilhado entre a tela
// de registro (PacientePerfil.jsx) e a Evolução (_Evolucao.jsx, timeline +
// Modo Apresentação), pra não duplicar a lista em dois lugares.

export const EXAMES_PARAMS = [
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

export const EXAMES_STATUS = [
  { id: 'baixo',     label: 'Baixo',     fg: 'var(--red)',    bg: 'var(--red-soft)' },
  { id: 'limitrofe', label: 'Limítrofe', fg: 'var(--orange)', bg: 'var(--orange-soft)' },
  { id: 'normal',    label: 'Normal',    fg: 'var(--green)',  bg: 'var(--green-soft)' },
  { id: 'alto',      label: 'Alto',      fg: 'var(--red)',    bg: 'var(--red-soft)' },
];
