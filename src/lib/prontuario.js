import { supabase } from './supabase.js';

/**
 * Cria a conta de login de uma paciente "por trás" (sem convite/email),
 * pra a nutri já ter acesso ao prontuário completo (Plano, Exames,
 * Avaliação, Atendimento) sem depender da paciente ativar o cadastro.
 * Usado pra pacientes de consulta avulsa, que nunca vão receber acesso
 * ao app. Chama a Edge Function `criar-prontuario-silencioso`.
 *
 * Retorna o id da nova paciente (mesmo id de public.pacientes).
 * Lança erro com mensagem amigável se falhar.
 */
export async function criarProntuarioSilencioso(pendente) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Sessão expirada — recarregue a página e tente de novo.');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/criar-prontuario-silencioso`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      nome: pendente.nome,
      email: pendente.email,
      nascimento: pendente.nascimento,
      sexo: pendente.sexo,
      objetivo: pendente.objetivo,
      tipo_plano: pendente.tipo_plano,
      modalidade: pendente.modalidade,
    }),
  });

  let body;
  try { body = await res.json(); } catch { body = null; }

  if (!res.ok) {
    const msg = body?.error || `Falha ao criar prontuário (HTTP ${res.status}).`;
    if (res.status === 404) {
      throw new Error(
        'A função "criar-prontuario-silencioso" ainda não foi publicada no Supabase. ' +
        'Peça pra configurar em Supabase → Edge Functions antes de usar este botão.'
      );
    }
    throw new Error(msg);
  }
  if (!body?.id) throw new Error('Resposta inesperada da função — tente de novo.');
  return body.id;
}
