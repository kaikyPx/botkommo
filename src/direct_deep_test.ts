import { config } from './config';
import { scrapeLeadDetails } from './kommo_automation';
import { sendN8nAlert } from './n8n';

const runDirectDeepTest = async () => {
    // Pegando o lead com maior espera identificado agora (115 minutos)
    const leadId = 53891469;
    const waitTime = 115;
    
    console.log(`--- TESTE PROFUNDO DIRETO: LEAD ${leadId} ---`);

    try {
        console.log('Iniciando navegador para extrair dados reais...');
        const scraped = await scrapeLeadDetails(leadId);

        const payload = {
            leadId: leadId,
            leadName: `Lead #${leadId}`,
            waitTimeMinutes: waitTime,
            salespersonName: scraped.salespersonName,
            lastMessage: scraped.lastMessage,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`
        };

        console.log('Payload extraído via Playwright:');
        console.log(JSON.stringify(payload, null, 2));

        await sendN8nAlert(payload);
        console.log('--- TESTE CONCLUÍDO ---');

    } catch (error: any) {
        console.error('Erro no scrape direto:', error.message);
    }
};

runDirectDeepTest();
