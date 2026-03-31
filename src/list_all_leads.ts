import { scrapeSalespersonLeads } from './kommo_automation';

async function listAllLeads() {
    console.log('--- BUSCA GERAL DO DIA TODO ---');
    const result = await scrapeSalespersonLeads('', { start: 0, end: 24 });
    console.log('\nIDs ENCONTRADOS:');
    console.log(result.leadIds.join(', '));
    console.log(`\nTOTAL: ${result.count}`);
    process.exit(0);
}

listAllLeads();
