import cron from 'node-cron';
import path from 'path';
import { runSlaMonitor } from './monitor';
import { runSalesReport } from './sales_report';
import { initDb } from './db';
import fs from 'fs';

const logFile = path.join(process.cwd(), 'bot.log');
function logToFile(msg: string) {
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const line = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log(msg);
}

const start = async () => {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`================================================`);
    console.log(`INICIANDO SERVIÇO ÀS: ${now}`);
    console.log(`================================================`);
    
    console.log('Starting Kommo SLA Monitor service...');

    try {
        // 1. Initialize DB
        await initDb();
        console.log('SQLite tracking DB initialized.');

        // 2. Schedule crons BEFORE initial blocking runs
        
        // SLA monitor every 5 mins
        const monitorCron = '*/5 * * * *';
        logToFile(`Scheduling monitor job with cron expression: ${monitorCron}`);
        cron.schedule(monitorCron, () => {
            runSlaMonitor().catch((e: any) => logToFile(`[Fatal Error] Monitor failed: ${e.message}`));
        });

        // Sales report (13:00, 18:00)
        const reportCron13 = '0 13 * * *';
        const reportCron18 = '0 18 * * *';
        
        logToFile(`Scheduling sales report job for 13:00 with cron: ${reportCron13}`);
        cron.schedule(reportCron13, () => {
             logToFile(`Triggering 13:00 Sales Report job...`);
             runSalesReport('13h').catch((e: any) => logToFile(`[Fatal Error] 13:00 Sales Report failed: ${e.message}`));
        });

        logToFile(`Scheduling sales report job for 18:00 with cron: ${reportCron18}`);
        cron.schedule(reportCron18, () => {
             logToFile(`Triggering 18:00 Sales Report job...`);
             runSalesReport('18h').catch((e: any) => logToFile(`[Fatal Error] 18:00 Sales Report failed: ${e.message}`));
        });

        // Heartbeat to check if cron is running
        cron.schedule('* * * * *', () => {
             logToFile(`HEARTBEAT - Cron scheduler is active and event loop is healthy.`);
        });

        // 3. Run initial monitoring once (non-blocking to ensure crons are not delayed by event loop)
        console.log('[Monitor] Starting FIRST immediate run (async)...');
        runSlaMonitor().catch((e: any) => logToFile(`[Fatal Error] Initial Monitor failed: ${e.message}`));

    } catch (error) {
        console.error('Failed to start service:', error);
        process.exit(1);
    }
};

start();
