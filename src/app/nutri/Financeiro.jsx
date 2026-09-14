import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import {
  brl, dataBR, mesAnoExtenso,
  gerarParcelas, statusParcela,
  labelFormaPgto, iconFormaPgto, FORMAS_PGTO_LIST,
} from '../../lib/utils.js';
import Gastos from './Gastos.jsx';

const STATUS_INFO = {
  pago:      { label: 'Pago',      bg: 'var(--green-bg)', color: 'var(--green)',  icon: 'check' },
  pendente:  { label: 'Pendente',  bg: '#f5f0e8',         color: 'var(--text3)',  icon: 'clock' },
  atrasado:  { label: 'Atrasado',  bg: 'var(--red-bg)',   color: 'var(--red)',    icon: 'alert-triangle' },
};

// Valor líquido "efetivo" de uma parcela: o que a nutri digitou manualmente,
// ou — se for Pix, que não tem taxa nenhuma — o próprio valor bruto. Pra
// qualquer outra forma sem valor líquido preenchido ainda, retorna null
// (não dá pra saber quanto vai cair líquido antes de acontecer).
function liquidoEfetivo(parcela, formaPgto) {
  if (parcela.valor_liquido != null) return Number(parcela.valor_liquido);
  if (formaPgto === 'pix') return Number(parcela.valor);
  return null;
}

