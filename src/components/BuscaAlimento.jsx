import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Campo de nome de alimento com busca embutida. Digita livre (o valor
 * digitado é o próprio nome do item) — se bater com algo da tabela
 * `alimentos`, aparece um dropdown de sugestões; clicar numa sugestão
 * chama `onSelect(alimento)` pra quem usa preencher kcal/macros
 * automaticamente. Não obriga escolher da lista: digitar e seguir em
 * frente também funciona (alimento fora da base, preenchido na mão).
 */
export default function BuscaAlimento({ value, onChangeValue, onSelect, alimentos, placeholder }) {
  const [foco, setFoco] = useState(false);
  const ref = useRef(null);

  const sugestoes = useMemo(() => {
    const q = (value ?? '').trim().toLowerCase();
    if (q.length < 2) return [];
    return alimentos.filter(a => a.nome.toLowerCase().includes(q)).slice(0, 8);
  }, [value, alimentos]);

  useEffect(() => {
    function onClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setFoco(false);
    }
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 140 }}>
      <input
        className="input-field"
        style={{ margin: 0, width: '100%' }}
        value={value ?? ''}
        onChange={e => onChangeValue(e.target.value)}
        onFocus={() => setFoco(true)}
        placeholder={placeholder ?? 'Nome do alimento'}
      />
      {foco && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--white)', border: '0.5px solid var(--border)',
          borderRadius: 8, marginTop: 2, maxHeight: 240, overflowY: 'auto',
          boxShadow: '0 4px 14px rgba(0,0,0,.14)',
        }}>
          {sugestoes.map(a => (
            <div key={a.id}
              onMouseDown={() => { onSelect(a); setFoco(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '0.5px solid #f5f0e8' }}>
              <div style={{ fontWeight: 500 }}>{a.nome}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {a.medida_padrao ? `${a.medida_padrao} · ` : ''}
                {a.kcal ?? 0} kcal · P {a.prot_g ?? 0}g · C {a.cho_g ?? 0}g · G {a.lip_g ?? 0}g
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
