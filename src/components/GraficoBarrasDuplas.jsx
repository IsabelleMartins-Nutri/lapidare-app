/**
 * Gráfico de barras agrupadas (2 séries por categoria) — usado hoje pra
 * comparar "Recomendado x Consumido" por grupo alimentar no resultado do
 * questionário de frequência alimentar. Sem lib externa, divs com altura
 * proporcional (mesmo padrão de barra de progresso já usado no projeto).
 *
 * Props:
 *   dados:  [{ label, a, b }]
 *   labelA, labelB: nomes das 2 séries (legenda)
 *   corA, corB: cores das 2 séries
 */
export default function GraficoBarrasDuplas({
  dados, labelA = 'Recomendado', labelB = 'Consumido',
  corA = 'var(--blue, #3b6fd6)', corB = 'var(--red, #d6567a)',
}) {
  const max = Math.max(1, ...dados.flatMap(d => [Number(d.a) || 0, Number(d.b) || 0]));

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
        <Legenda cor={corA} label={labelA} />
        <Legenda cor={corB} label={labelB} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 14,
        height: 200, borderBottom: '1px solid var(--border)',
      }}>
        {dados.map(d => (
          <div key={d.label} style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end',
            justifyContent: 'center', gap: 5, height: '100%',
          }}>
            <Barra valor={Number(d.a) || 0} max={max} cor={corA} />
            <Barra valor={Number(d.b) || 0} max={max} cor={corB} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        {dados.map(d => (
          <div key={d.label} style={{
            flex: 1, minWidth: 0, fontSize: 10, color: 'var(--text3)',
            textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word',
          }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Barra({ valor, max, cor }) {
  const alturaPct = Math.max(2, (valor / max) * 100);
  return (
    <div style={{ width: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{valor}</div>
      <div style={{
        width: '100%', height: `${alturaPct}%`,
        background: cor, borderRadius: '4px 4px 0 0',
      }} />
    </div>
  );
}

function Legenda({ cor, label }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: cor, display: 'inline-block' }} />
      {label}
    </div>
  );
}
