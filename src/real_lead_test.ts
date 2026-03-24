import { config } from './config';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';

// Simple regex to find names like "meu nome é X"
const detectSalespersonName = (messages: kommo.Message[]): string | null => {
    const namePatterns = [
        /meu nome [ée] ([\w\s]+)/i,
        /falo com o ([\w\s]+)/i,
        /aqui é o ([\w\s]+)/i,
        /aqui é a ([\w\s]+)/i,
        /sou o ([\w\s]+)/i,
        /sou a ([\w\s]+)/i,
    ];

    for (const msg of messages) {
        if (msg.author.type === 'user') {
            for (const pattern of namePatterns) {
                const match = msg.text.match(pattern);
                if (match && match[1]) {
                    return match[1].trim().split(' ')[0];
                }
            }
        }
    }
    return null;
};

const runRealLeadTest = async () => {
    console.log('--- BUSCANDO LEAD REAL PARA TESTE ---');

    try {
        const leads = await kommo.getActiveLeads();
        const now = Math.floor(Date.now() / 1000);
        
        let target = null;

        // Buscando o lead com a maior espera que não esteja ignorado
        for (const lead of leads) {
            const phone = await kommo.getLeadPhoneNumber(lead.id);
            if (phone && config.monitor.ignoredNumbers.includes(phone)) continue;

            const messages = await kommo.getLeadMessages(lead.id);
            if (messages.length > 0 && messages[0].author.type === 'contact') {
                const wait = now - messages[0].created_at;
                const minutes = Math.floor(wait / 60);

                if (!target || minutes > target.minutes) {
                    target = { lead, messages, minutes };
                }
            }
        }

        if (!target) {
            console.log('Nenhum lead real sem resposta encontrado no momento.');
            return;
        }

        const salespersonName = detectSalespersonName(target.messages) || "Não identificado no chat";
        const lastMessageText = target.messages[0].text || "(Mensagem de mídia/arquivo)";

        const payload = {
            leadId: target.lead.id,
            leadName: target.lead.name,
            waitTimeMinutes: target.minutes,
            salespersonName: salespersonName,
            lastMessage: lastMessageText,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${target.lead.id}`
        };

        console.log('Enviando LEAD REAL para o n8n:');
        console.log(JSON.stringify(payload, null, 2));

        await sendN8nAlert(payload);
        console.log('--- TESTE CONCLUÍDO ---');

    } catch (error: any) {
        console.error('Erro:', error.message);
    }
};

runRealLeadTest();
