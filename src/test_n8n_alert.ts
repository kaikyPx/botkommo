import { config } from './config';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';

const runTest = async () => {
    console.log('--- INICIANDO TESTE DE ENVIO N8N ---');
    console.log(`Webhook: ${config.n8n.webhookUrl}`);

    try {
        console.log('Buscando leads ativos...');
        const leads = await kommo.getActiveLeads();
        const now = Math.floor(Date.now() / 1000);
        
        let testLead = null;
        let waitMins = 0;

        for (const lead of leads) {
            // Ignorar números da lista de bloqueio
            const phone = await kommo.getLeadPhoneNumber(lead.id);
            if (phone && config.monitor.ignoredNumbers.includes(phone)) continue;

            const messages = await kommo.getLeadMessages(lead.id);
            if (messages.length > 0 && messages[0].author.type === 'contact') {
                const wait = now - messages[0].created_at;
                const minutes = Math.floor(wait / 60);
                
                // Procurando alguém com espera significativa (idealmente > 60 min para o teste)
                if (minutes > 30 && (!testLead || minutes > waitMins)) {
                    testLead = {
                        lead,
                        messages,
                        waitMins: minutes
                    };
                    waitMins = minutes;
                }
            }
        }

        if (!testLead) {
            console.log('Não encontramos nenhum lead real aguardando há tempo suficiente para o teste.');
            console.log('Enviando um payload de exemplo para garantir que o webhook funciona.');
            
            const dummyPayload = {
                leadId: 123456,
                leadName: "CLIENTE TESTE (EXEMPLO)",
                waitTimeMinutes: 95,
                salespersonName: "Everton",
                lastMessage: "Exemplo de mensagem",
                leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/123456`
            };
            
            console.log('Payload de teste:', dummyPayload);
            await sendN8nAlert(dummyPayload);
        } else {
            console.log(`Lead selecionado para teste: ${testLead.lead.name} (${testLead.lead.id})`);
            console.log(`Tempo de espera atual: ${testLead.waitMins} minutos`);

            const payload = {
                leadId: testLead.lead.id,
                leadName: testLead.lead.name,
                waitTimeMinutes: testLead.waitMins,
                salespersonName: "Teste Manual",
                lastMessage: "Mensagem capturada no teste",
                leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${testLead.lead.id}`
            };

            console.log('Enviando payload real de teste para o N8N...');
            console.log(JSON.stringify(payload, null, 2));
            await sendN8nAlert(payload);
        }

    } catch (error: any) {
        console.error('Erro no teste:', error.message);
    }
    console.log('--- TESTE FINALIZADO ---');
};

runTest();
