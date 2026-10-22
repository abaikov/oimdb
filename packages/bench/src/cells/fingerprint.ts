import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { participantModuleOf } from '../harness/participantModules';
import { BENCH_SRC, REPO } from './paths';
import type { TFingerprint } from './types';

type TClosure = {
    benchFiles: ReadonlySet<string>;
    subjectFiles: ReadonlySet<string>;
    libraries: Readonly<Record<string, string>>;
};

const NODE_MODULES = 'node_modules/';
const BENCH_PREFIX = `${BENCH_SRC.slice(REPO.length + 1)}/`;

const packageNameOf = (input: string): string => {
    const segments = input.slice(input.lastIndexOf(NODE_MODULES) + NODE_MODULES.length).split('/');
    return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
};

const packageRootOf = (input: string): string =>
    `${input.slice(0, input.lastIndexOf(NODE_MODULES) + NODE_MODULES.length)}${packageNameOf(input)}`;

const versionOf = (packageRoot: string): string => {
    const manifest = JSON.parse(readFileSync(join(REPO, packageRoot, 'package.json'), 'utf8')) as {
        version?: string;
    };
    return manifest.version ?? 'unversioned';
};

const digestOf = (files: Iterable<string>): string => {
    const hash = createHash('sha256');
    for (const file of [...files].sort()) {
        hash.update(`${file}\0`);
        hash.update(readFileSync(join(REPO, file)));
        hash.update('\0');
    }
    return hash.digest('hex').slice(0, 16);
};

const closureOf = async (entry: string): Promise<TClosure> => {
    const result = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        metafile: true,
        platform: 'node',
        format: 'esm',
        logLevel: 'silent',
        absWorkingDir: REPO,
    });
    const benchFiles = new Set<string>();
    const subjectFiles = new Set<string>();
    const libraries: Record<string, string> = {};
    for (const input of Object.keys(result.metafile.inputs)) {
        if (input.includes(NODE_MODULES)) {
            libraries[packageNameOf(input)] ??= versionOf(packageRootOf(input));
            continue;
        }
        if (input.startsWith(BENCH_PREFIX)) benchFiles.add(input);
        else subjectFiles.add(input);
    }
    return { benchFiles, subjectFiles, libraries };
};

export interface IFingerprintSource {
    fingerprintOf(participant: string): Promise<TFingerprint>;
    harnessDigest(): Promise<string>;
}

export class CellFingerprinter implements IFingerprintSource {
    private harnessClosure: Promise<TClosure> | undefined;

    private readonly participantFingerprints = new Map<string, Promise<TFingerprint>>();

    public fingerprintOf(participant: string): Promise<TFingerprint> {
        let fingerprint = this.participantFingerprints.get(participant);
        if (fingerprint === undefined) {
            fingerprint = this.computeFingerprint(participant);
            this.participantFingerprints.set(participant, fingerprint);
        }
        return fingerprint;
    }

    public async harnessDigest(): Promise<string> {
        return digestOf((await this.harness()).benchFiles);
    }

    private harness(): Promise<TClosure> {
        this.harnessClosure ??= closureOf(join(BENCH_SRC, 'worker.ts'));
        return this.harnessClosure;
    }

    private async computeFingerprint(participant: string): Promise<TFingerprint> {
        const harness = await this.harness();
        const own = await closureOf(join(BENCH_SRC, participantModuleOf(participant).file));
        const adapterFiles = [...own.benchFiles].filter(file => !harness.benchFiles.has(file));
        const subjectFiles = new Set([...harness.subjectFiles, ...own.subjectFiles]);
        return {
            harness: digestOf(harness.benchFiles),
            adapter: digestOf(adapterFiles),
            subject: digestOf(subjectFiles),
            libraries: { ...harness.libraries, ...own.libraries },
        };
    }
}
