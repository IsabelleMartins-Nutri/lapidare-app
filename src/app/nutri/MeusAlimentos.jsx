import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

export default function MeusAlimentos() {
  const { user } = useSession();
  const [alimentos, setAlimentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null); // null = não, {} = novo, {id} = editar
  const [toast, setToast] = useState(null);

  async function carregar() {
    if (!user) return;
    const { data } = await supabase.from('alimentos')
      .select('*').eq('nutri_id', user.id)
      .order('nome');
    setAlimentos(data ?? []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [user]);

  function mostraToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function excluir(a) {
    if (!window.confirm(`Excluir "${a.nome}"?`)) return;
    await supabase.from('alimentos').delete().eq('id', a.id);
    mostraToast('Alimento excluído');
    carregar();
  }

  const filtrados = alimentos.filter(a => a.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <>
      <div className="page-title">Meus alimentos</div>
      <div className="page-sub">
        Alimentos que você cadastra aqui aparecem na busca do editor de plano alimentar, junto com a base padrão.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <input
          style={{ width: 240, margin: 0 }}
          className="input-field"
          placeholder="Buscar nos seus alimentos..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="btn" onClick={() => setEditando({})}>
          <i className="ti ti-plus" aria-hidden="true"></i> Novo alimento
        </button>
      </div>

      {carregando ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : alimentos.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-apple empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhum alimento próprio cadastrado</div>
          <div className="empty-sub">
            A busca do editor de plano já vem com uma base padrão de alimentos. Cadastre aqui só os que ainda não encontrar lá.
          </div>
          <button className="btn" onClick={() => setEditando({})}>
            <i className="ti ti-plus" aria-hidden="true"></i> Cadastrar primeiro alimento
          </button>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhum alimento encontrado para "{busca}".</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {filtrados.map((a, i) => (
            <AlimentoRow key={a.id} a={a} isLast={i === filtrados.length - 1}
              onEditar={() => setEditando(a)}
              onExcluir={() => excluir(a)} />
          ))}
        </div>
      )}

      {editando !== null && (
        <EditorAlimento
          alimento={editando}
          nutriId={user.id}
          onClose={() => setEditando(null)}
          onSaved={async () => { setEditando(null); await carregar(); mostraToast('Alimento salvo'); }}
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

function AlimentoRow({ a, isLast, onEditar, onExcluir }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : '0.5px solid #f5f0e8',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{a.nome}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {a.medida_padrao ? `${a.medida_padrao} · ` : ''}
          {a.kcal ?? 0} kcal · P {a.prot_g ?? 0}g · C {a.cho_g ?? 0}g · G {a.lip_g ?? 0}g
        </div>
      </div>
      <div style={{ display: 'inline-flex', gap: 6 }}>
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

function EditorAlimento({ alimento, nutriId, onClose, onSaved }) {
  const isEdit = !!alimento?.id;
  const [nome, setNome] = useState(alimento?.nome ?? '');
  const [medidaPadrao, setMedidaPadrao] = useState(alimento?.medida_padrao ?? '');
  const [kcal, setKcal] = useState(alimento?.kcal != null ? String(alimento.kcal) : '');
  const [protG, setProtG] = useState(alimento?.prot_g != null ? String(alimento.prot_g) : '');
  const [choG, setChoG] = useState(alimento?.cho_g != null ? String(alimento.cho_g) : '');
  const [lipG, setLipG] = useState(alimento?.lip_g != null ? String(alimento.lip_g) : '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome do alimento.');

    setBusy(true);
    const payload = {
      nutri_id: nutriId,
      nome: nome.trim(),
      medida_padrao: medidaPadrao.trim() || null,
      kcal: kcal === '' ? null : Number(kcal),
      prot_g: protG === '' ? null : Number(protG),
      cho_g: choG === '' ? null : Number(choG),
      lip_g: lipG === '' ? null : Number(lipG),
    };
    const { error } = isEdit
      ? await supabase.from('alimentos').update(payload).eq('id', alimento.id)
      : await supabase.from('alimentos').insert(payload);
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
          {isEdit ? 'Editar alimento' : 'Novo alimento'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Kcal e macros se referem à quantidade descrita em "medida padrão"
        </div>

        <label className="form-lbl" style={{ marginTop: 0 }}>Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Bolo de cenoura caseiro" />

        <label className="form-lbl">Medida padrão</label>
        <input value={medidaPadrao} onChange={e => setMedidaPadrao(e.target.value)} placeholder="Ex: 1 fatia (60g)" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="form-lbl">Kcal</label>
            <input inputMode="decimal" value={kcal} onChange={e => setKcal(e.target.value)} />
          </div>
          <div>
            <label className="form-lbl">Proteína (g)</label>
            <input inputMode="decimal" value={protG} onChange={e => setProtG(e.target.value)} />
          </div>
          <div>
            <label className="form-lbl">Carboidrato (g)</label>
            <input inputMode="decimal" value={choG} onChange={e => setChoG(e.target.value)} />
          </div>
          <div>
            <label className="form-lbl">Gordura (g)</label>
            <input inputMode="decimal" value={lipG} onChange={e => setLipG(e.target.value)} />
          </div>
        </div>

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
