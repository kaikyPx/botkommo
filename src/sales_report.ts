import { config } from './config';
import { scrapeSalespersonLeads } from './kommo_automation';
import axios from 'axios';
import { logWebhook } from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Core: fetch counts for all salespersons within a BRT hour window
// ─────────────────────────────────────────────────────────────────────────────

async function fetchCountsForPeriod(startHour: number, endHour: number): Promise<Record<string, number>> {
    const salespersons = config.monitor.salespersons;
    const results: Record<string, number> = {};

    for (const salesperson of salespersons) {
        console.log(`[Sales Report] → Buscando quantidade para: ${salesperson} (${startHour}h–${endHour}h BRT)`);
        const raw = await scrapeSalespersonLeads(salesperson, { start: startHour, end: endHour }) as any;
        results[salesperson] = raw.count ?? 0;
        
        if (salespersons.indexOf(salesperson) < salespersons.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Entry Points
// ─────────────────────────────────────────────────────────────────────────────

export async function runReport13h(): Promise<void> {
    console.log('\n[Sales Report] Gerando Relatório 13h Simplificado...');
    const counts = await fetchCountsForPeriod(0, 13);
    const subtotal = Object.values(counts).reduce((a, b) => a + b, 0);

    const payload = {
        type: 'report_13h',
        label: 'MANHÃ (00:00 - 13:00)',
        counts,
        subtotal
    };

    console.log('Payload N8N (13h):', payload);
    if (config.n8n.webhookUrl) {
        try {
            const resp = await axios.post(config.n8n.webhookUrl, payload);
            logWebhook(config.n8n.webhookUrl, payload, resp);
        } catch (e: any) {
            console.error('[Sales Report] Erro ao enviar 13h:', e.message);
        }
    }
}

export async function runReport18h(): Promise<void> {
    console.log('\n[Sales Report] Gerando Relatório 18h Consolidado...');

    // 1. Tarde (13h–18h)
    console.log('[Sales Report] 1/2: Buscando período da TARDE...');
    const countsTarde = await fetchCountsForPeriod(13, 18);
    const subtotalTarde = Object.values(countsTarde).reduce((a, b) => a + b, 0);

    // 2. Total do Dia (00h-18h)
    console.log('\n[Sales Report] 2/2: Buscando período TOTAL do dia...');
    const countsTotal = await fetchCountsForPeriod(0, 18);
    const totalGeral = Object.values(countsTotal).reduce((a, b) => a + b, 0);

    const payload = {
        type: 'report_18h_consolidado',
        tarde: {
            label: 'TARDE (13h–18h)',
            counts: countsTarde,
            subtotal: subtotalTarde
        },
        totalDia: {
            label: 'TOTAL DO DIA (00h–18h)',
            counts: countsTotal,
            totalGeral: totalGeral
        }
    };

    console.log('Payload N8N (18h Consolidado):', JSON.stringify(payload, null, 2));
    if (config.n8n.webhookUrl) {
        try {
            const resp = await axios.post(config.n8n.webhookUrl, payload);
            logWebhook(config.n8n.webhookUrl, payload, resp);
            console.log('[Sales Report] ✓ Relatório 18h enviado com sucesso.');
        } catch (e: any) {
            console.error('[Sales Report] Erro ao enviar 18h:', e.message);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry dispatch
// ─────────────────────────────────────────────────────────────────────────────

export const runSalesReport = async (reportType?: '13h' | '18h'): Promise<void> => {
    if (reportType === '13h') return runReport13h();
    if (reportType === '18h') return runReport18h();

    // Default for manual run
    console.log('[Sales Report] Execução manual: Gerando consolidado 18h...');
    return runReport18h();
};

export const performScrapeAndSend = runSalesReport;
