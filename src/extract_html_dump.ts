import { chromium } from 'playwright';
import { config } from './config';
import fs from 'fs';

async function extractHtml() {
    const leadId = 55042071;
    console.log(`Starting HTML extraction for lead ${leadId}...`);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 1000 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        // Login Flow
        const rootUrl = `https://${config.kommo.subdomain}.kommo.com/`;
        await page.goto(rootUrl, { waitUntil: 'load' });
        await page.waitForTimeout(5000);
        
        const pageTitle = await page.title();
        if (pageTitle.includes('Authorization') || pageTitle.includes('Autorização')) {
             await page.waitForSelector('input[name="username"]', { timeout: 10000 }).catch(() => null);
             const loginFormVisible = await page.$('input[name="username"]');
             if (loginFormVisible) {
                 await page.fill('input[name="username"]', config.kommo.automationLogin);
                 await page.fill('input[name="password"]', config.kommo.automationPassword);
                 await page.click('button[type="submit"]');
                 await page.waitForTimeout(20000);
             }
        }

        // Navigate to Lead
        const leadUrl = `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`;
        await page.goto(leadUrl, { waitUntil: 'load' });
        await page.waitForTimeout(20000); // Wait for chat to load

        // Scroll
        await page.mouse.wheel(0, 5000);
        await page.waitForTimeout(5000);
        for(let i=0; i<3; i++) {
            await page.mouse.wheel(0, -3000);
            await page.waitForTimeout(5000);
        }

        // Extract HTML
        const html = await page.evaluate(() => {
            const feedContainer = document.querySelector('.feed-composed, .feed-notes, .notes-wrapper, #feed_container, .feed__body');
            return feedContainer ? feedContainer.innerHTML : 'Feed container not found';
        });

        fs.writeFileSync('feed_html_dump.html', html);
        console.log('HTML saved to feed_html_dump.html');

    } catch (e: any) {
        console.error('Test error:', e.message);
    } finally {
        await browser.close();
    }
}

extractHtml();
