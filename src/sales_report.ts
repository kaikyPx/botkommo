import { config } from './config';
import { scrapeSalespersonLeads } from './kommo_automation';
import axios from 'axios';

/**
 * Helper to perform a full scrape and send report for a given range
 */
const performScrapeAndSend = async (start: number, end: number, typeLabel: string, webhookType: string) => {
    const timeRange = { start, end };
    const salespersons = config.monitor.salespersons;
    
    console.log(`[Sales Report] Processing range: ${typeLabel}...`);

    // 1. Fetch ALL leads (empty search)
    const totalResult = await scrapeSalespersonLeads('', timeRange);
    const allLeadIds = totalResult.leadIds;

    // 2. Fetch leads for each salesperson
    const individualResults: any[] = [];
    const attributedIds = new Set<string>();

    for (const salesperson of salespersons) {
        const result = await scrapeSalespersonLeads(salesperson, timeRange);
        individualResults.push({ vendedor: salesperson, count: result.count, leadIds: result.leadIds });
        result.leadIds.forEach((id: string) => attributedIds.add(id));
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 3. Unattributed
    const unknownLeads = allLeadIds.filter((id: string) => !attributedIds.has(id));

    // 4. Send to N8N
    if (config.n8n.webhookUrl) {
        try {
            await axios.post(config.n8n.webhookUrl, {
                type: webhookType,
                timestamp: new Date().toISOString(),
                timeLabel: typeLabel,
                totalLeadsCount: allLeadIds.length,
                totalLeadsIds: allLeadIds,
                salespersonBreakdown: individualResults,
                unattributedLeadsCount: unknownLeads.length,
                unattributedLeadsIds: unknownLeads
            });
            console.log(`[Sales Report] ${typeLabel} report sent successfully.`);
        } catch (error: any) {
            console.error(`[Sales Report] Error sending ${typeLabel} report:`, error.message);
        }
    }
};

export const runSalesReport = async () => {
    const spTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const currentHour = parseInt(spTime.split(' ')[1].split(':')[0]);

    console.log(`[Sales Report] Starting report logic at ${spTime} (Hour: ${currentHour})...`);

    if (currentHour >= 12 && currentHour <= 14) {
        // Run 08:00 - 13:00
        await performScrapeAndSend(8, 13, '08:00 - 13:00', 'shifted_sales_report');
    } else if (currentHour >= 17 && currentHour <= 19) {
        // Run 13:00 - 18:00
        await performScrapeAndSend(13, 18, '13:00 - 18:00', 'shifted_sales_report');
        
        // Wait a bit before full day report to avoid blocking
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Run 08:00 - 18:00 (Full Day)
        await performScrapeAndSend(8, 18, 'Relatório Total (08:00 - 18:00)', 'daily_total_sales_report');
    } else {
        console.log(`[Sales Report] Outside scheduled hours. Manual run default: Full Day today.`);
        await performScrapeAndSend(0, 24, 'Full Day', 'manual_sales_report');
    }
};
