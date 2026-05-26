import { useState, useMemo, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BrandFooter from './BrandFooter.jsx';
import { useSession, signOut } from '../lib/session.jsx';
import { useTheme } from '../lib/theme.jsx';
import { supabase } from '../lib/supabase.js';
import { iniciais } from '../lib/utils.js';
import '../styles/paciente.css';

const TABS = [
  { id: 'inicio',    path: '/paciente/inicio',    label: 'Início',    icon: 'home' },
  { id: 'plano',     path: '/paciente/plano',     label: 'Plano',     icon: 'salad' },
  { id: 'feed',      path: '/paciente/feed',      label: 'Pratos',    icon: 'camera' },
  { id: 'progresso', path: '/paciente/progresso', label: 'Progresso', icon: 'trending-up' },
  { id: 'mais',                                    label: 'Mais',      icon: 'menu-2' },
];

const MAIS_ITEMS = [
  { path: '/paciente/compras',     icon: 'shopping-cart', label: 'Lista de compras',     sub: 'Lista da semana' },
  { path: '/paciente/suplementos', icon: 'pill',          label: 'Suplementos',          sub: 'Lista do dia' },
  { path: '/paciente/habitos',     icon: 'checklist',     label: 'Hábitos',              sub: 'Tracker diário' },
  { path: '/paciente/prescricoes', icon: 'file-text',     label: 'Prescrições',          sub: 'Documentos da Dra.' },
  { path: '/paciente/ebooks',      icon: 'book-2',        label: 'E-books',              sub: 'Materiais da Dra.' },
  { path: '/paciente/chat',        icon: 'message-circle', label: 'Chat com a Dra.',     sub: 'Conversa direta' },
];

const HEADERS = {
  '/paciente/inicio':       (nome) =>           ({ eyebrow: 'Meu plano',         title: `Bom dia, ${nome}` }),
  '/paciente/plano':        () =>                ({ eyebrow: 'Plano alimentar',  title: 'Meu plano',         subtitle: '' }),
  '/paciente/feed':         () =>                ({ eyebrow: 'Diário alimentar', title: 'Pratos',            subtitle: 'Registre o que você comeu' }),
  '/paciente/progresso':    () =>                ({ eyebrow: 'Minha evolução',   title: 'Progresso' }),
  '/paciente/compras':      () =>                ({ eyebrow: 'Lista',            title: 'Compras',           subtitle: 'Para a semana' }),
  '/paciente/prescricoes':  () =>                ({ eyebrow: 'Documentos',       title: 'Prescrições' }),
  '/paciente/ebooks':       () =>                ({ eyebrow: 'Materiais',        title: 'E-books',           subtitle: 'Compartilhados pela sua nutri' }),
  '/paciente/suplementos':  () =>                ({ eyebrow: 'Habit tracker',    title: 'Meus suplementos',  subtitle: 'Marque diariamente' }),
  '/paciente/habitos':      () =>                ({ eyebrow: 'Hábitos do dia',   title: 'Meus hábitos',      subtitle: 'Acompanhe sua rotina' }),
  '/paciente/chat':         (_nome, nutriNome) => ({ eyebrow: 'Conversa',         title: nutriNome || 'Sua nutri', subtitle: 'Online' }),
};

export default function PacienteLayout() {
  const { profile, user } = useSession();
  const tema = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  const isChat = location.pathname === '/paciente/chat';
  const primeiroNome = profile?.nome?.split(' ')[0] ?? '';

  // Conta mensagens não lidas vindas da nutri
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function recarregar() {
      const { count } = await supabase
        .from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('paciente_id', user.id)
        .eq('de', 'nutri')
        .eq('lida', false);
      if (active) setUnreadChat(count ?? 0);
    }

    recarregar();
    const channel = supabase
      .channel(`paciente-unread-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mensagens',
        filter: `paciente_id=eq.${user.id}`,
      }, recarregar)
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

  const header = useMemo(() => {
    const factory = HEADERS[location.pathname];
    return factory ? factory(primeiroNome, tema.nutri_nome) : { eyebrow: '', title: '' };
  }, [location.pathname, primeiroNome, tema.nutri_nome]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="paciente-app">
      <header className="app-header">
        {isChat && (
          <button
            onClick={() => navigate('/paciente/inicio')}
            aria-label="Voltar"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, flexShrink: 0, marginBottom: 4,
            }}>
            <i className="ti ti-chevron-left" style={{ fontSize: 22, color: 'var(--ink)' }} aria-hidden="true"></i>
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {header.eyebrow && <div className="eyebrow">{header.eyebrow}</div>}
          <div className="app-title">{header.title}</div>
          {header.subtitle && <div className="app-subtitle">{header.subtitle}</div>}
        </div>
        <div className="header-right">
          <div className="header-avatar">{iniciais(profile?.nome)}</div>
        </div>
      </header>

      <div className="body">
        <Outlet />
        <BrandFooter compact />
      </div>

      {!isChat && (
        <nav className="tabbar" role="tablist">
          {TABS.map(t => {
            const active = t.path
              ? location.pathname === t.path
              : ['/paciente/compras', '/paciente/suplementos', '/paciente/habitos', '/paciente/prescricoes', '/paciente/ebooks', '/paciente/chat'].includes(location.pathname);

            if (!t.path) {
              return (
                <button
                  key={t.id}
                  className={`tab ${active ? 'active' : ''}`}
                  onClick={() => setMoreOpen(true)}
                  role="tab"
                  style={{ position: 'relative' }}
                >
                  <i className={`ti ti-${t.icon}`} aria-hidden="true"></i>
                  <span>{t.label}</span>
                  {unreadChat > 0 && (
                    <span style={{
                      position: 'absolute', top: 2, right: 'calc(50% - 18px)',
                      background: 'var(--red)', color: 'var(--paper)',
                      fontSize: 9, fontWeight: 600,
                      minWidth: 14, height: 14, borderRadius: 7,
                      padding: '0 4px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid var(--paper)',
                    }}>{unreadChat}</span>
                  )}
                </button>
              );
            }

            return (
              <NavLink
                key={t.id}
                to={t.path}
                className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
                role="tab"
              >
                <i className={`ti ti-${t.icon}`} aria-hidden="true"></i>
                <span>{t.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="grabber"></div>
            <div className="serif" style={{ fontSize: 22, marginBottom: 14 }}>Mais</div>
            {MAIS_ITEMS.map(item => {
              const isChatItem = item.path === '/paciente/chat';
              return (
                <button key={item.path}
                  className="sheet-item"
                  onClick={() => { setMoreOpen(false); navigate(item.path); }}>
                  <div className="icon-wrap"><i className={`ti ti-${item.icon}`} aria-hidden="true"></i></div>
                  <div style={{ flex: 1 }}>
                    <div className="label">{item.label}</div>
                    <div className="sub">{item.sub}</div>
                  </div>
                  {isChatItem && unreadChat > 0 && (
                    <span style={{
                      background: 'var(--red)', color: 'var(--paper)',
                      fontSize: 10, fontWeight: 600,
                      minWidth: 18, height: 18, borderRadius: 9,
                      padding: '0 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{unreadChat}</span>
                  )}
                  <i className="ti ti-chevron-right" style={{ color: 'var(--muted)' }} aria-hidden="true"></i>
                </button>
              );
            })}

            <div style={{ height: 1, background: 'var(--hair)', margin: '12px 0 8px' }}></div>

            <button
              className="sheet-item"
              onClick={async () => {
                if (window.confirm('Tem certeza que deseja sair?')) {
                  setMoreOpen(false);
                  await handleSignOut();
                }
              }}>
              <div className="icon-wrap" style={{ background: 'var(--red-soft)' }}>
                <i className="ti ti-logout" style={{ color: 'var(--red)' }} aria-hidden="true"></i>
              </div>
              <div style={{ flex: 1 }}>
                <div className="label" style={{ color: 'var(--red)' }}>Sair</div>
                <div className="sub">Encerrar sessão</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
