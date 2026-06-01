interface TOIMBenchEntity {
    id: number;
    category: number;
    value: number;
    name: string;
}

interface TOIMSlot<TEntity> {
    item: TEntity | undefined;
}

interface TOIMIndexEntry<TEntity> {
    pk: number;
    item: TEntity | undefined;
}

interface TOIMSlotIndexScenario {
    name: string;
    keyCount: number;
    pksPerKey: number;
    readIterations: number;
    updateIterations: number;
}

type TOIMReadResult = {
    name: string;
    totalTime: number;
    opsPerSecond: number;
    checksum: number;
};

type TOIMBuildResult = {
    name: string;
    memoryMb: number;
    checksum: number;
};

const scenarios: TOIMSlotIndexScenario[] = [
    {
        name: 'medium buckets',
        keyCount: 1_000,
        pksPerKey: 100,
        readIterations: 200_000,
        updateIterations: 100_000,
    },
    {
        name: 'large buckets',
        keyCount: 200,
        pksPerKey: 1_000,
        readIterations: 80_000,
        updateIterations: 100_000,
    },
    {
        name: 'huge buckets',
        keyCount: 50,
        pksPerKey: 5_000,
        readIterations: 20_000,
        updateIterations: 100_000,
    },
];

function maybeGc(): void {
    const g = globalThis as unknown as { gc?: () => void };
    g.gc?.();
    g.gc?.();
}

function memoryMb(): number {
    return process.memoryUsage().heapUsed / 1024 / 1024;
}

function formatNumber(value: number): string {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatMs(value: number): string {
    return value.toLocaleString('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
    });
}

function formatMb(value: number): string {
    return value.toLocaleString('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
    });
}

function generateEntities(count: number): TOIMBenchEntity[] {
    const entities: TOIMBenchEntity[] = new Array(count);
    for (let i = 0; i < count; i++) {
        entities[i] = {
            id: i,
            category: i % 1_000,
            value: i,
            name: `Entity ${i}`,
        };
    }
    return entities;
}

function createPkBuckets(scenario: TOIMSlotIndexScenario): number[][] {
    const buckets: number[][] = new Array(scenario.keyCount);
    for (let key = 0; key < scenario.keyCount; key++) {
        const pks = new Array<number>(scenario.pksPerKey);
        const base = key * scenario.pksPerKey;
        for (let i = 0; i < scenario.pksPerKey; i++) {
            pks[i] = base + i;
        }
        buckets[key] = pks;
    }
    return buckets;
}

function measure<T>(name: string, operation: () => T): { result: T; time: number } {
    const startedAt = performance.now();
    const result = operation();
    return {
        name,
        result,
        time: performance.now() - startedAt,
    };
}

function benchmarkCurrentRead(
    scenario: TOIMSlotIndexScenario,
    buckets: number[][],
    collection: Map<number, TOIMBenchEntity>
): TOIMReadResult {
    const { result: checksum, time } = measure('current', () => {
        let sum = 0;
        for (let iteration = 0; iteration < scenario.readIterations; iteration++) {
            const bucket = buckets[iteration % scenario.keyCount];
            for (let i = 0; i < bucket.length; i++) {
                sum += collection.get(bucket[i])?.value ?? 0;
            }
        }
        return sum;
    });

    return {
        name: 'pk[] + collection Map.get',
        totalTime: time,
        opsPerSecond: scenario.readIterations / (time / 1_000),
        checksum,
    };
}

function benchmarkSlotRead(
    scenario: TOIMSlotIndexScenario,
    slotBuckets: TOIMSlot<TOIMBenchEntity>[][]
): TOIMReadResult {
    const { result: checksum, time } = measure('slot', () => {
        let sum = 0;
        for (let iteration = 0; iteration < scenario.readIterations; iteration++) {
            const bucket = slotBuckets[iteration % scenario.keyCount];
            for (let i = 0; i < bucket.length; i++) {
                sum += bucket[i].item?.value ?? 0;
            }
        }
        return sum;
    });

    return {
        name: 'slot[] -> slot.item',
        totalTime: time,
        opsPerSecond: scenario.readIterations / (time / 1_000),
        checksum,
    };
}

