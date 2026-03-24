import { scrapeLeadDetails, closeAutomation } from './kommo_automation';

async function test() {
    const leadId = 55042071;
    console.log(`Testing scraping for lead ${leadId}...`);
    try {
        const result = await scrapeLeadDetails(leadId);
        console.log('Scrape Result:', JSON.stringify(result, null, 2));
        
        if (result.isContactMessage && result.lastMessage === '(Mensagem de Áudio)') {
            console.log('SUCCESS: Audio from client detected correctly!');
        } else {
            console.log('FAILURE: Could not detect audio from client correctly.');
            console.log(`Detected as Contact: ${result.isContactMessage}, Last Message: ${result.lastMessage}`);
        }
    } catch (e: any) {
        console.error('Test error:', e.message);
    } finally {
        await closeAutomation();
    }
}

test();
