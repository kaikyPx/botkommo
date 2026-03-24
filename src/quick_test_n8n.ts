import { config } from './config';
import { sendN8nAlert } from './n8n';

const runQuickTest = async () => {
    console.log('--- ENVIANDO PAYLOAD DE TESTE RÁPIDO ---');
    console.log(`Webhook: ${config.n8n.webhookUrl}`);

    const payload = {
        leadId: 53878585,
        leadName: "Lead de Teste (SLA 90min)",
        waitTimeMinutes: 92,
        salespersonName: "Vendedor Teste",
        lastMessage: "Teste de conteúdo",
        leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/53878585`
    };

    try {
        console.log('Dados do envio:', JSON.stringify(payload, null, 2));
        await sendN8nAlert(payload);
        console.log('Envio concluído com sucesso!');
    } catch (error: any) {
        console.error('Falha no envio:', error.message);
    }
    console.log('--- FIM DO TESTE ---');
};

runQuickTest();
