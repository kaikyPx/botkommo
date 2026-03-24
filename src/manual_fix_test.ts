import { chromium } from 'playwright';
import { config } from './config';
import { sendN8nAlert } from './n8n';

const runManualScrapeTest = async () => {
    // Lead que sabemos que existe ou um ID genérico para teste de login
    const leadId = 48746963;
    console.log(`--- Teste de Recuperação com Navegador: Lead ${leadId} ---`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        console.log('Navegando para o login...');
        await page.goto(`https://${config.kommo.subdomain}.kommo.com/login/`, { waitUntil: 'networkidle' });
        
        await page.fill('input[name="username"]', config.kommo.automationLogin);
        await page.fill('input[name="password"]', config.kommo.automationPassword);
        await page.click('button[type="submit"]');
        
        console.log('Aguardando login...');
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(5000);

        console.log(`Acessando lead ${leadId}...`);
        await page.goto(`https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`, { waitUntil: 'load' });
        await page.waitForTimeout(10000);

        // Tirar screenshot para validar se logou
        const screenshotBuffer = await page.screenshot({ path: `screenshots/manual_fix_test.png` });
        const screenshotBase64 = screenshotBuffer.toString('base64');

        // Extrair texto via DOM
        const details = await page.evaluate(() => {
            const lastMsg = document.querySelector('.feed-note__text_message, .feed-note-v2__text, .feed-composed')?.textContent?.trim() || "Não encontrada";
            const owner = document.querySelector('.linked-form__field-value_owner, [data-id="responsible_user_id"] .control-content')?.textContent?.trim() || "Hubclass";
            return { lastMsg, owner };
        });

        console.log('Dados extraídos:', details);

        const payload = {
            leadId,
            leadName: `Lead #${leadId}`,
            waitTimeMinutes: 125,
            salespersonName: details.owner,
            lastMessage: details.lastMsg,
            leadUrl: `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`,
            screenshot: screenshotBase64
        };

        console.log('Enviando para n8n...');
        await sendN8nAlert(payload);
        console.log('--- TESTE CONCLUÍDO ---');

    } catch (error: any) {
        console.error('Erro no teste manual:', error.message);
        await page.screenshot({ path: 'screenshots/error_manual_fix.png' });
    } finally {
        await browser.close();
    }
};

runManualScrapeTest();
