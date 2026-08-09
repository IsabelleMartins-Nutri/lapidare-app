import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import BrandFooter from '../../components/BrandFooter.jsx';
import CheckinForm from '../../components/CheckinForm.jsx';
import { QFA_LAPIDARE, achatarEstrutura } from '../../lib/anamneseDefault.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TITULOS = {
  geral: 'Questionário de pré-consulta',
  qfa: 'Questionário de frequência alimentar',
};

export default function PreConsultaIntake() {
  const { nutriId, tipo } = useParams();

  const [estado, setEstado] = useState('carregando'); // carregando | invalido | sem_perguntas | pronto | enviado
  const [nutriNome, setNutriNome] = useState('');
  const [perguntas, setPerguntas] = useState([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [respostas, setRespostas] = useState({});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const tipoValido = tipo === 'geral' || tipo === 'qfa';

  useEffect(() => {
    let active = true;
    async function carregar() {
      if (!nutriId || !UUID_RE.test(nutriId) || !tipoValido) {
        if (active) setEstado('invalido');
        return;
      }

      const { data: nutriData } = await supabase.rpc('buscar_nome_nutri', { p_nutri_id: nutriId });
      if (!active) return;
      if (!nutriData || nutriData.length === 0) {
        setEstado('invalido');
        return;
      }
      setNutriNome(nutriData[0].nome ?? '');

      if (tipo === 'qfa') {
        setPerguntas(achatarEstrutura(QFA_LAPIDARE.estrutura));
        setEstado('pronto');
        return;
      }

      const { data: perguntasData } = await supabase.rpc('buscar_template_intake', { p_nutri_id: nutriId });
      if (!active) return;
      if (!Array.isArray(perguntasData) || perguntasData.length === 0) {
        setEstado('sem_perguntas');
        return;
      }
      setPerguntas(perguntasData);
      setEstado('pronto');
    }
    carregar();
    return () => { active = false; };
  }, [nutriId, tipo, tipoValido]);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) return setErro('Informe seu nome completo.');
    if (!email.trim()) return setErro('Informe seu email.');

    setBusy(true);
    const { error } = await supabase.rpc('salvar_intake_submissao', {
      p_nutri_id: nutriId,
      p_tipo: tipo,
      p_nome: nome.trim(),
      p_email: email.trim(),
      p_perguntas: perguntas,
      p_respostas: respostas,
    });
    setBusy(false);
    if (error) return setErro('Não consegui enviar suas respostas: ' + error.message);
    setEstado('enviado');
  }

  return (
    <CenterWrap>
      <Box>
        <Brand />
        {estado === 'carregando' && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</div>
        )}

        {estado === 'invalido' && (
          <>
            <h1 style={H1}>Link inválido</h1>
            <p style={P}>Este link não está mais ativo ou foi digitado incorretamente. Peça um novo link à sua nutricionista.</p>
          </>
        )}

        {estado === 'sem_perguntas' && (
          <>
            <h1 style={H1}>Quase lá</h1>
            <p style={P}>Sua nutricionista ainda está preparando esse questionário. Aguarde um contato dela.</p>
          </>
        )}

        {estado === 'pronto' && (
          <>
            <h1 style={H1}>{TITULOS[tipo]}</h1>
            <p style={P}>
              {nutriNome ? `${nutriNome} preparou algumas perguntas ` : 'Preparamos algumas perguntas '}
              pra te conhecer melhor. Leva só alguns minutos.
            </p>

            <form onSubmit={enviar} style={{ marginTop: 16, textAlign: 'left' }}>
              <div style={{
                background: 'var(--bg-soft, #faf7f2)',
                border: '0.5px solid var(--hair, #d9d3c9)',
                borderRadius: 10, padding: 12, marginBottom: 14,
              }}>
                <Field label="Seu nome completo" value={nome} onChange={setNome} required autoFocus />
                <Field label="Seu email" type="email" value={email} onChange={setEmail} required />
              </div>

              <CheckinForm perguntas={perguntas} valores={respostas} onChange={(id, v) => setRespostas(r => ({ ...r, [id]: v }))} />

              {erro && (
                <div style={{ ...AlertCss, background: 'var(--red-soft)', color: 'var(--red)' }}>{erro}</div>
              )}
              <button type="submit" disabled={busy} style={{
                width: '100%', padding: '11px 18px',
                background: 'var(--ink)', color: 'var(--bg-soft)',
                borderRadius: 12, fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                opacity: busy ? .6 : 1, marginTop: 14,
              }}>
                {busy ? 'Enviando...' : 'Enviar respostas'}
              </button>
            </form>
          </>
        )}

        {estado === 'enviado' && (
          <>
            <h1 style={H1}>Recebido! 🎉</h1>
            <p style={P}>Suas respostas já chegaram pra sua nutricionista.</p>
          </>
        )}
      </Box>
    </CenterWrap>
  );
}

const H1 = { fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 4 };
const P = { fontSize: 12, color: 'var(--muted)', marginTop: 6, textAlign: 'center' };
const AlertCss = { fontSize: 12, padding: '8px 12px', borderRadius: 8, marginTop: 10, marginBottom: 10 };

function CenterWrap({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, var(--bg-soft) 0%, var(--bg-deep) 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'var(--font-sans)',
    }}>
      {children}
      <BrandFooter />
    </div>
  );
}

function Box({ children }) {
  return (
    <div style={{
      width: '100%', maxWidth: 480,
      background: 'var(--paper)',
      border: '0.5px solid var(--hair, #d9d3c9)',
      borderRadius: 20,
      boxShadow: '0 4px 12px rgba(28,23,18,.06), 0 2px 4px rgba(28,23,18,.04)',
      padding: 32, textAlign: 'center',
    }}>{children}</div>
  );
}

function Brand() {
  return (
    <div style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
      Lapidare
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, autoFocus }) {
  return (
    <label style={{ display: 'block', marginBottom: 12, textAlign: 'left' }}>
      <span style={{
        display: 'block', fontSize: 11, letterSpacing: '.04em',
        color: 'var(--ink-soft)', marginBottom: 5, fontWeight: 500,
      }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          background: 'var(--paper)',
          border: '0.5px solid var(--hair, #d9d3c9)',
          borderRadius: 10, outline: 'none',
          color: 'var(--ink)',
          fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}
