import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

const TIPOGRAFIAS = [
  { id: 'classica',  nome: 'Clássica',  desc: 'Cormorant + Inter — elegante e atemporal' },
  { id: 'modern',    nome: 'Modern',    desc: 'Manrope — geométrica e contemporânea' },
  { id: 'minimal',   nome: 'Minimal',   desc: 'Inter — limpa e funcional' },
  { id: 'romantica', nome: 'Romântica', desc: 'Playfair + Lato — feminina e suave' },
];

const PALETAS_PRONTAS = [
  { nome: 'Dourado Lapidare', primaria: '#a08456', secundaria: '#c9a96e' },
  { nome: 'Rose Gold',        primaria: '#b76e79', secundaria: '#d4a5a5' },
  { nome: 'Verde Sálvia',     primaria: '#5e7a6b', secundaria: '#9bb19f' },
  { nome: 'Terracota',        primaria: '#a0613f', secundaria: '#d4926a' },
  { nome: 'Lavanda',          primaria: '#8e7aa3', secundaria: '#bca8c9' },
  { nome: 'Azul Sereno',      primaria: '#5a7a99', secundaria: '#9fb5cc' },
];

export default function Personalizacao() {
  const { user, profile } = useSession();
  const [form, setForm] = useState({
    marca_nome: 'Lapidare',
    marca_subtitulo: '',
    logo_url: null,
    cor_primaria: '#a08456',
    cor_secundaria: '#c9a96e',
    tipografia: 'classica',
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      marca_nome: profile.marca_nome ?? 'Lapidare',
      marca_subtitulo: profile.marca_subtitulo ?? '',
      logo_url: profile.logo_url ?? null,
      cor_primaria: profile.cor_primaria ?? '#a08456',
      cor_secundaria: profile.cor_secundaria ?? '#c9a96e',
      tipografia: profile.tipografia ?? 'classica',
    });
  }, [profile]);

  async function salvar() {
    setErro(null); setFeedback(null);
    if (!form.marca_nome.trim()) return setErro('Informe o nome da marca.');
    setBusy(true);
    const { error } = await supabase.from('nutris').update({
      marca_nome: form.marca_nome.trim(),
      marca_subtitulo: form.marca_subtitulo.trim() || null,
      logo_url: form.logo_url,
      cor_primaria: form.cor_primaria,
      cor_secundaria: form.cor_secundaria,
      tipografia: form.tipografia,
    }).eq('id', user.id);
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    setFeedback('Personalização salva! Recarregue a página pra ver tudo aplicado.');
  }

  async function aplicarPaleta(p) {
    setForm(f => ({ ...f, cor_primaria: p.primaria, cor_secundaria: p.secundaria }));
    // aplica preview imediato (cobertura completa via useEffect abaixo)
  }

  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert('Imagem muito grande (máx 2 MB).');
    setUploading(true);

    // Remove logo antiga se existir
    if (form.logo_url) {
      try {
        const u = new URL(form.logo_url);
        const oldPath = u.pathname.split('/logos/')[1];
        if (oldPath) await supabase.storage.from('logos').remove([oldPath]);
      } catch { /* ignore */ }
    }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('logos')
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) {
      setUploading(false);
      return alert('Erro no upload: ' + upErr.message);
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    setForm(f => ({ ...f, logo_url: data.publicUrl }));
    setUploading(false);
  }

  function removerLogo() {
    if (!window.confirm('Remover logo?')) return;
    setForm(f => ({ ...f, logo_url: null }));
  }

  // Aplica preview ao vivo das mudanças de cor/tipografia
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--gold-deep', form.cor_primaria);
    r.style.setProperty('--amber',     form.cor_secundaria);
    r.style.setProperty('--gold',      form.cor_secundaria);
    r.style.setProperty('--dark',      form.cor_primaria);
    r.dataset.tipografia = form.tipografia;
  }, [form.cor_primaria, form.cor_secundaria, form.tipografia]);

  return (
    <>
      <div className="page-title">Personalização</div>
      <div className="page-sub">Deixe o app com a cara da sua marca — sem mexer em código</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20 }}>
        <div>
          {/* Marca */}
          <div className="card" style={{ padding: 18, marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Marca</div>

            <label className="form-lbl">Nome da marca</label>
            <input value={form.marca_nome} onChange={e => setForm(f => ({ ...f, marca_nome: e.target.value }))}
              placeholder="Ex: Lapidare, Nutri Ana, Sara Dias..." />

            <label className="form-lbl" style={{ marginTop: 10 }}>Subtítulo (opcional)</label>
            <input value={form.marca_subtitulo} onChange={e => setForm(f => ({ ...f, marca_subtitulo: e.target.value }))}
              placeholder="Ex: Nutrição estratégica · Reeducação alimentar" />

            <label className="form-lbl" style={{ marginTop: 14 }}>Logo</label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: 12, border: '0.5px dashed var(--border)',
              borderRadius: 10, background: 'var(--bg2)',
            }}>
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" style={{
                  width: 60, height: 60, objectFit: 'contain',
                  background: 'var(--white)', borderRadius: 8, padding: 4,
                }} />
              ) : (
                <div style={{
                  width: 60, height: 60, borderRadius: 8,
                  background: 'var(--white)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text3)', fontSize: 11, fontWeight: 500,
                }}>Sem logo</div>
              )}
              <div style={{ flex: 1 }}>
                <input type="file" accept="image/*" onChange={uploadLogo}
                  disabled={uploading}
                  style={{ fontSize: 12 }} />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  PNG ou SVG · máx 2 MB · ideal 300×300px
                </div>
              </div>
              {form.logo_url && (
                <button onClick={removerLogo}
                  style={{
                    background: 'none', border: '0.5px solid var(--red)',
                    borderRadius: 6, padding: '4px 8px',
                    color: 'var(--red)', cursor: 'pointer', fontSize: 12,
                  }}>
                  <i className="ti ti-trash" aria-hidden="true"></i> Remover
                </button>
              )}
            </div>
          </div>

          {/* Cores */}
          <div className="card" style={{ padding: 18, marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Cores</div>

            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }}>
              Paletas prontas
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {PALETAS_PRONTAS.map(p => (
                <button key={p.nome} onClick={() => aplicarPaleta(p)}
                  style={{
                    background: 'var(--white)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 8, padding: 8, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', textAlign: 'left',
                  }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 4, background: p.primaria, display: 'block' }}></span>
                    <span style={{ width: 18, height: 18, borderRadius: 4, background: p.secundaria, display: 'block' }}></span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>{p.nome}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-lbl">Cor primária</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={form.cor_primaria}
                    onChange={e => setForm(f => ({ ...f, cor_primaria: e.target.value }))}
                    style={{ width: 50, height: 36, padding: 0, border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} />
                  <input value={form.cor_primaria}
                    onChange={e => setForm(f => ({ ...f, cor_primaria: e.target.value }))}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }} />
                </div>
              </div>
              <div>
                <label className="form-lbl">Cor secundária</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={form.cor_secundaria}
                    onChange={e => setForm(f => ({ ...f, cor_secundaria: e.target.value }))}
                    style={{ width: 50, height: 36, padding: 0, border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} />
                  <input value={form.cor_secundaria}
                    onChange={e => setForm(f => ({ ...f, cor_secundaria: e.target.value }))}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Tipografia */}
          <div className="card" style={{ padding: 18 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Tipografia</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {TIPOGRAFIAS.map(t => {
                const ativo = form.tipografia === t.id;
                return (
                  <button key={t.id} onClick={() => setForm(f => ({ ...f, tipografia: t.id }))}
                    style={{
                      background: ativo ? 'var(--amber-bg, var(--bg2))' : 'var(--white)',
                      border: `0.5px solid ${ativo ? 'var(--gold-deep)' : 'var(--border)'}`,
                      borderWidth: ativo ? 2 : 1,
                      borderRadius: 10, padding: 14, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', textAlign: 'left',
                    }}>
                    <div style={{
                      fontSize: 18, fontWeight: 500, marginBottom: 4,
                      fontFamily: previewFontPara(t.id),
                    }}>{t.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{t.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Preview à direita */}
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Preview ao vivo</div>
          <div style={{
            background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 12, padding: 18, position: 'sticky', top: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {form.logo_url ? (
                <img src={form.logo_url} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: form.cor_primaria,
                }}></div>
              )}
              <div>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 500,
                }}>{form.marca_nome}</div>
                {form.marca_subtitulo && (
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{form.marca_subtitulo}</div>
                )}
              </div>
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: form.cor_primaria, color: '#fff',
              fontSize: 13, fontWeight: 500, marginBottom: 8,
              textAlign: 'center',
            }}>
              Botão primário
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'transparent',
              border: `0.5px solid ${form.cor_secundaria}`,
              color: form.cor_secundaria,
              fontSize: 13, fontWeight: 500, marginBottom: 14,
              textAlign: 'center',
            }}>
              Botão secundário
            </div>

            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>
              Tipografia
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, lineHeight: 1.2 }}>
              Bom dia, Ana
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              Texto de corpo · Inter / Manrope / Lato
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
              ✨ As mudanças aparecem na hora no painel. Pra ver no app da paciente, peça pra ela recarregar.
            </div>
          </div>
        </div>
      </div>

      {/* Salvar */}
      <div style={{
        marginTop: 18, padding: 14,
        background: 'var(--white)', borderRadius: 12,
        border: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
        position: 'sticky', bottom: 16,
      }}>
        <div style={{ flex: 1 }}>
          {erro && <div style={{ color: 'var(--red)', fontSize: 13 }}>{erro}</div>}
          {feedback && <div style={{ color: 'var(--green)', fontSize: 13 }}>{feedback}</div>}
        </div>
        <button className="btn" onClick={salvar} disabled={busy}>
          <i className="ti ti-device-floppy" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Salvar personalização'}
        </button>
      </div>
    </>
  );
}

function previewFontPara(id) {
  switch (id) {
    case 'modern':    return '"Manrope", sans-serif';
    case 'minimal':   return '"Inter", sans-serif';
    case 'romantica': return '"Playfair Display", serif';
    default:          return '"Cormorant Garamond", serif';
  }
}
