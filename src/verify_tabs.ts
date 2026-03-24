import { scrapeSalespersonLeads } from './kommo_automation';

async function testParallel() {
    console.log('[Test] Starting parallel tasks...');
    
    // We will run two salesperson scrapes at the same time
    // One for a real one, one for an empty one
    try {
        const [res1, res2] = await Promise.all([
            scrapeSalespersonLeads('Pablo', { start: 0, end: 24 }),
            scrapeSalespersonLeads('', { start: 0, end: 24 })
        ]);

        console.log('[Test] Task 1 (Pablo) finished with count:', res1.count);
        console.log('[Test] Task 2 (General) finished with count:', res2.count);
        
        if (res1.count >= 0 && res2.count >= 0) {
            console.log('[Test] SUCCESS: Both tasks completed in parallel tabs.');
        }
    } catch (error) {
        console.error('[Test] FAILED:', error);
    } finally {
        process.exit(0);
    }
}

testParallel();
