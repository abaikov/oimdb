import { CellFingerprinter } from './cells/fingerprint';
import { stampCard } from './audit/auditCards';
import { auditEntries } from './audit/auditEntries';
import { publishAudit } from './audit/publishAudit';

const USAGE = `npm run audit -- <command>

commands
  status            every participant and scenario: current, stale, unstamped or missing card
  digests           the digest each card has to carry to be current
  stamp <subject>   write the current digest into that card, after reading the card against the code
  publish           write website/src/data/bench/audit.json`;

const log = (...lines: string[]): void => {
    for (const line of lines) process.stdout.write(`${line}\n`);
};

const main = async (): Promise<void> => {
    const [command = 'status', subject] = process.argv.slice(2);
    const entries = await auditEntries(new CellFingerprinter());
    if (command === 'status' || command === 'digests') {
        for (const kind of ['participant', 'scenario'] as const) {
            log('', `${kind}s`);
            for (const entry of entries.filter(candidate => candidate.kind === kind)) {
                const detail = command === 'digests' ? entry.currentDigest : (entry.card?.verdict ?? '');
                log(`  ${entry.state.padEnd(10)} ${entry.subject.padEnd(26)} ${detail}`);
            }
        }
        const counts = new Map<string, number>();
        for (const entry of entries) counts.set(entry.state, (counts.get(entry.state) ?? 0) + 1);
        log('', [...counts].map(([state, count]) => `${state} ${count}`).join(' · '));
        return;
    }
    if (command === 'stamp') {
        const entry = entries.find(candidate => candidate.subject === subject);
        if (entry?.card === undefined) throw new Error(`No card for "${subject}"`);
        stampCard(entry.card, entry.currentDigest);
        log(`stamped ${entry.card.file} with ${entry.currentDigest}`);
        return;
    }
    if (command === 'publish') {
        log(`Published ${publishAudit(entries)}`);
        return;
    }
    throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
};

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
