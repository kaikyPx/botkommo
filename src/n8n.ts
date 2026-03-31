import axios from 'axios';
import { config } from './config';
import { logWebhook } from './logger';

interface SlaAlertPayload {
    leadId: number;
    leadName: string;
    waitTimeMinutes: number;
    salespersonName: string | null;
    lastMessage: string | null;
    leadUrl: string;
}

/**
 * Sends the SLA alert payload to the configured N8N webhook.
 */
export const sendN8nAlert = async (payload: SlaAlertPayload): Promise<void> => {
    if (!config.n8n.webhookUrl) {
        console.error('N8N Webhook URL is not configured. Skipping alert.');
        return;
    }

    try {
        console.log(`\n[N8N] Enviando payload para webhook:`);
        console.log(JSON.stringify(payload, null, 2));

        const response = await axios.post(config.n8n.webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`[N8N] Successfully sent SLA alert for lead ${payload.leadId}`);
        console.log(`[N8N] Resposta do n8n (Status ${response.status}):`, JSON.stringify(response.data, null, 2));
        console.log(`-------------------------------------------------------------------\n`);

        // Persistence log
        logWebhook(config.n8n.webhookUrl, payload, response);

    } catch (error: any) {
        console.error(`[N8N] Error sending alert to webhook:`, error.response?.data || error.message);
        // Persistence log on error
        logWebhook(config.n8n.webhookUrl, payload, null, error);
    }
};
