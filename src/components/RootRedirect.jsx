import { Navigate } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';

/**
 * Decide para onde mandar o usuário na raiz "/":
 *   • sem sessão → /login
 *   • nutri      → /nutri/visao
 *   • paciente   → /paciente/inicio
 */
export default function RootRedirect() {
  const { session, role, loading } = useSession();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--muted)', fontSize: 13
      }}>
        Carregando…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (role === 'nutri') return <Navigate to="/nutri/visao" replace />;
  if (role === 'paciente') return <Navigate to="/paciente/inicio" replace />;
  return <Navigate to="/login" replace />;
}
