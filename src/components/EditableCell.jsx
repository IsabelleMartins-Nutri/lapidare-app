import { useEffect, useState } from 'react';
import { dataBR } from '../lib/utils.js';

/**
 * Célula "clica, edita, sai do campo e salva" — usada em tabelas que
 * precisam de edição direta sem abrir modal (CRM comercial, agenda
 * editorial). `tipo`: 'texto' | 'textarea' | 'data' | 'select'.
 * `opcoes` (só pra tipo 'select'): array de strings ou de
 * { id, label, bg, color } — quando `bg`/`color` vêm preenchidos, o valor
 * selecionado aparece como uma tag colorida em vez de texto simples.
 */
export default function EditableCell({ value, tipo = 'texto', opcoes = [], onSave, placeholder }) {
  const [editando, setEditando] = useState(false);
  const [val, setVal] = useState(value ?? '');

  useEffect(() => { setVal(value ?? ''); }, [value]);

  function commitTexto() {
    setEditando(false);
    if (val !== (value ?? '')) onSave(typeof val === 'string' ? (val.trim() || null) : val);
  }

  function commitSelect(v) {
    setEditando(false);
    setVal(v);
    if (v !== (value ?? '')) onSave(v || null);
  }

  if (editando) {
    if (tipo === 'select') {
      return (
        <select autoFocus value={val ?? ''} onChange={e => commitSelect(e.target.value)} onBlur={() => setEditando(false)}
          style={{ margin: 0, fontSize: 13, minWidth: 130 }}>
          <option value="">—</option>
          {opcoes.map(o => {
            const id = o.id ?? o, label = o.label ?? o;
            return <option key={id} value={id}>{label}</option>;
          })}
        </select>
      );
    }
    if (tipo === 'textarea') {
      return (
        <textarea autoFocus value={val ?? ''} rows={3}
          onChange={e => setVal(e.target.value)}
          onBlur={commitTexto}
          onKeyDown={e => { if (e.key === 'Escape') { setVal(value ?? ''); setEditando(false); } }}
          style={{ margin: 0, fontSize: 13, minWidth: 140, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
      );
    }
    return (
      <input autoFocus type={tipo === 'data' ? 'date' : 'text'} value={val ?? ''}
        onChange={e => setVal(e.target.value)}
        onBlur={commitTexto}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setVal(value ?? ''); setEditando(false); }
        }}
        style={{ margin: 0, fontSize: 13, minWidth: 110, width: '100%', boxSizing: 'border-box' }} />
    );
  }

  const opcaoSelecionada = tipo === 'select' && value ? opcoes.find(o => (o.id ?? o) === value) : null;
  let display = value;
  if (tipo === 'data' && value) display = dataBR(value);
  if (tipo === 'select' && value) display = opcaoSelecionada?.label ?? value;

  // Campo vazio: caixa pontilhada visível (deixa claro que é clicável),
  // maior pra textarea. Campo preenchido: fundo aparece só no hover.
  const vazio = !value;
  const boxStyle = vazio
    ? {
        cursor: 'pointer', borderRadius: 6, fontSize: 13,
        border: '1px dashed var(--border)', background: 'var(--bg2)',
        padding: '6px 8px', minHeight: tipo === 'textarea' ? 50 : 26,
        display: 'flex', alignItems: tipo === 'textarea' ? 'flex-start' : 'center',
        color: 'var(--text3)',
      }
    : {
        cursor: 'pointer', borderRadius: 6, fontSize: 13,
        padding: '4px 6px', minHeight: 18,
        whiteSpace: tipo === 'textarea' ? 'pre-wrap' : 'nowrap',
      };

  return (
    <div onClick={() => setEditando(true)} style={boxStyle}
      onMouseEnter={e => { if (!vazio) e.currentTarget.style.background = 'var(--bg2)'; }}
      onMouseLeave={e => { if (!vazio) e.currentTarget.style.background = 'transparent'; }}>
      {value ? (
        opcaoSelecionada?.bg ? (
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 500,
            padding: '3px 9px', borderRadius: 20,
            background: opcaoSelecionada.bg, color: opcaoSelecionada.color,
          }}>
            {display}
          </span>
        ) : display
      ) : (placeholder ?? 'clique pra preencher')}
    </div>
  );
}
