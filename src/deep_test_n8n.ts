import { config } from './config';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';
import { scrapeLeadDetails } from './kommo_automation';

const runDeepTest = async () => {
    console.log('--- INICIANDO TESTE PROFUNDO COM NAVEGADOR ---');

    try {
        console.log('Buscando leads ativos via API...');
        const leads = await kommo.getActiveLeads();
        const now = Math.floor(Date.now() / 1000);
        
        let target = null;

        // Encontrar o lead com maior espera que não seja ignorado
        for (const lead of leads) {
            const phone = await kommo.getLeadPhoneNumber(lead.id);
            if (phone && config.monitor.ignoredNumbers.includes(phone)) continue;

            const messages = await kommo.getLeadMessages(lead.id);
            if (messages.length > 0 && messages[0].author.type === 'contact') {
                const wait = now - messages[0].created_at;
                const minutes = Math.floor(wait / 60);

                if (!target || minutes > target.minutes) {
                    target = { lead, minutes };
                }
            }
        }

        if (!target) {
            console.log('Nenhum lead real sem resposta encontrado no momento.');
            return;
        }

        console.log(`Lead identificado: ${target.lead.name} (${target.lead.id})`);
        console.log(`Espera via API: ${target.minutes} minutos.`);
        console.log('Iniciando automação de navegador para extrair conteúdo real...');

        // EXTRAÇÃO PROFUNDA VIA PLAYWRIGHT
        const scraped = await scrapeLeadDetails(target.lead.id);

        const payload = {
            leadId: target.lead.id,
            leadName: target.lead.name,
            waitTimeMinutes: target.minutes,
            salespersonName: scraped.salespersonName,
            lastMessage: scraped.lastMessage,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${target.lead.id}`
        };

        console.log('Payload FINAL para o n8n (extraído via navegador):');
        console.log(JSON.stringify(payload, null, 2));

        await sendN8nAlert(payload);
        console.log('--- TESTE PROFUNDO CONCLUÍDO COM SUCESSO ---');

    } catch (error: any) {
        console.error('Erro no teste profundo:', error.message);
    }
};

runDeepTest();
