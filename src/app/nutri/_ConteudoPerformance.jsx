import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { REDES_SOCIAIS, FORMATOS_POST } from '../../lib/marketingDefault.js';

/**
 * Modal "Registrar desempenho" — usado tanto pela Agenda Editorial
 * (pré-preenchido a partir do dia clicado, com `agenda_id` vinculado)
 * quanto pela tela Redes Sociais (criação solta, via "Adicionar conteúdo").
 * Preenchimento em etapas: números do dia, "24 horas depois" e "uma
 * semana depois" (todos opcionais, pra voltar e completar mais tarde).
 */
export default function ModalConteudoPerformance({ post, nutriId, onClose, onSaved }) {
  const [form, setForm] = useState({
    data: post.data ?? new Date().toISOString().slice(0, 10),
    rede_social: post.rede_social ?? '',
    formato: post.formato ?? '',
    titulo: post.titulo ?? '',
    alcance: post.alcance ?? '',
    views: post.views ?? '',
    curtidas: post.curtidas ?? '',
    comentarios: post.comentarios ?? '',
    salvamentos: post.salvamentos ?? '',
    seguidores: post.seguidores ?? '',
    investimento: post.investimento ?? '',
    turbinado: post.turbinado ?? false,
    seguidores_24h: post.seguidores_24h ?? '',
    investimento_1_semana: post.investimento_1_semana ?? '',
    seguidores_1_semana: post.seguidores_1_semana ?? '',
    recomendacao: post.recomendacao ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));
  const num = (v) => (v === '' || v == null ? null : (Number(String(v).replace(',', '.')) || 0));

  async function salvar() {
    setErro(null);
    if (!form.data) return setErro('Informe a data.');
    if (!form.titulo.trim()) return setErro('Informe o título do conteúdo.');
    setBusy(true);
    const payload = {
      data: form.data,
      rede_social: form.rede_social || null,
      formato: form.formato || null,
      titulo: form.titulo.trim(),
      alcance: num(form.alcance),
      views: num(form.views),
      curtidas: num(form.curtidas),
      comentarios: num(form.comentarios),
      salvamentos: num(form.salvamentos),
      seguidores: num(form.seguidores),
      investimento: num(form.investimento),
      turbinado: !!form.turbinado,
      seguidores_24h: num(form.seguidores_24h),
      investimento_1_semana: num(form.investimento_1_semana),
      seguidores_1_semana: num(form.seguidores_1_semana),
      recomendacao: form.recomendacao.trim() || null,
    };
    const { error } = post.novo
      ? await supabase.from('posts_performance').insert({ ...payload, nutri_id: nutriId, agenda_id: post.agenda_id ?? null })
      : await supabase.from('posts_performance').update(payload).eq('id', post.id);
    setBusy(false);
    if (error) return setErro('Erro: ' + error.message);
    onSaved();
  }

  async function excluir() {
    if (post.novo) return;
    if (!window.confirm('Excluir esse registro de desempenho?')) return;
    setBusy(true);
    await supabase.from('posts_performance').delete().eq('id', post.id);
    setBusy(false);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 110, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12,
        maxWidth: 620, width: '100%', maxHeight: '90vh',
        overflow: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--dark)' }}>
            {post.novo ? 'Registrar desempenho' : 'Editar desempenho'}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text3)', padding: 4,
          }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label className="form-lbl" style={{ marginTop: 0 }}>Data *</label>
            <input type="date" value={form.data} onChange={set('data')} />
          </div>
          <div>
            <label className="form-lbl" style={{ marginTop: 0 }}>Rede social</label>
            <select value={form.rede_social} onChange={set('rede_social')}>
              <option value="">Não informado</option>
              {REDES_SOCIAIS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="form-lbl" style={{ marginTop: 0 }}>Formato</label>
            <select value={form.formato} onChange={set('formato')}>
              <option value="">Não informado</option>
              {FORMATOS_POST.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <label className="form-lbl">Título do conteúdo *</label>
        <input value={form.titulo} onChange={set('titulo')} placeholder="Ex: Foto única do dia do Nutricionista" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
          {[
            ['alcance', 'Alcance'], ['views', 'Views'], ['curtidas', 'Curtidas'],
            ['comentarios', 'Comentários'], ['salvamentos', 'Salvamentos'], ['seguidores', 'Seguidores'],
          ].map(([campo, label]) => (
            <div key={campo}>
              <label className="form-lbl">{label}</label>
              <input inputMode="numeric" value={form[campo]} onChange={set(campo)} placeholder="0" />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginTop: 10 }}>
          <div>
            <label className="form-lbl">Investimento (R$)</label>
            <input inputMode="decimal" value={form.investimento} onChange={set('investimento')} placeholder="0" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', paddingBottom: 10 }}>
            <input type="checkbox" checked={form.turbinado}
              onChange={e => setForm(f => ({ ...f, turbinado: e.target.checked }))} style={{ margin: 0 }} />
            Turbinado
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>24 horas depois</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Opcional — volte aqui quando os dados estiverem disponíveis.</div>
            <label className="form-lbl" style={{ marginTop: 0 }}>Seguidores após 24h</label>
            <input inputMode="numeric" value={form.seguidores_24h} onChange={set('seguidores_24h')} placeholder="Preencher depois" />
          </div>
          <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>Uma semana depois</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Opcional — volte aqui quando os dados estiverem disponíveis.</div>
            <label className="form-lbl" style={{ marginTop: 0 }}>Investimento após 1 semana (R$)</label>
            <input inputMode="decimal" value={form.investimento_1_semana} onChange={set('investimento_1_semana')} placeholder="Preencher depois" />
            <label className="form-lbl">Seguidores após 1 semana</label>
            <input inputMode="numeric" value={form.seguidores_1_semana} onChange={set('seguidores_1_semana')} placeholder="Preencher depois" />
          </div>
        </div>

        <label className="form-lbl" style={{ marginTop: 12 }}>Recomendação</label>
        <textarea rows={3} value={form.recomendacao} onChange={set('recomendacao')}
          placeholder="Sua análise sobre esse conteúdo (opcional)" style={{ resize: 'vertical' }} />

        {erro && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '6px 10px', borderRadius: 6, fontSize: 13, marginTop: 10,
          }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={salvar} disabled={busy}>
            <i className="ti ti-check" aria-hidden="true"></i> {busy ? '...' : 'Salvar'}
          </button>
        </div>
        {!post.novo && (
          <button onClick={excluir} disabled={busy} style={{
            marginTop: 10, width: '100%', padding: '8px 14px',
            background: 'transparent', color: 'var(--red)',
            border: '0.5px solid var(--red)', borderRadius: 6,
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <i className="ti ti-trash" aria-hidden="true"></i> Excluir este registro
          </button>
        )}
      </div>
    </div>
  );
}
