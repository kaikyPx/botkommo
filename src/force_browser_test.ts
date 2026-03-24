import { config } from './config';
import { scrapeLeadDetails } from './kommo_automation';
import { sendN8nAlert } from './n8n';

const runForceBrowserTest = async () => {
    // Usando um ID que sabemos que existe para pular a chamada de API de busca que está dando 403
    const leadId = 48746963; 
    console.log(`--- Teste de Navegador Direto (Bypass API 403): Lead ${leadId} ---`);

    try {
        // A automação agora vai para a URL base, verifica login e depois vai para o lead
        const scraped = await scrapeLeadDetails(leadId);

        const payload = {
            leadId,
            leadName: `Teste de Login Corrigido`,
            waitTimeMinutes: 130,
            salespersonName: scraped.salespersonName,
            lastMessage: scraped.lastMessage,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`,
            screenshot: scraped.screenshotBase64
        };

        console.log('Dados capturados:', {
            vendedor: scraped.salespersonName,
            mensagem: scraped.lastMessage
        });

        console.log('Enviando para n8n com o novo print...');
        await sendN8nAlert(payload);
        
        console.log(`\n--- TESTE FINALIZADO ---`);
        console.log(`Screenshot salvo: ${scraped.screenshotPath}`);

    } catch (e: any) {
        console.error('Erro no teste de navegador:', e.message);
    }
};

runForceBrowserTest();
