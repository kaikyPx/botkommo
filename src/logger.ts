import fs from 'fs';
import path from 'path';

/**
 * Utility to log webhook requests and responses to webhook.log
 */
export const logWebhook = (url: string, payload: any, response: any, error?: any) => {
    const logPath = path.join(process.cwd(), 'webhook.log');
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const logEntry = {
        timestamp,
        url,
        request: {
            payload
        },
        response: error ? {
            error: error.message,
            data: error.response?.data,
            status: error.response?.status
        } : {
            status: response?.status,
            data: response?.data
        }
    };

    const logString = `[${timestamp}] --------------------------------------------------\n` +
                      `URL: ${url}\n` +
                      `PAYLOAD: ${JSON.stringify(payload, null, 2)}\n` +
                      `RESPONSE STATUS: ${logEntry.response.status || 'N/A'}\n` +
                      `RESPONSE DATA: ${JSON.stringify(logEntry.response.data, null, 2)}\n` +
                      `------------------------------------------------------------------\n\n`;

    fs.appendFileSync(logPath, logString, 'utf8');
};
