export default function Placeholder({ title, area }) {
  return (
    <div style={{ padding: 32, fontFamily: 'var(--font-sans)' }}>
      <div style={{
        fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase',
        color: 'var(--muted)', marginBottom: 6
      }}>
        {area}
      </div>
      <h1 style={{
        fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32,
        letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 8
      }}>
        {title}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        Em construção — placeholder gerado no passo 1 do briefing.
      </p>
    </div>
  );
}
