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
    console.log('Starting Kommo SLA Monitor service...');

    try {
        // 1. Initialize DB
        await initDb();
        console.log('SQLite tracking DB initialized.');

        // 2. Run once immediately
        await runSlaMonitor();

        // 3. Schedule cron job
        // Runs every 5 minutes: '*/5 * * * *'
        const monitorCron = '*/5 * * * *';
        logToFile(`Scheduling monitor job with cron expression: ${monitorCron}`);
        cron.schedule(monitorCron, () => {
            runSlaMonitor().catch((e: any) => logToFile(`[Fatal Error] Monitor failed: ${e.message}`));
        });

        // 4. Schedule sales report (13:00 and 18:00)
        // Cron: '0 13,18 * * *' (Every day at 13h00 and 18h00)
        const reportCron = '0 13,18 * * *';
        logToFile(`Scheduling sales report job with cron expression: ${reportCron} (TZ: America/Sao_Paulo)`);
        cron.schedule(reportCron, () => {
             logToFile(`Triggering Sales Report job at 18:00 slot...`);
             runSalesReport().catch((e: any) => logToFile(`[Fatal Error] Sales Report failed: ${e.message}`));
        }, {
            timezone: "America/Sao_Paulo"
        });

    } catch (error) {
        console.error('Failed to start service:', error);
        process.exit(1);
    }
};

start();
