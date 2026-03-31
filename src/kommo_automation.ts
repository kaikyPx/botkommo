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
const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

async function takeScreenshot(page: any, name: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}_${name}.png`;
    const filePath = path.join(screenshotsDir, fileName);
    try {
        await page.screenshot({ path: filePath, fullPage: true });
        console.log(`[Automation] Screenshot salva: ${fileName}`);
    } catch (e: any) {
        console.error(`[Automation] Erro ao salvar screenshot: ${e.message}`);
    }
}

/**
 * Ensures browser is launched and logged in persistently.
 */
let contextPromise: Promise<any> | null = null;

async function getPage(): Promise<any> {
    if (!contextPromise || (context && !context.browser()?.isConnected())) {
        if (context) await context.close().catch(() => null);
        contextPromise = (async () => {
            if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir);
            console.log('[Automation] Lançando novo contexto do navegador...');
            const ctx = await require('playwright').chromium.launchPersistentContext(profileDir, {
                headless: true,
                viewport: { width: 1366, height: 1000 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            context = ctx;
            return ctx;
        })();
    }

    const ctx = await contextPromise;
    try {
        const page = await ctx.newPage();
        page.on('console', (msg: any) => console.log(`[Browser] ${msg.text()}`));
        return page;
    } catch (e) {
        console.log('[Automation] Falha ao criar página (browser fechado?). Resetando contexto...');
        contextPromise = null;
        return getPage(); // Tenta novamente com novo contexto
    }
}

/**
 * Ensures the page is logged in to Kommo.
 */
async function ensureLoggedIn(page: any): Promise<void> {
    const rootUrl = `https://${config.kommo.subdomain}.kommo.com/chats/`;
    console.log(`[Automation] Verificando autenticação em: ${rootUrl}`);
    
    await page.goto(rootUrl, { waitUntil: 'load' });
    await page.waitForTimeout(5000); 
    
    const pageTitle = await page.title();
    console.log(`[Automation] Título da página: "${pageTitle}"`);

    const isAuthorized = !pageTitle.includes('Authorization') && !pageTitle.includes('Autorização');
    const hasNav = await page.$('.notification-list, .nav, .dashboard-wrapper');

    if (!isAuthorized || !hasNav) {
         console.log('[Automation] Sessão expirada ou redirecionada. Iniciando fluxo de login...');
         
         if (!page.url().includes('login')) {
             await page.goto(`https://${config.kommo.subdomain}.kommo.com/chats/`, { waitUntil: 'load' });
         }
         
         await page.waitForSelector('input[name="username"]', { timeout: 10000 }).catch(() => null);
         const loginFormVisible = await page.$('input[name="username"]');
         
         if (loginFormVisible) {
             console.log('[Automation] Preenchendo credenciais...');
             await page.waitForSelector('input[name="username"]', { timeout: 10000 });
             await page.fill('input[name="username"]', config.kommo.automationLogin);
             await page.waitForTimeout(1000);
             await page.waitForSelector('input[name="password"]', { timeout: 10000 });
             await page.fill('input[name="password"]', config.kommo.automationPassword);
             await page.waitForTimeout(2000);
             await page.click('button[type="submit"]');
             console.log('[Automation] Login enviado. Aguardando...');
             await page.waitForTimeout(20000); // 20 segundos para carregar o painel
         }
    } else {
        console.log('[Automation] Sessão ativa. [OK]');
    }
    await takeScreenshot(page, 'logged_in_check');
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
        await takeScreenshot(page, `lead_${leadId}_loaded`);
        
        console.log('[Automation] Passo 4: Interação: Página do lead acessada. Aguardando 20 segundos para renderização... [OK]');
        await page.waitForTimeout(20000); // 20 segundos
        console.log('[Automation] Renderização concluída após pausa. [OK]');
        await takeScreenshot(page, `lead_${leadId}_after_wait`);

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
            const scrollers = document.querySelectorAll('.notes-wrapper__scroller, .feed__notes, .js-feed-notes-wrapper, .linked-form__notes-wrapper, .feed-compose__scroller');
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
            await takeScreenshot(page, `lead_${leadId}_scroll_${i+1}`);
        }
        console.log('[Automation] Fluxo de scroll completado. [OK]');
        await takeScreenshot(page, `lead_${leadId}_final_scroll_state`);

        // --- EXTRACT DATA ---
        const salespersonsList = config.monitor.salespersons;
        const ignoredMessagesList = config.sla.ignoredMessages;

        const data = await page.evaluate((salespersons: string[], ignoredMsgs: string[]) => {
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
                const hasQuestionMark = contentText.includes('?');
                const cleanText = contentText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, '').trim();
                
                // Lista dinâmica vinda do .env (ignorar encerramentos)
                const ignoredPatterns = ignoredMsgs.map(m => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()).join('|');
                const ignoredWordsRegex = new RegExp(`^(${ignoredPatterns})$`, 'i');
                
                if (!hasQuestionMark && cleanText.length > 0 && cleanText.length < 35 && ignoredWordsRegex.test(cleanText)) {
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
                        
                        const dateEl = note.querySelector('.js-feed-note__date, .feed-note__date, .feed-note-v2__date');
                        const dateText = dateEl?.textContent?.trim().toLowerCase() || '';
                        
                        let timestamp = Date.now() / 1000;
                        const timeMatch = dateText.match(/(\d{1,2}):(\d{2})/);
                        if (timeMatch) {
                            const msgDate = new Date();
                            msgDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
                            
                            if (dateText.includes('ontem')) {
                                msgDate.setDate(msgDate.getDate() - 1);
                            } else if (dateText.match(/\d{2}\.\d{2}\.\d{4}/)) {
                                const datePart = dateText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
                                if (datePart) {
                                    msgDate.setFullYear(parseInt(datePart[3]), parseInt(datePart[2]) - 1, parseInt(datePart[1]));
                                }
                            } else if (dateText.match(/\d{2}\.\d{2}/) && !dateText.includes('hoje')) {
                                const dayMonth = dateText.match(/(\d{2})\.(\d{2})/);
                                if (dayMonth) {
                                    msgDate.setMonth(parseInt(dayMonth[2]) - 1, parseInt(dayMonth[1]));
                                }
                            }
                            timestamp = Math.floor(msgDate.getTime() / 1000);
                        }

                        const isIncomingClass = note.classList.contains('feed-note--left') || 
                                         note.classList.contains('feed-note-incoming') ||
                                         note.querySelector('.feed-note-incoming') !== null;
                        
                        isContactMessage = isIncomingClass;
                        (window as any).__lastMsgTs = timestamp;
                        break;
                    }
                }

                // 2. Scan history for salesperson name (regex) OR author name
                let lastSalespersonAuthor = '';
                const namePatterns = [
                    /me chamo ([\wÀ-ÿ]+)/i, 
                    /aqui quem fala [ée] [oa]?\s*([\wÀ-ÿ]+)/i, 
                    /meu nome [ée] ([\wÀ-ÿ]+)/i, 
                    /sou o ([\wÀ-ÿ]+)/i, 
                    /sou a ([\wÀ-ÿ]+)/i
                ];

                for (const note of notes) {
                    const authorEl = note.querySelector('.feed-note__amojo-user, .feed-note__author, .feed-note-v2__author');
                    const authorName = authorEl?.textContent?.trim().toLowerCase() || '';
                    const isIncoming = note.classList.contains('feed-note--left') || note.classList.contains('feed-note-incoming');
                    
                    // Regex strategy
                    if (!detectedName) {
                        const text = note.textContent || '';
                        for (const p of namePatterns) {
                            const m = text.match(p);
                            if (m && m[1] && m[1].trim().length < 20) {
                                detectedName = m[1].trim().split(' ')[0];
                                break;
                            }
                        }
                    }

                    // Author name strategy
                    if (!isIncoming && !lastSalespersonAuthor) {
                        const match = salespersons.find(name => authorName.includes(name.toLowerCase()));
                        if (match) lastSalespersonAuthor = match;
                    }
                    
                    if (detectedName && lastSalespersonAuthor) break;
                }

                const owner = document.querySelector('.linked-form__field-value_owner, [data-id="responsible_user_id"] .control-content')?.textContent?.trim() || 'Desconhecido';
                
                return {
                    lastMessage: lastMsg,
                    salespersonName: lastSalespersonAuthor || detectedName || owner,
                    isContactMessage,
                    lastMessageTimestamp: (window as any).__lastMsgTs || (Date.now() / 1000)
                };
            }, salespersonsList, ignoredMessagesList);
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
 * Fetches lead IDs for a specific salesperson via the Kommo inbox API.
 *
 * Uses a logged-in browser session (persistent profile) to access the
 * authenticated /ajax/v4/inbox/list endpoint and filters leads by
 * found_message.created_at within the given BRT hour range on TODAY.
 *
 * @param salesperson  Name to search (exact match used in Kommo query)
 * @param startHourBRT Start of time window, inclusive (e.g. 0 = 00:00 BRT)
 * @param endHourBRT   End of time window, exclusive   (e.g. 13 = 13:00 BRT)
 */
