import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, iniciais } from '../../lib/utils.js';

const TAGS = [
  { id: 'ebook',         label: 'E-book',         cor: 'red'    },
  { id: 'receitas',      label: 'Receitas',       cor: 'orange' },
  { id: 'guia',          label: 'Guia',           cor: 'blue'   },
  { id: 'protocolo',     label: 'Protocolo',      cor: 'green'  },
  { id: 'suplementacao', label: 'Suplementação',  cor: 'amber'  },
  { id: 'outro',         label: 'Outro',          cor: 'gray'   },
];

function pillStyleFor(tag) {
  const t = TAGS.find(x => x.id === tag);
  const cor = t?.cor ?? 'gray';
  return {
    background: `var(--${cor}-bg, var(--bg2))`,
    color: `var(--${cor}, var(--text3))`,
  };
}

export default function Biblioteca() {
  const { user } = useSession();
  const [ebooks, setEbooks] = useState(null);
  const [pacientes, setPacientes] = useState([]);
  const [atribuicoes, setAtribuicoes] = useState({});
  const [busca, setBusca] = useState('');
  const [filtroTag, setFiltroTag] = useState('todos');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [atribuirEbook, setAtribuirEbook] = useState(null);
  const [atualizarEbook, setAtualizarEbook] = useState(null);
  const [capasUrl, setCapasUrl] = useState({});
  const [capasErro, setCapasErro] = useState({});

  async function carregar() {
    if (!user) return;
    const [ebRes, pacRes, atRes] = await Promise.all([
      supabase.from('ebooks').select('*').eq('nutri_id', user.id).order('created_at', { ascending: false }),
      supabase.from('pacientes').select('id, nome, email').eq('nutri_id', user.id).order('nome'),
      supabase.from('ebooks_pacientes').select('ebook_id, paciente_id'),
    ]);
    const lista = ebRes.data ?? [];
    setEbooks(lista);
    setPacientes(pacRes.data ?? []);
    // mapa ebook_id → [paciente_id]
    const mapa = {};
    for (const a of atRes.data ?? []) {
      if (!mapa[a.ebook_id]) mapa[a.ebook_id] = [];
      mapa[a.ebook_id].push(a.paciente_id);
    }
    setAtribuicoes(mapa);

    const comCapa = lista.filter(e => e.capa_path);
    if (comCapa.length > 0) {
      const urls = await Promise.all(comCapa.map(e =>
        supabase.storage.from('ebooks').createSignedUrl(e.capa_path, 3600).then(r => {
          if (r.error) console.error(`Falha ao gerar link da capa de "${e.titulo}":`, r.error);
          return [e.id, r.data?.signedUrl, r.error?.message];
        })
      ));
      setCapasUrl(Object.fromEntries(urls.filter(([, u]) => u)));
      setCapasErro(Object.fromEntries(urls.filter(([, , m]) => m).map(([id, , m]) => [id, m])));
    }
  }
  useEffect(() => { carregar(); }, [user]);

  async function abrirEbook(eb) {
    const { data, error } = await supabase.storage
      .from('ebooks').createSignedUrl(eb.storage_path, 120);
    if (error) return alert('Não foi possível abrir: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function excluirEbook(eb) {
    const nPac = atribuicoes[eb.id]?.length ?? 0;
    const aviso = nPac > 0
      ? `Excluir "${eb.titulo}"? Está atribuído a ${nPac} paciente${nPac === 1 ? '' : 's'} — todas perderão acesso.`
      : `Excluir "${eb.titulo}"?`;
    if (!window.confirm(aviso)) return;
    await supabase.storage.from('ebooks').remove([eb.storage_path]);
    await supabase.from('ebooks').delete().eq('id', eb.id);
    carregar();
  }

  const filtrados = useMemo(() => {
    if (!ebooks) return [];
    const q = busca.trim().toLowerCase();
    return ebooks.filter(e => {
      if (filtroTag !== 'todos' && (e.tag ?? 'outro') !== filtroTag) return false;
      if (!q) return true;
      return (e.titulo ?? '').toLowerCase().includes(q)
        || (e.descricao ?? '').toLowerCase().includes(q);
    });
  }, [ebooks, busca, filtroTag]);

  return (
    <>
      <div className="page-title">Biblioteca</div>
      <div className="page-sub">E-books, guias e protocolos para reutilizar com suas pacientes</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <input
            style={{ width: 240, margin: 0 }}
            className="input-field"
            placeholder="Buscar e-book..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select value={filtroTag} onChange={(e) => setFiltroTag(e.target.value)}
            style={{ margin: 0, width: 'auto' }}>
            <option value="todos">Todas as categorias</option>
            {TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <button className="btn" onClick={() => setUploadOpen(true)}>
          <i className="ti ti-upload" style={{ fontSize: 15 }} aria-hidden="true"></i>
          Adicionar e-book
        </button>
      </div>

      {ebooks === null ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : ebooks.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-book-2 empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Biblioteca vazia</div>
          <div className="empty-sub">
            Suba seus e-books, guias e protocolos uma única vez e atribua às pacientes que precisarem.
          </div>
          <button className="btn" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-upload" aria-hidden="true"></i> Adicionar primeiro e-book
          </button>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum e-book encontrado com esses filtros.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtrados.map(eb => {
            const nPac = atribuicoes[eb.id]?.length ?? 0;
            const tag = TAGS.find(t => t.id === (eb.tag ?? 'outro')) ?? TAGS[TAGS.length - 1];
            return (
              <div key={eb.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  aspectRatio: '4/3', background: 'var(--bg2)', position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {capasUrl[eb.id] ? (
                    <img src={capasUrl[eb.id]} alt={eb.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="ti ti-file-text" style={{ fontSize: 32, color: 'var(--text3)' }} aria-hidden="true"></i>
                  )}
                  {capasErro[eb.id] && (
                    <div style={{ position: 'absolute', fontSize: 11, color: 'var(--red)', padding: 8 }}>Erro na capa: {capasErro[eb.id]}</div>
                  )}
                </div>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>{eb.titulo}</div>
                    <span style={{
                      display: 'inline-block', fontSize: 10, padding: '2px 8px',
                      borderRadius: 999, fontWeight: 500,
                      ...pillStyleFor(eb.tag ?? 'outro'),
                    }}>{tag.label}</span>
                  </div>
                  {eb.descricao && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>
                      {eb.descricao}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-users" aria-hidden="true"></i>
                    {nPac === 0
                      ? 'Não atribuído'
                      : `${nPac} paciente${nPac === 1 ? '' : 's'}`}
                    <span style={{ marginLeft: 'auto' }}>{dataBR(eb.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    <button className="btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => abrirEbook(eb)}>
                      <i className="ti ti-eye" aria-hidden="true"></i> Abrir
                    </button>
                    <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => setAtribuirEbook(eb)}>
                      <i className="ti ti-share" aria-hidden="true"></i> Atribuir
                    </button>
                    <button onClick={() => excluirEbook(eb)}
                      title="Excluir"
                      style={{
                        background: 'none', border: '0.5px solid var(--red)',
                        borderRadius: 6, padding: '4px 8px',
                        color: 'var(--red)', cursor: 'pointer',
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                  <button className="btn-outline" style={{ justifyContent: 'center', fontSize: 12 }} onClick={() => setAtualizarEbook(eb)}>
                    <i className="ti ti-refresh" aria-hidden="true"></i> Atualizar arquivo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploadOpen && (
        <ModalUpload
          nutriId={user.id}
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); carregar(); }}
        />
      )}

      {atribuirEbook && (
        <ModalAtribuir
          ebook={atribuirEbook}
          pacientes={pacientes}
          atribuidos={atribuicoes[atribuirEbook.id] ?? []}
          onClose={() => setAtribuirEbook(null)}
          onSaved={() => { setAtribuirEbook(null); carregar(); }}
        />
      )}

      {atualizarEbook && (
        <ModalAtualizarArquivo
          ebook={atualizarEbook}
          nutriId={user.id}
          onClose={() => setAtualizarEbook(null)}
          onSaved={() => { setAtualizarEbook(null); carregar(); }}
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


function ModalUpload({ nutriId, onClose, onSaved }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tag, setTag] = useState('guia');
  const [arquivo, setArquivo] = useState(null);
  const [capaBlob, setCapaBlob] = useState(null);
  const [capaPreview, setCapaPreview] = useState(null);
  const [gerandoCapa, setGerandoCapa] = useState(false);
  const [erroCapa, setErroCapa] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function selecionarArquivo(file) {
    setArquivo(file ?? null);
    setCapaBlob(null);
    setCapaPreview(null);
    setErroCapa(null);
    if (!file) return;
    setGerandoCapa(true);
    try {
      const { gerarCapaPdf } = await import('../../lib/pdfCapa.js');
      const blob = await gerarCapaPdf(file);
      setCapaBlob(blob);
      setCapaPreview(URL.createObjectURL(blob));
    } catch (e) {
      // Sem capa gerada não é impeditivo — o e-book continua funcionando
      // normalmente, só fica sem fotinho (ex: PDF protegido/corrompido).
      console.error('Falha ao gerar capa do PDF:', e);
      setErroCapa(e?.message || 'Não foi possível gerar a fotinho automaticamente.');
    }
    setGerandoCapa(false);
  }

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione um arquivo PDF.');
    if (!titulo.trim()) return setErro('Informe um título.');
    setBusy(true);
    const nomeBase = `${Date.now()}-${titulo.trim().replace(/[^a-z0-9]/gi, '_')}`;
    const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${nutriId}/${nomeBase}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ebooks')
      .upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }

    let capaPath = null;
    if (capaBlob) {
      capaPath = `${nutriId}/${nomeBase}-capa.jpg`;
      const { error: capaErr } = await supabase.storage.from('ebooks')
        .upload(capaPath, capaBlob, { contentType: 'image/jpeg' });
      if (capaErr) {
        console.error('Falha ao subir a capa do PDF:', capaErr);
        capaPath = null; // segue sem capa em vez de travar o envio
      }
    }

    const { error: insErr } = await supabase.from('ebooks').insert({
      nutri_id: nutriId,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tag, storage_path: path, capa_path: capaPath,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('ebooks').remove([path, ...(capaPath ? [capaPath] : [])]);
      return setErro('Erro: ' + insErr.message);
    }
    onSaved();
  }

  return (
    <ModalShell title="Adicionar e-book" subtitle="Sobe uma vez e atribui pra quantas pacientes quiser" onClose={onClose}>
      <label className="form-lbl">Arquivo (PDF)</label>
      <input type="file" accept="application/pdf" onChange={e => selecionarArquivo(e.target.files?.[0] ?? null)}
        style={{ padding: 6 }} />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
        {arquivo ? `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB` : 'Nenhum arquivo selecionado'}
      </div>

      {(gerandoCapa || capaPreview) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 8, background: 'var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, overflow: 'hidden',
          }}>
            {capaPreview ? (
              <img src={capaPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <i className="ti ti-loader-2" style={{ fontSize: 20, color: 'var(--text3)' }} aria-hidden="true"></i>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {gerandoCapa ? 'Gerando fotinho a partir da 1ª página...' : 'Fotinho gerada automaticamente a partir da 1ª página do PDF.'}
          </div>
        </div>
      )}
      {erroCapa && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>Não consegui gerar a fotinho automaticamente: {erroCapa}. O e-book continua funcionando normalmente, só sem foto.</div>
      )}

      <label className="form-lbl" style={{ marginTop: 12 }}>Título</label>
      <input value={titulo} onChange={e => setTitulo(e.target.value)}
        placeholder="Ex: Guia de receitas low-carb" />

      <label className="form-lbl" style={{ marginTop: 12 }}>Categoria</label>
      <select value={tag} onChange={e => setTag(e.target.value)}>
        {TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      <label className="form-lbl" style={{ marginTop: 12 }}>Descrição (opcional)</label>
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
        rows={3} placeholder="Resumo do conteúdo, quem é o público, etc."
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 64 }} />

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
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo || gerandoCapa}>
          <i className="ti ti-upload" aria-hidden="true"></i> {busy ? 'Enviando...' : gerandoCapa ? 'Gerando capa...' : 'Salvar'}
        </button>
      </div>
    </ModalShell>
  );
}


function ModalAtribuir({ ebook, pacientes, atribuidos, onClose, onSaved }) {
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
      await supabase.from('ebooks_pacientes').insert(
        adicionar.map(paciente_id => ({ ebook_id: ebook.id, paciente_id }))
      );
    }
    if (remover.length > 0) {
      await supabase.from('ebooks_pacientes').delete()
        .eq('ebook_id', ebook.id).in('paciente_id', remover);
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
      subtitle={`Quem pode ler "${ebook.titulo}"`}
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


function ModalAtualizarArquivo({ ebook, nutriId, onClose, onSaved }) {
  const [arquivo, setArquivo] = useState(null);
  const [capaBlob, setCapaBlob] = useState(null);
  const [capaPreview, setCapaPreview] = useState(null);
  const [gerandoCapa, setGerandoCapa] = useState(false);
  const [erroCapa, setErroCapa] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function selecionarArquivo(file) {
    setArquivo(file ?? null);
    setCapaBlob(null);
    setCapaPreview(null);
    setErroCapa(null);
    if (!file) return;
    setGerandoCapa(true);
    try {
      const { gerarCapaPdf } = await import('../../lib/pdfCapa.js');
      const blob = await gerarCapaPdf(file);
      setCapaBlob(blob);
      setCapaPreview(URL.createObjectURL(blob));
    } catch (e) {
      // Sem capa gerada não é impeditivo — segue com a atualização normalmente.
      console.error('Falha ao gerar capa do PDF:', e);
      setErroCapa(e?.message || 'Não foi possível gerar a fotinho automaticamente.');
    }
    setGerandoCapa(false);
  }

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione o novo arquivo PDF.');
    setBusy(true);
    const nomeBase = `${Date.now()}-${ebook.titulo.trim().replace(/[^a-z0-9]/gi, '_')}`;
    const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${nutriId}/${nomeBase}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ebooks')
      .upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }

    let capaPath = null;
    if (capaBlob) {
      capaPath = `${nutriId}/${nomeBase}-capa.jpg`;
      const { error: capaErr } = await supabase.storage.from('ebooks')
        .upload(capaPath, capaBlob, { contentType: 'image/jpeg' });
      if (capaErr) {
        console.error('Falha ao subir a capa do PDF:', capaErr);
        capaPath = null;
      }
    }

    // Mesma linha em `ebooks`, só troca os arquivos — quem já tinha acesso
    // continua tendo, sem precisar reatribuir.
    const { error: updErr } = await supabase.from('ebooks')
      .update({ storage_path: path, capa_path: capaPath })
      .eq('id', ebook.id);
    if (updErr) {
      setBusy(false);
      await supabase.storage.from('ebooks').remove([path, ...(capaPath ? [capaPath] : [])]);
      return setErro('Erro: ' + updErr.message);
    }

    const antigos = [ebook.storage_path, ...(ebook.capa_path ? [ebook.capa_path] : [])];
    await supabase.storage.from('ebooks').remove(antigos);
    setBusy(false);
    onSaved();
  }

  return (
    <ModalShell title="Atualizar arquivo" subtitle={`"${ebook.titulo}" — pacientes já atribuídas mantêm acesso`} onClose={onClose}>
      <label className="form-lbl" style={{ marginTop: 0 }}>Novo arquivo (PDF)</label>
      <input type="file" accept="application/pdf" onChange={e => selecionarArquivo(e.target.files?.[0] ?? null)}
        style={{ padding: 6 }} />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
        {arquivo ? `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB` : 'Nenhum arquivo selecionado'}
      </div>

      {(gerandoCapa || capaPreview) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 8, background: 'var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, overflow: 'hidden',
          }}>
            {capaPreview ? (
              <img src={capaPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <i className="ti ti-loader-2" style={{ fontSize: 20, color: 'var(--text3)' }} aria-hidden="true"></i>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {gerandoCapa ? 'Gerando fotinho a partir da 1ª página...' : 'Fotinho nova gerada automaticamente a partir do PDF.'}
          </div>
        </div>
      )}
      {erroCapa && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>Não consegui gerar a fotinho automaticamente: {erroCapa}. O arquivo continua sendo atualizado normalmente, só sem foto.</div>
      )}

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
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo || gerandoCapa}>
          <i className="ti ti-refresh" aria-hidden="true"></i> {busy ? 'Atualizando...' : gerandoCapa ? 'Gerando capa...' : 'Atualizar arquivo'}
        </button>
      </div>
    </ModalShell>
  );
}
