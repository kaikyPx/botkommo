import { config } from './config';
import { scrapeSalespersonLeads } from './kommo_automation';
import axios from 'axios';

export const runSalesReport = async () => {
    // Determine the hour in Sao Paulo TZ
    // We use a simple way since we are already in Brazil, but to be safe:
    const now = new Date();
    const spTime = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const currentHour = parseInt(spTime.split(' ')[1].split(':')[0]);

    console.log(`[Sales Report] Starting scheduled salesperson lead report at ${spTime} (Hour: ${currentHour})...`);
    
    // Logic: 
    // 12:00 run (hours 11-13) -> 08:00 to 12:00
    // 18:00 run (hours 17-19) -> 12:00 to 18:00
    let timeRange: { start: number, end: number } | undefined = undefined;
    
    if (currentHour >= 11 && currentHour <= 13) {
        timeRange = { start: 8, end: 12 };
    } else if (currentHour >= 17 && currentHour <= 19) {
        timeRange = { start: 12, end: 18 };
    }

    const salespersons = config.monitor.salespersons;
    const timeLabel = timeRange ? `${timeRange.start}:00 - ${timeRange.end}:00` : 'Full Day';
    
    if (salespersons.length === 0) {
        console.warn(`[Sales Report] No salespersons found in configuration.`);
        return;
    }

    for (const salesperson of salespersons) {
        const result = await scrapeSalespersonLeads(salesperson, timeRange);
        
        // Send to N8N individually for this salesperson
        if (config.n8n.webhookUrl) {
            try {
                console.log(`[Sales Report] Sending individual report for "${salesperson}" to N8N...`);
                await axios.post(config.n8n.webhookUrl, {
                    type: 'salesperson_lead_report',
                    timestamp: new Date().toISOString(),
                    timeLabel: timeLabel,
                    vendedor: salesperson,
                    leadsCount: result.count,
                    leadIds: result.leadIds
                });
                console.log(`[Sales Report] Notification for "${salesperson}" sent successfully.`);
            } catch (error: any) {
                console.error(`[Sales Report] Error sending individual report for "${salesperson}":`, error.message);
            }
        }
        
        // Wait between searches/sends
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log(`[Sales Report] All salesperson reports processed.`);
};
