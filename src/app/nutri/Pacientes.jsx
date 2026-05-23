import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR, iniciais } from '../../lib/utils.js';
import ImportarCsv from './_ImportarCsv.jsx';

export default function Pacientes() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [pacientes, setPacientes] = useState(null);
  const [pendentes, setPendentes] = useState([]);
  const [busca, setBusca] = useState('');
  const [importerOpen, setImporterOpen] = useState(false);
  const [showPendentes, setShowPendentes] = useState(false);

  async function carregar() {
    const [pacRes, pendRes] = await Promise.all([
      supabase
        .from('pacientes')
        .select('id, nome, email, objetivo, tipo_plano, modalidade, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('pacientes_pendentes')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false }),
    ]);
    setPacientes(pacRes.data ?? []);
    setPendentes(pendRes.data ?? []);
  }

  useEffect(() => { if (user) carregar(); }, [user]);

  async function copiarLinkSignup(p) {
    const link = `${window.location.origin}/signup-paciente/${user.id}`;
    await navigator.clipboard.writeText(link);
    alert(`Link copiado! Envie pra ${p.nome.split(' ')[0]} por WhatsApp ou email.`);
    await supabase.from('pacientes_pendentes').update({ status: 'enviado' }).eq('id', p.id);
    carregar();
  }

  async function removerPendente(p) {
    if (!window.confirm(`Remover "${p.nome}" da lista de pendentes?`)) return;
    await supabase.from('pacientes_pendentes').delete().eq('id', p.id);
    carregar();
  }

  const filtradas = useMemo(() => {
    if (!pacientes) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter(p =>
      p.nome?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
    );
  }, [pacientes, busca]);

  return (
    <>
      <div className="page-title">Pacientes</div>
      <div className="page-sub">Gerencie todas as suas pacientes</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <input
          style={{ width: 240, margin: 0 }}
          className="input-field"
          placeholder="Buscar paciente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={() => setImporterOpen(true)}>
            <i className="ti ti-file-upload" aria-hidden="true"></i> Importar CSV
          </button>
          <button className="btn" onClick={() => navigate('/nutri/cadastrar')}>
            <i className="ti ti-user-plus" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Nova paciente
          </button>
        </div>
      </div>

      {/* Banner de pendentes */}
      {pendentes.length > 0 && (
        <div className="al-b" style={{
          marginBottom: 14, background: 'var(--orange-bg)',
          borderLeftColor: 'var(--orange)',
          cursor: 'pointer',
        }} onClick={() => setShowPendentes(v => !v)}>
          <i className="ti ti-user-plus" style={{ fontSize: 16, color: 'var(--orange)', marginTop: 1 }} aria-hidden="true"></i>
          <div style={{ flex: 1 }}>
            <div className="al-t" style={{ color: 'var(--orange)' }}>
              {pendentes.length} paciente{pendentes.length === 1 ? '' : 's'} pendente{pendentes.length === 1 ? '' : 's'} de cadastro
            </div>
            <div className="al-d">
              Foram importadas mas ainda não criaram conta. Envie o link de cadastro pra ativar.
              {showPendentes ? ' Toque pra esconder.' : ' Toque pra ver.'}
            </div>
          </div>
          <i className={`ti ti-chevron-${showPendentes ? 'up' : 'down'}`} style={{ fontSize: 16, color: 'var(--orange)' }} aria-hidden="true"></i>
        </div>
      )}

      {showPendentes && pendentes.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 14 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Objetivo</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.nome}</strong></td>
                  <td>{p.email}</td>
                  <td>{p.objetivo ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => copiarLinkSignup(p)}>
                        <i className="ti ti-link" aria-hidden="true"></i> Copiar link
                      </button>
                      <button onClick={() => removerPendente(p)}
                        style={{
                          background: 'none', border: '0.5px solid var(--red)',
                          borderRadius: 6, padding: '4px 8px',
                          color: 'var(--red)', cursor: 'pointer',
                        }}>
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importerOpen && (
        <ImportarCsv
          onClose={() => setImporterOpen(false)}
          onImported={() => { carregar(); setShowPendentes(true); }}
        />
      )}

      {pacientes === null ? (
        <div className="card empty-card">
          <div className="empty-sub">Carregando…</div>
        </div>
      ) : pacientes.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-users empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Nenhuma paciente cadastrada ainda</div>
          <div className="empty-sub">
            Cadastre a primeira paciente para começar a publicar planos, prescrições e acompanhar progresso.
          </div>
          <button className="btn" onClick={() => navigate('/nutri/cadastrar')}>
            <i className="ti ti-user-plus" aria-hidden="true"></i> Cadastrar primeira paciente
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-sub">Nenhuma paciente encontrada para "{busca}".</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Objetivo</th>
                <th>Plano</th>
                <th>Modalidade</th>
                <th>Cadastro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/nutri/pacientes/${p.id}`)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'var(--bg2)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 600, color: 'var(--dark)'
                      }}>{iniciais(p.nome)}</div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{p.nome}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{p.objetivo ?? '—'}</td>
                  <td>{p.tipo_plano ?? '—'}</td>
                  <td>{p.modalidade ?? '—'}</td>
                  <td>{dataBR(p.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <i className="ti ti-chevron-right" style={{ color: 'var(--text3)' }} aria-hidden="true"></i>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
