import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMIndexManualArrayBased } from '../src/core/OIMIndexManualArrayBased';
import { OIMIndexManualSetBased } from '../src/core/OIMIndexManualSetBased';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { OIMReactiveCollectionIndexManualArrayBased } from '../src/core/OIMReactiveCollectionIndexManualArrayBased';
import { OIMReactiveCollectionIndexManualSetBased } from '../src/core/OIMReactiveCollectionIndexManualSetBased';
import { TOIMAnyEntitySlot } from '../src/types/TOIMEntitySlot';

type TEntity = { id: number; value: number };

const ITEM_COUNT = 10_000;
const KEY_COUNT = 100;

function measure(name: string, fn: () => void): void {
    const start = performance.now();
    fn();
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)}ms`);
}

function makeSlots(): TOIMAnyEntitySlot<number>[] {
    const slots: TOIMAnyEntitySlot<number>[] = [];
    for (let i = 0; i < ITEM_COUNT; i++) {
        const id = i + 1;
        slots.push({ pk: id, item: { id, value: i } });
    }
    return slots;
}

function makeCollection(queue: OIMEventQueue): OIMReactiveCollection<TEntity, number> {
    const collection = new OIMReactiveCollection<TEntity, number>(queue, {
        selectPk: item => item.id,
    });
    const entities: TEntity[] = [];
    for (let i = 0; i < ITEM_COUNT; i++) {
        entities.push({ id: i + 1, value: i });
    }
    collection.upsertMany(entities);
    queue.flush();
    return collection;
}

function runRawSlotBench(): void {
    const slots = makeSlots();
    const setIndex = new OIMIndexManualSetBased<string, number>();
    const arrayIndex = new OIMIndexManualArrayBased<string, number>();

    measure('raw set index setSlots', () => {
        for (let key = 0; key < KEY_COUNT; key++) {
            setIndex.setSlots(`key${key}`, new Set(slots.slice(0, 100)));
        }
    });

    measure('raw array index setSlots', () => {
        for (let key = 0; key < KEY_COUNT; key++) {
            arrayIndex.setSlots(`key${key}`, slots.slice(0, 100));
        }
    });
}

function runCollectionBoundBench(): void {
    const queue = new OIMEventQueue();
    const collection = makeCollection(queue);
    const setIndex = new OIMReactiveCollectionIndexManualSetBased<
        string,
        number,
        TEntity
    >(queue, { collection });
    const arrayIndex = new OIMReactiveCollectionIndexManualArrayBased<
        string,
        number,
        TEntity
    >(queue, { collection });

    const pks = Array.from({ length: 100 }, (_, i) => i + 1);

    measure('collection set index setPks', () => {
        for (let key = 0; key < KEY_COUNT; key++) {
            setIndex.setPks(`key${key}`, pks);
        }
        queue.flush();
    });

    measure('collection array index setPks', () => {
        for (let key = 0; key < KEY_COUNT; key++) {
            arrayIndex.setPks(`key${key}`, pks);
        }
        queue.flush();
    });
}

export function runAllIndexBenchmarks(): void {
    runRawSlotBench();
    runCollectionBoundBench();
}
