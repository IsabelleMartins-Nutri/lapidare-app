import { useMemo } from 'react';
import { listarSecoes } from '../lib/checkinDefault.js';
import '../styles/checkin.css';

/**
 * Renderiza dinamicamente um formulário de check-in a partir de
 * um array `perguntas` (vindo do template/envio) e mantém os valores
 * controlados via prop `valores` + callback `onChange(id, valor)`.
 *
 * Props:
 *   perguntas: array de perguntas (ver src/lib/checkinDefault.js)
 *   valores:   objeto { perguntaId: valor } controlado
 *   onChange:  (id, novoValor) => void
 *   disabled:  bool — modo só-leitura (para a nutri ver respostas)
 */
export default function CheckinForm({ perguntas, valores, onChange, disabled = false }) {
  const secoes = useMemo(() => listarSecoes(perguntas), [perguntas]);

  // Numera as perguntas globalmente
  const perguntasComNumero = useMemo(() => {
    return (perguntas ?? []).map((p, i) => ({ ...p, _num: i + 1 }));
  }, [perguntas]);

  return (
    <div className="checkin-form">
      {secoes.map(secao => (
        <div key={secao} className="ckg-section">
          <div className="ckg-section-label">{secao}</div>
          {perguntasComNumero
            .filter(p => p.secao === secao)
            .map(p => (
              <Pergunta
                key={p.id}
                pergunta={p}
                valor={valores?.[p.id]}
                onChange={v => onChange?.(p.id, v)}
                disabled={disabled}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function Pergunta({ pergunta, valor, onChange, disabled }) {
  return (
    <div className="ckg-q">
      <div className="ckg-num">{String(pergunta._num).padStart(2, '0')}</div>
      <div className="ckg-pergunta">{pergunta.pergunta}</div>
      {pergunta.sub && <div className="ckg-sub">{pergunta.sub}</div>}
      {renderTipo(pergunta, valor, onChange, disabled)}
    </div>
  );
}

function renderTipo(p, valor, onChange, disabled) {
  switch (p.tipo) {
    case 'emoji_scale': return <EmojiScale p={p} valor={valor} onChange={onChange} disabled={disabled} />;
    case 'slider':      return <SliderQ p={p} valor={valor} onChange={onChange} disabled={disabled} />;
    case 'single':      return <SingleOpts p={p} valor={valor} onChange={onChange} disabled={disabled} />;
    case 'multi':       return <MultiOpts p={p} valor={valor} onChange={onChange} disabled={disabled} />;
    case 'habitos':     return <Habitos p={p} valor={valor} onChange={onChange} disabled={disabled} />;
    case 'texto':       return <Texto p={p} valor={valor} onChange={onChange} disabled={disabled} />;
    default:            return <div style={{ fontSize: 11, color: '#999' }}>Tipo "{p.tipo}" não suportado.</div>;
  }
}

function EmojiScale({ p, valor, onChange, disabled }) {
  return (
    <div className="ckg-emoji-scale">
      {p.opcoes?.map((o, i) => (
        <button key={i} type="button" disabled={disabled}
          className={'ckg-emoji-btn' + (valor === o.valor ? ' active' : '')}
          onClick={() => onChange(o.valor)}>
          {o.emoji}<span className="lbl">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function SliderQ({ p, valor, onChange, disabled }) {
  const v = valor ?? p.default ?? p.min;
  return (
    <div className="ckg-slider-wrap">
      <input type="range" className="ckg-slider" disabled={disabled}
        min={p.min} max={p.max} value={v}
        onChange={e => onChange(Number(e.target.value))} />
      <div className="ckg-slider-value">
        {v}{p.unit && <span className="unit">{p.unit}</span>}
      </div>
      <div className="ckg-slider-labels">
        <span>{p.esquerda ?? p.min}</span>
        <span>{p.direita ?? p.max}</span>
      </div>
    </div>
  );
}

function SingleOpts({ p, valor, onChange, disabled }) {
  return (
    <div className="ckg-options">
      {p.opcoes?.map((o, i) => (
        <button key={i} type="button" disabled={disabled}
          className={'ckg-opt' + (valor === o ? ' active' : '')}
          onClick={() => onChange(o)}>
          <span className="ckg-opt-check"></span>{o}
        </button>
      ))}
    </div>
  );
}

function MultiOpts({ p, valor, onChange, disabled }) {
  const arr = Array.isArray(valor) ? valor : [];
  const toggle = (o) => onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o]);
  return (
    <div className="ckg-options">
      {p.opcoes?.map((o, i) => (
        <button key={i} type="button" disabled={disabled}
          className={'ckg-opt' + (arr.includes(o) ? ' active' : '')}
          onClick={() => toggle(o)}>
          <span className="ckg-opt-check"></span>{o}
        </button>
      ))}
    </div>
  );
}

function Habitos({ p, valor, onChange, disabled }) {
  const arr = Array.isArray(valor) ? valor : [];
  const toggle = (label) => onChange(arr.includes(label) ? arr.filter(x => x !== label) : [...arr, label]);
  return (
    <div className="ckg-habitos">
      {p.opcoes?.map((o, i) => (
        <button key={i} type="button" disabled={disabled}
          className={'ckg-habito' + (arr.includes(o.label) ? ' checked' : '')}
          onClick={() => toggle(o.label)}>
          <div className="ckg-habito-check"></div>
          <span className="ckg-habito-emoji">{o.emoji}</span>
          <span className="ckg-habito-nome">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Texto({ p, valor, onChange, disabled }) {
  return (
    <textarea className="ckg-textarea" disabled={disabled}
      rows={p.rows ?? 4}
      placeholder={p.placeholder ?? 'Escreva aqui...'}
      value={valor ?? ''}
      onChange={e => onChange(e.target.value)} />
  );
}
