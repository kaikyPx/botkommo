import { config } from './config';
import { scrapeSalespersonLeads } from './kommo_automation';
import axios from 'axios';

export const runSalesReport = async () => {
    const now = new Date();
    const spTime = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const currentHour = parseInt(spTime.split(' ')[1].split(':')[0]);

    console.log(`[Sales Report] Starting report logic at ${spTime} (Hour: ${currentHour})...`);
    
    // Logic to select turn:
    // 13:00 run (hours 12-14) -> 08:00 to 13:00
    // 18:00 run (hours 17-19) -> 08:00 to 18:00 (Total do Dia)
    let timeRange = { start: 8, end: 13 };
    let timeLabel = `08:00 - 13:00 (Turno da Manhã)`;

    if (currentHour >= 16) { // Run at 18:00
        timeRange = { start: 8, end: 18 };
        timeLabel = `08:00 - 18:00 (Total do Dia)`;
    }

    const salespersons = config.monitor.salespersons;
    if (salespersons.length === 0) {
        console.warn(`[Sales Report] No salespersons found in configuration.`);
        return;
    }

    // 1. Fetch ALL leads within the range (empty search)
    console.log(`[Sales Report] Fetching total leads for today in range...`);
    const totalResult = await scrapeSalespersonLeads('', timeRange);
    const allLeadIds = totalResult.leadIds;
    console.log(`[Sales Report] Total leads found: ${allLeadIds.length}`);

    // 2. Fetch leads for each salesperson and track attributed IDs
    const individualResults: any[] = [];
    const attributedIds = new Set<string>();

    for (const salesperson of salespersons) {
        console.log(`[Sales Report] Fetching leads for salesperson: ${salesperson}`);
        const result = await scrapeSalespersonLeads(salesperson, timeRange);
        
        individualResults.push({
            vendedor: salesperson,
            count: result.count,
            leadIds: result.leadIds
        });

        // Track who handled what
        result.leadIds.forEach((id: string) => attributedIds.add(id));
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 3. Identify leads without identification (In total but not in any salesperson results)
    const unknownLeads = allLeadIds.filter((id: string) => !attributedIds.has(id));

    // 4. Send consolidated report to N8N
    if (config.n8n.webhookUrl) {
        try {
            console.log(`[Sales Report] Sending consolidated report to N8N...`);
            await axios.post(config.n8n.webhookUrl, {
                type: 'consolidated_sales_report',
                timestamp: new Date().toISOString(),
                timeLabel: timeLabel,
                totalLeadsCount: allLeadIds.length,
                totalLeadsIds: allLeadIds,
                salespersonBreakdown: individualResults,
                unattributedLeadsCount: unknownLeads.length,
                unattributedLeadsIds: unknownLeads
            });
            console.log(`[Sales Report] Consolidated report sent successfully.`);
        } catch (error: any) {
            console.error(`[Sales Report] Error sending consolidated report:`, error.message);
        }
    }
    
    console.log(`[Sales Report] Finished.`);
};
