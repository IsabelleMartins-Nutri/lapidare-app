import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import BrandFooter from '../../components/BrandFooter.jsx';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, role, loading: sessionLoading } = useSession();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [crn, setCrn] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  // Redireciona automaticamente após login bem-sucedido
  useEffect(() => {
    if (sessionLoading || !session) return;
    const from = location.state?.from;
    if (role === 'nutri') {
      navigate(from?.startsWith('/nutri') ? from : '/nutri/visao', { replace: true });
    } else if (role === 'paciente') {
      navigate(from?.startsWith('/paciente') ? from : '/paciente/inicio', { replace: true });
    }
  }, [session, role, sessionLoading, navigate, location.state]);

  async function handleSignIn(e) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setBusy(false);
    if (error) setErro(error.message);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    if (!nome.trim()) return setErro('Informe o nome completo.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { role: 'nutri', nome: nome.trim(), crn: crn.trim() },
      },
    });
    setBusy(false);
    if (error) return setErro(error.message);
    if (!data.session) {
      setAviso('Conta criada. Verifique seu email para confirmar e depois faça login.');
      setMode('signin');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #ece6dc 0%, #e3dcce 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'var(--font-sans)'
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--paper)', border: '0.5px solid var(--hair)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: 32
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase',
            color: 'var(--muted)', marginBottom: 4
          }}>
            Lapidare
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 28,
            letterSpacing: '-0.02em', color: 'var(--ink)'
          }}>
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            {mode === 'signin'
              ? 'Acesse seu painel ou app'
              : 'Cadastro de nutricionista'}
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 2, background: 'var(--bg-deep)',
          borderRadius: 10, padding: 3, marginBottom: 18
        }}>
          {[
            { id: 'signin', label: 'Entrar' },
            { id: 'signup', label: 'Criar conta' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setMode(t.id); setErro(null); setAviso(null); }}
              style={{
                flex: 1, padding: '7px 4px', fontSize: 12, fontWeight: 500,
                borderRadius: 8,
                color: mode === t.id ? 'var(--ink)' : 'var(--muted)',
                background: mode === t.id ? 'var(--paper)' : 'transparent',
                boxShadow: mode === t.id ? 'var(--shadow-sm)' : 'none',
                transition: 'all .2s'
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
          {mode === 'signup' && (
            <>
              <Field label="Nome completo" value={nome} onChange={setNome} required autoFocus />
              <Field label="CRN" value={crn} onChange={setCrn} placeholder="opcional" />
            </>
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} required autoFocus={mode === 'signin'} />
          <Field label="Senha" type="password" value={senha} onChange={setSenha} required minLength={6} />

          {erro && (
            <div style={{
              fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)',
              padding: '8px 12px', borderRadius: 8, marginBottom: 12
            }}>
              {erro}
            </div>
          )}
          {aviso && (
            <div style={{
              fontSize: 12, color: 'var(--green)', background: 'var(--green-soft)',
              padding: '8px 12px', borderRadius: 8, marginBottom: 12
            }}>
              {aviso}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%', padding: '11px 18px',
              background: 'var(--ink)', color: 'var(--bg-soft)',
              borderRadius: 12, fontSize: 13, fontWeight: 500,
              opacity: busy ? .6 : 1, transition: 'opacity .15s'
            }}>
            {busy ? '...' : (mode === 'signin' ? 'Entrar' : 'Criar conta de nutri')}
          </button>
        </form>
        <BrandFooter />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, placeholder, autoFocus, minLength }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, letterSpacing: '.04em',
        color: 'var(--ink-soft)', marginBottom: 5, fontWeight: 500
      }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        minLength={minLength}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          background: 'var(--bg-soft)',
          border: '0.5px solid var(--hair)',
          borderRadius: 10, outline: 'none',
          color: 'var(--ink)',
        }}
      />
    </label>
  );
}
