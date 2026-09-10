import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { iniciais } from '../../lib/utils.js';

export default function Receitas() {
  const { user } = useSession();
  const [receitas, setReceitas] = useState(null);
  const [urls, setUrls] = useState({});
  const [pacientes, setPacientes] = useState([]);
  const [atribuicoes, setAtribuicoes] = useState({});
  const [busca, setBusca] = useState('');
  const [editar, setEditar] = useState(null);
  const [ver, setVer] = useState(null);
  const [atribuirReceita, setAtribuirReceita] = useState(null);

  async function carregar() {
    if (!user) return;
    const [rRes, pacRes, atRes] = await Promise.all([
      supabase.from('receitas').select('*').eq('nutri_id', user.id).order('created_at', { ascending: false }),
      supabase.from('pacientes').select('id, nome, email').eq('nutri_id', user.id).order('nome'),
      supabase.from('receitas_pacientes').select('receita_id, paciente_id'),
    ]);
    const data = rRes.data ?? [];
    setReceitas(data);
    setPacientes(pacRes.data ?? []);
    const mapa = {};
    for (const a of atRes.data ?? []) {
      if (!mapa[a.receita_id]) mapa[a.receita_id] = [];
      mapa[a.receita_id].push(a.paciente_id);
    }
    setAtribuicoes(mapa);

    const novasUrls = {};
    for (const r of data) {
      if (!r.storage_path) continue;
      const { data: signed } = await supabase.storage.from('receitas').createSignedUrl(r.storage_path, 300);
      if (signed) novasUrls[r.id] = signed.signedUrl;
    }
    setUrls(novasUrls);
  }
  useEffect(() => { carregar(); }, [user]);

  async function excluir(r) {
    if (!window.confirm(`Excluir a receita "${r.nome}"?`)) return;
    if (r.storage_path) await supabase.storage.from('receitas').remove([r.storage_path]);
    await supabase.from('receitas').delete().eq('id', r.id);
    carregar();
  }

  const filtradas = useMemo(() => {
    if (!receitas) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return receitas;
    return receitas.filter(r => (r.nome ?? '').toLowerCase().includes(q));
  }, [receitas, busca]);

  return (
    <>
      <div className="page-title">Receitas</div>
      <div className="page-sub">Sua biblioteca de receitas — nome, ingredientes, modo de preparo e foto</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <input
          style={{ width: 240, margin: 0 }}
          className="input-field"
          placeholder="Buscar receita..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="btn" onClick={() => setEditar({ novo: true, nome: '', ingredientes: [], modo_preparo: '' })}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} aria-hidden="true"></i>
          Nova receita
        </button>
      </div>

      {receitas === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : receitas.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-tools-kitchen-2 empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma receita cadastrada ainda</div>
          <div className="empty-sub">Organize suas receitas com ingredientes, modo de preparo e foto.</div>
          <button className="btn" onClick={() => setEditar({ novo: true, nome: '', ingredientes: [], modo_preparo: '' })}>
            <i className="ti ti-plus" aria-hidden="true"></i> Criar primeira receita
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma receita encontrada para "{busca}".</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtradas.map(r => (
            <div key={r.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                aspectRatio: '4/3', background: 'var(--bg2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                {urls[r.id] ? (
                  <img src={urls[r.id]} alt={r.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="ti ti-tools-kitchen-2" style={{ fontSize: 32, color: 'var(--text3)' }} aria-hidden="true"></i>
                )}
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.3 }}>{r.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {(r.ingredientes ?? []).length} ingrediente{(r.ingredientes ?? []).length === 1 ? '' : 's'}
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-users" aria-hidden="true"></i>
                    {(atribuicoes[r.id]?.length ?? 0) === 0 ? 'Não atribuída' : `${atribuicoes[r.id].length} paciente${atribuicoes[r.id].length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button className="btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => setVer(r)}>
                    <i className="ti ti-eye" aria-hidden="true"></i> Ver
                  </button>
                  <button className="btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                    onClick={() => setEditar({ ...r, novo: false })}>
                    <i className="ti ti-edit" aria-hidden="true"></i> Editar
                  </button>
                  <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                    onClick={() => setAtribuirReceita(r)}>
                    <i className="ti ti-share" aria-hidden="true"></i> Atribuir
                  </button>
                  <button onClick={() => excluir(r)} title="Excluir" style={{
                    background: 'none', border: '0.5px solid var(--red)',
                    borderRadius: 6, padding: '4px 8px', color: 'var(--red)', cursor: 'pointer',
                  }}>
                    <i className="ti ti-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editar && (
        <ModalEditarReceita
          receita={editar} nutriId={user.id} urlAtual={urls[editar.id]}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); carregar(); }}
        />
      )}

      {ver && (
        <ModalVerReceita receita={ver} url={urls[ver.id]} onClose={() => setVer(null)} />
      )}

      {atribuirReceita && (
        <ModalAtribuir
          receita={atribuirReceita}
          pacientes={pacientes}
          atribuidos={atribuicoes[atribuirReceita.id] ?? []}
          onClose={() => setAtribuirReceita(null)}
          onSaved={() => { setAtribuirReceita(null); carregar(); }}
        />
      )}
    </>
  );
}


function ModalShell({ title, subtitle, onClose, children, width = 480 }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: width, width: '100%', maxHeight: '90vh',
        overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--dark)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
        {children}
      </div>
    </div>
  );
}


function ModalVerReceita({ receita, url, onClose }) {
  return (
    <ModalShell title={receita.nome} onClose={onClose} width={560}>
      {url && (
        <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 14, aspectRatio: '16/9', background: 'var(--bg2)' }}>
          <img src={url} alt={receita.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 500 }}>
        Ingredientes
      </div>
      {(receita.ingredientes ?? []).length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14 }}>Nenhum ingrediente cadastrado.</div>
      ) : (
        <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: 'var(--dark)', lineHeight: 1.7 }}>
          {receita.ingredientes.map((ing, i) => <li key={i}>{ing}</li>)}
        </ul>
      )}
      <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 500 }}>
        Modo de preparo
      </div>
      <div style={{ fontSize: 13, color: 'var(--dark)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {receita.modo_preparo || 'Nenhuma instrução cadastrada.'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}


function ModalEditarReceita({ receita, nutriId, urlAtual, onClose, onSaved }) {
  const [nome, setNome] = useState(receita.nome);
  const [ingredientes, setIngredientes] = useState(receita.ingredientes ?? []);
  const [novoIngrediente, setNovoIngrediente] = useState('');
  const [modoPreparo, setModoPreparo] = useState(receita.modo_preparo ?? '');
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  function adicionarIngrediente() {
    const texto = novoIngrediente.trim();
    if (!texto) return;
    setIngredientes(list => [...list, texto]);
    setNovoIngrediente('');
  }
  function removerIngrediente(i) {
    setIngredientes(list => list.filter((_, idx) => idx !== i));
  }

  function escolherArquivo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    setPreview(URL.createObjectURL(f));
  }

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome da receita.');
    setBusy(true);

    let storagePath = receita.storage_path ?? null;
    if (arquivo) {
      const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${nutriId}/${Date.now()}-${nome.trim().replace(/[^a-z0-9]/gi, '_')}.${ext}`;
      const { error: upErr } = await supabase.storage.from('receitas')
        .upload(path, arquivo, { contentType: arquivo.type });
      if (upErr) {
        setBusy(false);
        return setErro('Upload da foto falhou: ' + upErr.message);
      }
      if (receita.storage_path) await supabase.storage.from('receitas').remove([receita.storage_path]);
      storagePath = path;
    }

    const payload = {
      nutri_id: nutriId,
      nome: nome.trim(),
      ingredientes,
      modo_preparo: modoPreparo.trim() || null,
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    };
    const { error } = receita.novo
      ? await supabase.from('receitas').insert(payload)
      : await supabase.from('receitas').update(payload).eq('id', receita.id);
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    onSaved();
  }

  return (
    <ModalShell title={receita.novo ? 'Nova receita' : 'Editar receita'} onClose={onClose} width={560}>
      <label className="form-lbl" style={{ marginTop: 0 }}>Nome</label>
      <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Panqueca de banana" />

      <label className="form-lbl">Foto de capa (opcional)</label>
      <input type="file" accept="image/*" onChange={escolherArquivo} style={{ padding: 6 }} />
      {(preview || urlAtual) && (
        <div style={{
          marginTop: 8, borderRadius: 8, overflow: 'hidden',
          aspectRatio: '16/9', background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={preview || urlAtual} alt="prévia"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <label className="form-lbl">Ingredientes</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {ingredientes.map((ing, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              flex: 1, fontSize: 13, background: 'var(--bg2)',
              borderRadius: 6, padding: '6px 10px',
            }}>{ing}</span>
            <button onClick={() => removerIngrediente(i)} title="Remover" style={{
              background: 'none', border: '0.5px solid var(--red)',
              borderRadius: 6, padding: '4px 7px', color: 'var(--red)', cursor: 'pointer',
            }}>
              <i className="ti ti-trash" style={{ fontSize: 11 }} aria-hidden="true"></i>
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={novoIngrediente} onChange={e => setNovoIngrediente(e.target.value)}
          placeholder="Ex: 2 ovos"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarIngrediente(); } }}
          style={{ margin: 0 }} />
        <button className="btn-outline" onClick={adicionarIngrediente} style={{ flexShrink: 0 }}>
          <i className="ti ti-plus" aria-hidden="true"></i> Adicionar
        </button>
      </div>

      <label className="form-lbl">Modo de preparo</label>
      <textarea value={modoPreparo} onChange={e => setModoPreparo(e.target.value)}
        rows={6} placeholder={'Ex:\n1. Bata todos os ingredientes no liquidificador\n2. Aqueça a frigideira...'}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 120 }} />

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
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Salvar receita'}
        </button>
      </div>
    </ModalShell>
  );
}


function ModalAtribuir({ receita, pacientes, atribuidos, onClose, onSaved }) {
  const [selecionadas, setSelecionadas] = useState(new Set(atribuidos));
  const [busca, setBusca] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(id) {
    setSelecionadas(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function salvar() {
    setBusy(true);
    const atual = new Set(atribuidos);
    const adicionar = [...selecionadas].filter(id => !atual.has(id));
    const remover   = [...atual].filter(id => !selecionadas.has(id));

    if (adicionar.length > 0) {
      await supabase.from('receitas_pacientes').insert(
        adicionar.map(paciente_id => ({ receita_id: receita.id, paciente_id }))
      );
    }
    if (remover.length > 0) {
      await supabase.from('receitas_pacientes').delete()
        .eq('receita_id', receita.id).in('paciente_id', remover);
    }
    setBusy(false);
    onSaved();
  }

  const filtradas = pacientes.filter(p => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return (p.nome ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q);
  });

  return (
    <ModalShell title="Atribuir pacientes"
      subtitle={`Quem pode ver a receita "${receita.nome}"`}
      onClose={onClose}
      width={520}>
      <input value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="Buscar paciente..." style={{ marginBottom: 10 }} />

      <div style={{ maxHeight: 360, overflow: 'auto', border: '0.5px solid var(--border)', borderRadius: 8 }}>
        {filtradas.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Nenhuma paciente encontrada.
          </div>
        ) : filtradas.map(p => {
          const checked = selecionadas.has(p.id);
          return (
            <label key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', cursor: 'pointer',
              borderBottom: '0.5px solid var(--border)',
              background: checked ? 'var(--amber-bg, var(--bg2))' : 'transparent',
            }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} style={{ margin: 0 }} />
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--bg2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: 'var(--dark)',
              }}>{iniciais(p.nome)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.email}</div>
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
        {selecionadas.size} de {pacientes.length} selecionada{selecionadas.size === 1 ? '' : 's'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Salvando...' : 'Salvar atribuições'}
        </button>
      </div>
    </ModalShell>
  );
}
