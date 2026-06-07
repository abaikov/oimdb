import * as React from 'react';
import { render, act } from '@testing-library/react';
import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    createInPlaceEntityUpdater,
} from '@oimdb/core';
import { useSelectEntityByPk, useSelectEntityByPkSignal } from '../src/hooks';

interface User {
    id: string;
    name: string;
}

function makeQueue(): OIMEventQueue {
    return new OIMEventQueue({
        scheduler: new OIMEventQueueSchedulerImmediate(),
    });
}

function makeMutableUsers(queue: OIMEventQueue): OIMReactiveCollection<User, string> {
    return new OIMReactiveCollection<User, string>(queue, {
        selectPk: u => u.id,
        updateEntity: createInPlaceEntityUpdater<User>(),
    });
}

describe('signal binding + in-place (mutable) collections', () => {
    test('signal hook reflects an in-place mutation', () => {
        const queue = makeQueue();
        const users = makeMutableUsers(queue);
        users.upsertOne({ id: 'u1', name: 'Alice' });

        const seen: (string | undefined)[] = [];
        function View(): React.ReactElement {
            const u = useSelectEntityByPkSignal(users, 'u1');
            seen.push(u?.name);
            return <div>{u?.name}</div>;
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

    test('demonstrates WHY: the uSES hook stays stale on an in-place mutation', () => {
        const queue = makeQueue();
        const users = makeMutableUsers(queue);
        users.upsertOne({ id: 'u1', name: 'Alice' });

        const signalSeen: (string | undefined)[] = [];
        const usesSeen: (string | undefined)[] = [];
        function Signal(): React.ReactElement {
            const u = useSelectEntityByPkSignal(users, 'u1');
            signalSeen.push(u?.name);
            return <div>{u?.name}</div>;
        }
        function USES(): React.ReactElement {
            const u = useSelectEntityByPk(users, 'u1');
            usesSeen.push(u?.name);
            return <div>{u?.name}</div>;
        }

        render(
            <>
                <Signal />
                <USES />
            </>
        );

        act(() => {
            // In-place mutation: the entity reference does not change.
            users.upsertOneByPk('u1', { name: 'Mutated' });
            queue.flush();
        });

        // Signal binding re-renders and shows the new value...
        expect(signalSeen[signalSeen.length - 1]).toBe('Mutated');
        // ...while the value-comparing uSES binding bails on the unchanged
        // reference and never re-renders — which is exactly why a mutable
        // collection needs the signal binding.
        expect(usesSeen[usesSeen.length - 1]).toBe('Alice');

        queue.destroy();
    });

    test('unsubscribes on unmount', () => {
        const queue = makeQueue();
        const users = makeMutableUsers(queue);
        users.upsertOne({ id: 'u1', name: 'Alice' });

        function View(): React.ReactElement {
            const u = useSelectEntityByPkSignal(users, 'u1');
            return <div>{u?.name}</div>;
        }

        const { unmount } = render(<View />);
        expect(users.getHandlerCount('u1')).toBe(1);
        unmount();
        expect(users.getHandlerCount('u1')).toBe(0);
        queue.destroy();
    });

    test('re-subscribes when the pk changes', () => {
        const queue = makeQueue();
        const users = makeMutableUsers(queue);
        users.upsertMany([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);

        let value: string | undefined;
        function View({ pk }: { pk: string }): React.ReactElement {
            value = useSelectEntityByPkSignal(users, pk)?.name;
            return <div>{value}</div>;
        }

        const { rerender, unmount } = render(<View pk="u1" />);
        expect(value).toBe('Alice');
        expect(users.getHandlerCount('u1')).toBe(1);

        rerender(<View pk="u2" />);
        expect(users.getHandlerCount('u1')).toBe(0);
        expect(users.getHandlerCount('u2')).toBe(1);

        act(() => {
            users.upsertOneByPk('u2', { name: 'Bob 2' });
            queue.flush();
        });
        expect(value).toBe('Bob 2');

        unmount();
        queue.destroy();
    });
});
