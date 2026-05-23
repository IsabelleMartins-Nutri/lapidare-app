import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';

export default function Suplementacao({ pacienteId, nutriId, pacienteNome }) {
  const [suplementos, setSuplementos] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [editar, setEditar] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);

  async function carregar() {
    const [supRes, logRes, pdfRes] = await Promise.all([
      supabase.from('suplementos').select('*').eq('paciente_id', pacienteId).order('ordem'),
      supabase.from('suplementos_logs').select('*')
        .eq('paciente_id', pacienteId)
        .gte('data', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .order('data', { ascending: false }),
      supabase.from('prescricoes').select('id, titulo, storage_path, created_at')
        .eq('paciente_id', pacienteId).eq('tipo', 'suplementacao')
        .order('created_at', { ascending: false }),
    ]);
    setSuplementos(supRes.data ?? []);
    setLogs(logRes.data ?? []);
    setPdfs(pdfRes.data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function salvar(s) {
    if (!s.nome?.trim()) { alert('Informe o nome do suplemento.'); return; }
    setBusy(true);
    if (s.novo) {
      const ordem = (suplementos?.length ?? 0);
      await supabase.from('suplementos').insert({
        paciente_id: pacienteId, nutri_id: nutriId,
        nome: s.nome.trim(), dose: s.dose?.trim() || null,
        horario: s.horario?.trim() || null, obs: s.obs?.trim() || null,
        ativo: true, ordem,
      });
    } else {
      await supabase.from('suplementos').update({
        nome: s.nome.trim(), dose: s.dose?.trim() || null,
        horario: s.horario?.trim() || null, obs: s.obs?.trim() || null,
        ativo: s.ativo, updated_at: new Date().toISOString(),
      }).eq('id', s.id);
    }
    setBusy(false);
    setEditar(null);
    carregar();
  }

  async function excluir(s) {
    if (!window.confirm(`Excluir "${s.nome}"? Os logs de aderência também serão removidos.`)) return;
    await supabase.from('suplementos').delete().eq('id', s.id);
    carregar();
  }

  async function subirPdf() {
    if (!pdfFile) return;
    setBusy(true);
    const ext = (pdfFile.name.split('.').pop() || 'pdf').toLowerCase();
    const titulo = pdfFile.name.replace(/\.[^.]+$/, '');
    const path = `${pacienteId}/${Date.now()}-suplementacao.${ext}`;
    const { error: upErr } = await supabase.storage.from('prescricoes')
      .upload(path, pdfFile, { contentType: pdfFile.type });
    if (upErr) { setBusy(false); alert('Erro: ' + upErr.message); return; }
    await supabase.from('prescricoes').insert({
      paciente_id: pacienteId, nutri_id: nutriId,
      tipo: 'suplementacao', titulo,
      storage_path: path,
    });
    setBusy(false);
    setPdfFile(null);
    const inp = document.getElementById('sup-pdf-file');
    if (inp) inp.value = '';
    carregar();
  }

  async function abrirPdf(pdf) {
    const { data, error } = await supabase.storage.from('prescricoes').createSignedUrl(pdf.storage_path, 120);
    if (error) return alert('Erro: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function excluirPdf(pdf) {
    if (!window.confirm(`Excluir PDF "${pdf.titulo}"?`)) return;
    await supabase.storage.from('prescricoes').remove([pdf.storage_path]);
    await supabase.from('prescricoes').delete().eq('id', pdf.id);
    carregar();
  }

  // Aderência: % de dias-suplemento marcados nos últimos 7 dias
  const aderencia = useMemo(() => {
    const ativos = (suplementos ?? []).filter(s => s.ativo);
    if (ativos.length === 0) return null;
    const dias7 = [];
    for (let i = 6; i >= 0; i--) {
      dias7.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    }
    const esperado = ativos.length * dias7.length;
    const cumprido = logs.filter(l =>
      l.tomado && dias7.includes(l.data) && ativos.some(s => s.id === l.suplemento_id)
    ).length;
    return Math.round((cumprido / esperado) * 100);
  }, [suplementos, logs]);

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Suplementação de {pacienteNome?.split(' ')[0] ?? 'paciente'}</div>
            <div className="card-sub">Lista pra ela checar todo dia + PDF da prescrição</div>
          </div>
          <button className="btn" onClick={() => setEditar({ novo: true, nome: '', dose: '', horario: '', obs: '', ativo: true })}>
            <i className="ti ti-plus" aria-hidden="true"></i> Novo suplemento
          </button>
        </div>

        <div className="card-body">
          {/* Aderência */}
          {aderencia !== null && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: 12, borderRadius: 10,
              background: aderencia >= 70 ? 'var(--green-bg)' : aderencia >= 40 ? 'var(--orange-bg)' : 'var(--red-bg)',
              border: `0.5px solid var(--${aderencia >= 70 ? 'green' : aderencia >= 40 ? 'orange' : 'red'})`,
              marginBottom: 14,
            }}>
              <div style={{
                fontSize: 24, fontWeight: 600,
                color: `var(--${aderencia >= 70 ? 'green' : aderencia >= 40 ? 'orange' : 'red'})`,
              }}>{aderencia}%</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>Aderência últimos 7 dias</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {aderencia >= 70 ? 'Excelente — paciente engajada' :
                   aderencia >= 40 ? 'Atenção — converse no próximo check-in' :
                                     'Baixa aderência — vale investigar o motivo'}
                </div>
              </div>
            </div>
          )}

          {/* Lista de suplementos */}
          <div style={{
            fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 500, marginBottom: 8,
          }}>Suplementos prescritos</div>

          {suplementos === null ? (
            <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Carregando…</div>
          ) : suplementos.length === 0 ? (
            <div style={{
              padding: '14px 16px', borderRadius: 8, background: 'var(--bg2)',
              fontSize: 12, color: 'var(--text3)',
            }}>
              Nenhum suplemento adicionado. Clica em "Novo suplemento" pra começar.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {suplementos.map(s => (
                <div key={s.id} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  padding: 12, borderRadius: 8,
                  background: s.ativo ? 'var(--white)' : 'var(--bg2)',
                  border: '0.5px solid var(--border)',
                  opacity: s.ativo ? 1 : 0.6,
                }}>
                  <i className="ti ti-pill" style={{ fontSize: 18, color: 'var(--gold-deep, var(--dark))' }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {s.nome}
                      {!s.ativo && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>(pausado)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {s.dose && <span><i className="ti ti-droplet" aria-hidden="true"></i> {s.dose}</span>}
                      {s.horario && <span><i className="ti ti-clock" aria-hidden="true"></i> {s.horario}</span>}
                      {s.obs && <span style={{ fontStyle: 'italic' }}>"{s.obs}"</span>}
                    </div>
                  </div>
                  <button onClick={() => setEditar({ ...s, novo: false })} className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                    <i className="ti ti-edit" aria-hidden="true"></i>
                  </button>
                  <button onClick={() => excluir(s)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '3px 8px', color: 'var(--red)', cursor: 'pointer',
                    }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* PDF da prescrição */}
          <div style={{
            marginTop: 18, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text3)', fontWeight: 500, marginBottom: 8,
          }}>Prescrição em PDF</div>

          <div style={{
            border: '1.5px dashed var(--border)', borderRadius: 8,
            padding: 12, marginBottom: 10,
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <input id="sup-pdf-file" type="file" accept="application/pdf"
              onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              style={{ flex: 1, padding: 4 }} />
            <button className="btn" onClick={subirPdf} disabled={!pdfFile || busy}>
              <i className="ti ti-upload" aria-hidden="true"></i> Subir
            </button>
          </div>

          {pdfs.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Nenhuma prescrição em PDF enviada.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pdfs.map(pdf => (
                <div key={pdf.id} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  padding: 10, borderRadius: 8, background: 'var(--white)',
                  border: '0.5px solid var(--border)',
                }}>
                  <i className="ti ti-file-text" style={{ fontSize: 16, color: 'var(--text3)' }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{pdf.titulo}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Enviado em {dataBR(pdf.created_at)}</div>
                  </div>
                  <button onClick={() => abrirPdf(pdf)} className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                  </button>
                  <button onClick={() => excluirPdf(pdf)}
                    style={{
                      background: 'none', border: '0.5px solid var(--red)',
                      borderRadius: 6, padding: '3px 8px', color: 'var(--red)', cursor: 'pointer',
                    }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editar && (
        <ModalSuplemento s={editar} onClose={() => setEditar(null)} onSave={salvar} busy={busy} />
      )}
    </>
  );
}


function ModalSuplemento({ s, onClose, onSave, busy }) {
  const [form, setForm] = useState(s);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 480, width: '100%', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{s.novo ? 'Novo suplemento' : 'Editar suplemento'}</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <label className="form-lbl">Nome</label>
        <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
          placeholder="Ex: Vitamina D3 2000UI" autoFocus />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <label className="form-lbl">Dose</label>
            <input value={form.dose ?? ''} onChange={e => setForm({ ...form, dose: e.target.value })}
              placeholder="1 cápsula, 5g..." />
          </div>
          <div>
            <label className="form-lbl">Horário</label>
            <input value={form.horario ?? ''} onChange={e => setForm({ ...form, horario: e.target.value })}
              placeholder="Café da manhã, 08:00..." />
          </div>
        </div>

        <label className="form-lbl" style={{ marginTop: 10 }}>Observação (opcional)</label>
        <input value={form.obs ?? ''} onChange={e => setForm({ ...form, obs: e.target.value })}
          placeholder="Tomar em jejum, com gordura..." />

        {!s.novo && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 14, fontSize: 13, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={!form.ativo}
              onChange={e => setForm({ ...form, ativo: !e.target.checked })} />
            Pausar (paciente não vê na lista do dia)
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onSave(form)} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
