import { api } from './kommo';

const testFetchMessages = async (leadId: number, eventId: string) => {
    console.log(`\nSpecific inspection for Lead: ${leadId} and Event: ${eventId}...`);
    try {
        // 1. Get Lead Details with common 'with' params
        console.log(`\n--- Lead Details (with=contacts,loss_reason,source_id) ---`);
        const leadResponse = await api.get(`/api/v4/leads/${leadId}`, {
            params: { with: 'contacts,loss_reason,source_id' }
        });
        console.log(JSON.stringify(leadResponse.data, null, 2));

        // 2. Get Specific Event Details
        console.log(`\n--- Fetching Specific Event: ${eventId} ---`);
        const eventResponse = await api.get(`/api/v4/events/${eventId}`);
        console.log(JSON.stringify(eventResponse.data, null, 2));

        // 3. Try to get events for this specific lead again, but just chat ones
        console.log(`\n--- Fetching Chat Events for Lead ${leadId} ---`);
        const chatEvents = await api.get(`/api/v4/events`, {
            params: { 
                'filter[entity]': 'lead',
                'filter[entity_id]': leadId,
                'filter[type]': 'incoming_chat_message,outgoing_chat_message'
            }
        });
        console.log(JSON.stringify(chatEvents.data, null, 2));

    } catch (error: any) {
        console.error('Error during test:', error.response?.data || error.message);
    }
};

// Lead 53470889 had event 01kkey3sarw602sehh50qb0y1f
testFetchMessages(53470889, '01kkey3sarw602sehh50qb0y1f');
