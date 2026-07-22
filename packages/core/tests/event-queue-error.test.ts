import {
    OIMEventQueue,
    EOIMEventQueueEventType,
    TOIMFlushError,
} from '../src';

describe('OIMEventQueue flush error handling', () => {
    test('loud by default: a throwing task propagates out of flush()', () => {
        const queue = new OIMEventQueue();
        queue.enqueue(() => {
            throw new Error('boom');
        });
        expect(() => queue.flush()).toThrow('boom');
    });

    test('queue is not wedged after a task throws (state restored)', () => {
        const queue = new OIMEventQueue();
        queue.enqueue(() => {
            throw new Error('boom');
        });
        expect(() => queue.flush()).toThrow('boom');

        // Not stuck mid-flush, and the next flush runs normally.
        expect(queue.isInFlush).toBe(false);
        let ran = false;
        queue.enqueue(() => {
            ran = true;
        });
        queue.flush();
        expect(ran).toBe(true);
    });

    test('onError handles the error — flush() does NOT re-raise', () => {
        const seen: unknown[] = [];
        const queue = new OIMEventQueue({ onError: e => seen.push(e) });
        queue.enqueue(() => {
            throw new Error('handled');
        });
        expect(() => queue.flush()).not.toThrow();
        expect(seen).toHaveLength(1);
        expect((seen[0] as Error).message).toBe('handled');
    });

    test('one throwing task does not starve the others (isolation)', () => {
        const queue = new OIMEventQueue({ onError: () => {} });
        const ran: string[] = [];
        queue.enqueue(() => ran.push('a'));
        queue.enqueue(() => {
            throw new Error('b fails');
        });
        queue.enqueue(() => ran.push('c'));
        queue.flush();
        expect(ran).toEqual(['a', 'c']);
    });

    test('FLUSH_ERROR is emitted for tooling, regardless of onError', () => {
        const errors: TOIMFlushError[] = [];
        const queue = new OIMEventQueue({ onError: () => {} });
        queue.emitter.on(EOIMEventQueueEventType.FLUSH_ERROR, p =>
            errors.push(p)
        );
        queue.enqueue(() => {
            throw new Error('observed');
        });
        queue.flush();
        expect(errors).toHaveLength(1);
        expect((errors[0].error as Error).message).toBe('observed');
    });

    test('multiple errors with no handler surface as an AggregateError', () => {
        const queue = new OIMEventQueue();
        queue.enqueue(() => {
            throw new Error('e1');
        });
        queue.enqueue(() => {
            throw new Error('e2');
        });
        expect(() => queue.flush()).toThrow(AggregateError);
    });
});
