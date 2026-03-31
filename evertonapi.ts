import axios from "axios";

// =============================================
// CONFIGURAÇÃO
// =============================================

const BASE_URL =
    "https://vagasmundoapplepb.kommo.com/ajax/v4/inbox/list";
const QUERY_PARAM = "Everton";

// Cole aqui o cookie/token de autenticação da sua sessão no Kommo
// Você pode pegar abrindo o DevTools (F12) > Network > qualquer requisição > Headers > Cookie
const AUTH_COOKIE = "SEU_COOKIE_AQUI";

// =============================================
// TIPOS
// =============================================

interface Contact {
    id: number;
    name: string;
    profile_avatar: string;
}

interface FoundMessage {
    id: string;
    text: string;
    created_at: number;
    author: string;
}

interface Talk {
    id: number;
    contact: Contact;
    found_message: FoundMessage;
    status: string;
    chat_source: string;
}

interface ApiResponse {
    _embedded: {
        talks: Talk[];
    };
    _links: {
        next?: {
            href: string;
        };
    };
}

interface ReportEntry {
    talkId: number;
    contactName: string;
    horario: string;
    fonte: string;
}

interface Report {
    data: string;
    manha: ReportEntry[];   // 08h - 13h
    tarde: ReportEntry[];   // 13h - 18h
    total: ReportEntry[];
}

// =============================================
// HELPERS
// =============================================

const BRT_OFFSET = -3 * 60 * 60; // UTC-3 em segundos

function toBRT(timestamp: number): Date {
    const utcDate = new Date(timestamp * 1000);
    const brtTime = utcDate.getTime() + BRT_OFFSET * 1000;
    return new Date(brtTime);
}