export default function Financeiro() {
  const { user } = useSession();
  const [tab, setTab] = useState('entradas');  // 'entradas' | 'gastos'
  const [vendas, setVendas] = useState(undefined);
  const [parcelas, setParcelas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [parcelaEdit, setParcelaEdit] = useState(null);
  const [vendaEdit, setVendaEdit] = useState(null);
  const [vendasExpandidas, setVendasExpandidas] = useState({});

  async function excluirVenda(venda) {
    const ok = window.confirm(
      `Excluir a venda "${venda.servico}" de ${venda.paciente?.nome ?? venda.paciente_nome_manual ?? 'Avulso'}?\n\n` +
      `Todas as parcelas relacionadas também serão removidas. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    const { error } = await supabase.from('vendas').delete().eq('id', venda.id);
    if (error) {
      alert('Erro ao excluir venda: ' + error.message);
      return;
    }
    await carregar();
  }

  async function carregar() {
    if (!user) return;
    const [vRes, pRes, pacRes, sRes] = await Promise.all([
      supabase.from('vendas')
        .select('id, paciente_id, paciente_nome_manual, servico_id, servico, valor_total, forma_pgto, data_venda, obs, paciente:pacientes(id, nome)')
        .eq('nutri_id', user.id)
        .order('data_venda', { ascending: false }),
      supabase.from('parcelas')
        .select('*')
        .eq('nutri_id', user.id)
        .order('vencimento', { ascending: true }),
      supabase.from('pacientes')
        .select('id, nome')
        .eq('nutri_id', user.id)
        .order('nome'),
      supabase.from('servicos')
        .select('id, nome, ticket, ativo')
        .eq('nutri_id', user.id).eq('ativo', true)
        .order('ticket', { ascending: false }),
    ]);
    setVendas(vRes.data ?? []);
    setParcelas(pRes.data ?? []);
    setPacientes(pacRes.data ?? []);
    setServicos(sRes.data ?? []);
  }
  useEffect(() => { carregar(); }, [user]);

  // Forma de pagamento de cada venda, por id — usado pra saber se uma
  // parcela é Pix (líquido = bruto sempre, sem taxa) nos cálculos abaixo.
  const formaPorVenda = useMemo(() => {
    const m = {};
    (vendas ?? []).forEach(v => { m[v.id] = v.forma_pgto; });
    return m;
  }, [vendas]);

  // Agrupa parcelas por venda
  const parcelasPorVenda = useMemo(() => {
    const m = {};
    parcelas.forEach(p => {
      (m[p.venda_id] ??= []).push(p);
    });
    return m;
  }, [parcelas]);

  // Filtra vendas com base no filtro
  const vendasFiltradas = useMemo(() => {
    if (!vendas) return [];
    if (filtro === 'todas') return vendas;
    return vendas.filter(v => {
      const ps = parcelasPorVenda[v.id] ?? [];
      if (filtro === 'areceber') {
        return ps.some(p => statusParcela(p) === 'pendente');
      }
      if (filtro === 'atrasado') {
        return ps.some(p => statusParcela(p) === 'atrasado');
      }
      return true;
    });
  }, [vendas, parcelasPorVenda, filtro]);

  // Stats
  const stats = useMemo(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const inicioMes = new Date(ano, mes, 1);
    const fimMes = new Date(ano, mes + 1, 0); fimMes.setHours(23, 59, 59, 999);

    let recebido = 0, recebidoN = 0;
    let recebidoLiquido = 0, recebidoLiquidoN = 0;
    let aReceber = 0, aReceberN = 0;
    let atrasado = 0, atrasadoN = 0;

    parcelas.forEach(p => {
      const s = statusParcela(p);
      const venc = p.vencimento ? new Date(p.vencimento + 'T00:00:00') : null;
      const pgto = p.data_pgto ? new Date(p.data_pgto + 'T00:00:00') : null;
      if (s === 'pago' && pgto && pgto >= inicioMes && pgto <= fimMes) {
        recebido += Number(p.valor); recebidoN++;
        const liq = liquidoEfetivo(p, formaPorVenda[p.venda_id]);
        if (liq != null) { recebidoLiquido += liq; recebidoLiquidoN++; }
      }
      if (s === 'pendente' && venc && venc >= inicioMes && venc <= fimMes) {
        aReceber += Number(p.valor); aReceberN++;
      }
      if (s === 'atrasado') {
        atrasado += Number(p.valor); atrasadoN++;
      }
    });
    return { recebido, recebidoN, recebidoLiquido, recebidoLiquidoN, aReceber, aReceberN, atrasado, atrasadoN };
  }, [parcelas, formaPorVenda]);

  // Previsão por mês — agrupa toda parcela ainda não paga (a receber ou em
  // atraso) pelo mês do vencimento, pra ver de uma vez quanto entra em cada
  // mês futuro (fica mais útil agora que as datas são ajustáveis uma a uma).
  const previsaoPorMes = useMemo(() => {
    const mapa = {};
    parcelas.forEach(p => {
      const s = statusParcela(p);
      if (s === 'pago' || !p.vencimento) return;
      const chave = p.vencimento.slice(0, 7); // "YYYY-MM"
      if (!mapa[chave]) mapa[chave] = { chave, total: 0, totalLiquido: 0, totalAtrasado: 0, n: 0, nLiquido: 0 };
      mapa[chave].total += Number(p.valor);
      mapa[chave].n++;
      if (s === 'atrasado') mapa[chave].totalAtrasado += Number(p.valor);
      const liq = liquidoEfetivo(p, formaPorVenda[p.venda_id]);
      if (liq != null) { mapa[chave].totalLiquido += liq; mapa[chave].nLiquido++; }
    });
    return Object.values(mapa).sort((a, b) => a.chave.localeCompare(b.chave));
  }, [parcelas, formaPorVenda]);

  const toggleExpand = (id) => setVendasExpandidas(s => ({ ...s, [id]: !s[id] }));

  return (
    <>
      <div className="page-title">Financeiro real</div>
      <div className="page-sub">
        {tab === 'entradas'
          ? 'Vendas e parcelas — o que entrou e o que ainda vai entrar'
          : 'Gastos do consultório — saída do fluxo de caixa'}
      </div>

      <div style={{
        display: 'flex', gap: 2, background: 'var(--bg2)',
        borderRadius: 10, padding: 3, marginBottom: 16, maxWidth: 360,
      }}>
        {[
          { id: 'entradas', label: '↗ Entradas (vendas)' },
          { id: 'gastos',   label: '↘ Saídas (gastos)' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '8px 12px', fontSize: 14, fontWeight: 500,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--dark)' : 'var(--text3)',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              fontFamily: 'var(--font-sans)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gastos' && <Gastos />}

      {tab === 'entradas' && (<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Recebido este mês</div>
          <div className="stat-val">{brl(stats.recebido)}</div>
          <div className="stat-sub">
            {stats.recebidoN} pagamento{stats.recebidoN === 1 ? '' : 's'}
            {stats.recebidoLiquidoN > 0 && <> · líquido {brl(stats.recebidoLiquido)}</>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">A receber este mês</div>
          <div className="stat-val">{brl(stats.aReceber)}</div>
          <div className="stat-sub">{stats.aReceberN} parcela{stats.aReceberN === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Em atraso</div>
          <div className="stat-val" style={{ color: stats.atrasado > 0 ? 'var(--red)' : 'var(--dark)' }}>
            {brl(stats.atrasado)}
          </div>
          <div className="stat-sub">{stats.atrasadoN} parcela{stats.atrasadoN === 1 ? '' : 's'}</div>
        </div>
      </div>

      {stats.atrasado > 0 && (
        <div className="al-b" style={{
          background: 'var(--red-bg)', borderLeftColor: 'var(--red)',
          marginBottom: 12,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: 'var(--red)', marginTop: 1 }} aria-hidden="true"></i>
          <div>
            <div className="al-t" style={{ color: 'var(--red)' }}>
              {stats.atrasadoN} parcela{stats.atrasadoN === 1 ? '' : 's'} em atraso · {brl(stats.atrasado)}
            </div>
            <div className="al-d">
              Entre em contato com as pacientes correspondentes para regularizar.
            </div>
          </div>
        </div>
      )}

      {previsaoPorMes.length > 0 && (
        <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)', marginBottom: 10 }}>
            Previsão por mês
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {previsaoPorMes.map(m => {
              const [ano, mes] = m.chave.split('-');
              const label = mesAnoExtenso(new Date(Number(ano), Number(mes) - 1, 1));
              return (
                <div key={m.chave} style={{
                  flex: '0 0 auto', minWidth: 148,
                  background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--dark)', marginTop: 2 }}>
                    {brl(m.total)} <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>bruto</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
                    {m.nLiquido > 0 ? brl(m.totalLiquido) : '—'} <span style={{ fontSize: 10, color: 'var(--text3)' }}>líquido{m.nLiquido < m.n ? ' (parcial)' : ''}</span>
                  </div>
                  <div style={{ fontSize: 11, color: m.totalAtrasado > 0 ? 'var(--red)' : 'var(--text3)', marginTop: 4 }}>
                    {m.n} parcela{m.n === 1 ? '' : 's'}
                    {m.totalAtrasado > 0 && <> · {brl(m.totalAtrasado)} atrasado</>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'todas',    label: 'Todas' },
            { id: 'areceber', label: 'A receber' },
            { id: 'atrasado', label: 'Em atraso' },
          ].map(f => (
            <button
              key={f.id}
              className={filtro === f.id ? 'btn' : 'btn-outline'}
              onClick={() => setFiltro(f.id)}
              style={{ fontSize: 13 }}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setNovaVendaOpen(true)}>
          <i className="ti ti-plus" aria-hidden="true"></i> Nova venda
        </button>
      </div>

      {vendas === undefined ? (
        <div className="card empty-card"><div className="empty-sub">Carregando…</div></div>
      ) : vendasFiltradas.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-credit-card empty-icon" aria-hidden="true"></i>
          <div className="empty-title">
            {filtro === 'todas' ? 'Nenhuma venda registrada' :
             filtro === 'areceber' ? 'Nenhuma venda a receber' :
             'Nada em atraso'}
          </div>
          <div className="empty-sub">
            Registre suas vendas com forma de pagamento para o financeiro começar a popular os indicadores.
          </div>
          {filtro === 'todas' && (
            <button className="btn" onClick={() => setNovaVendaOpen(true)}>
              <i className="ti ti-plus" aria-hidden="true"></i> Primeira venda
            </button>
          )}
        </div>
      ) : (
        vendasFiltradas.map(v => {
          const ps = parcelasPorVenda[v.id] ?? [];
          const aberta = vendasExpandidas[v.id];
          const pagasArr = ps.filter(p => p.status === 'pago');
          const totalPago = pagasArr.reduce((a, p) => a + Number(p.valor), 0);
          const pagasComLiquido = pagasArr.filter(p => liquidoEfetivo(p, v.forma_pgto) != null);
          const totalPagoLiquido = pagasComLiquido.reduce((a, p) => a + liquidoEfetivo(p, v.forma_pgto), 0);
          const pagas = pagasArr.length;
          return (
            <div key={v.id} className="card" style={{ padding: 0 }}>
              <div
                onClick={() => toggleExpand(v.id)}
                style={{
                  padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer',
                  borderBottom: aberta ? '0.5px solid #f5f0e8' : 'none',
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: 'var(--bg2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <i className={`ti ti-${iconFormaPgto(v.forma_pgto)}`} style={{ fontSize: 17 }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>
                    {v.paciente?.nome ?? v.paciente_nome_manual ?? 'Avulso'} · {v.servico}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {dataBR(v.data_venda)} · {labelFormaPgto(v.forma_pgto)} · {ps.length} parcela{ps.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{brl(v.valor_total)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {pagas}/{ps.length} · {brl(totalPago)}
                    {pagasComLiquido.length > 0 && <> · líq. {brl(totalPagoLiquido)}</>}
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{
                  fontSize: 16, color: 'var(--text3)',
                  transform: aberta ? 'rotate(90deg)' : 'none', transition: 'transform .2s',
                }} aria-hidden="true"></i>
              </div>

              {aberta && (
                <div style={{ padding: '4px 16px 10px' }}>
                  {ps.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', margin: '4px 0 2px' }}>
                      Parcelas (clique pra editar)
                    </div>
                  )}
                  {ps.map((p, i) => {
                    const s = statusParcela(p);
                    const info = STATUS_INFO[s];
                    return (
                      <div
                        key={p.id}
                        onClick={() => setParcelaEdit({ parcela: p, venda: v })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 0', fontSize: 13,
                          borderBottom: i === ps.length - 1 ? 'none' : '0.5px solid #f5f0e8',
                          cursor: 'pointer',
                        }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: info.bg, color: info.color,
                          fontSize: 12, fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>{p.numero}</div>
                        <div style={{ flex: 1 }}>
                          <div>Venc. {dataBR(p.vencimento)}</div>
                          {p.data_pgto && (
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                              pago em {dataBR(p.data_pgto)}
                              {liquidoEfetivo(p, v.forma_pgto) != null && <> · líquido {brl(liquidoEfetivo(p, v.forma_pgto))}</>}
                            </div>
                          )}
                          {p.obs && (
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontStyle: 'italic' }}>"{p.obs}"</div>
                          )}
                        </div>
                        <div style={{ fontWeight: 500 }}>{brl(p.valor)}</div>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 20,
                          fontWeight: 500, background: info.bg, color: info.color,
                        }}>
                          {info.label}
                        </span>
                      </div>
                    );
                  })}

                  {/* Ações da venda inteira */}
                  <div style={{
                    display: 'flex', gap: 8, marginTop: 12,
                    paddingTop: 10, borderTop: '0.5px solid #f5f0e8',
                  }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setVendaEdit(v); }}
                      style={{
                        flex: 1, padding: '8px 12px',
                        background: 'transparent', color: 'var(--text2)',
                        border: '0.5px solid var(--border)', borderRadius: 7,
                        fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <i className="ti ti-pencil" aria-hidden="true"></i> Editar venda
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); excluirVenda(v); }}
                      style={{
                        flex: 1, padding: '8px 12px',
                        background: 'transparent', color: 'var(--red)',
                        border: '0.5px solid var(--red)', borderRadius: 7,
                        fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i> Excluir venda
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {novaVendaOpen && (
        <NovaVendaModal
          pacientes={pacientes}
          servicos={servicos}
          nutriId={user.id}
          onClose={() => setNovaVendaOpen(false)}
          onSaved={async () => { setNovaVendaOpen(false); await carregar(); }}
        />
      )}

      {parcelaEdit && (
        <EditarParcelaModal
          {...parcelaEdit}
          onClose={() => setParcelaEdit(null)}
          onSaved={async () => { setParcelaEdit(null); await carregar(); }}
        />
      )}

      {vendaEdit && (
        <EditarVendaModal
          venda={vendaEdit}
          pacientes={pacientes}
          onClose={() => setVendaEdit(null)}
          onSaved={async () => { setVendaEdit(null); await carregar(); }}
        />
      )}
      </>)}
    </>
  );
}

/* ============================================================
   NOVA VENDA — modal
   ============================================================ */
function NovaVendaModal({ pacientes, servicos, nutriId, onClose, onSaved }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [pacienteId, setPacienteId] = useState('');
  const [pacienteNomeManual, setPacienteNomeManual] = useState('');
  const [servicoId, setServicoId] = useState('');  // '' = manual/custom
  const [servico, setServico] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje);
  const [forma, setForma] = useState('pix');
  const [nParcelas, setNParcelas] = useState(3);
  const [nMeses, setNMeses] = useState(3);
  const [datasEditadas, setDatasEditadas] = useState({});
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  // Ao escolher um serviço do catálogo, popula nome e valor automaticamente
  function escolherServico(id) {
    setServicoId(id);
    if (!id) {
      // modo "outro" — limpa para a nutri preencher manualmente
      setServico('');
      setValor('');
      return;
    }
    const s = servicos.find(x => x.id === id);
    if (s) {
      setServico(s.nome);
      setValor(String(s.ticket).replace('.', ','));
    }
  }

  const valorNum = Number(String(valor).replace(',', '.')) || 0;

  const parcelasAuto = useMemo(() => {
    if (!valorNum || !data) return [];
    return gerarParcelas({
      forma_pgto: forma,
      valor_total: valorNum,
      data_venda: data,
      n_parcelas: forma === 'parcelado' ? nParcelas : (forma === 'asaas' ? nMeses : 1),
    });
  }, [forma, valorNum, data, nParcelas, nMeses]);

  // Se algum parâmetro que afeta o cálculo mudar, descarta os ajustes manuais
  // de data feitos antes (senão a parcela 2 antiga pode ficar "grudada" numa
  // parcela 5 nova, por exemplo).
  useEffect(() => { setDatasEditadas({}); }, [forma, valorNum, data, nParcelas, nMeses]);

  const parcelasPreview = useMemo(() => (
    parcelasAuto.map(p => ({ ...p, vencimento: datasEditadas[p.numero] ?? p.vencimento }))
  ), [parcelasAuto, datasEditadas]);

  async function salvar() {
    setErro(null);
    if (!servico.trim()) return setErro('Informe o serviço.');
    if (!valorNum) return setErro('Informe um valor válido.');
    if (!data) return setErro('Informe a data da venda.');

    setBusy(true);
    const { data: venda, error: vErr } = await supabase
      .from('vendas')
      .insert({
        nutri_id: nutriId,
        paciente_id: pacienteId || null,
        paciente_nome_manual: pacienteId ? null : (pacienteNomeManual.trim() || null),
        servico_id: servicoId || null,
        servico: servico.trim(),
        valor_total: valorNum,
        forma_pgto: forma,
        data_venda: data,
        obs: obs.trim() || null,
      })
      .select('id')
      .single();
    if (vErr) {
      setBusy(false);
      return setErro('Erro ao salvar venda: ' + vErr.message);
    }

    const linhas = parcelasPreview.map(p => ({
      venda_id: venda.id,
      nutri_id: nutriId,
      numero: p.numero,
      valor: p.valor,
      vencimento: p.vencimento,
    }));
    const { error: pErr } = await supabase.from('parcelas').insert(linhas);
    setBusy(false);
    if (pErr) {
      // rollback venda
      await supabase.from('vendas').delete().eq('id', venda.id);
      return setErro('Erro ao gerar parcelas: ' + pErr.message);
    }
    onSaved();
  }

  return (
    <ModalShell title="Nova venda" subtitle="Registre a venda e o parcelamento" onClose={onClose}>
      <label className="form-lbl">Paciente</label>
      <select value={pacienteId} onChange={e => setPacienteId(e.target.value)}>
        <option value="">— Avulso / não atribuir —</option>
        {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
      {!pacienteId && (
        <input
          type="text"
          value={pacienteNomeManual}
          onChange={e => setPacienteNomeManual(e.target.value)}
          placeholder="Ou digite o nome (paciente ainda não cadastrada no sistema)"
          style={{ marginTop: 6 }}
        />
      )}

      <label className="form-lbl">Serviço</label>
      {servicos.length > 0 ? (
        <select value={servicoId} onChange={e => escolherServico(e.target.value)}>
          <option value="">— Outro (digitar manualmente) —</option>
          {servicos.map(s => (
            <option key={s.id} value={s.id}>{s.nome} · {brl(s.ticket)}</option>
          ))}
        </select>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
          Cadastre serviços em <strong>Meus serviços</strong> para selecionar com 1 clique.
        </div>
      )}
      {(!servicoId || servicos.length === 0) && (
        <input value={servico} onChange={e => setServico(e.target.value)}
          placeholder="Ex: Acompanhamento trimestral"
          style={{ marginTop: 6 }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-lbl">Valor total (R$)</label>
          <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
            placeholder="0,00" />
          {servicoId && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
              Pode ajustar se houve desconto ou upgrade
            </div>
          )}
        </div>
        <div>
          <label className="form-lbl">Data da venda</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <label className="form-lbl">Forma de pagamento</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        {FORMAS_PGTO_LIST.map(f => {
          const ativo = forma === f.id;
          return (
            <button key={f.id} type="button"
              onClick={() => setForma(f.id)}
              style={{
                border: ativo ? 'none' : '0.5px solid var(--border)',
                background: ativo ? 'var(--dark)' : 'var(--white)',
                color: ativo ? 'var(--white)' : 'var(--text2)',
                borderRadius: 7, padding: '9px 12px',
                fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
                fontFamily: 'var(--font-sans)',
              }}>
              <i className={`ti ti-${f.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
              {f.label}
            </button>
          );
        })}
      </div>

      {forma === 'parcelado' && (
        <>
          <label className="form-lbl">Número de parcelas</label>
          <select value={nParcelas} onChange={e => setNParcelas(Number(e.target.value))}>
            {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
              <option key={n} value={n}>{n}x</option>
            ))}
          </select>
        </>
      )}

      {forma === 'asaas' && (
        <>
          <label className="form-lbl">Número de meses</label>
          <select value={nMeses} onChange={e => setNMeses(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n} {n === 1 ? 'mês' : 'meses'}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
            Cada parcela cai 32 dias depois da anterior (tempo real do repasse do Asaas) — pode ajustar qualquer data abaixo.
          </div>
        </>
      )}

      {parcelasPreview.length > 0 && (
        <div style={{
          background: 'var(--bg2)', borderRadius: 6, padding: '10px 10px',
          marginTop: 10,
        }}>
          <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13, color: 'var(--text2)' }}>
            {parcelasPreview.length === 1 ? 'Vencimento' : `${parcelasPreview.length} parcelas — ajuste as datas se precisar`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {parcelasPreview.map(p => (
              <div key={p.numero} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)', width: 92, flexShrink: 0 }}>
                  {parcelasPreview.length === 1 ? 'Valor único' : `Parcela ${p.numero}`} · {brl(p.valor)}
                </span>
                <input type="date" value={p.vencimento} style={{ margin: 0, flex: 1 }}
                  onChange={e => setDatasEditadas(d => ({ ...d, [p.numero]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="form-lbl">Observação (opcional)</label>
      <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: paciente adiantou 1 mês, desconto dado..." style={{ resize: 'none' }} />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Registrar venda'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   EDITAR PARCELA — modal
   ============================================================ */
function EditarParcelaModal({ parcela, venda, onClose, onSaved }) {
  const [status, setStatus] = useState(parcela.status);
  const [dataPgto, setDataPgto] = useState(parcela.data_pgto ?? new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState(String(parcela.valor));
  const [valorLiquido, setValorLiquido] = useState(parcela.valor_liquido != null ? String(parcela.valor_liquido) : '');
  const [obs, setObs] = useState(parcela.obs ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    setBusy(true);
    const valorNum = Number(String(valor).replace(',', '.')) || parcela.valor;
    const liquidoNum = venda.forma_pgto === 'pix'
      ? valorNum
      : (valorLiquido.trim() ? (Number(String(valorLiquido).replace(',', '.')) || null) : null);
    const { error } = await supabase
      .from('parcelas')
      .update({
        status,
        data_pgto: status === 'pago' ? dataPgto : null,
        valor: valorNum,
        valor_liquido: liquidoNum,
        obs: obs.trim() || null,
      })
      .eq('id', parcela.id);
    setBusy(false);
    if (error) return setErro(error.message);
    onSaved();
  }

  async function excluirParcela() {
    if (!window.confirm('Excluir esta parcela?')) return;
    setBusy(true);
    await supabase.from('parcelas').delete().eq('id', parcela.id);
    setBusy(false);
    onSaved();
  }

  return (
    <ModalShell
      title="Editar parcela"
      subtitle={`Parcela ${parcela.numero} · ${venda.paciente?.nome ?? venda.paciente_nome_manual ?? 'Avulso'} · ${venda.servico}`}
      onClose={onClose}>
      <label className="form-lbl">Status</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {['pago', 'pendente', 'atrasado'].map(s => {
          const info = STATUS_INFO[s];
          const ativo = status === s;
          return (
            <button key={s} type="button" onClick={() => setStatus(s)}
              style={{
                border: ativo ? 'none' : '0.5px solid var(--border)',
                background: ativo ? 'var(--dark)' : 'var(--white)',
                color: ativo ? 'var(--white)' : 'var(--text2)',
                borderRadius: 7, padding: '8px 10px', fontSize: 13, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-sans)',
              }}>
              <i className={`ti ti-${info.icon}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
              {info.label}
            </button>
          );
        })}
      </div>

      {status === 'pago' && (
        <>
          <label className="form-lbl">Data de pagamento</label>
          <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)} />
        </>
      )}

      <label className="form-lbl">Valor bruto (R$)</label>
      <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
        placeholder="Pode diferir se adiantou ou pagou parcial" />

      <label className="form-lbl">Valor líquido {venda.forma_pgto === 'pix' ? '' : '(opcional)'}</label>
      {venda.forma_pgto === 'pix' ? (
        <>
          <input inputMode="decimal" value={valor} disabled style={{ opacity: .6 }} />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
            Pix não tem taxa — o líquido é sempre igual ao bruto.
          </div>
        </>
      ) : (
        <input inputMode="decimal" value={valorLiquido} onChange={e => setValorLiquido(e.target.value)}
          placeholder="O que efetivamente caiu na conta, depois da taxa" />
      )}

      <label className="form-lbl">Observação</label>
      <input value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: adiantou 1 mês, pagou parcial..." />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
        </button>
      </div>

      <button onClick={excluirParcela} disabled={busy}
        style={{
          marginTop: 12, width: '100%', padding: '8px 14px',
          background: 'transparent', color: 'var(--red)',
          border: '0.5px solid var(--red)', borderRadius: 6,
          fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        <i className="ti ti-trash" aria-hidden="true"></i> Excluir esta parcela
      </button>
    </ModalShell>
  );
}

/* ============================================================
   EDITAR VENDA — modal
   Edita só os dados "leves" da venda (paciente, serviço, data, obs).
   Pra mudar valor/forma de pagamento, é mais seguro excluir e recriar
   — assim as parcelas são regeradas corretamente.
   ============================================================ */
function EditarVendaModal({ venda, pacientes, onClose, onSaved }) {
  const [pacienteId, setPacienteId] = useState(venda.paciente_id ?? '');
  const [pacienteNomeManual, setPacienteNomeManual] = useState(venda.paciente_nome_manual ?? '');
  const [servico, setServico] = useState(venda.servico ?? '');
  const [data, setData] = useState(venda.data_venda ?? '');
  const [obs, setObs] = useState(venda.obs ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar() {
    setErro(null);
    if (!servico.trim()) return setErro('Informe o serviço.');
    if (!data) return setErro('Informe a data da venda.');

    setBusy(true);
    const { error } = await supabase
      .from('vendas')
      .update({
        paciente_id: pacienteId || null,
        paciente_nome_manual: pacienteId ? null : (pacienteNomeManual.trim() || null),
        servico: servico.trim(),
        data_venda: data,
        obs: obs.trim() || null,
      })
      .eq('id', venda.id);
    setBusy(false);
    if (error) return setErro('Erro ao salvar: ' + error.message);
    onSaved();
  }

  return (
    <ModalShell title="Editar venda" subtitle="Ajuste os dados desta venda" onClose={onClose}>
      <label className="form-lbl">Paciente</label>
      <select value={pacienteId} onChange={e => setPacienteId(e.target.value)}>
        <option value="">— Avulso / não atribuir —</option>
        {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
      {!pacienteId && (
        <input
          type="text"
          value={pacienteNomeManual}
          onChange={e => setPacienteNomeManual(e.target.value)}
          placeholder="Ou digite o nome (paciente ainda não cadastrada no sistema)"
          style={{ marginTop: 6 }}
        />
      )}

      <label className="form-lbl">Serviço</label>
      <input value={servico} onChange={e => setServico(e.target.value)}
        placeholder="Ex: Acompanhamento trimestral" />

      <label className="form-lbl">Data da venda</label>
      <input type="date" value={data} onChange={e => setData(e.target.value)} />

      <label className="form-lbl">Observação</label>
      <textarea rows="2" value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: desconto dado, condição especial..."
        style={{ resize: 'none' }} />

      <div style={{
        background: 'var(--bg2)', borderRadius: 7, padding: '10px 12px',
        marginTop: 12, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
      }}>
        <strong>Pra mudar valor total ou forma de pagamento</strong>, é melhor
        excluir essa venda e criar uma nova — assim as parcelas são geradas
        corretamente. Pra ajustar valor de uma parcela específica, clique nela
        na lista.
      </div>

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   MODAL SHELL — reaproveitado
   ============================================================ */
function ModalShell({ title, subtitle, children, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 420, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
