import { useMemo, useState } from 'react';
import BuscaAlimento from './BuscaAlimento.jsx';

function somarMacros(refeicoes) {
  const total = { kcal: 0, prot_g: 0, cho_g: 0, lip_g: 0 };
  for (const r of refeicoes ?? []) {
    for (const al of r.alimentos ?? []) {
      total.kcal += Number(al.kcal) || 0;
      total.prot_g += Number(al.prot_g) || 0;
      total.cho_g += Number(al.cho_g) || 0;
      total.lip_g += Number(al.lip_g) || 0;
    }
  }
  return total;
}

const REFEICAO_VAZIA = { nome: '', horario: '', emoji: '🍽️', alimentos: [], obs: '' };
const ALIMENTO_VAZIO = { nome: '', qty: '', kcal: '', prot_g: '', cho_g: '', lip_g: '', subs: [] };

/**
 * Editor visual do plano alimentar — refeições e alimentos montados na
 * tela (sem JSON), com busca de alimentos preenchendo kcal/macros
 * automaticamente. Produz exatamente o mesmo formato de `dados` que já
 * era usado no modo JSON, então PlanoView/publicar/etc não mudam nada.
 */
export default function PlanoEditor({ dados, onChange, alimentosBase }) {
  const refeicoes = dados?.refeicoes ?? [];
  const macros = dados?.macros ?? {};
  const macrosCalculados = useMemo(() => somarMacros(refeicoes), [refeicoes]);

  function set(patch) {
    onChange({ ...dados, ...patch });
  }
  function setMacro(campo, valor) {
    set({ macros: { ...macros, [campo]: valor === '' ? undefined : Number(valor) } });
  }
  function setRefeicoes(novasRefeicoes) {
    set({ refeicoes: novasRefeicoes });
  }
  function addRefeicao() {
    setRefeicoes([...refeicoes, { ...REFEICAO_VAZIA }]);
  }
  function removeRefeicao(ri) {
    setRefeicoes(refeicoes.filter((_, i) => i !== ri));
  }
  function updateRefeicao(ri, patch) {
    setRefeicoes(refeicoes.map((r, i) => (i === ri ? { ...r, ...patch } : r)));
  }
  function addAlimento(ri) {
    updateRefeicao(ri, { alimentos: [...(refeicoes[ri].alimentos ?? []), { ...ALIMENTO_VAZIO }] });
  }
  function removeAlimento(ri, ai) {
    updateRefeicao(ri, { alimentos: refeicoes[ri].alimentos.filter((_, i) => i !== ai) });
  }
  function updateAlimento(ri, ai, patch) {
    updateRefeicao(ri, {
      alimentos: refeicoes[ri].alimentos.map((a, i) => (i === ai ? { ...a, ...patch } : a)),
    });
  }
  function selecionarAlimento(ri, ai, alimentoBase) {
    updateAlimento(ri, ai, {
      nome: alimentoBase.nome,
      qty: alimentoBase.medida_padrao || '',
      kcal: alimentoBase.kcal ?? '',
      prot_g: alimentoBase.prot_g ?? '',
      cho_g: alimentoBase.cho_g ?? '',
      lip_g: alimentoBase.lip_g ?? '',
    });
  }

  return (
    <div>
      <div className="card" style={{ padding: '14px 16px', marginBottom: 14, background: 'var(--bg2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
            Macros do dia (calculado pelos alimentos)
          </span>
          <span className="pill ghost" style={{ fontSize: 11 }}>{macrosCalculados.kcal} kcal</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          Proteína {macrosCalculados.prot_g.toFixed(1)}g · Carboidrato {macrosCalculados.cho_g.toFixed(1)}g · Gordura {macrosCalculados.lip_g.toFixed(1)}g
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="field-label">Água (litros)</label>
            <input type="number" step="0.1" className="input-field" style={{ margin: 0 }}
              value={macros.agua_l ?? ''} onChange={e => setMacro('agua_l', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Fibras (g)</label>
            <input type="number" step="1" className="input-field" style={{ margin: 0 }}
              value={macros.fibras_g ?? ''} onChange={e => setMacro('fibras_g', e.target.value)} />
          </div>
        </div>
      </div>

      {refeicoes.map((ref, ri) => (
        <div key={ri} className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 90px auto', gap: 8, marginBottom: 10 }}>
            <input className="input-field" style={{ margin: 0, textAlign: 'center' }}
              value={ref.emoji ?? ''} onChange={e => updateRefeicao(ri, { emoji: e.target.value })} placeholder="🍽️" />
            <input className="input-field" style={{ margin: 0 }}
              value={ref.nome ?? ''} onChange={e => updateRefeicao(ri, { nome: e.target.value })} placeholder="Nome da refeição (ex: Café da manhã)" />
            <input type="time" className="input-field" style={{ margin: 0 }}
              value={ref.horario ?? ''} onChange={e => updateRefeicao(ri, { horario: e.target.value })} />
            <button onClick={() => removeRefeicao(ri)} title="Excluir refeição"
              style={{ background: 'none', border: '0.5px solid var(--red)', borderRadius: 6, padding: '0 10px', color: 'var(--red)', cursor: 'pointer' }}>
              <i className="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>

          {(ref.alimentos ?? []).map((al, ai) => (
            <AlimentoRow
              key={ai}
              alimento={al}
              alimentosBase={alimentosBase}
              onSelect={(a) => selecionarAlimento(ri, ai, a)}
              onChange={(patch) => updateAlimento(ri, ai, patch)}
              onRemove={() => removeAlimento(ri, ai)}
            />
          ))}

          <button className="btn-outline" style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }}
            onClick={() => addAlimento(ri)}>
            <i className="ti ti-plus" aria-hidden="true"></i> Adicionar alimento
          </button>

          <label className="field-label" style={{ marginTop: 10 }}>Observação (opcional)</label>
          <textarea rows={2} style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
            value={ref.obs ?? ''} onChange={e => updateRefeicao(ri, { obs: e.target.value })}
            placeholder="Ex: beber 1 copo de água antes" />
        </div>
      ))}

      <button className="btn" onClick={addRefeicao}>
        <i className="ti ti-plus" aria-hidden="true"></i> Adicionar refeição
      </button>
    </div>
  );
}

function AlimentoRow({ alimento, alimentosBase, onSelect, onChange, onRemove }) {
  const [subNovo, setSubNovo] = useState('');
  const subs = alimento.subs ?? [];

  function addSub() {
    const v = subNovo.trim();
    if (!v) return;
    onChange({ subs: [...subs, v] });
    setSubNovo('');
  }
  function removeSub(i) {
    onChange({ subs: subs.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 0', borderBottom: '0.5px solid #f5f0e8', marginBottom: 6,
    }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <BuscaAlimento
          value={alimento.nome}
          onChangeValue={(v) => onChange({ nome: v })}
          onSelect={onSelect}
          alimentos={alimentosBase}
        />
        <input className="input-field" style={{ margin: 0, width: 110 }}
          value={alimento.qty ?? ''} onChange={e => onChange({ qty: e.target.value })} placeholder="Quantidade" />
        <input type="number" step="1" className="input-field" style={{ margin: 0, width: 78 }}
          value={alimento.kcal ?? ''} onChange={e => onChange({ kcal: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="kcal" />
        <input type="number" step="0.1" className="input-field" style={{ margin: 0, width: 66 }}
          value={alimento.prot_g ?? ''} onChange={e => onChange({ prot_g: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="P (g)" />
        <input type="number" step="0.1" className="input-field" style={{ margin: 0, width: 66 }}
          value={alimento.cho_g ?? ''} onChange={e => onChange({ cho_g: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="C (g)" />
        <input type="number" step="0.1" className="input-field" style={{ margin: 0, width: 66 }}
          value={alimento.lip_g ?? ''} onChange={e => onChange({ lip_g: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="G (g)" />
        <button onClick={onRemove} title="Excluir alimento"
          style={{ background: 'none', border: '0.5px solid var(--red)', borderRadius: 6, padding: '0 8px', color: 'var(--red)', cursor: 'pointer' }}>
          <i className="ti ti-trash" style={{ fontSize: 14 }} aria-hidden="true"></i>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {subs.map((s, i) => (
          <span key={i} className="pill ghost" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {s}
            <i className="ti ti-x" style={{ fontSize: 10, cursor: 'pointer' }} onClick={() => removeSub(i)} aria-hidden="true"></i>
          </span>
        ))}
        <input className="input-field" style={{ margin: 0, width: 160, fontSize: 12, padding: '4px 8px' }}
          value={subNovo} onChange={e => setSubNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }}
          placeholder="+ substituição" />
      </div>
    </div>
  );
}
