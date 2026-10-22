import {
    OIMChannelService,
    type IOIMChannelMap,
    type IOIMStoreSlotListener,
    type OIMComputedService,
    type OIMSlotCollectionService,
    type TOIMBucketSlot,
    type TOIMComputedStoreSlot,
    type TOIMDefaultSlotStore,
    type TOIMEntitySlot,
    type TOIMDisposer,
    type TOIMKeyedSlot,
    type TOIMStoreKey,
    type TOIMStoreSlot,
} from '@oimdb/core';
import { OIMDevBridgeRequestReader } from './OIMDevBridgeRequestReader';
import type { TOIMDevCollectionOptions } from '../types/TOIMDevCollectionOptions';
import type { TOIMDevCollectionInfo } from '../types/TOIMDevCollectionInfo';
import type { TOIMDevComputedInfo } from '../types/TOIMDevComputedInfo';
import type { TOIMDevFlushErrorRecord } from '../types/TOIMDevFlushErrorRecord';
import type { TOIMDevFlushRecord } from '../types/TOIMDevFlushRecord';
import type { TOIMDevIndexInfo } from '../types/TOIMDevIndexInfo';
import type { TOIMDevInspectResult } from '../types/TOIMDevInspectResult';

type TOIMDevRegistryEntry = {
    read: () => readonly TOIMEntitySlot[] | undefined;
    indexes: Record<string, () => readonly TOIMKeyedSlot[] | undefined>;
    relations: Record<string, string>;
    description: string | undefined;
};

export class OIMDevRegistry implements IOIMStoreSlotListener {
    private readonly entries = new Map<string, TOIMDevRegistryEntry>();
    private readonly computedEntries = new Map<string, () => TOIMDevComputedInfo | undefined>();
    private readonly storeSlots = new WeakSet<object>();
    private readonly flushHistory: TOIMDevFlushRecord[] = [];
    private readonly flushErrors: TOIMDevFlushErrorRecord[] = [];
    /** Every frame off the socket goes through this before a field is read off it. */
    private readonly requestReader = new OIMDevBridgeRequestReader();
    private static readonly MAX_HISTORY = 50;

    public onStoreSlotCreated(storeSlot: TOIMStoreSlot): void {
        this.storeSlots.add(storeSlot);
    }

    public collection<
        TKey, TEntity extends object, TStore,
        TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    >(
        name: string,
        entityCollectionService: Pick<OIMSlotCollectionService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore, unknown>, 'getSlots'>,
        entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>,
        options: TOIMDevCollectionOptions<TBucketStore> = {}
    ): this {
        const indexes: Record<string, () => readonly TOIMKeyedSlot[] | undefined> = {};
        for (const [indexName, { bucketCollectionService, bucketStoreSlot }] of Object.entries(options.indexes ?? {})) {
            indexes[indexName] = OIMDevRegistry.readWeakly(bucketStoreSlot, storeSlot => bucketCollectionService.getSlots(storeSlot));
        }
        this.entries.set(name, {
            read: OIMDevRegistry.readWeakly(entityStoreSlot, storeSlot => entityCollectionService.getSlots(storeSlot)),
            indexes,
            relations: options.relations ?? {},
            description: options.description,
        });
        return this;
    }

    public computed<TValue, TStore>(
        name: string,
        computedService: OIMComputedService<void, TValue, TStore>,
        computedStoreSlot: TOIMComputedStoreSlot<TStore, TValue, void>,
    ): this {
        const computedStoreSlotWeakRef = new WeakRef(computedStoreSlot);
        this.computedEntries.set(name, () => {
            const liveComputedStoreSlot = computedStoreSlotWeakRef.deref();
            if (liveComputedStoreSlot === undefined) return undefined;
            const computedCollectionService = computedService.computedCollectionService;
            const computedSlot = computedCollectionService.getSlotByKey(liveComputedStoreSlot, undefined);
            return { currentValue: computedCollectionService.slotContentService.getValueForSlot(computedSlot) };
        });
        return this;
    }

    public inspect(): TOIMDevInspectResult {
        const collections: TOIMDevInspectResult['collections'] = {};
        for (const [name, entry] of this.entries) {
            const collectionInfo = OIMDevRegistry.describeCollection(entry);
            if (collectionInfo === undefined) this.entries.delete(name);
            else collections[name] = collectionInfo;
        }

        const computeds: TOIMDevInspectResult['computeds'] = {};
        for (const [name, read] of this.computedEntries) {
            const computedInfo = read();
            if (computedInfo === undefined) this.computedEntries.delete(name);
            else computeds[name] = computedInfo;
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
                lines.push(`    ${name.padEnd(24)} value: ${JSON.stringify(info.currentValue)}`);
            }
        }

