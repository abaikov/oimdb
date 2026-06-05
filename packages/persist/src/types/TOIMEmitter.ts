import { TOIMPersistUnsubscribe } from './TOIMPersistUnsubscribe';

/**
 * Minimal structural shape of a core event emitter that this package relies on.
 * Kept intentionally narrow so every OIM emitter satisfies it.
 */
export type TOIMEmitter<TEvent extends PropertyKey> = {
    on(
        event: TEvent,
        handler: (...args: unknown[]) => void
    ): TOIMPersistUnsubscribe;
};
