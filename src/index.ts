import cron from 'node-cron';
import { runSlaMonitor } from './monitor';
import { runSalesReport } from './sales_report';
import { initDb } from './db';

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
        console.log(`Scheduling monitor job with cron expression: ${monitorCron}`);
        cron.schedule(monitorCron, () => {
            runSlaMonitor();
        });

        // 4. Schedule sales report (12:00 and 18:00)
        // Cron: '0 12,18 * * *' (Every day at 12h00 and 18h00)
        const reportCron = '0 12,18 * * *';
        console.log(`Scheduling sales report job with cron expression: ${reportCron} (TZ: America/Sao_Paulo)`);
        cron.schedule(reportCron, () => {
             runSalesReport();
        }, {
            timezone: "America/Sao_Paulo"
        });

    } catch (error) {
        console.error('Failed to start service:', error);
        process.exit(1);
    }
};

start();
