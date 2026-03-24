import { api } from './kommo';
import { scrapeLeadDetails } from './kommo_automation';
import { sendN8nAlert } from './n8n';
import { config } from './config';

const runDeepTestLive = async () => {
    try {
        console.log(`\n--- Teste Profundo: Descobrindo Lead com Maior Espera ---`);
        
        // 1. Pegar eventos recentes de chat de todos para evitar 429 nas faturas dos leads
        const evs = await api.get('/api/v4/events', {
            params: {
                'filter[type]': 'incoming_chat_message,outgoing_chat_message',
                limit: 100
            }
        });

        if (!evs.data?._embedded?.events) {
            console.log('Nenhum evento de chat encontrado.');
            return;
        }

        const events = evs.data._embedded.events;
        const lastActivity: Record<number, any> = {};

        // Track absolute last activity for each lead
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
            console.log('Nenhum lead aguardando resposta encontrado nos eventos recentes.');
            return;
        }

        const leadId = targetEvent.entity_id;
        const waitMins = Math.floor(maxWait / 60);

        console.log(`Lead Real Identificado: ${leadId} com ${waitMins} minutos de espera.`);
        console.log('--- Iniciando Extração Profunda via Navegador ---');

        // 2. Usar a automação para logar e pegar tudo
        const scraped = await scrapeLeadDetails(leadId);

        // 3. Montar e enviar payload
        const payload = {
            leadId: leadId,
            leadName: `Lead #${leadId}`,
            waitTimeMinutes: waitMins,
            salespersonName: scraped.salespersonName,
            lastMessage: scraped.lastMessage,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`
        };

        console.log('Payload Enviado:');
        console.log(JSON.stringify(payload, null, 2));

        await sendN8nAlert(payload);
        console.log('\n--- TESTE FINALIZADO COM SUCESSO ---');

    } catch (e: any) {
        console.error('Erro:', e.response?.data || e.message);
    }
};

runDeepTestLive();
