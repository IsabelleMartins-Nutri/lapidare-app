import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { gen } from '../../lib/utils.js';
import PlanoView from '../../components/PlanoView.jsx';

export default function Plano() {
  const { user, profile } = useSession();
  const [plano, setPlano] = useState(undefined); // undefined=loading, null=vazio
  const [validade, setValidade] = useState(null);
  const [pdfPlano, setPdfPlano] = useState(null);          // URL do PDF do plano
  const [subsExternas, setSubsExternas] = useState(null);  // dados da tabela substituicoes
  const [pdfSubs, setPdfSubs] = useState(null);            // URL do PDF de substituições

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) return;
      const [pRes, sRes] = await Promise.all([
        supabase
          .from('planos')
          .select('dados, validade, pdf_url, publicado_em')
          .eq('paciente_id', user.id)
          .eq('ativo', true)
          .order('publicado_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('substituicoes')
          .select('dados, pdf_url, publicado_em')
          .eq('paciente_id', user.id)
          .order('publicado_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!active) return;
      setPlano(pRes.data?.dados ?? null);
      setValidade(pRes.data?.validade ?? null);
      setPdfPlano(pRes.data?.pdf_url ?? null);
      setSubsExternas(sRes.data?.dados ?? null);
      setPdfSubs(sRes.data?.pdf_url ?? null);
    }
    load();
    return () => { active = false; };
  }, [user]);

  if (plano === undefined) {
    return <div className="empty-state"><div className="empty-sub">Carregando…</div></div>;
  }

  if (!plano) {
    return (
      <div className="empty-state">
        <i className="ti ti-salad empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Plano não publicado ainda</div>
        <div className="empty-sub">
          Sua nutricionista está preparando seu plano personalizado. Você será {gen(profile?.sexo, 'notificado', 'notificada')} quando estiver pronto.
        </div>
      </div>
    );
  }

  return (
    <PlanoView dados={plano} validade={validade} pdfPlano={pdfPlano} pdfSubs={pdfSubs} subsExternas={subsExternas} />
  );
}