        return lines.join('\n');
    }

    public dump(): void {
        // eslint-disable-next-line no-console -- printing IS this method's purpose: an explicit developer-invoked dump.
        console.log(this.dumpString());
    }

    /** The size of every registered population, once per flush. */
    public trackFlushes(channelMap: IOIMChannelMap): TOIMDisposer {
        return OIMChannelService.INSTANCE.subscribeAfterEachFlush(channelMap.defaultChannelSlot, () => {
            const counts: Record<string, number> = {};
            for (const [name, entry] of this.entries) {
                const entitySlots = entry.read();
                if (entitySlots !== undefined) counts[name] = entitySlots.length;
            }
            this.flushHistory.unshift({ time: Date.now(), counts });
            if (this.flushHistory.length > OIMDevRegistry.MAX_HISTORY) {
                this.flushHistory.length = OIMDevRegistry.MAX_HISTORY;
            }
        });
    }

    /** A SINK the caller pushes into from the error policy's `onError`, never a subscription. */
    public recordError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        this.flushErrors.unshift({ time: Date.now(), message });
        if (this.flushErrors.length > OIMDevRegistry.MAX_HISTORY) {
            this.flushErrors.length = OIMDevRegistry.MAX_HISTORY;
        }
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
            // A FRAME THIS PAGE CANNOT READ IS DROPPED, silently, and the socket
            // stays — unlike the server, which closes with 1007.
            const request = this.requestReader.read(event.data);
            if (request === null) return;
            try {
                const data = request.action === 'dump' ? this.dumpString() : this.inspect();
                ws.send(JSON.stringify({ type: 'response', id: request.id, data }));
            } catch (err) {
                ws.send(JSON.stringify({ type: 'response', id: request.id, data: null, error: String(err) }));
            }
        });

        ws.addEventListener('error', () => {
            console.warn(`[OIMDB DevTools] Could not connect to MCP bridge at ${url}. Is @oimdb/mcp running?`);
        });

        return () => ws.close();
    }


    private static readWeakly<TStoreSlot extends object, TSlot>(
        storeSlot: TStoreSlot,
        getSlots: (liveStoreSlot: TStoreSlot) => Iterable<TSlot>,
    ): () => readonly TSlot[] | undefined {
        const storeSlotWeakRef = new WeakRef(storeSlot);
        return () => {
            const liveStoreSlot = storeSlotWeakRef.deref();
            return liveStoreSlot === undefined ? undefined : Array.from(getSlots(liveStoreSlot));
        };
    }

    private static describeCollection(entry: TOIMDevRegistryEntry): TOIMDevCollectionInfo | undefined {
        const rows = entry.read();
        if (rows === undefined) return undefined;
        const plainKeys: unknown[] = [];
        const entities: unknown[] = [];
        for (const entitySlot of rows) {
            plainKeys.push(OIMDevRegistry.plainKeyOf(entitySlot));
            // A HOLE IS KEPT: `undefined` is what the engine holds at a reserved or
            // emptied identity, and dropping it under-reports the population.
            entities.push(entitySlot.entity);
        }

        const indexes: Record<string, TOIMDevIndexInfo> = {};
        for (const [indexName, readIndex] of Object.entries(entry.indexes)) {
            // NOTHING IS SETTLED HERE: `write` refuses to run inside a frame, so
            // nothing is pending, and addresses are read rather than slots.
            const bucketSlots = readIndex();
            if (bucketSlots === undefined) continue;
            const keys: unknown[] = [];
            for (const bucketSlot of bucketSlots) {
                keys.push(OIMDevRegistry.plainKeyOf(bucketSlot));
            }
            indexes[indexName] = { keyCount: keys.length, keys };
        }

        return {
            count: rows.length,
            samplePks: plainKeys.slice(0, 5),
            sampleEntity: entities[0] ?? null,
            entities,
            indexes,
            relations: entry.relations,
            description: entry.description,
        };
    }

    /** What names this identity, in a form a report can be serialised in. */
    private static plainKeyOf(slot: TOIMKeyedSlot): unknown {
        return OIMDevRegistry.plainKeyPartOf(slot.key);
    }

    private static plainKeyPartOf(key: unknown): unknown {
        if (Array.isArray(key)) return key.map((segment: unknown) => OIMDevRegistry.plainKeyPartOf(segment));
        if (key === null || typeof key !== 'object') return key;
        return OIMDevRegistry.plainKeyPartOf((key as TOIMKeyedSlot).key);
    }
}
