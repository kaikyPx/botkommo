import { config } from './config';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';

const runTestWithSpecificLead = async () => {
    const leadId = 46560005; // O lead do Everton que analisamos antes
    console.log(`--- BUSCANDO DADOS REAIS DO LEAD ${leadId} ---`);

    try {
        const leadRes = await kommo.api.get(`/api/v4/leads/${leadId}`, { params: { with: 'contacts' } });
        const lead = leadRes.data;
        
        const messages = await kommo.getLeadMessages(leadId);
        
        if (messages.length === 0) {
            console.log('Nenhuma mensagem encontrada para este lead.');
            return;
        }

        const now = Math.floor(Date.now() / 1000);
        const waitMins = Math.floor((now - messages[0].created_at) / 60);

        // Pattern matching for salesperson name
        const namePatterns = [/meu nome [ée] ([\w\s]+)/i, /sou o ([\w\s]+)/i, /falo com o ([\w\s]+)/i];
        let detectedName = "Everton"; // Fallback baseado no que descobrimos na varredura anterior

        for (const msg of messages) {
            if (msg.author.type === 'user') {
                for (const p of namePatterns) {
                    const m = msg.text.match(p);
                    if (m) { detectedName = m[1].trim().split(' ')[0]; break; }
                }
            }
        }

        const payload = {
            leadId: lead.id,
            leadName: lead.name,
            waitTimeMinutes: waitMins,
            salespersonName: detectedName,
            lastMessage: messages[0].text || "(Mensagem de mídia)",
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${lead.id}`
        };

        console.log('Enviando dados reais para o n8n:');
        console.log(JSON.stringify(payload, null, 2));

        await sendN8nAlert(payload);
        console.log('--- TESTE FINALIZADO COM SUCESSO ---');

    } catch (error: any) {
        console.error('Erro no teste:', error.message);
    }
};

runTestWithSpecificLead();
