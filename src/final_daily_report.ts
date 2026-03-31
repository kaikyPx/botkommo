import { runSalesReport } from './sales_report';

async function runFinalReport() {
    console.log('[Report] Iniciando relatório manual do dia completo...');
    await runSalesReport(); // sem argumento = detecta hora ou faz full day fora do horário
    console.log('[Report] Concluído.');
    process.exit(0);
}

runFinalReport();
