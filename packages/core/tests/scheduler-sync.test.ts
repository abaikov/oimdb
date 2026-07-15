import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMEventQueueSchedulerFactory } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerFactory';
import { OIMEventQueueSchedulerSync } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerSync';
import { EOIMEventQueueEventType } from '../src/enums/EOIMEventQueueEventType';

describe('OIMEventQueueSchedulerSync', () => {
    test('delivers synchronously in the same call stack (no await)', () => {
        const queue = new OIMEventQueue({
            scheduler: new OIMEventQueueSchedulerSync(),
        });

        let ran = false;
        queue.enqueue(() => {
            ran = true;
        });

        // No microtask/await: the task already ran during enqueue.
        expect(ran).toBe(true);
        expect(queue.isEmpty).toBe(true);
    });

    test('does NOT coalesce — each scheduling write flushes separately', () => {
        const queue = new OIMEventQueue({
            scheduler: new OIMEventQueueSchedulerSync(),
        });

        let flushes = 0;
        const task = () => {
            flushes++;
        };

        // Each enqueue on an empty queue schedules → syncs a flush immediately.
        queue.enqueue(task);
        queue.enqueue(task);
        queue.enqueue(task);

        expect(flushes).toBe(3);
    });

    test('the factory produces a working sync scheduler', () => {
        const queue = new OIMEventQueue({
            scheduler: OIMEventQueueSchedulerFactory.createSync(),
        });
        const bySwitch = new OIMEventQueue({
            scheduler: OIMEventQueueSchedulerFactory.create('sync'),
        });

        let a = 0;
        let b = 0;
        queue.enqueue(() => {
            a++;
        });
        bySwitch.enqueue(() => {
            b++;
        });

        expect(a).toBe(1);
        expect(b).toBe(1);
    });

    test('reentrant enqueue from AFTER_FLUSH is safe (runs, no corruption)', () => {
        const queue = new OIMEventQueue({
            scheduler: new OIMEventQueueSchedulerSync(),
        });

        const order: string[] = [];
        let scheduledFollowUp = false;

        // Simulate an effect that, at AFTER_FLUSH, enqueues more work once.
        const unsub = queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            () => {
                if (scheduledFollowUp) return;
                scheduledFollowUp = true;
                queue.enqueue(() => order.push('follow-up'));
            }
        );

        queue.enqueue(() => order.push('initial'));
        unsub();

        expect(order).toEqual(['initial', 'follow-up']);
        expect(queue.isEmpty).toBe(true);
    });
});
