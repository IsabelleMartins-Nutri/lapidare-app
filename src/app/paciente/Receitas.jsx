import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

export default function Receitas() {
  const { user } = useSession();
  const [receitas, setReceitas] = useState(null);
  const [urls, setUrls] = useState({});
  const [erroCarga, setErroCarga] = useState(null);
  const [ver, setVer] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: links, error: errLinks } = await supabase
        .from('receitas_pacientes')
        .select('receita_id')
        .eq('paciente_id', user.id);
      if (errLinks) {
        setErroCarga('Não consegui carregar as receitas. Verifique sua conexão.');
        setReceitas([]);
        return;
      }
      const ids = (links ?? []).map(l => l.receita_id);
      if (ids.length === 0) {
        setReceitas([]);
        return;
      }
      const { data, error: errR } = await supabase
        .from('receitas')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });
      if (errR) {
        setErroCarga('Não consegui carregar as receitas. Verifique sua conexão.');
        setReceitas([]);
        return;
      }
      setReceitas(data ?? []);

      const novasUrls = {};
      for (const r of data ?? []) {
        if (!r.storage_path) continue;
        const { data: signed } = await supabase.storage.from('receitas').createSignedUrl(r.storage_path, 300);
        if (signed) novasUrls[r.id] = signed.signedUrl;
      }
      setUrls(novasUrls);
    })();
  }, [user]);

  return (
    <>
      {receitas === null ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
          Carregando...
        </div>
      ) : erroCarga ? (
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <i className="ti ti-cloud-off" style={{ fontSize: 40, color: 'var(--red)' }} aria-hidden="true"></i>
          <div style={{ fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>Não consegui carregar</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{erroCarga}</div>
        </div>
      ) : receitas.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <i className="ti ti-tools-kitchen-2" style={{ fontSize: 40, color: 'var(--muted-2)' }} aria-hidden="true"></i>
          <div style={{ fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>Nenhuma receita ainda</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            A sua nutri ainda não compartilhou receitas com você.
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px' }}>
          {receitas.map(r => (
            <button key={r.id} onClick={() => setVer(r)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'var(--white)',
                border: '0.5px solid var(--hair)', borderRadius: 14,
                padding: 14, marginBottom: 10,
                display: 'flex', gap: 12, alignItems: 'center',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: 'var(--bg-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
              }}>
                {urls[r.id] ? (
                  <img src={urls[r.id]} alt={r.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="ti ti-tools-kitchen-2" style={{ fontSize: 22, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                  {r.nome}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {(r.ingredientes ?? []).length} ingrediente{(r.ingredientes ?? []).length === 1 ? '' : 's'}
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: 18, color: 'var(--muted)' }} aria-hidden="true"></i>
            </button>
          ))}
        </div>
      )}

      {ver && (
        <ModalReceita receita={ver} url={urls[ver.id]} onClose={() => setVer(null)} />
      )}
    </>
  );
}

function ModalReceita({ receita, url, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: '18px 18px 0 0',
        width: '100%', maxWidth: 480, maxHeight: '88vh', overflow: 'auto',
        padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{receita.nome}</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--muted)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        {url && (
          <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 14, aspectRatio: '16/9', background: 'var(--bg-soft)' }}>
            <img src={url} alt={receita.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 500 }}>
          Ingredientes
        </div>
        {(receita.ingredientes ?? []).length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Nenhum ingrediente cadastrado.</div>
        ) : (
          <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 14, color: 'var(--ink)', lineHeight: 1.8 }}>
            {receita.ingredientes.map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
        )}

        <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 500 }}>
          Modo de preparo
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: 8 }}>
          {receita.modo_preparo || 'Nenhuma instrução cadastrada.'}
        </div>
      </div>
    </div>
  );
}
