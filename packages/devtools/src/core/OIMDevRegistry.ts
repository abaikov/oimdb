import { IOIMDevCollectionLike } from '../interfaces/IOIMDevCollectionLike';
import { IOIMDevComputedLike } from '../interfaces/IOIMDevComputedLike';
import { TOIMDevCollectionOptions } from '../types/TOIMDevCollectionOptions';
import {
    TOIMDevFlushErrorRecord,
    TOIMDevFlushRecord,
    TOIMDevInspectResult,
} from '../types/TOIMDevInspectResult';

type TOIMDevRegistryEntry = {
    name: string;
    collection: IOIMDevCollectionLike;
    options: TOIMDevCollectionOptions;
};

type TOIMDevDepWithSource = {
    source: unknown;
};

function hasSource(dep: unknown): dep is TOIMDevDepWithSource {
    return dep !== null && typeof dep === 'object' && 'source' in dep;
}

type TOIMDevComputedWithDeps = IOIMDevComputedLike & {
    deps: readonly unknown[];
};

function hasDeps(computed: IOIMDevComputedLike): computed is TOIMDevComputedWithDeps {
    return 'deps' in computed && Array.isArray((computed as TOIMDevComputedWithDeps).deps);
}

export class OIMDevRegistry {
    private readonly entries = new Map<string, TOIMDevRegistryEntry>();
    private readonly computedEntries = new Map<string, IOIMDevComputedLike>();
    private readonly nameByInstance = new WeakMap<object, string>();
    private readonly flushHistory: TOIMDevFlushRecord[] = [];
    private readonly flushErrors: TOIMDevFlushErrorRecord[] = [];
    private static readonly MAX_HISTORY = 50;

    public collection(
        name: string,
        collection: IOIMDevCollectionLike,
        options: TOIMDevCollectionOptions = {}
    ): this {
        this.entries.set(name, { name, collection, options });
        this.nameByInstance.set(collection as object, name);

        if (options.indexes) {
            for (const [indexName, index] of Object.entries(options.indexes)) {
                this.nameByInstance.set(index as object, `${name}.${indexName}`);
            }
        }

        return this;
    }

    public computed(name: string, computed: IOIMDevComputedLike): this {
        this.computedEntries.set(name, computed);
        this.nameByInstance.set(computed as object, name);
        return this;
    }

    public inspect(): TOIMDevInspectResult {
        const collections: TOIMDevInspectResult['collections'] = {};

        for (const [name, entry] of this.entries) {
            const indexes: TOIMDevInspectResult['collections'][string]['indexes'] = {};

            if (entry.options.indexes) {
                for (const [indexName, index] of Object.entries(entry.options.indexes)) {
                    const keys = index.getKeys();
                    // Copy into a fresh mutable array for the serializable result.
                    indexes[indexName] = { keyCount: keys.length, keys: [...keys] };
                }
            }

            const allPks = entry.collection.getAllPks();
            const all = entry.collection.getAll();

            collections[name] = {
                count: allPks.length,
                samplePks: allPks.slice(0, 5),
                sampleEntity: all[0] ?? null,
                entities: all,
                indexes,
                relations: entry.options.relations ?? {},
                description: entry.options.description,
            };
        }

        const computeds: TOIMDevInspectResult['computeds'] = {};

        for (const [name, comp] of this.computedEntries) {
            const collectedDeps = this.collectComputedDeps(comp);
            computeds[name] = {
                isReady: comp.isReady,
                needsRecompute: comp.needsRecompute,
                currentValue: comp.getIfReady(),
                deps: collectedDeps,
            };
        }

        return {
            collections,
            computeds,
            history: this.flushHistory.slice(),
            errors: this.flushErrors.slice(),
        };
    }

