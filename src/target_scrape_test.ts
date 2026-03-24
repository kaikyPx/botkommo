import { scrapeLeadDetails } from './kommo_automation';
import * as kommo from './kommo';

async function testSpecificLead() {
    const leadId = 55142577;
    console.log(`\n--- INICIANDO TESTE DE SCRAPE PROFUNDO PARA LEAD ${leadId} ---\n`);

    try {
        // Buscamos o lead na API apenas para ter os campos básicos (nome, etc)
        const leadRes = await kommo.api.get(`/api/v4/leads/${leadId}`);
        const lead = leadRes.data;

        console.log(`Lead Nome: ${lead.name}`);

        const result = await scrapeLeadDetails(leadId);

        console.log("\n--- RESULTADO DA EXTRAÇÃO ---");
        console.log(`Última Mensagem: "${result.lastMessage}"`);
        console.log(`Vendedor Detectado: ${result.salespersonName}`);
        console.log(`É Mensagem do Cliente? ${result.isContactMessage ? 'SIM' : 'NÃO'}`);
        
        if (result.lastMessageTimestamp) {
            const date = new Date(result.lastMessageTimestamp * 1000);
            console.log(`Data/Hora da Mensagem: ${date.toLocaleString('pt-BR')}`);
            
            const now = Math.floor(Date.now() / 1000);
            const diffMin = Math.round((now - result.lastMessageTimestamp) / 60);
            console.log(`Tempo de Espera Calculado: ${diffMin} min`);
        }

        console.log("\n-----------------------------\n");
        process.exit(0);
    } catch (err: any) {
        console.error("ERRO NO TESTE:", err.message);
        process.exit(1);
    }
}

testSpecificLead();
