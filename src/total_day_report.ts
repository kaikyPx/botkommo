import { runSalesReport } from './sales_report';
runSalesReport().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
