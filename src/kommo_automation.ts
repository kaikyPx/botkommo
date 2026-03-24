import path from 'path';
import fs from 'fs';
import { config } from './config';

interface ScrapedDetails {
    lastMessage: string;
    salespersonName: string;
    isContactMessage: boolean;
    lastMessageTimestamp?: number;
}

let context: any | null = null;

const profileDir = path.join(process.cwd(), 'browser_profile');

/**
 * Ensures browser is launched and logged in persistently.
 */
async function getPage(): Promise<any> {
    if (!context) {
        if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir);
        context = await require('playwright').chromium.launchPersistentContext(profileDir, {
            headless: true,
            viewport: { width: 1366, height: 1000 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
    }

    const page = await context.newPage();
    page.on('console', (msg: any) => console.log(`[Browser] ${msg.text()}`));
    return page;
}

/**
 * Ensures the page is logged in to Kommo.
 */
async function ensureLoggedIn(page: any): Promise<void> {
    const rootUrl = `https://${config.kommo.subdomain}.kommo.com/`;
    console.log(`[Automation] Verificando autenticação em: ${rootUrl}`);
    
    await page.goto(rootUrl, { waitUntil: 'load' });
    await page.waitForTimeout(5000); 
    
    const pageTitle = await page.title();
    console.log(`[Automation] Título da página: "${pageTitle}"`);

    if (pageTitle.includes('Authorization') || pageTitle.includes('Autorização')) {
         console.log('[Automation] Tela de login detectada. Iniciando fluxo...');
         
         await page.waitForSelector('input[name="username"]', { timeout: 10000 }).catch(() => null);
         const loginFormVisible = await page.$('input[name="username"]');
         
         if (loginFormVisible) {
             console.log('[Automation] Preenchendo credenciais...');
             await page.fill('input[name="username"]', config.kommo.automationLogin);
             await page.fill('input[name="password"]', config.kommo.automationPassword);
             await page.waitForTimeout(5000);
             await page.click('button[type="submit"]');
             console.log('[Automation] Login enviado. Aguardando...');
             await page.waitForTimeout(15000);
         }
    } else {
        console.log('[Automation] Sessão ativa. [OK]');
    }
}

export const scrapeLeadDetails = async (leadId: number): Promise<ScrapedDetails> => {
    console.log(`[Automation] Starting deep scrape for lead ${leadId}...`);
    const page = await getPage();
    
    try {
        await ensureLoggedIn(page);

        const leadUrl = `https://${config.kommo.subdomain}.kommo.com/leads/detail/${leadId}`;
        console.log(`[Automation] Passo 3: Navegando para a página do lead ${leadId}...`);
        await page.goto(leadUrl, { waitUntil: 'load' });
        
        console.log(`[Automation] URL do Lead carregada. [OK]`);
        
        console.log('[Automation] Passo 4: Interação: Página do lead acessada. Aguardando 20 segundos para renderização... [OK]');
        await page.waitForTimeout(20000); // 20 segundos
        console.log('[Automation] Renderização concluída após pausa. [OK]');

        // --- CLEAN MODALS ---
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('.modal-close, .hb-modal-close, button[aria-label="Close"], .js-modal-close');
            buttons.forEach((btn: any) => btn.click());

            const allElements = document.querySelectorAll('*');
            allElements.forEach((el: any) => {
                const style = window.getComputedStyle(el);
                const zIndex = parseInt(style.zIndex, 10);
                if (style.position === 'fixed' && !isNaN(zIndex) && zIndex > 50) {
                    el.style.display = 'none';
                }
            });
            document.body.classList.remove('modal-open');
        });
        await page.waitForTimeout(2000);
        console.log('[Automation] Passo 5: Modais removidos e interface limpa. [OK]');

        // --- SCROLL NO FEED CORRETO ---
        console.log('[Automation] Passo 6: Forçando scroll específico no painel de mensagens para subir o histórico...');
        
        await page.evaluate(() => {
            // Tenta múltiplas divs que podem ser o scroller do Kommo
            const scrollers = document.querySelectorAll('.notes-wrapper__scroller, .feed__notes, .js-feed-notes-wrapper, .linked-form__notes-wrapper');
            scrollers.forEach((scroller: any) => {
                scroller.scrollTop = scroller.scrollHeight; // Primeiro desce tudo para ancorar
            });
        });
        
        console.log('[Automation] Interação: Scroll para baixo realizado. Aguardando 10 segundos... [OK]');
        await page.waitForTimeout(10000);
        
        let finishedScrolling = false;
        for(let i=0; i<8 && !finishedScrolling; i++) {
            finishedScrolling = await page.evaluate(() => {
                const showMore = document.querySelector('.js-show-more') as HTMLElement;
                if (!showMore) return true; // Se não tem botão, já carregou tudo ou não tem histórico
                
                const text = showMore.textContent || '';
                // "Mais 1 do 14" ou "Mais 1 de 14" indica que chegou no topo
                if (text.includes('Mais 1 do') || text.includes('Mais 1 de')) return true;

                // Se o botão existe e não é o "Mais 1", clicamos nele
                showMore.click();
                
                const scrollers = document.querySelectorAll('.notes-wrapper__scroller, .feed__notes, .js-feed-notes-wrapper, .linked-form__notes-wrapper');
                scrollers.forEach((scroller: any) => {
                    scroller.scrollTop = 0; // Força ida ao topo
                });
                return false;
            });
            
            if (finishedScrolling) {
                console.log(`[Automation] Histórico considerado carregado (Botão Mais 1 detectado ou ausente).`);
                break;
            }

            console.log(`[Automation] Interação: Scroll para cima ${i+1}. Aguardando 15 segundos... [OK]`);
            await page.waitForTimeout(15000);
        }
        console.log('[Automation] Fluxo de scroll completado. [OK]');

        // --- EXTRACT DATA ---
        const salespersonsList = config.monitor.salespersons;
        const data = await page.evaluate((salespersons: string[]) => {
            // Pega exatamente os containers raiz de cada mensagem, sem pegar elementos internos ou filhos fragmentados
            const noteElements = Array.from(document.querySelectorAll('.js-note, .feed-note-wrapper'))
                .filter(el => !el.classList.contains('feed-composed') && !el.closest('.feed-composed'));
            
            console.log(`[Browser] Found ${noteElements.length} valid message wrapper elements.`);
            const notes = noteElements.reverse();
            
            let lastMsg = 'Não encontrada no feed';
            let detectedName = '';
            let isContactMessage = false;

            const forbiddenTexts = ['enviar', 'resumir', 'fechar conversa', 'adicionar nota'];

            // 1. Get last message and author
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                const textElements = note.querySelectorAll('.feed-note__message_paragraph:not(.quotation__message-text)');
                let contentText = '';

                if (textElements.length > 0) {
                    const lastTextEl = textElements[textElements.length - 1];
                    const cloned = lastTextEl.cloneNode(true) as HTMLElement;
                    const toolbars = cloned.querySelectorAll('.feed-note__actions, .actions-toolbar, [class*="action"]');
                    toolbars.forEach(t => t.remove());
                    contentText = cloned.textContent?.trim() || '';
                }
                
                const isAudio = note.querySelector('.amojo-voice, .audio-player, audio') !== null || 
                                note.querySelector('svg [points*="play"], svg polygon[points*="8.33333 4.29524 16.3333 9"]') !== null;
                const isImage = note.querySelector('.feed-note__media-preview__picture, .feed-note__image, img[src*="blob:"]') !== null;

                console.log(`[Browser] Note[${i}] Text="${contentText}" | Audio=${isAudio} | Image=${isImage} | Class=${note.className}`);

                if (forbiddenTexts.includes(contentText.toLowerCase())) {
                    console.log(`[Browser] Skipping Note[${i}]: Forbidden text`);
                    continue;
                }

                // Nova regra: Ignorar mensagens curtas de confirmação do cliente
                const cleanText = contentText.toLowerCase().replace(/[^\w\s]/g, '').trim();
                const ignoredWordsRegex = /^(ok|blz|beleza|tranquilo|certo|sim|podemos|obrigado|obrigada|obg|valeu|vlw|tchau|ate logo|ate mais|fechado|joia|show|perfeito|ta bom|ta otimo|isso)$/i;
                if (cleanText.length > 0 && cleanText.length < 15 && ignoredWordsRegex.test(cleanText)) {
                    console.log(`[Browser] Skipping Note[${i}]: Mensagem curta ignoravel ("${contentText}")`);
                    continue;
                }

                if (contentText || isAudio || isImage) {
                    if (contentText) {
                        lastMsg = contentText;
                    } else if (isAudio) {
                        lastMsg = '(Mensagem de Áudio)';
                    } else if (isImage) {
                        lastMsg = '(Imagem/Arquivo)';
                    }
                    
                    const isIncomingClass = note.classList.contains('feed-note--left') || 
                                     note.classList.contains('feed-note-incoming') ||
                                     note.querySelector('.feed-note-incoming') !== null;
                    
                    const isOutgoingClass = note.classList.contains('feed-note--right') || 
                                     note.classList.contains('feed-composed') || 
                                     (!isIncomingClass && note.classList.contains('feed-note-external')) ||
                                     (!isIncomingClass && note.classList.contains('feed-note'));

                    const authorEl = note.querySelector('.feed-note__amojo-user, .feed-note__author, .feed-note-v2__author');
                    const authorName = authorEl?.textContent?.trim().toLowerCase() || '';

                    const dateEl = note.querySelector('.js-feed-note__date, .feed-note__date, .feed-note-v2__date');
                    const dateText = dateEl?.textContent?.trim().toLowerCase() || '';
                    
                    let timestamp = Date.now() / 1000;
                    const timeMatch = dateText.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) {
                        const msgDate = new Date();
                        msgDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
                        if (dateText.includes('ontem')) {
                            msgDate.setDate(msgDate.getDate() - 1);
                        }
                        timestamp = Math.floor(msgDate.getTime() / 1000);
                    }

                    const isBotOrWaba = authorName.includes('whatsapp') || authorName.includes('bot');
                    const isKnownSalesperson = salespersons.some(name => authorName.includes(name.toLowerCase()));

                    if (isBotOrWaba || isKnownSalesperson) {
                        isContactMessage = false; 
                        console.log(`[Browser] Assigned Salesperson: Author is bot/WABA or known (${authorName})`);
                    } else if (isIncomingClass) {
                        isContactMessage = true;
                        console.log(`[Browser] Assigned Contact: Has incoming classes`);
                    } else if (isOutgoingClass) {
                        isContactMessage = false;
                        console.log(`[Browser] Assigned Salesperson: Has outgoing classes`);
                    } else {
                        isContactMessage = false; 
                        console.log(`[Browser] Assigned Salesperson: Fallback chosen`);
                    }

                    // Save the calculated timestamp onto a variable outside the loop
                    (window as any).__lastMsgTs = timestamp;
                    break;
                }
            }

            // 2. Scan history for salesperson name (fallback)
            const patterns = [
                /me chamo ([\wÀ-ÿ]+)/i, 
                /aqui quem fala [ée] [oa]?\s*([\wÀ-ÿ]+)/i, 
                /meu nome [ée] ([\wÀ-ÿ]+)/i, 
                /sou o ([\wÀ-ÿ]+)/i, 
                /sou a ([\wÀ-ÿ]+)/i
            ];
            for (const note of notes) {
                const text = note.textContent || '';
                for (const p of patterns) {
                    const m = text.match(p);
                    if (m && m[1] && m[1].trim().length < 20) {
                        detectedName = m[1].trim().split(' ')[0];
                        break;
                    }
                }
                if (detectedName) break;
            }

            const owner = document.querySelector('.linked-form__field-value_owner, [data-id="responsible_user_id"] .control-content')?.textContent?.trim() || 'Desconhecido';
            
            return {
                lastMessage: lastMsg,
                salespersonName: detectedName || owner,
                isContactMessage,
                lastMessageTimestamp: (window as any).__lastMsgTs || (Date.now() / 1000)
            };
        }, salespersonsList);
        console.log('[Automation] Passo 7: Extração profunda de dados concluída. [OK]');

        return {
            ...data
        };

    } catch (error: any) {
        console.error(`[Automation] Error scraping lead ${leadId}:`, error.message);
        return {
            lastMessage: 'Erro ao extrair via navegador',
            salespersonName: 'Erro na automação',
            isContactMessage: false
        };
    } finally {
        await page.close().catch(() => null);
    }
};

