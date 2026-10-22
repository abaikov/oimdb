import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BENCH as BENCH_ROOT, WEBSITE_DATA } from '../cells/paths';
import { EXPERIMENT } from '../harness/identity';
import { pricePairs } from './pricePairs';
import type { TPriceRecord } from './TPriceRecord';

const MEASUREMENTS = join(BENCH_ROOT, 'measurements');
const WHY_EACH_ROW = join(BENCH_ROOT, 'WHY-EACH-ROW.md');
const PUBLISHED = join(WEBSITE_DATA, 'prices.json');

type TPublishedPrice = {
    id: string;
    catalogue: 'price' | 'alternative';
    path: string;
    ours: string;
    floor: string;
    caveat: string;
    oursNs: number;
    floorNs: number;
    ratio: number;
    noise: number;
    oursSpread: number;
    floorSpread: number;
    samples: number;
    measuredAt: string;
    runDir: string;
    machine: { cpu: string; node: string };
    coreFingerprint: string | null;
    isStale: boolean;
    whyAnchor: string | null;
};

type TMachine = { cpu?: string; node?: string; coreFingerprint?: string };

const readJson = <T>(path: string): T | undefined =>
    existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;

const runDirectories = (): string[] => {
    const found: string[] = [];
    for (const dated of readdirSync(MEASUREMENTS, { withFileTypes: true })) {
        if (!dated.isDirectory() || !/^\d{4}-\d{2}-\d{2}-/.test(dated.name)) continue;
        for (const topic of readdirSync(join(MEASUREMENTS, dated.name), { withFileTypes: true })) {
            const directory = join(MEASUREMENTS, dated.name, topic.name);
            if (topic.isDirectory() && existsSync(join(directory, 'records.json'))) found.push(directory);
        }
    }
    const writtenAtMs = (directory: string): number => statSync(join(directory, 'records.json')).mtimeMs;
    return found.sort((left, right) => writtenAtMs(left) - writtenAtMs(right));
};

type TWhySection = { slug: string; idPatterns: RegExp[] };

const githubSlug = (heading: string): string =>
    heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

const idPattern = (mention: string): RegExp => {
    const escaped = mention.replace(/[.+?^$()|[\]\\]/g, '\\$&');
    const expanded = escaped
        .replace(/\{([^}]*)\}/g, (_, alternatives: string) => `(?:${alternatives.split(',').join('|')})`)
        .replace(/\*/g, '.*');
    return new RegExp(`^${expanded}$`);
};

const whySections = (): TWhySection[] => {
    if (!existsSync(WHY_EACH_ROW)) return [];
    const sections: TWhySection[] = [];
    for (const line of readFileSync(WHY_EACH_ROW, 'utf8').split('\n')) {
        const heading = /^#{2,4}\s+(.*)$/.exec(line);
        if (heading !== null) { sections.push({ slug: githubSlug(heading[1]), idPatterns: [] }); continue; }
        const section = sections[sections.length - 1];
        if (section === undefined) continue;
        for (const mention of line.matchAll(/`([a-zA-Z][\w-]*(?:\.[\w{},*-]+)+)`/g)) {
            section.idPatterns.push(idPattern(mention[1]));
        }
    }
    return sections;
};

const sections = whySections();

const whyAnchorFor = (id: string): string | null => {
    const section = sections.find(candidate => candidate.idPatterns.some(pattern => pattern.test(id)));
    return section === undefined ? null : `packages/bench/WHY-EACH-ROW.md#${section.slug}`;
};

const publishedFrom = (record: TPriceRecord, directory: string, currentFingerprint: string): TPublishedPrice => {
    const reading = record.reading;
    const machine = readJson<TMachine>(join(directory, 'machine.json')) ?? {};
    const coreFingerprint = machine.coreFingerprint ?? null;
    const runDir = relative(BENCH_ROOT, directory).split('\\').join('/');
    return {
        id: reading.id,
        catalogue: reading.id.startsWith('alt.') ? 'alternative' : 'price',
        path: reading.path,
        ours: reading.ours,
        floor: reading.floor,
        caveat: reading.caveat,
        oursNs: reading.oursNs,
        floorNs: reading.floorNs,
        ratio: reading.ratio,
        noise: reading.noise,
        oursSpread: reading.oursSpread,
        floorSpread: reading.floorSpread,
        samples: reading.samples,
        measuredAt: runDir.slice(runDir.indexOf('/') + 1, runDir.indexOf('/') + 11),
        runDir,
        machine: { cpu: machine.cpu ?? 'unknown', node: machine.node ?? reading.node },
        coreFingerprint,
        isStale: coreFingerprint === null || coreFingerprint !== currentFingerprint,
        whyAnchor: whyAnchorFor(reading.id),
    };
};

const currentFingerprint = EXPERIMENT.subject;
const latestById = new Map<string, { published: TPublishedPrice; isControl: boolean }>();
for (const directory of runDirectories()) {
    const records = readJson<TPriceRecord[]>(join(directory, 'records.json'));
    if (!Array.isArray(records)) continue;
    for (const record of records) {
        if (record?.reading?.id === undefined || pricePairs.byId(record.reading.id) === undefined) continue;
        latestById.set(record.reading.id, {
            published: publishedFrom(record, directory, currentFingerprint),
            isControl: record.reading.isControl,
        });
    }
}

const entries = [...latestById.values()].sort((left, right) => left.published.id.localeCompare(right.published.id));
const published = {
    generatedAt: new Date().toISOString(),
    coreFingerprint: currentFingerprint,
    pairs: entries.filter(entry => !entry.isControl).map(entry => entry.published),
    controls: entries.filter(entry => entry.isControl).map(entry => entry.published),
};
writeFileSync(PUBLISHED, `${JSON.stringify(published, null, 2)}\n`);
process.stdout.write(
    `prices.json written: ${published.pairs.length} pairs (${published.pairs.filter(pair => pair.isStale).length} stale), `
    + `${published.controls.length} controls\n`,
);
