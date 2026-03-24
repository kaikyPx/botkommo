import { config } from './config';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';

const runManualTargetedTest = async () => {
    // Dados extraídos diretamente do lead real identificado no passo anterior
    const leadId = 48746963;
    const leadName = "Lead #48746963";
    const waitTimeMinutes = 104; // Calculado: 15:25 - 13:41
    const salespersonName = "Everton";
    const lastMessage = "Conteúdo protegido (WhatsApp)";

    console.log(`--- ENVIANDO DADOS DO LEAD REAL ${leadId} PARA O N8N ---`);

    const payload = {
        leadId,
        leadName,
        waitTimeMinutes,
        salespersonName,
        lastMessage,
        leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`
    };

    try {
        console.log('Payload:', JSON.stringify(payload, null, 2));
        await sendN8nAlert(payload);
        console.log('--- ENVIO CONCLUÍDO COM SUCESSO ---');
    } catch (error: any) {
        console.error('Falha no envio:', error.message);
    }
};

runManualTargetedTest();
