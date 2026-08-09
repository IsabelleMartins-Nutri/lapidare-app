import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

export default function Beneficios() {
  const { user } = useSession();
  const [beneficios, setBeneficios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null); // null = não, {} = novo, {id} = editar
  const [toast, setToast] = useState(null);

  async function carregar() {
    if (!user) return;
    const { data } = await supabase.from('beneficios')
      .select('*').eq('nutri_id', user.id)
      .order('ordem', { ascending: true }).order('created_at', { ascending: true });
    setBeneficios(data ?? []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [user]);

  function mostraToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function toggleAtivo(b) {
    await supabase.from('beneficios').update({ ativo: !b.ativo }).eq('id', b.id);
    carregar();
  }
  async function excluir(b) {
    if (!window.confirm(`Excluir "${b.marca}"?`)) return;
    await supabase.from('beneficios').delete().eq('id', b.id);
    mostraToast('Benefício excluído');
    carregar();
  }
  async function mover(index, dir) {
    const alvo = index + dir;
    if (alvo < 0 || alvo >= beneficios.length) return;
    const a = beneficios[index], b = beneficios[alvo];
    await Promise.all([
      supabase.from('beneficios').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('beneficios').update({ ordem: a.ordem }).eq('id', b.id),
    ]);
    carregar();
  }

  const proximaOrdem = beneficios.reduce((max, b) => Math.max(max, b.ordem), -1) + 1;

  return (
    <>
      <div className="page-title">Benefícios</div>
      <div className="page-sub">
        Parcerias e cupons de desconto — cadastre aqui e todas as suas pacientes veem no app delas.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn" onClick={() => setEditando({})}>
          <i className="ti ti-plus" aria-hidden="true"></i> Novo benefício
        </button>
      </div>

      {carregando ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : beneficios.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-gift empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhum benefício cadastrado</div>
          <div className="empty-sub">
            Cadastre parcerias com marcas (imagem, link do site, cupom de desconto) pra suas pacientes verem no app.
          </div>
          <button className="btn" onClick={() => setEditando({})}>
            <i className="ti ti-plus" aria-hidden="true"></i> Cadastrar primeiro benefício
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {beneficios.map((b, i) => (
            <BeneficioRow key={b.id} b={b} isLast={i === beneficios.length - 1} isFirst={i === 0}
              onEditar={() => setEditando(b)}
              onToggle={() => toggleAtivo(b)}
              onExcluir={() => excluir(b)}
              onSubir={() => mover(i, -1)}
              onDescer={() => mover(i, 1)} />
          ))}
        </div>
      )}

      {editando !== null && (
        <EditorBeneficio
          beneficio={editando}
          nutriId={user.id}
          proximaOrdem={proximaOrdem}
          onClose={() => setEditando(null)}
          onSaved={async () => { setEditando(null); await carregar(); mostraToast('Benefício salvo'); }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--dark)', color: '#faf8f5',
          padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 500, zIndex: 200,
        }}>{toast}</div>
      )}
    </>
  );
}

function BeneficioRow({ b, isLast, isFirst, onEditar, onToggle, onExcluir, onSubir, onDescer }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : '0.5px solid #f5f0e8',
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: b.ativo ? 1 : .55,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {b.imagem_url
          ? <img src={b.imagem_url} alt={b.marca} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <i className="ti ti-gift" style={{ fontSize: 18, color: 'var(--text3)' }} aria-hidden="true"></i>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{b.marca}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {b.cupom && `Cupom: ${b.cupom}`}
          {b.cupom && b.descricao && ' · '}
          {b.descricao}
        </div>
      </div>
      <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onSubir} disabled={isFirst} title="Mover pra cima"
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 8px', cursor: isFirst ? 'default' : 'pointer',
            color: isFirst ? 'var(--text4)' : 'var(--text2)', fontSize: 13,
          }}>
          <i className="ti ti-chevron-up" aria-hidden="true"></i>
        </button>
        <button onClick={onDescer} disabled={isLast} title="Mover pra baixo"
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 8px', cursor: isLast ? 'default' : 'pointer',
            color: isLast ? 'var(--text4)' : 'var(--text2)', fontSize: 13,
          }}>
          <i className="ti ti-chevron-down" aria-hidden="true"></i>
        </button>
        <button onClick={onToggle} title={b.ativo ? 'Desativar' : 'Ativar'}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
            color: 'var(--text3)', fontSize: 13,
          }}>
          <i className={`ti ti-${b.ativo ? 'eye' : 'eye-off'}`} aria-hidden="true"></i>
        </button>
        <button onClick={onEditar}
          style={{
            background: 'none', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 13,
          }}>
          <i className="ti ti-pencil" aria-hidden="true"></i>
        </button>
        <button onClick={onExcluir}
          style={{
            background: 'none', border: '0.5px solid var(--red)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
            color: 'var(--red)', fontSize: 13,
          }}>
          <i className="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

function EditorBeneficio({ beneficio, nutriId, proximaOrdem, onClose, onSaved }) {
  const isEdit = !!beneficio?.id;
  const [marca, setMarca] = useState(beneficio?.marca ?? '');
  const [descricao, setDescricao] = useState(beneficio?.descricao ?? '');
  const [link, setLink] = useState(beneficio?.link ?? '');
  const [cupom, setCupom] = useState(beneficio?.cupom ?? '');
  const [imagemUrl, setImagemUrl] = useState(beneficio?.imagem_url ?? '');
  const [ativo, setAtivo] = useState(beneficio?.ativo ?? true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function uploadImagem(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert('Imagem muito grande (máx 2 MB).');
    setUploading(true);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${nutriId}/beneficios/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('logos')
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) {
      setUploading(false);
      return alert('Erro no upload: ' + upErr.message);
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    setImagemUrl(data.publicUrl);
    setUploading(false);
  }

  async function salvar() {
    setErro(null);
    if (!marca.trim()) return setErro('Informe o nome da marca/parceria.');

    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      marca: marca.trim(),
      descricao: descricao.trim() || null,
      link: link.trim() || null,
      cupom: cupom.trim() || null,
      imagem_url: imagemUrl || null,
      ativo,
    };
    const { error } = isEdit
      ? await supabase.from('beneficios').update(payload).eq('id', beneficio.id)
      : await supabase.from('beneficios').insert({ ...payload, ordem: proximaOrdem });
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 420, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>
          {isEdit ? 'Editar benefício' : 'Novo benefício'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Aparece pra todas as suas pacientes, em "Mais → Benefícios"
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Marca/parceria</label>
        <input value={marca} onChange={e => setMarca(e.target.value)} placeholder="Ex: Pura Vida" />

        <label className="form-lbl">Imagem</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {imagemUrl && (
            <img src={imagemUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
          )}
          <input type="file" accept="image/*" onChange={uploadImagem} disabled={uploading} />
        </div>
        {uploading && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Enviando imagem...</div>}

        <label className="form-lbl">Link do site</label>
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="Ex: https://puravida.com.br" />

        <label className="form-lbl">Cupom de desconto (opcional)</label>
        <input value={cupom} onChange={e => setCupom(e.target.value)} placeholder="Ex: ISABELLE10" />

        <label className="form-lbl">Descrição (opcional)</label>
        <textarea rows="2" value={descricao} onChange={e => setDescricao(e.target.value)}
          placeholder="Ex: 10% off em toda a loja" />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
          Visível pras pacientes agora
        </label>

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy || uploading}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
