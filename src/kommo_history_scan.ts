import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const login = 'vagasmundoapplepb@gmail.com';
const password = 'Teste2025@';
const leadUrl = 'https://vagasmundoapplepb.kommo.com/leads/detail/46560005';

async function run() {
    console.log('Iniciando varredura de histórico (Modo Estendido)...');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 1200 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        // LOGIN com tratamento de erro e prints
        console.log('Tentando login...');
        await page.goto('https://vagasmundoapplepb.kommo.com/', { waitUntil: 'load' });
        await page.waitForTimeout(5000);

        if (await page.$('input[name="username"]')) {
            await page.fill('input[name="username"]', login);
            await page.fill('input[name="password"]', password);
            await page.click('button[type="submit"]');
        } else {
            console.log('Página de login não carregou campos. Tentando redirecionar...');
            await page.goto('https://vagasmundoapplepb.kommo.com/login/');
            await page.waitForSelector('input[name="username"]');
            await page.fill('input[name="username"]', login);
            await page.fill('input[name="password"]', password);
            await page.click('button[type="submit"]');
        }
        
        await page.waitForTimeout(10000); 

        // 2. NAVEGAR PARA O LEAD
        console.log(`Buscando histórico do lead: ${leadUrl}`);
        await page.goto(leadUrl);
        await page.waitForTimeout(10000);

        // 3. LIMPAR MODAIS
        await page.evaluate(() => {
            const modais = document.querySelectorAll('.modal-holder, .modal-overlay, .modal-root, [class*="modal"]');
            modais.forEach((m: any) => m.remove());
            document.body.classList.remove('modal-open');
        });

        // 4. SCROLL UP REPETIDO PARA FORÇAR CARREGAMENTO
        console.log('Carregando histórico completo...');
        for(let i=0; i<15; i++) {
            await page.mouse.wheel(0, -5000);
            await page.waitForTimeout(1500);
        }

        // 5. ANÁLISE DE NOMES
        const report = await page.evaluate(() => {
            const notes = Array.from(document.querySelectorAll('.feed-note')).map(n => n.textContent?.trim() || '');
            const patterns = [
                /meu nome [ée] ([\w\s]+)/i,
                /sou o ([\w\s]+)/i,
                /sou a ([\w\s]+)/i,
                /aqui é o ([\w\s]+)/i,
                /aqui é a ([\w\s]+)/i,
                /falo com ([^?!.]+)/i
            ];

            const matches: string[] = [];
            notes.forEach(text => {
                patterns.forEach(p => {
                    const m = text.match(p);
                    if (m && m[1] && m[1].length < 30) {
                        matches.push(`${m[1].trim()} -> "${text.substring(0, 150)}..."`);
                    }
                });
            });

            return {
                names: Array.from(new Set(matches)),
                count: notes.length,
                fullFeed: notes.slice(0, 20) // Primeiras mensagens (histórico antigo)
            };
        });

        console.log('\n--- RESULTADO DA BUSCA DE HISTÓRICO ---');
        console.log(`Mensagens analisadas: ${report.count}`);
        
        if (report.names.length > 0) {
            console.log('IDENTIFICAÇÕES DE VENDEDORES:');
            report.names.forEach(n => console.log(`- ${n}`));
        } else {
            console.log('Nenhuma apresentação direta encontrada.');
            console.log('\nAnálise das mensagens mais antigas:');
            report.fullFeed.forEach((f, i) => {
                if(f.length > 5) console.log(`${i+1}: ${f.substring(0, 100)}`);
            });
        }
        console.log('---------------------------------------\n');

        await page.screenshot({ path: 'screenshots/11_final_scan_report.png', fullPage: true });

    } catch (error: any) {
        console.error('Falha:', error.message);
        await page.screenshot({ path: 'screenshots/error_final_run.png' });
    } finally {
        await browser.close();
        console.log('Navegador fechado.');
    }
}

run();
