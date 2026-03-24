import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const getEnvData = (key: string, required: boolean = true): string => {
    const value = process.env[key];
    if (required && !value) {
        throw new Error(`Environment variable ${key} is required but not set.`);
    }
    return value || '';
};

export const config = {
    kommo: {
        subdomain: getEnvData('KOMMO_SUBDOMAIN'),
        integrationId: getEnvData('KOMMO_INTEGRATION_ID'),
        secretKey: getEnvData('KOMMO_SECRET_KEY'),
        token: getEnvData('KOMMO_TOKEN'),
        automationLogin: getEnvData('KOMMO_AUTOMATION_LOGIN', false),
        automationPassword: getEnvData('KOMMO_AUTOMATION_PASSWORD', false),
    },
    sla: {
        thresholdMinutes: parseInt(getEnvData('SLA_THRESHOLD_MINUTES', false) || '120', 10),
    },
    n8n: {
        webhookUrl: getEnvData('N8N_WEBHOOK_URL', false)
    },
    monitor: {
        pipelineIds: getEnvData('MONITORED_PIPELINE_IDS', false)
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== ''),
        statusIds: getEnvData('MONITORED_STATUS_IDS', false)
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== ''),
        ignoredNumbers: getEnvData('IGNORED_NUMBERS', false)
            .split(',')
            .map(s => s.replace(/\D/g, '')) // Remove non-numeric chars
            .filter(s => s !== ''),
        salespersons: getEnvData('SALESPERSONS', false)
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== ''),
    }
};
