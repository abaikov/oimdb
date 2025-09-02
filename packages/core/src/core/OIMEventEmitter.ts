import { TOIMEventHandler } from '../types/TOIMEventHandler';

// Performance-optimized bucket: O(1) removal, O(n) iteration with minimal overhead
type TOIMEventBucket<T, K extends keyof T> = {
    handlers: Array<TOIMEventHandler<T[K]> | null>; // Sparse array for O(1) removal
    indexByHandler: Map<TOIMEventHandler<T[K]>, number>; // O(1) lookup for removal
    tombstoneCount: number; // Track fragmentation for compaction decisions
    isEmitting: number; // Reentrancy guard for safe cleanup
};

export class OIMEventEmitter<T extends Record<string, unknown>> {
    private buckets: Partial<{ [K in keyof T]: TOIMEventBucket<T, K> }> = {};

    private getOrCreateBucket<K extends keyof T>(
        event: K
    ): TOIMEventBucket<T, K> {
        let bucket = this.buckets[event];
        if (!bucket) {
            bucket = {
                handlers: [],
                indexByHandler: new Map<TOIMEventHandler<T[K]>, number>(),
                tombstoneCount: 0,
                isEmitting: 0,
            };
            this.buckets[event] = bucket;
        }
        return bucket;
    }

    private compactBucket<K extends keyof T>(
        bucket: TOIMEventBucket<T, K>
    ): void {
        const handlers = bucket.handlers;
        const length = handlers.length;
        const newHandlers: Array<TOIMEventHandler<T[K]>> = [];

        bucket.indexByHandler.clear();
        // Pre-size array if we know most handlers are valid
        if (bucket.tombstoneCount < length >> 2) {
            newHandlers.length = length - bucket.tombstoneCount;
        }

        let writeIndex = 0;
        for (let i = 0; i < length; i++) {
            const handler = handlers[i];
            if (handler) {
                newHandlers[writeIndex] = handler;
                bucket.indexByHandler.set(handler, writeIndex);
                writeIndex++;
            }
        }

        // Trim if we pre-sized
        if (newHandlers.length !== writeIndex) {
            newHandlers.length = writeIndex;
        }

        bucket.handlers = newHandlers;
        bucket.tombstoneCount = 0;
    }

    on<K extends keyof T>(event: K, handler: TOIMEventHandler<T[K]>): void {
        const bucket = this.getOrCreateBucket(event);
        if (bucket.indexByHandler.has(handler)) return;
        const index = bucket.handlers.length;
        bucket.handlers.push(handler);
        bucket.indexByHandler.set(handler, index);
    }

    emit<K extends keyof T>(event: K, payload: T[K]): void {
        const bucket = this.buckets[event];
        if (!bucket) return;
        const handlers = bucket.handlers;
        const length = handlers.length;
        if (length === 0) return;

        bucket.isEmitting++;
        // Hot path: simple for loop with cached length
        for (let i = 0; i < length; i++) {
            const handler = handlers[i];
            if (handler) handler(payload);
        }
        bucket.isEmitting--;

        // Cleanup only when not emitting and significant fragmentation
        if (bucket.isEmitting === 0 && bucket.tombstoneCount > 0) {
            if (bucket.tombstoneCount >= length >> 1) {
                this.compactBucket(bucket);
            } else if (length === bucket.tombstoneCount) {
                // All handlers removed - delete bucket
                delete this.buckets[event];
            }
        }
    }

    off<K extends keyof T>(event: K, handler: TOIMEventHandler<T[K]>): void {
        const bucket = this.buckets[event];
        if (!bucket) return;
        const index = bucket.indexByHandler.get(handler);
        if (index === undefined) return;

        // Remove handler (guaranteed to exist if index found)
        bucket.handlers[index] = null;
        bucket.tombstoneCount++;
        bucket.indexByHandler.delete(handler);

        // Immediate cleanup if not emitting
        if (bucket.isEmitting === 0) {
            const length = bucket.handlers.length;
            if (bucket.tombstoneCount >= length >> 1) {
                this.compactBucket(bucket);
            } else if (length === bucket.tombstoneCount) {
                // All handlers removed - delete bucket
                delete this.buckets[event];
            }
        }
    }

    offAll<K extends keyof T>(event?: K): void {
        if (event !== undefined) {
            delete this.buckets[event];
        } else {
            this.buckets = {};
        }
    }
}
