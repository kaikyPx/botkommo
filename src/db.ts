import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../db.sqlite');
const db = new sqlite3.Database(dbPath);

export const initDb = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(
            `CREATE TABLE IF NOT EXISTS alerted_leads (
        lead_id INTEGER PRIMARY KEY,
        last_message_timestamp INTEGER NOT NULL,
        alerted_at INTEGER NOT NULL
      )`,
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

/**
 * Checks if we already alerted for this specific message.
 * We store the timestamp of the last message that caused the alert.
 * Returns true if already alerted for this timestamp AND it has been less than 2 hours.
 */
export const isLeadAlerted = (leadId: number, lastMessageTimestamp: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT last_message_timestamp, alerted_at FROM alerted_leads WHERE lead_id = ?',
            [leadId],
            (err, row: { last_message_timestamp: number, alerted_at: number } | undefined) => {
                if (err) return reject(err);

                if (!row) return resolve(false); // Nunca foi alertado

                const now = Math.floor(Date.now() / 1000);
                const TWO_HOURS_IN_SECONDS = 2 * 60 * 60;

                // Se o último alerta para esse lead ocorreu a menos de 2 horas, bloqueia.
                // Isso evita bombardear o vendedor a cada minuto se reiniciar o servidor.
                if (now - row.alerted_at < TWO_HOURS_IN_SECONDS) {
                    return resolve(true);
                }

                // Se já se passaram mais de 2 horas desde o último alerta,
                // DEIXA ENVIAR O ALERTA DE NOVO (resolve false) mesmo que seja a mesma mensagem!
                // Isso serve como uma "escalação" ou lembrete a cada 2 horas.
                resolve(false);
            }
        );
    });
};

/**
 * Saves that we have alerted the responsible user for this specific message.
 */
export const markLeadAsAlerted = (leadId: number, lastMessageTimestamp: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        const now = Math.floor(Date.now() / 1000);
        db.run(
            `INSERT INTO alerted_leads (lead_id, last_message_timestamp, alerted_at) 
       VALUES (?, ?, ?) 
       ON CONFLICT(lead_id) 
       DO UPDATE SET last_message_timestamp = excluded.last_message_timestamp, alerted_at = excluded.alerted_at`,
            [leadId, lastMessageTimestamp, now],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

/**
 * Clears the alert tracking for a lead, usually because the salesperson replied.
 */
export const clearLeadAlert = (leadId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM alerted_leads WHERE lead_id = ?', [leadId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};
