import { config } from './config';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';

const runFinalRealTest = async () => {
    // Lead identificado agora mesmo pelo verify_test.ts
    const leadId = 48746963; 
    console.log(`--- TESTE FINAL COM DADOS REAIS: LEAD ${leadId} ---`);

    try {
        const leadRes = await kommo.api.get(`/api/v4/leads/${leadId}`, { params: { with: 'contacts' } });
        const lead = leadRes.data;
        
        // No Kommo, mensagens de WhatsApp/Chat ficam em 'notes' do tipo 'incoming_chat_message' ou eventos genéricos
        const eventsRes = await kommo.api.get('/api/v4/events', {
            params: {
                'filter[entity_id]': leadId,
                limit: 20
            }
        });

        const events = eventsRes.data?._embedded?.events || [];
        const msgEvent = events.find((e: any) => e.type === 'incoming_chat_message' || e.type === 'outgoing_chat_message');
        
        const lastMsgText = msgEvent?.value_after?.[0]?.message?.text || "Mensagem via WhatsApp";
        const timestamp = msgEvent?.created_at || Math.floor(Date.now() / 1000);
        
        const now = Math.floor(Date.now() / 1000);
        const waitMins = Math.floor((now - timestamp) / 60);

        const payload = {
            leadId: lead.id,
            leadName: lead.name,
            waitTimeMinutes: waitMins,
            salespersonName: "Everton", // Vendedor responsável identificado no histórico anterior
            lastMessage: lastMsgText,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${lead.id}`
        };

        console.log('Enviando dadosREAIS para o n8n:');
        console.log(JSON.stringify(payload, null, 2));

        await sendN8nAlert(payload);
        console.log('--- TESTE CONCLUÍDO COM SUCESSO ---');

    } catch (error: any) {
        console.error('Erro no teste:', error.message);
    }
};

runFinalRealTest();
