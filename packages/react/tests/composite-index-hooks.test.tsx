import * as React from 'react';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    createOIMCollectionIndexFactory,
} from '@oimdb/core';
import {
    useSelectEntitiesByCompositeIndexKeySetBased,
    useSelectPksByCompositeIndexKeyArrayBased,
} from '../src/hooks';

interface Member {
    id: string;
    name: string;
}

describe('composite (key-path) index hooks', () => {
    let queue: OIMEventQueue;
    let members: OIMReactiveCollection<Member, string>;

    beforeEach(() => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        queue = new OIMEventQueue({ scheduler });
        members = new OIMReactiveCollection<Member, string>(queue, {
            selectPk: m => m.id,
        });
        members.upsertMany([
            { id: 'm1', name: 'Alice' },
            { id: 'm2', name: 'Bob' },
        ]);
    });

    afterEach(() => {
        queue.destroy();
    });

    test('reads entities and re-renders only on relevant changes', () => {
        const indexFactory = createOIMCollectionIndexFactory(queue, members);
        const index = indexFactory.compositeSetIndex();
        act(() => {
            index.setPks(['p1', 'admin'], ['m1', 'm2']);
            queue.flush();
        });

        let renderCount = 0;
        let latest: readonly (Member | undefined)[] | undefined;

        const Scope = () => {
            renderCount++;
            // A FRESH key-path array on every render — must stay stable by content.
            latest = useSelectEntitiesByCompositeIndexKeySetBased(
                members,
                index,
                ['p1', 'admin']
            );
            return <div>{latest?.map(m => m?.name).join(',')}</div>;
        };

        render(<Scope />);
        expect(latest).toEqual([
            { id: 'm1', name: 'Alice' },
            { id: 'm2', name: 'Bob' },
        ]);
        const rendersAfterMount = renderCount;

        // A change to an UNRELATED key path must not re-render this scope.
        act(() => {
            index.setPks(['p2', 'member'], ['m1']);
            queue.flush();
        });
        expect(renderCount).toBe(rendersAfterMount);

        // A relevant entity change re-renders and reflects the new value.
        act(() => {
            members.upsertOneByPk('m1', { name: 'Alicia' });
            queue.flush();
        });
        expect(latest).toEqual([
            { id: 'm1', name: 'Alicia' },
            { id: 'm2', name: 'Bob' },
        ]);
        expect(renderCount).toBe(rendersAfterMount + 1);
    });

    test('array-based hook preserves order for a key path', () => {
        const indexFactory = createOIMCollectionIndexFactory(queue, members);
        const index = indexFactory.compositeArrayIndex();
        act(() => {
            index.setPks(['c1', 't1'], ['m2', 'm1']);
            queue.flush();
        });

        let pks: readonly string[] | undefined;
        const Scope = () => {
            pks = useSelectPksByCompositeIndexKeyArrayBased(index, ['c1', 't1']);
            return null;
        };
        render(<Scope />);
        expect(pks).toEqual(['m2', 'm1']);
    });
});
