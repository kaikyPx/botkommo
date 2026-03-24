import { config } from './config';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';

const runTargetedTest = async () => {
    const leadId = 53446209; // Lead com 110 minutos de espera identificado agora
    console.log(`--- TESTE COM DADOS REAIS: LEAD ${leadId} ---`);

    try {
        const leadRes = await kommo.api.get(`/api/v4/leads/${leadId}`, { params: { with: 'contacts' } });
        const lead = leadRes.data;
        
        // No Kommo v4, para leads criados via WhatsApp/Chat, usamos eventos para pegar as mensagens
        const eventsRes = await kommo.api.get('/api/v4/events', {
            params: {
                'filter[entity]': 'lead',
                'filter[entity_id]': leadId,
                'filter[type]': 'incoming_chat_message,outgoing_chat_message',
                limit: 10
            }
        });

        const events = eventsRes.data?._embedded?.events || [];
        if (events.length === 0) {
            console.log('Nenhuma mensagem de chat encontrada via eventos para este lead.');
            return;
        }

        // Ordenar por criação decrescente
        events.sort((a: any, b: any) => b.created_at - a.created_at);
        const latestEvent = events[0];
        const lastMsgText = latestEvent.value_after?.[0]?.message?.text || "(Arquivo/Mídia)";
        
        const now = Math.floor(Date.now() / 1000);
        const waitMins = Math.floor((now - latestEvent.created_at) / 60);

        // Identificando vendedor através do banco de usuários se possível, 
        // ou usando o nome que descobrimos na varredura (Everton) como exemplo real
        const usersRes = await kommo.api.get('/api/v4/users');
        const users = usersRes.data._embedded?.users || [];
        const responsibleName = users.find((u: any) => u.id === lead.responsible_user_id)?.name || "Hubclass Company";

        const payload = {
            leadId: lead.id,
            leadName: lead.name,
            waitTimeMinutes: waitMins,
            salespersonName: responsibleName === "Hubclass Company" ? "Everton" : responsibleName, // Usando Everton como exemplo do vendedor real
            lastMessage: lastMsgText,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${lead.id}`
        };

        console.log('Payload REAL enviado ao n8n:');
        console.log(JSON.stringify(payload, null, 2));

        await sendN8nAlert(payload);
        console.log('--- TESTE CONCLUÍDO ---');

    } catch (error: any) {
        console.error('Erro no teste:', error.message);
    }
};

runTargetedTest();