function benchmarkEntryRead(
    scenario: TOIMSlotIndexScenario,
    entryBuckets: TOIMIndexEntry<TOIMBenchEntity>[][]
): TOIMReadResult {
    const { result: checksum, time } = measure('entry', () => {
        let sum = 0;
        for (let iteration = 0; iteration < scenario.readIterations; iteration++) {
            const bucket = entryBuckets[iteration % scenario.keyCount];
            for (let i = 0; i < bucket.length; i++) {
                sum += bucket[i].item?.value ?? 0;
            }
        }
        return sum;
    });

    return {
        name: 'entry[] { pk, item }',
        totalTime: time,
        opsPerSecond: scenario.readIterations / (time / 1_000),
        checksum,
    };
}

function benchmarkCurrentUpdate(
    scenario: TOIMSlotIndexScenario,
    collection: Map<number, TOIMBenchEntity>,
    entityCount: number
): TOIMReadResult {
    const { result: checksum, time } = measure('current update', () => {
        let sum = 0;
        for (let i = 0; i < scenario.updateIterations; i++) {
            const pk = (i * 17) % entityCount;
            const prev = collection.get(pk);
            if (!prev) continue;
            const next = { ...prev, value: prev.value + 1 };
            collection.set(pk, next);
            sum += next.value;
        }
        return sum;
    });

    return {
        name: 'collection Map.set',
        totalTime: time,
        opsPerSecond: scenario.updateIterations / (time / 1_000),
        checksum,
    };
}

function benchmarkSlotUpdate(
    scenario: TOIMSlotIndexScenario,
    slotByPk: Map<number, TOIMSlot<TOIMBenchEntity>>,
    entityCount: number
): TOIMReadResult {
    const { result: checksum, time } = measure('slot update', () => {
        let sum = 0;
        for (let i = 0; i < scenario.updateIterations; i++) {
            const pk = (i * 17) % entityCount;
            const slot = slotByPk.get(pk);
            const prev = slot?.item;
            if (!slot || !prev) continue;
            const next = { ...prev, value: prev.value + 1 };
            slot.item = next;
            sum += next.value;
        }
        return sum;
    });

    return {
        name: 'slot Map.get + slot.item=',
        totalTime: time,
        opsPerSecond: scenario.updateIterations / (time / 1_000),
        checksum,
    };
}

function benchmarkEntryUpdate(
    scenario: TOIMSlotIndexScenario,
    entryByPk: Map<number, TOIMIndexEntry<TOIMBenchEntity>>,
    entityCount: number
): TOIMReadResult {
    const { result: checksum, time } = measure('entry update', () => {
        let sum = 0;
        for (let i = 0; i < scenario.updateIterations; i++) {
            const pk = (i * 17) % entityCount;
            const entry = entryByPk.get(pk);
            const prev = entry?.item;
            if (!entry || !prev) continue;
            const next = { ...prev, value: prev.value + 1 };
            entry.item = next;
            sum += next.value;
        }
        return sum;
    });

    return {
        name: 'entry Map.get + entry.item=',
        totalTime: time,
        opsPerSecond: scenario.updateIterations / (time / 1_000),
        checksum,
    };
}

function buildCurrent(
    entities: TOIMBenchEntity[],
    buckets: number[][]
): {
    collection: Map<number, TOIMBenchEntity>;
    buckets: number[][];
    build: TOIMBuildResult;
} {
    maybeGc();
    const before = memoryMb();
    const collection = new Map<number, TOIMBenchEntity>();
    for (const entity of entities) {
        collection.set(entity.id, entity);
    }
    const builtBuckets = buckets.map(bucket => bucket.slice());
    maybeGc();
    const after = memoryMb();

    return {
        collection,
        buckets: builtBuckets,
        build: {
            name: 'current: collection Map + pk[]',
            memoryMb: after - before,
            checksum: collection.size + builtBuckets.length,
        },
    };
}

