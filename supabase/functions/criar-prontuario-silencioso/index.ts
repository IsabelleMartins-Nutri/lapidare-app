// Cria a conta de login de uma paciente "por trás" (sem mandar email/convite
// nenhum), pra a nutri já ter acesso completo ao prontuário (Plano, Exames,
// Avaliação, Atendimento) de pacientes de consulta avulsa que ela nunca vai
// dar acesso ao app. Senha é aleatória e nunca é entregue a ninguém — se um
// dia a nutri quiser liberar o app de verdade, ela usa o botão "Enviar
// redefinição de senha" que já existe no perfil da paciente.
//
// Deploy: Supabase Dashboard → Edge Functions → New Function →
// nome exatamente "criar-prontuario-silencioso" → cola este arquivo → Deploy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Não autenticado.' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Cliente com o token de quem chamou — só pra confirmar quem é.
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const nutriId = userData.user.id;

    // Confirma que quem chamou é realmente uma nutri (não uma paciente).
    const { data: nutriRow } = await supabaseAuth.from('nutris').select('id').eq('id', nutriId).maybeSingle();
    if (!nutriRow) {
      return new Response(JSON.stringify({ error: 'Só nutris podem criar prontuários.' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { nome, email, nascimento, sexo, objetivo, tipo_plano, modalidade } = body;
    if (!nome || !email) {
      return new Response(JSON.stringify({ error: 'Nome e email são obrigatórios.' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Cliente com a chave de admin — só existe dentro da Edge Function,
    // nunca é exposta ao navegador.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const senhaAleatoria = crypto.randomUUID() + crypto.randomUUID();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: senhaAleatoria,
      email_confirm: true, // não dispara nenhum email de confirmação
      user_metadata: {
        role: 'paciente',
        nutri_id: nutriId,
        nome,
        nascimento: nascimento || null,
        sexo: sexo || 'feminino',
        objetivo: objetivo || null,
        tipo_plano: tipo_plano || null,
        modalidade: modalidade || null,
      },
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ id: created.user.id }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
