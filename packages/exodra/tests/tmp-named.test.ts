import { OIMEventQueue, createOIMCollectionKit } from '@oimdb/core';

type Task = { id: string; status: string; assignee: string; label: string };

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

test('cost of projecting a key object into a key path', () => {
    const queue = new OIMEventQueue();
    const kit = createOIMCollectionKit<Task, string>(queue, {
        selectPk: t => t.id,
    });
    const byParams = kit.indexFactory.compositeSetIndex();
    kit.collection.upsertOne({
        id: 't1',
        status: 'open',
        assignee: 'u1',
        label: 'bug',
    });
    byParams.setPks(['open', 'u1', 'bug'], ['t1']);
    queue.flush();

    const path = ['open', 'u1', 'bug'] as const;
    const names = ['status', 'assignee', 'label'] as const;
    const keyObject = { status: 'open', assignee: 'u1', label: 'bug' };

    const N = 500_000;
    const time = (fn: () => void) => {
        for (let i = 0; i < 50_000; i++) fn(); // warm up
        const runs: number[] = [];
        for (let r = 0; r < 5; r++) {
            const t0 = process.hrtime.bigint();
            for (let i = 0; i < N; i++) fn();
            runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
        }
        return median(runs);
    };

    const direct = time(() => {
        byParams.getPksByKey(path as unknown as string[]);
    });

    const projected = time(() => {
        const p: string[] = new Array(names.length);
        for (let i = 0; i < names.length; i++) {
            p[i] = (keyObject as Record<string, string>)[names[i]];
        }
        byParams.getPksByKey(p);
    });

    // eslint-disable-next-line no-console
    console.log(
        `lookup with a ready path = ${((direct * 1e6) / N).toFixed(0)}ns  |  ` +
            `projecting {obj} → path then looking up = ${((projected * 1e6) / N).toFixed(0)}ns  ` +
            `(+${(((projected - direct) * 1e6) / N).toFixed(0)}ns)`
    );
    expect(true).toBe(true);
});