export const scrapeSalespersonLeads = async (
    salesperson: string,
    timeRange?: { start: number; end: number }
) => {
    const startHour = timeRange?.start ?? 0;
    const endHour   = timeRange?.end   ?? 24;

    console.log(`[API] Buscando "${salesperson}" | BRT ${String(startHour).padStart(2,'0')}:00 – ${String(endHour).padStart(2,'0')}:00`);

    const page = await getPage();

    try {
        await ensureLoggedIn(page);

        // ── Build today's BRT window as UTC unix timestamps ────────────────
        const BRT_OFFSET_S = -3 * 60 * 60;                      // -10800 s
        const nowUtcMs     = Date.now();
        const nowBRTMs     = nowUtcMs + BRT_OFFSET_S * 1000;
        const brtMidnight  = new Date(nowBRTMs);
        brtMidnight.setUTCHours(0, 0, 0, 0);

        // Convert BRT midnight back to UTC unix seconds
        const brtMidnightUtcS = (brtMidnight.getTime() / 1000) - BRT_OFFSET_S;

        const windowStartUtcS = brtMidnightUtcS + startHour * 3600;
        const windowEndUtcS   = brtMidnightUtcS + endHour   * 3600;
        // ──────────────────────────────────────────────────────────────────

        const subdomain = config.kommo.subdomain;
        const apiUrl = `https://${subdomain}.kommo.com/ajax/v4/inbox/list?limit=250&query%5Bmessage%5D=${encodeURIComponent(salesperson)}`;

        console.log(`[API] GET ${apiUrl}`);
        await page.goto(apiUrl, { waitUntil: 'load', timeout: 60000 });
        const content = await page.evaluate(() => document.body.innerText);

        let data: any;
        try {
            data = JSON.parse(content);
        } catch {
            throw new Error('[API] Resposta não é JSON válido.');
        }

        const allTalks: any[] = data?._embedded?.talks ?? [];
        console.log(`[API] ${allTalks.length} registros recebidos.`);


        // ── Filter & deduplicate ───────────────────────────────────────────
        const uniqueIds = new Set<string>();
        const results: { id: string; snippet: string; time: string; clientName: string; fonte: string }[] = [];

        for (const talk of allTalks) {
            // Only process leads (not contacts)
            if (talk.entity?.type !== 'leads') continue;

            const leadId = talk.entity?.id?.toString();
            if (!leadId || uniqueIds.has(leadId)) continue;

            // Use found_message.created_at — this is when the salesperson
            // was first assigned / greeted the client in the chat
            const msgTs: number = talk.found_message?.created_at ?? 0;
            if (!msgTs) continue;

            // Is this message within today's BRT window?
            if (msgTs < windowStartUtcS || msgTs >= windowEndUtcS) continue;

            uniqueIds.add(leadId);

            // Format time in BRT for display
            const brtDate = new Date((msgTs + BRT_OFFSET_S) * 1000);
            const timeStr =
                String(brtDate.getUTCHours()).padStart(2, '0') + ':' +
                String(brtDate.getUTCMinutes()).padStart(2, '0');

            const clientName  = talk.contact?.name || 'Desconhecido';
            const snippet      = talk.found_message?.text || talk.last_message?.text || '';
            const chatSource   = talk.chat_source === 'instagram_business' ? 'Instagram' : 'WhatsApp';

            results.push({ id: leadId, snippet, time: timeStr, clientName, fonte: chatSource });
            console.log(`[LEAD] ${salesperson} | #${leadId} | ${clientName} | ${timeStr} | ${chatSource}`);
        }

        // Sort chronologically (oldest → newest)
        results.sort((a, b) => {
            const [ha, ma] = a.time.split(':').map(Number);
            const [hb, mb] = b.time.split(':').map(Number);
            return ha * 60 + ma - (hb * 60 + mb);
        });

        console.log(`[API] Concluído: ${results.length} leads únicos para "${salesperson}" no período.`);

        return {
            salesperson,
            count: results.length,
            leadIds: results.map(r => r.id),
            leads: results
        };

    } catch (error: any) {
        console.error(`[Automation] Erro ao buscar "${salesperson}":`, error.message);
        return { salesperson, count: 0, leadIds: [], leads: [] };
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
