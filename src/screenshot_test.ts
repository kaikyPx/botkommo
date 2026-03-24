import { config } from './config';
import { api } from './kommo';
import { scrapeLeadDetails } from './kommo_automation';
import { sendN8nAlert } from './n8n';

const runScreenshotTest = async () => {
    try {
        console.log(`\n--- Teste de Alerta com Screenshot ---`);
        
        // 1. Pegar o lead com maior espera (mesma lógica dos testes anteriores)
        const evs = await api.get('/api/v4/events', {
            params: {
                'filter[type]': 'incoming_chat_message,outgoing_chat_message',
                limit: 50
            }
        });

        if (!evs.data?._embedded?.events) {
            console.log('Nenhum evento encontrado.');
            return;
        }

        const events = evs.data._embedded.events;
        const lastActivity: Record<number, any> = {};
        events.sort((a: any, b: any) => a.created_at - b.created_at);
        events.forEach((e: any) => { lastActivity[e.entity_id] = e; });

        let targetEvent: any = null;
        let maxWait = 0;

        for (const leadId in lastActivity) {
            const e = lastActivity[leadId];
            if (e.type === 'incoming_chat_message') {
                const wait = Math.floor(Date.now() / 1000) - e.created_at;
                if (wait > maxWait) {
                    maxWait = wait;
                    targetEvent = e;
                }
            }
        }

        if (!targetEvent) {
            console.log('Nenhum lead aguardando resposta para o teste.');
            return;
        }

        const leadId = targetEvent.entity_id;
        const waitMins = Math.floor(maxWait / 60);

        console.log(`Lead Real: ${leadId} (${waitMins} min). Iniciando navegador...`);

        // 2. Extração profunda (já com screenshot)
        const scraped = await scrapeLeadDetails(leadId);

        // 3. Enviar para o n8n
        const payload = {
            leadId,
            leadName: `Lead #${leadId}`,
            waitTimeMinutes: waitMins,
            salespersonName: scraped.salespersonName,
            lastMessage: scraped.lastMessage,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`,
            screenshot: scraped.screenshotBase64 // Aqui vai o Base64 da imagem
        };

        console.log('Enviando dados e imagem para o n8n...');
        await sendN8nAlert(payload);
        
        console.log(`\n--- TESTE FINALIZADO ---`);
        console.log(`Screenshot salvo localmente em: ${scraped.screenshotPath}`);

    } catch (e: any) {
        console.error('Erro:', e.message);
    }
};

runScreenshotTest();
