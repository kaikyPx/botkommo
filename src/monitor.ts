import { config } from './config';
import * as db from './db';
import * as kommo from './kommo';
import { sendN8nAlert } from './n8n';
import { scrapeLeadDetails } from './kommo_automation';

// Simple regex to find names like "meu nome é X" or "falo com o X"
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
        // Only check messages sent by the user (salesperson)
        if (msg.author.type === 'user') {
            for (const pattern of namePatterns) {
                const match = msg.text.match(pattern);
                if (match && match[1]) {
                    return match[1].trim().split(' ')[0]; // Return just the first name ideally
                }
            }
        }
    }
    return null;
};

export const runSlaMonitor = async () => {
    console.log(`[Monitor] Starting SLA monitor run at ${new Date().toISOString()}`);

    try {
        const leads = await kommo.getActiveLeads();
        console.log(`[Monitor] Found ${leads.length} active leads to check.`);

        const thresholdSeconds = config.sla.thresholdMinutes * 60;

        for (let i = 0; i < leads.length; i++) {
            const now = Math.floor(Date.now() / 1000); // 👈 Atualizado aqui para cada lead
            const lead = leads[i];
            const lastActivity = new Date(lead.updated_at * 1000).toLocaleString('pt-BR');
            console.log(`\n[Monitor] [${i + 1}/${leads.length}] Verificando Lead ID: ${lead.id} (${lead.name}) - Última Atividade: ${lastActivity}`);
            
            try {
                // Check if lead phone should be ignored
                console.log(`   - Passo 1: Verificando filtros de número...`);
                const phoneNumber = await kommo.getLeadPhoneNumber(lead.id);
                if (phoneNumber && config.monitor.ignoredNumbers.includes(phoneNumber)) {
                    console.log(`   - IGNORADO: Número (${phoneNumber}) está na lista de bloqueio/ignorar. [OK]`);
                    await db.clearLeadAlert(lead.id); 
                    continue;
                }
                console.log(`   - Passo 1: Verificação de filtros concluída. [OK]`);

                // Fetch messages
                console.log(`   - Passo 2: Buscando histórico de mensagens via API...`);
                const messages = await kommo.getLeadMessages(lead.id);
                if (messages.length === 0) {
                    console.log(`   - AVISO: API não retornou histórico. Verificando via Scrapping (Instagram/Direct?)...`);
                    
                    const scraped = await scrapeLeadDetails(lead.id);

                    if (scraped.isContactMessage && scraped.lastMessage !== 'Não encontrada no feed') {
                         // Utilizamos o tempo exato colhido do balão de texto ("Hoje 14:47")
                         const waitTimeSeconds = now - (scraped.lastMessageTimestamp || lead.updated_at);
                         const waitTimeMinutes = Math.max(0, Math.round(waitTimeSeconds / 60)); 

                         if (waitTimeSeconds > thresholdSeconds) {
                             const alreadyAlerted = await db.isLeadAlerted(lead.id, lead.updated_at);
                             
                             if (!alreadyAlerted) {
                                  const msgTimeStr = new Date((scraped.lastMessageTimestamp || lead.updated_at) * 1000).toLocaleTimeString('pt-BR');
                                  const nowTimeStr = new Date().toLocaleTimeString('pt-BR');

                                  console.log(`   - ALERTA: Mensagem do CLIENTE via browser detectada e tempo excedido (${waitTimeMinutes} min)! Enviando p/ n8n.`);
                                  console.log(`      ↳ Hora da Mensagem: ${msgTimeStr} | Hora Atual: ${nowTimeStr}`);
                                  
                                  const leadUrl = `https://${config.kommo.subdomain}.kommo.com/leads/detail/${lead.id}`;
                                  await sendN8nAlert({
                                     leadId: lead.id,
                                     leadName: lead.name,
                                     waitTimeMinutes: waitTimeMinutes, 
                                     salespersonName: scraped.salespersonName,
                                     lastMessage: scraped.lastMessage,
                                     leadUrl
                                 });
                                 await db.markLeadAsAlerted(lead.id, lead.updated_at);
                                 console.log(`   - SUCESSO: Alerta enviado (via Navegador). Tempo estimado: ${waitTimeMinutes}min.`);
                             } else {
                                 console.log(`   - IGNORADO: Já enviamos alerta para esta mensagem (ou nas últimas 2h).`);
                             }
                         } else {
                             const msgTimeStr = new Date((scraped.lastMessageTimestamp || lead.updated_at) * 1000).toLocaleTimeString('pt-BR');
                             const nowTimeStr = new Date().toLocaleTimeString('pt-BR');

                             console.log(`   - DENTRO DO PRAZO: Mensagem não respondida, mas está no prazo para tolerância.`);
                             console.log(`      ↳ Mensagem do Cliente: "${scraped.lastMessage}"`);
                             console.log(`      ↳ Vendedor Assumido: ${scraped.salespersonName}`);
                             console.log(`      ↳ Hora da Mensagem: ${msgTimeStr} | Hora Atual: ${nowTimeStr}`);
                             console.log(`      ↳ Tempo de Espera: ${waitTimeMinutes} min (de ${config.sla.thresholdMinutes} permitidos).`);
                         }
                    } else {
                        console.log(`   - OK: Scrapping confirmou que não há novas mensagens de clientes aguardando.`);
                        await db.clearLeadAlert(lead.id); // Vendedor respondeu, limpar alerta
                    }
                    continue;
                }

                const latestMessage = messages[0]; // Newest first
                const authorType = latestMessage.author.type;

                // Check who sent the last message
                if (authorType === 'contact') {
                    // Nova regra: Ignorar mensagens curtas que são apenas concordâncias ou encerramentos
                    const hasQuestionMark = latestMessage.text.includes('?');
                    const cleanText = latestMessage.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, '').trim();
                    
                    // Lista dinâmica vinda do .env (ignorar encerramentos)
                    const ignoredPatterns = config.sla.ignoredMessages.map(m => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()).join('|');
                    const ignoredWordsRegex = new RegExp(`^(${ignoredPatterns})$`, 'i');
                    
                    if (!hasQuestionMark && cleanText.length > 0 && cleanText.length < 35 && ignoredWordsRegex.test(cleanText)) {
                        console.log(`   - OK: A última mensagem do cliente foi uma concordância curta ("${latestMessage.text}"). Ignorando SLA.`);
                        await db.clearLeadAlert(lead.id);
                        continue;
                    }

                    // Client sent the last message, calculate wait time
                    const waitTimeSeconds = now - latestMessage.created_at;
                    const waitTimeMinutes = Math.round(waitTimeSeconds / 60);

                    const msgTimeStr = new Date(latestMessage.created_at * 1000).toLocaleTimeString('pt-BR');
                    const nowTimeStr = new Date().toLocaleTimeString('pt-BR');

                    console.log(`   - ÚLTIMA MENSAGEM: Do CLIENTE há ${waitTimeMinutes} minutos.`);
                    console.log(`      ↳ Hora da Mensagem: ${msgTimeStr} | Hora Atual: ${nowTimeStr} | Espera Reais: ${waitTimeSeconds} seg.`);

                    if (waitTimeSeconds > thresholdSeconds) {
                        const alreadyAlerted = await db.isLeadAlerted(lead.id, latestMessage.created_at);

                        if (!alreadyAlerted) {
                            console.log(`   - SLA VIOLADO! Limite: ${config.sla.thresholdMinutes}min. Iniciando Playwright para extração profunda...`);

                            // Deep scrape using Playwright to get real message and salesperson
                            const scraped = await scrapeLeadDetails(lead.id);
                            console.log(`   - Passo 3: Extração via Playwright concluída. [OK]`);
                            const leadUrl = `https://${config.kommo.subdomain}.kommo.com/leads/detail/${lead.id}`;

                            // Send alert
                                 await sendN8nAlert({
                                    leadId: lead.id,
                                    leadName: lead.name,
                                    waitTimeMinutes,
                                    salespersonName: scraped.salespersonName,
                                    lastMessage: scraped.lastMessage,
                                    leadUrl
                                });

                            await db.markLeadAsAlerted(lead.id, latestMessage.created_at);
                            console.log(`   - SUCESSO: Alerta enviado para o n8n. [OK]`);
                        } else {
                            console.log(`   - IGNORADO: Já enviamos alerta para esta mensagem anteriormente.`);
                        }
                    } else {
                        console.log(`   - DENTRO DO PRAZO: Aguardando mais ${config.sla.thresholdMinutes - waitTimeMinutes} minutos antes de alertar. [OK]`);
                        console.log(`      ↳ Hora da Mensagem: ${msgTimeStr} | Hora Atual: ${nowTimeStr}`);
                    }
                } else {
                    console.log(`   - OK: A última mensagem foi do VENDEDOR. SLA zerado. [OK]`);
                    await db.clearLeadAlert(lead.id);
                }
            } catch (error: any) {
                console.error(`   - ERRO no processamento deste lead: ${error.message}`);
            }
        }
    } catch (error: any) {
        console.error(`[Monitor] Error fetching leads:`, error.message);
    }

    console.log(`[Monitor] Finished run.`);
};
