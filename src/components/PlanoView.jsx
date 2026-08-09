import { useMemo, useState } from 'react';
import { dataBR, indexarSubstituicoes } from '../lib/utils.js';

/**
 * Renderiza uma substituição com segurança — aceita string OU objeto.
 * Se a Skill 6 (ChatGPT) gerar substituições como objetos em vez de
 * strings simples, isso evita que o React quebre a tela inteira.
 */
function formatarSub(s) {
  if (typeof s === 'string') return s;
  if (!s || typeof s !== 'object') return String(s ?? '');
  const partes = [s.nome, s.qty, s.kcal && `${s.kcal} kcal`].filter(Boolean);
  return partes.length ? partes.join(' · ') : JSON.stringify(s);
}

/**
 * Componente puro de desenho do plano alimentar — não busca nada, só
 * recebe os dados prontos e desenha. Usado tanto pela tela real da
 * paciente (`src/app/paciente/Plano.jsx`) quanto pela prévia no painel
 * da nutri (`PacientePerfil.jsx`), pra garantir que "o que a nutri vê
 * na prévia" seja EXATAMENTE "o que a paciente vê de verdade".
 */
export default function PlanoView({ dados, validade, pdfPlano, pdfSubs, subsExternas }) {
  const [openSubs, setOpenSubs] = useState({});
  const indiceSubs = useMemo(() => indexarSubstituicoes(subsExternas), [subsExternas]);
  const toggleSubs = (key) => setOpenSubs(s => ({ ...s, [key]: !s[key] }));

  const plano = dados ?? {};

  // Plano foi publicado SÓ como PDF (sem JSON estruturado).
  const somentePdf = plano.somente_pdf === true || !Array.isArray(plano.refeicoes);
  if (somentePdf && pdfPlano) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <i className="ti ti-file-text" style={{ fontSize: 40, color: 'var(--gold-deep)', display: 'block', marginBottom: 12 }}></i>
        <div className="serif" style={{ fontSize: 20, marginBottom: 6 }}>Seu plano alimentar</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>
          Sua nutricionista enviou o plano em PDF. Toque pra baixar e visualizar.
        </div>
        <a href={pdfPlano} target="_blank" rel="noopener noreferrer"
           style={{
             display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
             padding: '12px 24px', borderRadius: 10,
             background: 'var(--gold-bg, #fff7e0)', color: 'var(--gold-deep, #5a4400)',
             border: '1px solid var(--gold, #c9a86a)',
             fontSize: 14, fontWeight: 500, textDecoration: 'none',
           }}>
          <i className="ti ti-file-download" style={{ fontSize: 18 }} aria-hidden="true"></i>
          Baixar PDF do plano
        </a>
        {pdfSubs && (
          <div style={{ marginTop: 12 }}>
            <a href={pdfSubs} target="_blank" rel="noopener noreferrer"
               style={{
                 display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                 padding: '8px 18px', borderRadius: 10,
                 background: 'var(--bg2)', color: 'var(--text2)',
                 border: '0.5px solid var(--border)',
                 fontSize: 13, fontWeight: 500, textDecoration: 'none',
               }}>
              <i className="ti ti-file-download" style={{ fontSize: 14 }} aria-hidden="true"></i>
              Baixar PDF das substituições
            </a>
          </div>
        )}
        {validade && (
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)' }}>
            Válido até {dataBR(validade)}
          </div>
        )}
      </div>
    );
  }

  const totalFeitos = plano.refeicoes?.filter(r => r.feita).length ?? 0;
  const total = plano.refeicoes?.length ?? 0;

  return (
    <>
      {(pdfPlano || pdfSubs) && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', flexWrap: 'wrap' }}>
          {pdfPlano && (
            <a href={pdfPlano} target="_blank" rel="noopener noreferrer"
               className="pdf-download-btn"
               style={{
                 flex: 1, minWidth: 140,
                 display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                 padding: '10px 14px', borderRadius: 10,
                 background: 'var(--gold-bg, #fff7e0)', color: 'var(--gold-deep, #5a4400)',
                 border: '1px solid var(--gold, #c9a86a)',
                 fontSize: 13, fontWeight: 500, textDecoration: 'none',
               }}>
              <i className="ti ti-file-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Baixar PDF do plano
            </a>
          )}
          {pdfSubs && (
            <a href={pdfSubs} target="_blank" rel="noopener noreferrer"
               className="pdf-download-btn"
               style={{
                 flex: 1, minWidth: 140,
                 display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                 padding: '10px 14px', borderRadius: 10,
                 background: 'var(--gold-bg, #fff7e0)', color: 'var(--gold-deep, #5a4400)',
                 border: '1px solid var(--gold, #c9a86a)',
                 fontSize: 13, fontWeight: 500, textDecoration: 'none',
               }}>
              <i className="ti ti-file-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Baixar PDF das substituições
            </a>
          )}
        </div>
      )}

      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
            Macros do dia
          </span>
          <span className="pill ghost" style={{ fontSize: 10 }}>{plano.macros?.kcal} kcal</span>
        </div>
        {[
          { label: 'Proteína',    v: plano.macros?.prot_g ?? plano.macros?.proteinas_g, color: 'var(--red)' },
          { label: 'Carboidrato', v: plano.macros?.cho_g  ?? plano.macros?.carbo_g,     color: 'var(--gold)' },
          { label: 'Gordura',     v: plano.macros?.lip_g  ?? plano.macros?.gorduras_g,  color: 'var(--green)' },
        ].map((m, i) => (
          <div key={i} className="macro-row">
            <div className="macro-label"><span>{m.label}</span><span>{m.v}g</span></div>
            <div className="bar"><i style={{ width: '70%', background: m.color }}></i></div>
          </div>
        ))}
        {(plano.macros?.agua_l || plano.macros?.fibras_g) && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            💧 Meta: {plano.macros.agua_l}L · 🌾 Fibras: {plano.macros.fibras_g}g
          </div>
        )}
      </div>

      {total > 0 && (
        <div style={{ margin: '0 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="bar" style={{ flex: 1 }}>
            <i style={{ width: `${(totalFeitos / total) * 100}%`, background: 'var(--green)' }}></i>
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {totalFeitos}/{total} refeições
          </span>
        </div>
      )}

      {plano.refeicoes?.map((ref, ri) => (
        <div key={ri} className="refeicao-card">
          <div className="refeicao-header">
            <div>
              <div className="refeicao-titulo">{ref.emoji} {ref.nome}</div>
              {ref.horario && <div className="refeicao-horario">{ref.horario}</div>}
            </div>
            {ref.kcal && <span className="refeicao-kcal">{ref.kcal} kcal</span>}
          </div>

          {ref.alimentos?.map((al, ai) => (
            <div key={ai}>
              <div className="alimento-row" style={{ background: ai % 2 === 0 ? 'var(--paper)' : 'var(--bg-soft)' }}>
                <div>
                  <div className="alimento-nome">{al.nome}</div>
                  {(al.qty || al.quantidade) && (
                    <div className="alimento-qty">
                      {al.qty ?? al.quantidade}
                      {(al.prot_g ?? al.proteinas_g) ? ` · ${al.prot_g ?? al.proteinas_g}g prot` : ''}
                    </div>
                  )}
                </div>
                {al.kcal && <span className="alimento-kcal">{al.kcal} kcal</span>}
              </div>

              {(() => {
                const externas = indiceSubs[String(al.nome ?? '').trim().toLowerCase()] ?? [];
                const subs = externas.length > 0 ? externas : (Array.isArray(al.subs) ? al.subs : []);
                if (subs.length === 0) return null;
                return (
                  <>
                    <button className="subs-toggle" onClick={() => toggleSubs(`${ri}-${ai}`)}>
                      <i className={`ti ti-${openSubs[`${ri}-${ai}`] ? 'chevron-up' : 'chevron-down'}`} style={{ fontSize: 12 }} aria-hidden="true"></i>
                      {openSubs[`${ri}-${ai}`] ? 'Fechar substituições' : `Ver ${subs.length} substituições`}
                    </button>
                    {openSubs[`${ri}-${ai}`] && (
                      <div className="subs-list">
                        {subs.map((s, si) => (
                          <div key={si} className="sub-item">→ {formatarSub(s)}</div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ))}

          {ref.obs && (
            <div className="refeicao-obs">
              <i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 5, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
              {ref.obs}
            </div>
          )}
        </div>
      ))}

      {validade && (
        <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
          Válido até {dataBR(validade)}
        </div>
      )}
    </>
  );
}
