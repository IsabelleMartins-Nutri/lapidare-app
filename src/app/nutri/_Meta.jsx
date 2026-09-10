import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';

// Acha o peso registrado com data mais próxima da data informada — usado
// pra achar "quanto ela pesava quando a meta foi definida" e "quanto ela
// pesou na consulta seguinte", mesmo sem uma avaliação exatamente naquele dia.
function pesoProximo(dataAlvo, registros) {
  if (!registros?.length) return null;
  const alvo = new Date(dataAlvo + 'T12:00:00').getTime();
  let melhor = null;
  let menorDif = Infinity;
  for (const r of registros) {
    if (r.kg == null) continue;
    const dif = Math.abs(new Date(r.data + 'T12:00:00').getTime() - alvo);
    if (dif < menorDif) { menorDif = dif; melhor = r; }
  }
  return melhor;
}

export default function Meta({ pacienteId, nutriId, pacienteNome }) {
  const [metas, setMetas] = useState(null);
  const [pesos, setPesos] = useState([]);
  const [editar, setEditar] = useState(null);

  async function carregar() {
    const [mRes, pRes] = await Promise.all([
      supabase.from('metas_consulta').select('*')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('peso_registros').select('id, data, kg')
        .eq('paciente_id', pacienteId)
        .order('data'),
    ]);
    setMetas(mRes.data ?? []);
    setPesos(pRes.data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId, nutriId]);

  async function excluir(m) {
    if (!window.confirm('Excluir essa meta?')) return;
    await supabase.from('metas_consulta').delete().eq('id', m.id);
    carregar();
  }

  function novaEmBranco() {
    setEditar({
      novo: true,
      meta: '',
      peso_alvo_kg: '',
      data: new Date().toISOString().slice(0, 10),
    });
  }

  // metasOrdenadas: cronológica (mais antiga primeiro), pra achar a "próxima
  // meta" de cada uma — a lista exibida continua mais recente primeiro.
  const metasCron = metas ? [...metas].sort((a, b) => a.data.localeCompare(b.data)) : [];

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Metas de {pacienteNome?.split(' ')[0] ?? 'paciente'}</div>
            <div className="card-sub">O que foi combinado em cada consulta, e o peso que ela voltou</div>
          </div>
          <button className="btn" onClick={novaEmBranco}>
            <i className="ti ti-plus" aria-hidden="true"></i> Nova meta
          </button>
        </div>

        <div className="card-body">
          {metas === null ? (
            <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13 }}>Carregando…</div>
          ) : metas.length === 0 ? (
            <div className="empty-card" style={{ padding: 24 }}>
              <i className="ti ti-target-arrow empty-icon" aria-hidden="true"></i>
              <div className="empty-title">Nenhuma meta registrada ainda</div>
              <div className="empty-sub">
                Anote a meta combinada nessa consulta — na próxima, dá pra comparar com o peso que ela voltou.
              </div>
              <button className="btn" onClick={novaEmBranco}>
                <i className="ti ti-plus" aria-hidden="true"></i> Registrar primeira meta
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {metas.map(m => {
                const idxCron = metasCron.findIndex(x => x.id === m.id);
                const proximaMeta = metasCron[idxCron + 1];
                const pesoNaMeta = pesoProximo(m.data, pesos);
                const pesoDepois = proximaMeta
                  ? pesoProximo(proximaMeta.data, pesos)
                  : (pesos.length ? pesos[pesos.length - 1] : null);
                const mostrarComparacao = pesoDepois && (!pesoNaMeta || pesoDepois.id !== pesoNaMeta.id);
                const delta = (pesoNaMeta && pesoDepois) ? Number(pesoDepois.kg) - Number(pesoNaMeta.kg) : null;

                return (
                  <div key={m.id} style={{
                    border: '0.5px solid var(--border)', borderRadius: 10,
                    padding: 14, background: 'var(--white)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                      <div style={{
                        flexShrink: 0, padding: '4px 10px',
                        borderRadius: 6, background: 'var(--bg2)',
                        fontSize: 11, fontWeight: 500, color: 'var(--dark)',
                      }}>
                        {dataBR(m.data)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{m.meta}</div>
                        {m.peso_alvo_kg != null && (
                          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                            Peso alvo: {Number(m.peso_alvo_kg).toFixed(1).replace('.', ',')} kg
                          </div>
                        )}
                        {(pesoNaMeta || mostrarComparacao) && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            fontSize: 12, color: 'var(--text2)', marginTop: 8,
                            background: 'var(--bg2)', borderRadius: 6, padding: '6px 10px',
                          }}>
                            {pesoNaMeta && (
                              <span>Peso na data da meta ({dataBR(pesoNaMeta.data)}): <strong>{Number(pesoNaMeta.kg).toFixed(1).replace('.', ',')} kg</strong></span>
                            )}
                            {mostrarComparacao && (
                              <>
                                <span style={{ color: 'var(--text3)' }}>→</span>
                                <span>
                                  {proximaMeta ? 'Peso na consulta seguinte' : 'Peso mais recente'} ({dataBR(pesoDepois.data)}): <strong>{Number(pesoDepois.kg).toFixed(1).replace('.', ',')} kg</strong>
                                </span>
                                {delta != null && (
                                  <span className={`pill ${delta <= 0 ? 'pill-g' : 'pill-r'}`}>
                                    {delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta).toFixed(1).replace('.', ',')} kg
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button onClick={() => setEditar({ ...m, novo: false })}
                          className="btn-outline" style={{ fontSize: 10, padding: '3px 8px' }}>
                          <i className="ti ti-edit" aria-hidden="true"></i>
                        </button>
                        <button onClick={() => excluir(m)}
                          style={{
                            background: 'none', border: '0.5px solid var(--red)',
                            borderRadius: 6, padding: '3px 8px',
                            color: 'var(--red)', cursor: 'pointer',
                          }}>
                          <i className="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editar && (
        <ModalEditarMeta
          m={editar} pacienteId={pacienteId} nutriId={nutriId}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); carregar(); }}
        />
      )}
    </>
  );
}


/* ============================================================
   MODAL: criar/editar uma meta
   ============================================================ */
function ModalEditarMeta({ m, pacienteId, nutriId, onClose, onSaved }) {
  const [meta, setMeta] = useState(m.meta);
  const [pesoAlvo, setPesoAlvo] = useState(m.peso_alvo_kg != null ? String(m.peso_alvo_kg) : '');
  const [data, setData] = useState(m.data);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  function num(v) {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }

  async function salvar() {
    setErro(null);
    if (!meta.trim()) return setErro('Escreva a meta combinada.');
    setBusy(true);
    const payload = {
      meta: meta.trim(),
      peso_alvo_kg: num(pesoAlvo),
      data,
    };
    if (m.novo) {
      const { error } = await supabase.from('metas_consulta').insert({
        paciente_id: pacienteId, nutri_id: nutriId, ...payload,
      });
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    } else {
      const { error } = await supabase.from('metas_consulta').update(payload).eq('id', m.id);
      if (error) { setBusy(false); return setErro('Erro: ' + error.message); }
    }
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
        maxWidth: 520, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {m.novo ? 'Nova meta' : 'Editar meta'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Anotação privada da nutri
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Data</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} />

        <label className="form-lbl" style={{ marginTop: 10 }}>Meta combinada</label>
        <textarea value={meta} onChange={e => setMeta(e.target.value)} rows={3}
          placeholder="Ex: Perder 2kg até a próxima consulta"
          style={{
            width: '100%', boxSizing: 'border-box',
            resize: 'vertical', minHeight: 64,
            fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5,
          }} />

        <label className="form-lbl" style={{ marginTop: 10 }}>Peso alvo (kg, opcional)</label>
        <input inputMode="decimal" value={pesoAlvo} onChange={e => setPesoAlvo(e.target.value)}
          placeholder="ex: 68" style={{ maxWidth: 160 }} />

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
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
