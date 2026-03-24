import { api } from './kommo';

const listUnansweredLeads = async () => {
    try {
        console.log(`\n--- Varredura de Mensagens sem Resposta ---`);
        
        // Fetch users once
        const usersRes = await api.get('/api/v4/users');
        const users = usersRes.data._embedded?.users || [];

        // 1. Fetch recent events
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

        events.sort((a: any, b: any) => a.created_at - b.created_at);
        events.forEach((e: any) => {
            lastActivity[e.entity_id] = e;
        });

        const unanswered = [];
        const now = Math.floor(Date.now() / 1000);

        for (const leadId in lastActivity) {
            const e = lastActivity[leadId];
            if (e.type === 'incoming_chat_message') {
                unanswered.push({
                    leadId: Number(leadId),
                    waitSeconds: now - e.created_at,
                    event: e
                });
            }
        }

        if (unanswered.length === 0) {
            console.log('Todos os leads recentes foram respondidos.');
            return;
        }

        unanswered.sort((a, b) => b.waitSeconds - a.waitSeconds);

        console.log(`\nLEADS AGUARDANDO RESPOSTA (${unanswered.length} total):`);
        
        // Take top 3
        const topN = unanswered.slice(0, 3);
        
        for (const item of topN) {
            const leadRes = await api.get(`/api/v4/leads/${item.leadId}`, { params: { with: 'contacts' } });
            const lead = leadRes.data;
            const responsible = users.find((u: any) => u.id === lead.responsible_user_id)?.name || 'Desconhecido';
            const waitMins = Math.floor(item.waitSeconds / 60);
            
            console.log(`\n- Lead: ${lead.name} (${item.leadId})`);
            console.log(`  Vendedor: ${responsible}`);
            console.log(`  Esperando há: ${waitMins} minutos`);
            console.log(`  Link: https://vagasmundoapplepb.kommo.com/leads/detail/${item.leadId}`);
        }

    } catch (e: any) {
        console.error('Erro:', e.response?.data || e.message);
    }
};

listUnansweredLeads();
