import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { config } from './config';

async function debugChatList() {
    console.log('[Debug] Launching browser to check chat list...');
    const profileDir = path.join(process.cwd(), 'debug_profile');
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir);

    const context = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        viewport: { width: 1366, height: 1000 }
    });

    const page = await context.newPage();
    try {
        console.log('[Debug] Navigating to /chats/...');
        await page.goto(`https://${config.kommo.subdomain}.kommo.com/chats/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(5000);
        
        console.log('[Debug] Checking items...');
        const itemCount = await page.locator('.notification__item').count();
        console.log(`[Debug] notification__item count: ${itemCount}`);
        
        const html = await page.content();
        fs.writeFileSync('chat_debug.html', html);
        console.log('[Debug] Saved chat_debug.html');

        // Check if there's a different selector
        const otherCount = await page.locator('.chat-list__item').count();
        console.log(`[Debug] chat-list__item count: ${otherCount}`);

    } catch (e) {
        console.error('[Debug] Error:', e);
    } finally {
        await context.close();
    }
}

debugChatList();
