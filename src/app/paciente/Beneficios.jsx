import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

export default function Beneficios() {
  const { user } = useSession();
  const [beneficios, setBeneficios] = useState(null);
  const [erroCarga, setErroCarga] = useState(null);
  const [copiado, setCopiado] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('beneficios')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        setErroCarga('Não consegui carregar os benefícios. Verifique sua conexão.');
        setBeneficios([]);
        return;
      }
      setBeneficios(data ?? []);
    })();
  }, [user]);

  async function copiarCupom(b) {
    try {
      await navigator.clipboard.writeText(b.cupom);
      setCopiado(b.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      alert('Não foi possível copiar. Cupom: ' + b.cupom);
    }
  }

  return (
    <>
      {beneficios === null ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
          Carregando...
        </div>
      ) : erroCarga ? (
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <i className="ti ti-cloud-off" style={{ fontSize: 40, color: 'var(--red)' }} aria-hidden="true"></i>
          <div style={{ fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>Não consegui carregar</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{erroCarga}</div>
        </div>
      ) : beneficios.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <i className="ti ti-gift" style={{ fontSize: 40, color: 'var(--muted-2)' }} aria-hidden="true"></i>
          <div style={{ fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>Nenhum benefício ainda</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Sua nutri ainda não cadastrou parcerias.
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px' }}>
          {beneficios.map(b => (
            <div key={b.id}
              style={{
                background: 'var(--white)',
                border: '0.5px solid var(--hair)', borderRadius: 14,
                padding: 14, marginBottom: 10,
                display: 'flex', gap: 12, alignItems: 'center',
              }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: 'var(--bg-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
              }}>
                {b.imagem_url
                  ? <img src={b.imagem_url} alt={b.marca} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <i className="ti ti-gift" style={{ fontSize: 22, color: 'var(--gold-deep)' }} aria-hidden="true"></i>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                  {b.marca}
                </div>
                {b.descricao && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, marginBottom: 6 }}>
                    {b.descricao}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {b.cupom && (
                    <button onClick={() => copiarCupom(b)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 8,
                        background: 'var(--bg-soft)', border: '1px dashed var(--gold-deep, #a08456)',
                        color: 'var(--gold-deep, #a08456)', fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      }}>
                      <i className={`ti ti-${copiado === b.id ? 'check' : 'copy'}`} style={{ fontSize: 13 }} aria-hidden="true"></i>
                      {copiado === b.id ? 'Copiado!' : b.cupom}
                    </button>
                  )}
                  {b.link && (
                    <a href={b.link} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 8,
                        background: 'var(--gold-bg, #fff7e0)', color: 'var(--gold-deep, #a08456)',
                        border: '1px solid var(--gold, #c9a86a)',
                        fontSize: 12, fontWeight: 500, textDecoration: 'none',
                      }}>
                      Acessar site
                      <i className="ti ti-external-link" style={{ fontSize: 12 }} aria-hidden="true"></i>
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