function buildSlot(
    entities: TOIMBenchEntity[],
    buckets: number[][]
): {
    slotByPk: Map<number, TOIMSlot<TOIMBenchEntity>>;
    buckets: TOIMSlot<TOIMBenchEntity>[][];
    build: TOIMBuildResult;
} {
    maybeGc();
    const before = memoryMb();
    const slotByPk = new Map<number, TOIMSlot<TOIMBenchEntity>>();
    for (const entity of entities) {
        slotByPk.set(entity.id, { item: entity });
    }
    const slotBuckets = buckets.map(bucket =>
        bucket.map(pk => {
            const slot = slotByPk.get(pk);
            if (!slot) throw new Error(`Missing slot for pk ${pk}`);
            return slot;
        })
    );
    maybeGc();
    const after = memoryMb();

    return {
        slotByPk,
        buckets: slotBuckets,
        build: {
            name: 'slot: slot Map + slot[]',
            memoryMb: after - before,
            checksum: slotByPk.size + slotBuckets.length,
        },
    };
}

function buildEntry(
    entities: TOIMBenchEntity[],
    buckets: number[][]
): {
    entryByPk: Map<number, TOIMIndexEntry<TOIMBenchEntity>>;
    buckets: TOIMIndexEntry<TOIMBenchEntity>[][];
    build: TOIMBuildResult;
} {
    maybeGc();
    const before = memoryMb();
    const entryByPk = new Map<number, TOIMIndexEntry<TOIMBenchEntity>>();
    for (const entity of entities) {
        entryByPk.set(entity.id, { pk: entity.id, item: entity });
    }
    const entryBuckets = buckets.map(bucket =>
        bucket.map(pk => {
            const entry = entryByPk.get(pk);
            if (!entry) throw new Error(`Missing entry for pk ${pk}`);
            return entry;
        })
    );
    maybeGc();
    const after = memoryMb();

    return {
        entryByPk,
        buckets: entryBuckets,
        build: {
            name: 'entry: entry Map + entry[]',
            memoryMb: after - before,
            checksum: entryByPk.size + entryBuckets.length,
        },
    };
}

function printOperationResults(results: TOIMReadResult[], operationLabel: string): void {
    const baseline = results[0];
    for (const result of results) {
        const speedup = result.opsPerSecond / baseline.opsPerSecond;
        console.log(
            `  ${result.name}: ${formatMs(result.totalTime)}ms, ${formatNumber(
                result.opsPerSecond
            )} ${operationLabel}/sec, ${speedup.toFixed(2)}x baseline`
        );
    }
}

function printBuildResults(results: TOIMBuildResult[]): void {
    const baseline = results[0];
    for (const result of results) {
        const delta = result.memoryMb - baseline.memoryMb;
        console.log(
            `  ${result.name}: ${formatMb(result.memoryMb)}MB (${delta >= 0 ? '+' : ''}${formatMb(delta)}MB vs baseline)`
        );
    }
}

async function runSlotIndexReadBenchmarks(): Promise<void> {
    console.log('Slot-backed index read benchmark\n');
    console.log(
        'Run with `node --expose-gc --import tsx packages/core/bench/slot-index-read.bench.ts` for steadier memory numbers.\n'
    );

    for (const scenario of scenarios) {
        const entityCount = scenario.keyCount * scenario.pksPerKey;
        const entities = generateEntities(entityCount);
        const pkBuckets = createPkBuckets(scenario);

        console.log(
            `${scenario.name}: ${formatNumber(scenario.keyCount)} keys x ${formatNumber(
                scenario.pksPerKey
            )} pks (${formatNumber(entityCount)} entities)`
        );

        const current = buildCurrent(entities, pkBuckets);
        const slot = buildSlot(entities, pkBuckets);
        const entry = buildEntry(entities, pkBuckets);

        console.log('Memory after build:');
        printBuildResults([current.build, slot.build, entry.build]);

        console.log('Read by index key:');
        printOperationResults(
            [
                benchmarkCurrentRead(scenario, current.buckets, current.collection),
                benchmarkSlotRead(scenario, slot.buckets),
                benchmarkEntryRead(scenario, entry.buckets),
            ],
            'reads'
        );

        console.log('Update by pk:');
        printOperationResults(
            [
                benchmarkCurrentUpdate(scenario, current.collection, entityCount),
                benchmarkSlotUpdate(scenario, slot.slotByPk, entityCount),
                benchmarkEntryUpdate(scenario, entry.entryByPk, entityCount),
            ],
            'updates'
        );

        console.log();
    }
}

void runSlotIndexReadBenchmarks();