    public dumpString(): string {
        const result = this.inspect();
        const lines: string[] = ['[OIMDB DevRegistry]'];

        for (const [name, info] of Object.entries(result.collections)) {
            lines.push('');
            lines.push(`  ${name} (${info.count} entities)`);

            if (info.description) {
                lines.push(`    description: ${info.description}`);
            }

            if (info.sampleEntity !== null && typeof info.sampleEntity === 'object') {
                const fields = Object.keys(info.sampleEntity as object).join(', ');
                lines.push(`    fields:      ${fields}`);
            }

            const indexEntries = Object.entries(info.indexes);
            if (indexEntries.length > 0) {
                const indexStr = indexEntries
                    .map(([n, idx]) => `${n} (${idx.keyCount} keys)`)
                    .join(', ');
                lines.push(`    indexes:     ${indexStr}`);
            }

            const relationEntries = Object.entries(info.relations);
            if (relationEntries.length > 0) {
                const relStr = relationEntries
                    .map(([field, target]) => `${field} → ${target}`)
                    .join(', ');
                lines.push(`    relations:   ${relStr}`);
            }
        }

        const computedEntries = Object.entries(result.computeds);
        if (computedEntries.length > 0) {
            lines.push('');
            lines.push('  computeds:');
            for (const [name, info] of computedEntries) {
                const status = !info.isReady
                    ? 'not computed yet'
                    : info.needsRecompute
                      ? `stale  — last: ${JSON.stringify(info.currentValue)}`
                      : `fresh  — value: ${JSON.stringify(info.currentValue)}`;
                lines.push(`    ${name.padEnd(24)} ${status}`);

                if (info.deps.length > 0) {
                    const depsStr = info.deps
                        .map((d) => (d.name ?? '(unregistered)'))
                        .join(', ');
                    lines.push(`    ${''.padEnd(24)}   deps: ${depsStr}`);
                }
            }
        }

        return lines.join('\n');
    }

    public dump(): void {
        console.log(this.dumpString());
    }

    /**
     * Subscribe to queue flushes and record them in the history.
     * Returns an unsubscribe function.
     *
     * Usage:
     * ```ts
     * registry.trackFlushes(handler =>
     *   queue.emitter.on(EOIMEventQueueEventType.AFTER_FLUSH, handler)
     * );
     * ```
     */
    public trackFlushes(subscribe: (handler: () => void) => () => void): () => void {
        return subscribe(() => {
            const counts: Record<string, number> = {};
            for (const [name, entry] of this.entries) {
                counts[name] = entry.collection.getAllPks().length;
            }
            this.flushHistory.unshift({ time: Date.now(), counts });
            if (this.flushHistory.length > OIMDevRegistry.MAX_HISTORY) {
                this.flushHistory.length = OIMDevRegistry.MAX_HISTORY;
            }
        });
    }

    /**
     * Subscribe to flush errors and record them so `getState().errors` surfaces
     * them (and the MCP bridge with them). Returns an unsubscribe function.
     *
     * Usage:
     * ```ts
     * registry.trackFlushErrors(handler =>
     *   queue.emitter.on(EOIMEventQueueEventType.FLUSH_ERROR, handler)
     * );
     * ```
     */
    public trackFlushErrors(
        subscribe: (
            handler: (payload: { error: unknown }) => void
        ) => () => void
    ): () => void {
        return subscribe(({ error }) => {
            const message =
                error instanceof Error ? error.message : String(error);
            this.flushErrors.unshift({ time: Date.now(), message });
            if (this.flushErrors.length > OIMDevRegistry.MAX_HISTORY) {
                this.flushErrors.length = OIMDevRegistry.MAX_HISTORY;
            }
        });
    }

    public connect(url = 'ws://localhost:7432'): () => void {
        if (typeof WebSocket === 'undefined') {
            throw new Error('[OIMDB DevTools] connect() requires a browser environment.');
        }
        const ws = new WebSocket(url);

        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({
                type: 'hello',
                url: typeof window !== 'undefined' ? window.location.href : 'unknown',
                title: typeof document !== 'undefined' ? document.title : 'unknown',
                timestamp: Date.now(),
            }));
        });

        ws.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data as string) as { type: string; id: string; action: string };
            if (msg.type !== 'request') return;
            try {
                const data = msg.action === 'dump' ? this.dumpString() : this.inspect();
                ws.send(JSON.stringify({ type: 'response', id: msg.id, data }));
            } catch (err) {
                ws.send(JSON.stringify({ type: 'response', id: msg.id, data: null, error: String(err) }));
            }
        });

        ws.addEventListener('error', () => {
            console.warn(`[OIMDB DevTools] Could not connect to MCP bridge at ${url}. Is @oimdb/mcp running?`);
        });

        return () => ws.close();
    }

    private collectComputedDeps(
        comp: IOIMDevComputedLike
    ): TOIMDevInspectResult['computeds'][string]['deps'] {
        if (!hasDeps(comp)) return [];

        return comp.deps.map((dep) => {
            if (!hasSource(dep)) return { name: null };
            const source = dep.source;
            if (source === null || typeof source !== 'object') return { name: null };
            const name = this.nameByInstance.get(source as object) ?? null;
            return { name };
        });
    }
}