/**
 * Scrapes lead IDs for a specific salesman by performing a chat search.
 * Filters for "Today" and optionally within a specific time range (e.g., 08:00 - 12:00).
 */
export const scrapeSalespersonLeads = async (salesperson: string, timeRange?: { start: number, end: number }) => {
    console.log(`[Automation] Searching for leads filtered by salesperson keyword: "${salesperson}"...`);
    if (timeRange) console.log(`[Automation] Target time range: ${timeRange.start}:00 - ${timeRange.end}:00`);
    
    const page = await getPage();
    
    try {
        await ensureLoggedIn(page);

        const subdomain = config.kommo.subdomain;
        const searchUrl = salesperson 
            ? `https://${subdomain}.kommo.com/chats/?filter%5Bterm%5D=${encodeURIComponent(salesperson)}`
            : `https://${subdomain}.kommo.com/chats/`;
        
        console.log(`[Automation] Navigating to search URL: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'load' });
        
        // Wait for results to be visible
        console.log(`[Automation] Waiting for results to appear...`);
        try {
            await page.waitForSelector('.notification__item', { timeout: 15000 });
        } catch (e) {
            console.log(`[Automation] Warning: No notification items appeared within 15s for "${salesperson}".`);
        }
        
        // Extract lead IDs with scroll and time range filtering
        console.log(`[Automation] Extracting leads with infinite scroll...`);
        
        const leads = await page.evaluate(async (range: { start: number, end: number } | undefined) => {
            const collected = new Set<string>();
            let reachedYesterday = false;
            let lastItemCount = 0;
            let attemptsWithoutNew = 0;
            
            const scroller = document.querySelector('.custom-scroll.a2965e40f') || 
                             document.querySelector('.notification-list__scroller') || 
                             document.querySelector('.custom-scroll') || 
                             document.documentElement;

            for (let i = 0; i < 30; i++) { 
                const items = Array.from(document.querySelectorAll('.notification__item'));
                console.log(`[Browser] Step ${i}: Found ${items.length} items.`);

                if (items.length > 0 && items.length === lastItemCount) {
                    attemptsWithoutNew++;
                } else {
                    attemptsWithoutNew = 0;
                    lastItemCount = items.length;
                }

                for (const item of items) {
                    const dateMsg = item.querySelector('.notification-inner__data_message')?.textContent || '';
                    const isToday = dateMsg.toLowerCase().includes('hoje');
                    
                    if (isToday) {
                        let isInRange = true;
                        if (range) {
                            const match = dateMsg.match(/(\d{1,2}):(\d{2})/);
                            if (match) {
                                const h = parseInt(match[1]);
                                isInRange = h >= range.start && h < range.end;
                            }
                        }

                        if (isInRange) {
                            const a = item.querySelector('a.js-navigate-link');
                            const href = a?.getAttribute('href') || '';
                            const match = href.match(/\/leads\/detail\/(\d+)/);
                            if (match && match[1]) collected.add(match[1]);
                        }
                    } else if (dateMsg.includes('Ontem') || dateMsg.match(/\d{2}\.\d{2}/)) {
                        reachedYesterday = true;
                    }
                }

                if (reachedYesterday) break;
                if (items.length > 0 && attemptsWithoutNew >= 4) break;

                if (scroller && scroller !== document.documentElement) {
                    scroller.scrollTop += 2000;
                } else {
                    window.scrollBy(0, 1500);
                }

                await new Promise(r => setTimeout(r, 3000));
            }

            return Array.from(collected);
        }, timeRange);
        
        console.log(`[Automation] Found ${leads.length} leads in range for "${salesperson}".`);
        
        return {
            salesperson,
            count: leads.length,
            leadIds: leads
        };
        
    } catch (error: any) {
        console.error(`[Automation] Error scraping leads for "${salesperson}":`, error.message);
        return {
            salesperson,
            count: 0,
            leadIds: []
        };
    } finally {
        await page.close().catch(() => null);
    }
};

/**
 * Call this to clean up when the service stops
 */
export const closeAutomation = async () => {
    if (context) {
        await context.close();
        context = null;
    }
};
