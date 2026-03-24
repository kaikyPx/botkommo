import { api } from './kommo';

const findLongestSlaBreachLive = async () => {
    try {
        console.log(`\n--- Varredura de SLA em Tempo Real ---`);
        
        // 1. Fetch recent events (both incoming and outgoing)
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

        // Sort events by time just in case
        events.sort((a: any, b: any) => a.created_at - b.created_at);

        // Track the absolute last activity for each lead
        events.forEach((e: any) => {
            lastActivity[e.entity_id] = e;
        });

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
            console.log('Todos os leads com mensagens recentes já foram respondidos ou não há mensagens novas.');
            // Fallback: Pick the very last incoming message anyway for demonstration
            targetEvent = events.reverse().find((e: any) => e.type === 'incoming_chat_message');
            if (!targetEvent) return;
        }

        const leadId = targetEvent.entity_id;
        const leadRes = await api.get(`/api/v4/leads/${leadId}`, { params: { with: 'contacts' } });
        const lead = leadRes.data;
        
        // Users map
        const usersRes = await api.get('/api/v4/users');
        const users = usersRes.data._embedded?.users || [];
        const responsible = users.find((u: any) => u.id === lead.responsible_user_id)?.name || 'Desconhecido';

        // Contact info
        const contactId = lead._embedded?.contacts?.[0]?.id;
        let phone = 'Desconhecido';
        if (contactId) {
            const contact = await api.get(`/api/v4/contacts/${contactId}`);
            const phoneField = contact.data.custom_fields_values?.find((f: any) => f.field_code === 'PHONE');
            if (phoneField) phone = phoneField.values[0].value;
        }

        const time = new Date(targetEvent.created_at * 1000).toLocaleString('pt-BR');
        let text = targetEvent.value_after?.[0]?.message?.text;

        // Try notes fallback
        if (!text) {
            const notes = await api.get(`/api/v4/leads/${leadId}/notes`, { params: { limit: 10 } });
            const msgNote = notes.data?._embedded?.notes?.find((n: any) => n.params?.text);
            if (msgNote) text = msgNote.params.text;
        }

        console.log(`\nRESULTADO DO TESTE:`);
        console.log(`- Lead: ${lead.name} (${leadId})`);
        console.log(`- Vendedor: ${responsible}`);
        console.log(`- Telefone: ${phone}`);
        console.log(`- Horário da Última Mensagem: ${time}`);
        console.log(`- Conteúdo: "${text || '(Texto protegido pela API/WABA)'}"`);

    } catch (e: any) {
        console.error('Erro:', e.response?.data || e.message);
    }
};

findLongestSlaBreachLive();
