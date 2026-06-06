import * as React from 'react';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
} from '@oimdb/core';
import {
    useSelectEntityByPkFast,
    useSelectPksByIndexKeyArrayBasedFast,
} from '../src/hooks';

interface User {
    id: string;
    name: string;
}

function makeQueue(): OIMEventQueue {
    return new OIMEventQueue({ scheduler: new OIMEventQueueSchedulerImmediate() });
}

describe('fast binding', () => {
    test('reflects the current entity and re-renders on its change', () => {
        const queue = makeQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.upsertOne({ id: 'u1', name: 'Alice' });

        const seen: (string | undefined)[] = [];
        function View(): React.ReactElement {
            const user = useSelectEntityByPkFast(users, 'u1');
            seen.push(user?.name);
            return <div>{user?.name}</div>;
        }

        const { unmount } = render(<View />);
        expect(seen[seen.length - 1]).toBe('Alice');

        act(() => {
            users.upsertOneByPk('u1', { name: 'Alice 2' });
            queue.flush();
        });
        expect(seen[seen.length - 1]).toBe('Alice 2');

        unmount();
        queue.destroy();
    });

    test('does not re-render when the key fires but content is unchanged', () => {
        const queue = makeQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.upsertMany([
            { id: 'u1', name: 'A' },
            { id: 'u2', name: 'B' },
        ]);
        const index = new OIMReactiveCollectionIndexManualArrayBased<
            string,
            string,
            User
        >(queue, { collection: users });
        index.setPks('team', ['u1', 'u2']);

        let renderCount = 0;
        const refs: readonly string[][] = [];
        function View(): React.ReactElement {
            renderCount++;
            const pks = useSelectPksByIndexKeyArrayBasedFast(index, 'team');
            (refs as string[][]).push(pks as string[]);
            return <div>{pks.join(',')}</div>;
        }

        render(<View />);
        const rendersAfterMount = renderCount;
        const refAfterMount = refs[refs.length - 1];

        // Re-set the SAME pks: the key fires, but the content is identical.
        act(() => {
            index.setPks('team', ['u1', 'u2']);
            queue.flush();
        });

        // No extra render, and the returned reference is stable.
        expect(renderCount).toBe(rendersAfterMount);
        expect(refs[refs.length - 1]).toBe(refAfterMount);

        queue.destroy();
    });

    test('unsubscribes on unmount (no leaked handlers)', () => {
        const queue = makeQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.upsertOne({ id: 'u1', name: 'Alice' });

        function View(): React.ReactElement {
            const user = useSelectEntityByPkFast(users, 'u1');
            return <div>{user?.name}</div>;
        }

        const { unmount } = render(<View />);
        expect(users.getHandlerCount('u1')).toBe(1);

        unmount();
        expect(users.getHandlerCount('u1')).toBe(0);

        queue.destroy();
    });

    test('StrictMode double-mount stays correct and leak-free', () => {
        const queue = makeQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.upsertOne({ id: 'u1', name: 'Alice' });

        const seen: (string | undefined)[] = [];
        function View(): React.ReactElement {
            const user = useSelectEntityByPkFast(users, 'u1');
            useEffect(() => {
                seen.push(user?.name);
            });
            return <div>{user?.name}</div>;
        }

        const { unmount } = render(
            <React.StrictMode>
                <View />
            </React.StrictMode>
        );

        act(() => {
            users.upsertOneByPk('u1', { name: 'Bob' });
            queue.flush();
        });
        expect(seen[seen.length - 1]).toBe('Bob');
        // Exactly one live subscription despite StrictMode's mount/remount.
        expect(users.getHandlerCount('u1')).toBe(1);

        unmount();
        expect(users.getHandlerCount('u1')).toBe(0);
        queue.destroy();
    });

    test('re-subscribes when the pk changes', () => {
        const queue = makeQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.upsertMany([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);

        let value: string | undefined;
        function View({ pk }: { pk: string }): React.ReactElement {
            value = useSelectEntityByPkFast(users, pk)?.name;
            return <div>{value}</div>;
        }

        const { rerender, unmount } = render(<View pk="u1" />);
        expect(value).toBe('Alice');
        expect(users.getHandlerCount('u1')).toBe(1);

        rerender(<View pk="u2" />);
        expect(value).toBe('Bob');
        // Old key released, new key subscribed.
        expect(users.getHandlerCount('u1')).toBe(0);
        expect(users.getHandlerCount('u2')).toBe(1);

        // Updates to the new key are reflected; the old key is ignored.
        act(() => {
            users.upsertOneByPk('u2', { name: 'Bob 2' });
            queue.flush();
        });
        expect(value).toBe('Bob 2');

        unmount();
        queue.destroy();
    });
});
