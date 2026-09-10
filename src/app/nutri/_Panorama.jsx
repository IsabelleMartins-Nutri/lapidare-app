import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

const MAX_FASES = 10;

export default function Panorama({ pacienteId, nutriId, pacienteNome }) {
  const [carregando, setCarregando] = useState(true);
  const [condutas, setCondutas] = useState([]);
  const [pontosAtencao, setPontosAtencao] = useState([]);
  const [fases, setFases] = useState([]);
  const [novoPonto, setNovoPonto] = useState('');
  const [novasCondutasPorFase, setNovasCondutasPorFase] = useState({});
  const [apresentacao, setApresentacao] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function carregar() {
    const [pRes, cRes] = await Promise.all([
      supabase.from('panoramas').select('*').eq('paciente_id', pacienteId).maybeSingle(),
      supabase.from('condutas_biblioteca').select('*').eq('nutri_id', nutriId).order('created_at'),
    ]);
    setPontosAtencao(pRes.data?.pontos_atencao ?? []);
    setFases(pRes.data?.fases ?? []);
    setCondutas(cRes.data ?? []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  // ESC pra sair da apresentação
  useEffect(() => {
    if (!apresentacao) return;
    const onKey = (e) => { if (e.key === 'Escape') setApresentacao(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apresentacao]);

  function adicionarPonto() {
    const texto = novoPonto.trim();
    if (!texto) return;
    setPontosAtencao(p => [...p, texto]);
    setNovoPonto('');
  }
  function removerPonto(i) {
    setPontosAtencao(p => p.filter((_, idx) => idx !== i));
  }

  function adicionarFase() {
    if (fases.length >= MAX_FASES) return;
    setFases(f => [...f, { titulo: `Fase ${f.length + 1}`, condutas: [], texto: '' }]);
  }
  function removerFase(i) {
    if (!window.confirm('Remover essa fase?')) return;
    setFases(f => f.filter((_, idx) => idx !== i));
  }
  function moverFase(i, direcao) {
    setFases(f => {
      const j = i + direcao;
      if (j < 0 || j >= f.length) return f;
      const nova = [...f];
      [nova[i], nova[j]] = [nova[j], nova[i]];
      return nova;
    });
  }
  function atualizarFase(i, campo, valor) {
    setFases(f => f.map((fase, idx) => idx === i ? { ...fase, [campo]: valor } : fase));
  }
  function toggleConduta(i, texto) {
    setFases(f => f.map((fase, idx) => {
      if (idx !== i) return fase;
      const jaTem = fase.condutas.includes(texto);
      return { ...fase, condutas: jaTem ? fase.condutas.filter(c => c !== texto) : [...fase.condutas, texto] };
    }));
  }

  async function adicionarCondutaEMarcar(i) {
    const texto = (novasCondutasPorFase[i] ?? '').trim();
    if (!texto) return;
    const { data, error } = await supabase.from('condutas_biblioteca')
      .insert({ nutri_id: nutriId, texto }).select('*').single();
    if (error) return alert('Erro ao criar conduta: ' + error.message);
    setCondutas(c => [...c, data]);
    toggleConduta(i, texto);
    setNovasCondutasPorFase(v => ({ ...v, [i]: '' }));
  }

  async function excluirConduta(c) {
    if (!window.confirm(`Excluir "${c.texto}" da biblioteca? Isso não remove das fases que já usam esse texto, só some da lista de sugestões.`)) return;
    await supabase.from('condutas_biblioteca').delete().eq('id', c.id);
    setCondutas(cs => cs.filter(x => x.id !== c.id));
  }

  async function salvar() {
    setFeedback(null);
    setBusy(true);
    const { error } = await supabase.from('panoramas').upsert({
      paciente_id: pacienteId,
      nutri_id: nutriId,
      pontos_atencao: pontosAtencao,
      fases,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'paciente_id' });
    setBusy(false);
    if (error) return setFeedback({ tipo: 'erro', msg: 'Erro: ' + error.message });
    setFeedback({ tipo: 'ok', msg: 'Panorama salvo.' });
  }

  if (carregando) {
    return <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>;
  }

  if (apresentacao) {
    return (
      <PanoramaApresentacao
        pacienteNome={pacienteNome}
        pontosAtencao={pontosAtencao}
        fases={fases}
        onClose={() => setApresentacao(false)}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          Planeje o caminho do tratamento em fases — pra apresentar na consulta de venda.
        </div>
        <button className="btn" onClick={() => setApresentacao(true)} disabled={fases.length === 0}>
          <i className="ti ti-presentation" aria-hidden="true"></i> Ver apresentação
        </button>
      </div>

      {/* Pontos de atenção */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="card-title">Pontos de atenção</div>
        <div className="card-sub">Sintomas e queixas que motivam esse plano — aparecem no topo da apresentação</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
          {pontosAtencao.map((p, i) => (
            <span key={i} className="pill pill-r" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
              {p}
              <button onClick={() => removerPonto(i)} title="Remover" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
                padding: 0, display: 'inline-flex', opacity: 0.7,
              }}>
                <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true"></i>
              </button>
            </span>
          ))}
          {pontosAtencao.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Nenhum ponto adicionado ainda.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={novoPonto} onChange={e => setNovoPonto(e.target.value)}
            placeholder="Ex: Distensão abdominal"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarPonto(); } }}
            style={{ margin: 0 }} />
          <button className="btn-outline" onClick={adicionarPonto} style={{ flexShrink: 0 }}>
            <i className="ti ti-plus" aria-hidden="true"></i> Adicionar
          </button>
        </div>
      </div>

      {/* Fases */}
      <div className="section-header" style={{ marginTop: 4 }}>
        <div className="section-title">Fases do tratamento ({fases.length}/{MAX_FASES})</div>
        <button className="btn-outline" onClick={adicionarFase} disabled={fases.length >= MAX_FASES}>
          <i className="ti ti-plus" aria-hidden="true"></i> Fase
        </button>
      </div>

      {fases.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-route empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma fase criada ainda</div>
          <div className="empty-sub">Monte até {MAX_FASES} fases pra planejar o caminho do tratamento dessa paciente.</div>
          <button className="btn" onClick={adicionarFase}>
            <i className="ti ti-plus" aria-hidden="true"></i> Criar primeira fase
          </button>
        </div>
      ) : (
        fases.map((fase, i) => (
          <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <input value={fase.titulo} onChange={e => atualizarFase(i, 'titulo', e.target.value)}
                placeholder={`Fase ${i + 1}`}
                style={{
                  margin: 0, flex: 1, fontWeight: 600, fontSize: 14,
                  border: 'none', borderBottom: '0.5px solid var(--border)', borderRadius: 0,
                  padding: '4px 2px',
                }} />
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => moverFase(i, -1)} disabled={i === 0} title="Mover pra cima"
                  className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                  <i className="ti ti-arrow-up" aria-hidden="true"></i>
                </button>
                <button onClick={() => moverFase(i, 1)} disabled={i === fases.length - 1} title="Mover pra baixo"
                  className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                  <i className="ti ti-arrow-down" aria-hidden="true"></i>
                </button>
                <button onClick={() => removerFase(i)} title="Excluir fase" style={{
                  background: 'none', border: '0.5px solid var(--red)',
                  borderRadius: 6, padding: '3px 8px', color: 'var(--red)', cursor: 'pointer',
                }}>
                  <i className="ti ti-trash" style={{ fontSize: 12 }} aria-hidden="true"></i>
                </button>
              </div>
            </div>

            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 500 }}>
              Condutas
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {condutas.map(c => {
                const marcada = fase.condutas.includes(c.texto);
                return (
                  <button key={c.id} type="button" onClick={() => toggleConduta(i, c.texto)}
                    style={{
                      padding: '4px 10px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                      background: marcada ? 'var(--dark)' : 'transparent',
                      color: marcada ? '#fff' : 'var(--text2)',
                      border: marcada ? 'none' : '0.5px solid var(--border)',
                      fontFamily: 'var(--font-sans)',
                    }}>
                    {c.texto}
                  </button>
                );
              })}
              {condutas.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Nenhuma conduta cadastrada ainda — crie a primeira abaixo.</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input value={novasCondutasPorFase[i] ?? ''}
                onChange={e => setNovasCondutasPorFase(v => ({ ...v, [i]: e.target.value }))}
                placeholder="+ nova conduta (ex: Aumentar consumo de água)"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarCondutaEMarcar(i); } }}
                style={{ margin: 0, fontSize: 12 }} />
              <button className="btn-outline" onClick={() => adicionarCondutaEMarcar(i)} style={{ flexShrink: 0, fontSize: 12 }}>
                Adicionar
              </button>
            </div>

            <label className="field-label">Detalhes (opcional)</label>
            <textarea value={fase.texto} onChange={e => atualizarFase(i, 'texto', e.target.value)}
              rows={3} placeholder="Ex: Focar na distensão abdominal relatada, investigar relação com laticínios."
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
              }} />
          </div>
        ))
      )}

      {condutas.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Biblioteca de condutas (todas as pacientes)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {condutas.map(c => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)',
                borderRadius: 20, padding: '3px 4px 3px 10px',
              }}>
                {c.texto}
                <button onClick={() => excluirConduta(c)} title="Excluir da biblioteca" style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
                  padding: 2, display: 'inline-flex', opacity: 0.6,
                }}>
                  <i className="ti ti-x" style={{ fontSize: 10 }} aria-hidden="true"></i>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <div style={{
          background: feedback.tipo === 'erro' ? 'var(--red-bg)' : 'var(--green-bg, #e8f5ea)',
          color: feedback.tipo === 'erro' ? 'var(--red)' : 'var(--green)',
          padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10,
        }}>{feedback.msg}</div>
      )}

      <button className="btn" onClick={salvar} disabled={busy}>
        <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Salvar panorama'}
      </button>
    </>
  );
}


