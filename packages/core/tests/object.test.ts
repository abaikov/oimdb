import { OIMObject } from '../src/core/OIMObject';
import { EOIMObjectEventType } from '../src/enum/EOIMObjectEventType';
import { OIMUpdateEventCoalescerObject } from '../src/core/OIMUpdateEventCoalescerObject';
import { EOIMUpdateEventCoalescerEventType } from '../src/enum/EOIMUpdateEventCoalescerEventType';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMUpdateEventEmitter } from '../src/core/OIMUpdateEventEmitter';
import { OIMReactiveObject } from '../src/core/OIMReactiveObject';
import { OIMObjectStoreRecordDriven } from '../src/core/OIMObjectStoreRecordDriven';

describe('OIMObject', () => {
    test('should emit UPDATE with keys on setProperty/delete/clear', () => {
        const obj = new OIMObject<string, number>();
        const updates: string[][] = [];

        obj.emitter.on(EOIMObjectEventType.UPDATE, payload => {
            updates.push([...payload.keys]);
        });

        obj.setProperty('a', 1);
        obj.delete('a');
        obj.clear();

        expect(updates).toEqual([['a'], ['a'], []]);

        obj.destroy();
    });

    test('should emit UPDATE with keys on merge', () => {
        const obj = new OIMObject<string, number>();
        const handler = jest.fn();

        obj.emitter.on(EOIMObjectEventType.UPDATE, payload => {
            handler(payload.keys);
        });

        obj.merge({ a: 1, b: 2 });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(['a', 'b']);

        obj.destroy();
    });
});

describe('OIMUpdateEventCoalescerObject', () => {
    test('should track updated keys when object is updated', () => {
        const obj = new OIMObject<string, number>();
        const coalescer = new OIMUpdateEventCoalescerObject(obj.emitter);

        obj.setProperty('a', 1);
        obj.setProperty('b', 2);

        const updatedKeys = coalescer.getUpdatedKeys();
        expect(updatedKeys.has('a')).toBe(true);
        expect(updatedKeys.has('b')).toBe(true);
        expect(updatedKeys.size).toBe(2);

        coalescer.destroy();
        obj.destroy();
    });

    test('should emit HAS_CHANGES only once for multiple updates', () => {
        const obj = new OIMObject<string, number>();
        const coalescer = new OIMUpdateEventCoalescerObject(obj.emitter);
        const changesSpy = jest.fn();

        coalescer.emitter.on(
            EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
            changesSpy
        );

        obj.setProperty('a', 1);
        obj.setProperty('b', 2);
        obj.setProperty('a', 3);

        expect(changesSpy).toHaveBeenCalledTimes(1);

        coalescer.destroy();
        obj.destroy();
    });
});

describe('OIMReactiveObject', () => {
    test('should notify subscribers on key updates (via queue.flush())', () => {
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<string, number>(queue);

        const handlerA = jest.fn();
        const handlerB = jest.fn();

        obj.updateEventEmitter.subscribeOnKey('a', handlerA);
        obj.updateEventEmitter.subscribeOnKey('b', handlerB);

        obj.setProperty('a', 1);
        queue.flush();

        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).not.toHaveBeenCalled();

        obj.updateEventEmitter.destroy();
        obj.coalescer.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('should coalesce multiple updates to same key into one notification per flush', () => {
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<string, number>(queue);

        const handler = jest.fn();
        obj.updateEventEmitter.subscribeOnKey('a', handler);

        obj.setProperty('a', 1);
        obj.setProperty('a', 2);
        obj.setProperty('a', 3);

        queue.flush();
        expect(handler).toHaveBeenCalledTimes(1);

        obj.updateEventEmitter.destroy();
        obj.coalescer.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('should call handler once per updated key when subscribed on multiple keys', () => {
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<string, number>(queue);

        const handler = jest.fn();
        obj.updateEventEmitter.subscribeOnKeys(['a', 'b', 'c'], handler);

        obj.merge({ a: 1, c: 3 });
        queue.flush();

        expect(handler).toHaveBeenCalledTimes(2);

        obj.updateEventEmitter.destroy();
        obj.coalescer.destroy();
        obj.destroy();
        queue.destroy();
    });
});

describe('OIMObjectStoreRecordDriven', () => {
    test('should support basic operations and isolate getAll() result', () => {
        const store = new OIMObjectStoreRecordDriven<'a' | 'b', number>({
            a: 1,
        });

        expect(store.get('a')).toBe(1);

        store.setProperty('b', 2);
        expect(store.get('b')).toBe(2);

        const all = store.getAll();
        all.a = 999;
        expect(store.get('a')).toBe(1);

        store.delete('a');
        expect(store.get('a')).toBeUndefined();

        store.clear();
        expect(store.count()).toBe(0);

        store.destroy();
    });
});


