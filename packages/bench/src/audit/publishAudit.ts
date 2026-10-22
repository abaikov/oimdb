import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEBSITE_DATA } from '../cells/paths';
import type { TAuditEntry } from './types';

export const publishAudit = (entries: readonly TAuditEntry[]): string => {
    mkdirSync(WEBSITE_DATA, { recursive: true });
    const path = join(WEBSITE_DATA, 'audit.json');
    const published = {
        format: 1,
        generatedAt: new Date().toISOString(),
        entries: entries.map(entry => ({
            subject: entry.subject,
            kind: entry.kind,
            state: entry.state,
            card: entry.card ?? null,
        })),
    };
    writeFileSync(path, `${JSON.stringify(published, undefined, 2)}\n`);
    return path;
};
