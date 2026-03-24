import axios from 'axios';
import { config } from './config';

export const api = axios.create({
    baseURL: `https://${config.kommo.subdomain}.kommo.com`,
    headers: {
        'Authorization': `Bearer ${config.kommo.token}`,
        'Content-Type': 'application/json'
    }
});

// Types based on Kommo API
export interface Lead {
    id: number;
    name: string;
    price: number;
    responsible_user_id: number;
    group_id: number;
    status_id: number;
    pipeline_id: number;
    loss_reason_id: number;
    created_by: number;
    updated_by: number;
    created_at: number;
    updated_at: number;
    closed_at: number;
    closest_task_at: number;
    is_deleted: boolean;
    custom_fields_values: any[];
    score: number | null;
    account_id: number;
}

export interface Message {
    id: string;
    conversation_id: string;
    type: string;
    status: string;
    text: string;
    created_at: number;
    updated_at: number;
    author: {
        id: string;
        type: 'user' | 'contact' | 'bot' | string;
        name: string;
    };
}

/**
 * Fetches active leads. 
 * If pipelineIds or statusIds are configured, it filters by them.
 */
export const getActiveLeads = async (): Promise<Lead[]> => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const twoHoursAgo = now - (2 * 60 * 60);

        const params: any = {
            'order[updated_at]': 'desc',
            'filter[updated_at][from]': twoHoursAgo, // Somente leads atualizados nas últimas 2 horas
            'limit': 250
        };

        if (config.monitor.pipelineIds.length > 0) {
            params['filter[pipeline_id]'] = config.monitor.pipelineIds.join(',');
        }

        if (config.monitor.statusIds.length > 0) {
            params['filter[status]'] = config.monitor.statusIds.join(',');
        }

        const response = await api.get('/api/v4/leads', { params });
        // If no leads found, kommo returns 204 No Content
        if (response.status === 204) return [];

        return response.data._embedded?.leads || [];
    } catch (error: any) {
        if (error.response?.status === 204) return [];
        console.error('Error fetching leads:', error.response?.data || error.message);
        return [];
    }
};

/**
 * Fetches the phone number for a given lead by checking its primary contact.
 */
export const getLeadPhoneNumber = async (leadId: number): Promise<string | null> => {
    try {
        const response = await api.get(`/api/v4/leads/${leadId}`, { params: { with: 'contacts' } });
        const contacts = response.data._embedded?.contacts || [];
        if (contacts.length === 0) return null;

        const contactId = contacts[0].id;
        const contactRes = await api.get(`/api/v4/contacts/${contactId}`);
        const phoneField = contactRes.data.custom_fields_values?.find((f: any) => f.field_code === 'PHONE');
        
        if (phoneField && phoneField.values?.[0]?.value) {
            // Return only digits for easy comparison
            return phoneField.values[0].value.replace(/\D/g, '');
        }
        return null;
    } catch (error: any) {
        console.error(`Error fetching phone for lead ${leadId}:`, error.message);
        return null;
    }
};

/**
 * Fetches the latest messages for a given lead.
 * We look at the chat associated with the lead.
 */
export const getLeadLatestMessage = async (leadId: number): Promise<Message | null> => {
    try {
        // Note: To get messages from a lead, you usually access the notes/events or chat API.
        // In Kommo, chat messages can be fetched via /api/v4/leads/{id}/notes?filter[note_type]=message
        const response = await api.get(`/api/v4/leads/${leadId}/notes`, {
            params: {
                'filter[note_type]': 'amojo_message',
                limit: 1, // Get the latest one
                // order[created_at]=desc (Depending on API supported sorting, or we fetch top and sort)
            }
        });

        if (response.status === 204) return null;

        const notes = response.data._embedded?.notes || [];
        if (notes.length === 0) return null;

        // notes is sorted by creation time usually, but let's grab the highest created_at
        const latestNote = notes.sort((a: any, b: any) => b.created_at - a.created_at)[0];

        // We infer the message author from note details
        // If it's a contact, they sent it. If it's a user, the salesperson sent it.
        return {
            id: latestNote.id,
            conversation_id: latestNote.entity_id,
            type: 'text',
            status: 'delivered',
            text: latestNote.params?.text || '',
            created_at: latestNote.created_at,
            updated_at: latestNote.updated_at,
            author: {
                // Simple heuristic: if created_by is 0 or matches responsible user, it might be the salesperson.
                // Usually, incoming messages via integration have created_by = 0 but specific author details in params.
                // A better check depends on your exact Kommo setup. Often, 'incoming_chat_message' or 'amojo_message'
                id: String(latestNote.created_by),
                type: latestNote.created_by === 0 ? 'contact' : 'user', // Basic heuristic
                name: 'Unknown' // We don't always get the name directly here
            }
        };
    } catch (error: any) {
        if (error.response?.status === 204) return null;
        console.error(`Error fetching messages for lead ${leadId}:`, error.response?.data || error.message);
        return null;
    }
};

/**
 * Fetches message-related events for a given lead.
 * This is used for the native WhatsApp Business integration.
 */
export const getLeadMessages = async (leadId: number): Promise<Message[]> => {
    try {
        // Fetch events of type incoming_chat_message and outgoing_chat_message
        const response = await api.get(`/api/v4/events`, {
            params: {
                'filter[entity]': 'lead',
                'filter[entity_id]': leadId,
                'filter[type]': 'incoming_chat_message,outgoing_chat_message',
                limit: 50
            }
        });

        if (response.status === 204) return [];

        const events = response.data._embedded?.events || [];
        if (events.length === 0) return [];

        // Sort by created_at descending (newest first)
        const sortedEvents = events.sort((a: any, b: any) => b.created_at - a.created_at);

        return sortedEvents.map((event: any) => ({
            id: event.id,
            conversation_id: String(event.value_after?.[0]?.message?.talk_id || ''),
            type: 'text',
            status: 'delivered',
            text: event.value_after?.[0]?.message?.text || '', // text might be empty in some views, but we use it if present
            created_at: event.created_at,
            updated_at: event.created_at,
            author: {
                id: String(event.created_by),
                type: event.type === 'incoming_chat_message' ? 'contact' : 'user',
                name: 'Unknown'
            }
        }));
    } catch (error: any) {
        if (error.response?.status === 204) return [];
        console.error(`Error fetching events for lead ${leadId}:`, error.response?.data || error.message);
        return [];
    }
};

/**
 * Adds an internal note to a lead.
 */
export const addLeadNote = async (leadId: number, text: string): Promise<void> => {
    try {
        await api.post(`/api/v4/leads/${leadId}/notes`, [
            {
                note_type: 'common',
                params: {
                    text: text
                }
            }
        ]);
    } catch (error: any) {
        console.error(`Error adding note to lead ${leadId}:`, error.response?.data || error.message);
    }
};

/**
 * Creates a task for a lead.
 */
export const createLeadTask = async (
    leadId: number,
    responsibleUserId: number,
    text: string,
    completeTill: number // unix timestamp
): Promise<void> => {
    try {
        await api.post(`/api/v4/tasks`, [
            {
                entity_id: leadId,
                entity_type: 'leads',
                task_type_id: 1, // General task
                text: text,
                complete_till: completeTill,
                responsible_user_id: responsibleUserId
            }
        ]);
    } catch (error: any) {
        console.error(`Error creating task for lead ${leadId}:`, error.response?.data || error.message);
    }
};