function formatHora(date: Date): string {
    const h = String(date.getUTCHours()).padStart(2, "0");
    const m = String(date.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

function formatData(date: Date): string {
    const d = String(date.getUTCDate()).padStart(2, "0");
    const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
    const y = date.getUTCFullYear();
    return `${d}/${mo}/${y}`;
}

function getTodayBRT(): string {
    const now = new Date();
    const brtNow = new Date(now.getTime() + BRT_OFFSET * 1000);
    return formatData(brtNow);
}

// =============================================
// BUSCA TODAS AS PÁGINAS DA API
// =============================================

async function fetchAllTalks(): Promise<Talk[]> {
    const allTalks: Talk[] = [];
    let page = 1;
    let hasMore = true;

    console.log("🔍 Buscando atendimentos do Everton na API...\n");

    while (hasMore) {
        const url = `${BASE_URL}?limit=100&query%5Bmessage%5D=${QUERY_PARAM}&page=${page}`;

        try {
            const response = await axios.get<ApiResponse>(url, {
                headers: {
                    Cookie: AUTH_COOKIE,
                    "User-Agent": "Mozilla/5.0",
                    Accept: "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
            });

            const talks = response.data._embedded?.talks ?? [];
            allTalks.push(...talks);

            console.log(`  📄 Página ${page}: ${talks.length} registros encontrados`);

            // Verifica se há próxima página
            if (response.data._links?.next && talks.length === 100) {
                page++;
            } else {
                hasMore = false;
            }
        } catch (err: any) {
            console.error(`❌ Erro na página ${page}:`, err.message);
            hasMore = false;
        }
    }

    console.log(`\n✅ Total bruto coletado: ${allTalks.length} registros\n`);
    return allTalks;
}

// =============================================
// GERA O RELATÓRIO PARA UMA DATA ESPECÍFICA
// =============================================

function buildReport(talks: Talk[], targetDate: string): Report {
    const seenIds = new Set<number>();
    const manha: ReportEntry[] = [];
    const tarde: ReportEntry[] = [];

    for (const talk of talks) {
        // Ignora duplicatas (mesmo talkId)
        if (seenIds.has(talk.id)) continue;
        seenIds.add(talk.id);

        const ts = talk.found_message?.created_at;
        if (!ts) continue;

        const dt = toBRT(ts);
        const dataStr = formatData(dt);

        // Filtra apenas a data alvo
        if (dataStr !== targetDate) continue;

        const horaMin = dt.getUTCHours() * 60 + dt.getUTCMinutes();

        // Fora do expediente (antes das 08h ou a partir das 18h)
        if (horaMin < 8 * 60 || horaMin >= 18 * 60) continue;

        const entry: ReportEntry = {
            talkId: talk.id,
            contactName: talk.contact?.name || "(sem nome)",
            horario: formatHora(dt),
            fonte: talk.chat_source === "instagram_business" ? "Instagram" : "WhatsApp",
        };

        if (horaMin < 13 * 60) {
            manha.push(entry); // 08h - 13h
        } else {
            tarde.push(entry); // 13h - 18h
        }
    }

    return {
        data: targetDate,
        manha,
        tarde,
        total: [...manha, ...tarde],
    };
}

// =============================================
// IMPRIME O RELATÓRIO
// =============================================

function printReport(report: Report, periodo: "manha" | "tarde" | "completo"): void {
    const linha = "─".repeat(55);

    if (periodo === "manha") {
        console.log(`\n${linha}`);
        console.log(`📊 RELATÓRIO MANHÃ (08h–13h) — ${report.data}`);
        console.log(linha);
        if (report.manha.length === 0) {
            console.log("  Nenhum atendimento no período.");
        } else {
            report.manha.forEach((e, i) => {
                console.log(`  ${i + 1}. [${e.horario}] ${e.contactName} (${e.fonte})`);
            });
        }
        console.log(`\n  Total manhã: ${report.manha.length} atendimento(s)`);
        console.log(linha);
    }

    if (periodo === "tarde") {
        console.log(`\n${linha}`);
        console.log(`📊 RELATÓRIO TARDE (13h–18h) — ${report.data}`);
        console.log(linha);
        if (report.tarde.length === 0) {
            console.log("  Nenhum atendimento no período.");
        } else {
            report.tarde.forEach((e, i) => {
                console.log(`  ${i + 1}. [${e.horario}] ${e.contactName} (${e.fonte})`);
            });
        }
        console.log(`\n  Total tarde: ${report.tarde.length} atendimento(s)`);
        console.log(linha);
    }

    if (periodo === "completo") {
        console.log(`\n${"═".repeat(55)}`);
        console.log(`📋 RELATÓRIO COMPLETO DO DIA — ${report.data}`);
        console.log(`${"═".repeat(55)}`);

        console.log(`\n  🌅 MANHÃ (08h–13h): ${report.manha.length} atendimento(s)`);
        report.manha.forEach((e, i) => {
            console.log(`    ${i + 1}. [${e.horario}] ${e.contactName} (${e.fonte})`);
        });

        console.log(`\n  🌇 TARDE (13h–18h): ${report.tarde.length} atendimento(s)`);
        report.tarde.forEach((e, i) => {
            console.log(`    ${i + 1}. [${e.horario}] ${e.contactName} (${e.fonte})`);
        });

        console.log(`\n${"═".repeat(55)}`);
        console.log(`  ✅ TOTAL DO DIA: ${report.total.length} atendimento(s)`);
        console.log(`${"═".repeat(55)}\n`);
    }
}

// =============================================
// AGENDAMENTO AUTOMÁTICO
// =============================================

function scheduleReports(report: Report): void {
    const now = new Date();
    const brtNow = new Date(now.getTime() + BRT_OFFSET * 1000);
    const currentMinutes = brtNow.getUTCHours() * 60 + brtNow.getUTCMinutes();

    // Calcula ms até o próximo horário alvo
    function msUntil(targetHour: number, targetMin: number = 0): number {
        const targetMinutes = targetHour * 60 + targetMin;
        let diff = targetMinutes - currentMinutes;
        if (diff <= 0) diff += 24 * 60; // próximo dia
        return diff * 60 * 1000;
    }

    // Relatório das 13h
    const msUntil13 = msUntil(13);
    console.log(
        `⏰ Relatório de manhã agendado para as 13:00 (em ${Math.round(msUntil13 / 60000)} min)`
    );
    setTimeout(async () => {
        const freshTalks = await fetchAllTalks();
        const freshReport = buildReport(freshTalks, getTodayBRT());
        printReport(freshReport, "manha");
        console.log("⏰ Próximo relatório às 18:00...");
    }, msUntil13);

    // Relatório das 18h
    const msUntil18 = msUntil(18);
    console.log(
        `⏰ Relatório de tarde agendado para as 18:00 (em ${Math.round(msUntil18 / 60000)} min)`
    );
    setTimeout(async () => {
        const freshTalks = await fetchAllTalks();
        const freshReport = buildReport(freshTalks, getTodayBRT());
        printReport(freshReport, "tarde");
        // Aguarda 5 segundos e imprime o completo
        setTimeout(() => printReport(freshReport, "completo"), 5000);
    }, msUntil18);
}

// =============================================
// MAIN
// =============================================

async function main(): Promise<void> {
    const today = getTodayBRT();
    console.log(`\n🗓️  Iniciando sistema de relatórios — Everton`);
    console.log(`📅 Data de hoje (BRT): ${today}\n`);

    // Busca os dados agora
    const talks = await fetchAllTalks();
    const report = buildReport(talks, today);

    // Verifica qual horário estamos e mostra o relatório parcial disponível
    const now = new Date();
    const brtNow = new Date(now.getTime() + BRT_OFFSET * 1000);
    const currentHour = brtNow.getUTCHours();

    if (currentHour >= 8 && currentHour < 13) {
        console.log("ℹ️  Ainda no período da manhã. Mostrando parcial:");
        printReport(report, "manha");
    } else if (currentHour >= 13 && currentHour < 18) {
        console.log("ℹ️  Período da tarde. Mostrando manhã completa + tarde parcial:");
        printReport(report, "manha");
        printReport(report, "tarde");
    } else if (currentHour >= 18) {
        console.log("ℹ️  Dia encerrado. Relatório completo:");
        printReport(report, "completo");
    }

    // Agenda os relatórios automáticos
    scheduleReports(report);
}

main().catch(console.error);