/* ============================================================
   APRESENTAÇÃO (fullscreen pra consulta de venda)
   ============================================================ */
function PanoramaApresentacao({ pacienteNome, pontosAtencao, fases, onClose }) {
  const n = fases.length;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      zIndex: 200,
      overflow: 'auto',
      padding: '40px 32px',
    }}>
      <button onClick={onClose} style={{
        position: 'fixed', top: 20, right: 20,
        background: 'var(--dark)', color: 'var(--white)',
        border: 'none', borderRadius: 8, padding: '8px 14px',
        cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        zIndex: 201,
      }}>
        <i className="ti ti-x" aria-hidden="true"></i> Sair (ESC)
      </button>

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase',
          color: 'var(--gold-deep, #a08456)', marginBottom: 8,
        }}>
          Panorama do tratamento
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 44, fontWeight: 500,
          color: 'var(--dark)', marginBottom: 32, lineHeight: 1.1,
        }}>
          {pacienteNome}
        </h1>

        {pontosAtencao.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500,
              color: 'var(--dark)', marginBottom: 16,
            }}>
              Pontos de atenção
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {pontosAtencao.map((p, i) => (
                <span key={i} style={{
                  fontSize: 15, color: 'var(--dark)',
                  background: 'var(--white)', border: '0.5px solid var(--border)',
                  borderRadius: 20, padding: '8px 18px',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        <h2 style={{
          fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500,
          color: 'var(--dark)', marginBottom: 24,
        }}>
          Caminho do tratamento
        </h2>

        {n === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 14 }}>Nenhuma fase planejada ainda.</div>
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${n}, minmax(200px, 1fr))`,
            gridTemplateRows: 'minmax(160px, auto) 24px 44px 24px minmax(160px, auto)',
            columnGap: 22,
            minWidth: n * 222,
          }}>
            {fases.map((fase, i) => (
              <div key={`top-${i}`} style={{ gridColumn: i + 1, gridRow: 1, alignSelf: 'end' }}>
                {i % 2 === 0 && <BlocoFase fase={fase} numero={i + 1} />}
              </div>
            ))}
            {fases.map((fase, i) => (
              <div key={`conn-top-${i}`} style={{ gridColumn: i + 1, gridRow: 2, display: 'flex', justifyContent: 'center' }}>
                {i % 2 === 0 && <div style={{ width: 2, height: '100%', background: 'var(--border)' }} />}
              </div>
            ))}
            <div style={{
              gridColumn: `1 / ${n + 1}`, gridRow: 3, position: 'relative',
              display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(200px, 1fr))`, alignItems: 'center',
            }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: '50%',
                height: 3, background: 'var(--border)', transform: 'translateY(-50%)',
              }} />
              {fases.map((fase, i) => (
                <div key={`dot-${i}`} style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'var(--gold-deep, #a08456)',
                    border: '3px solid var(--bg)', boxShadow: '0 0 0 1px var(--border)',
                  }} />
                </div>
              ))}
            </div>
            {fases.map((fase, i) => (
              <div key={`conn-bottom-${i}`} style={{ gridColumn: i + 1, gridRow: 4, display: 'flex', justifyContent: 'center' }}>
                {i % 2 === 1 && <div style={{ width: 2, height: '100%', background: 'var(--border)' }} />}
              </div>
            ))}
            {fases.map((fase, i) => (
              <div key={`bottom-${i}`} style={{ gridColumn: i + 1, gridRow: 5, alignSelf: 'start' }}>
                {i % 2 === 1 && <BlocoFase fase={fase} numero={i + 1} />}
              </div>
            ))}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlocoFase({ fase }) {
  return (
    <div style={{
      background: 'var(--white)', border: '0.5px solid var(--border)',
      borderRadius: 14, padding: '18px 20px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--dark)', marginBottom: fase.condutas?.length || fase.texto ? 10 : 0 }}>
        {fase.titulo}
      </div>
      {fase.condutas?.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          {fase.condutas.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
      {fase.texto && (
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: fase.condutas?.length ? 8 : 0, lineHeight: 1.6 }}>
          {fase.texto}
        </div>
      )}
    </div>
  );
}
