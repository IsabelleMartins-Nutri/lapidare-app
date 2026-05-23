/**
 * Dica padrão pra mostrar perto de inputs de JSON.
 * Sugere usar ChatGPT/Claude pra gerar o JSON e oferece um exemplo de prompt.
 *
 * - exemploPrompt: o prompt sugerido pra colar na IA
 * - alvoVisual:    se a tela tem editor visual, nome do botão pro qual voltar
 *                  (ex.: "Editor visual"). Se não tem, deixa undefined.
 */
export default function DicaJSON({ exemploPrompt, alvoVisual }) {
  return (
    <div style={{
      marginTop: 10,
      padding: '10px 12px',
      background: 'var(--amber-bg, #fff8ec)',
      border: '0.5px solid var(--amber, #e6c97a)',
      borderLeft: '3px solid var(--amber, #c9a96e)',
      borderRadius: 8,
      fontSize: 12,
      color: 'var(--ink-soft, #4a3828)',
      lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className="ti ti-bulb" aria-hidden="true" style={{ fontSize: 14 }}></i>
        Dica: deixa o ChatGPT/Claude montar pra você
      </div>
      <div>Cole um prompt assim e copie o JSON gerado:</div>
      <div style={{
        marginTop: 6, padding: '8px 10px',
        background: 'var(--white)', borderRadius: 6,
        fontStyle: 'italic', color: 'var(--text2, #5a4a3a)',
        fontSize: 12, lineHeight: 1.5,
      }}>
        "{exemploPrompt}"
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
        {alvoVisual
          ? <>Cole o JSON aqui em cima, clica em <strong>{alvoVisual}</strong> pra revisar e ajustar visualmente, salva. 🎯</>
          : <>Cole o JSON aqui em cima e salva — o sistema valida automaticamente. 🎯</>}
      </div>
    </div>
  );
}
