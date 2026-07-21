import { IOIMDisposable } from '../interfaces/IOIMDisposable';
import { TOIMDisposable } from '../types/TOIMDisposable';

/**
 * Collects disposables and tears them ALL down at once, in reverse registration
 * (LIFO) order — so dependents are disposed before the things they depend on
 * (indexes/streams/selectors before the collection, the collection before the
 * queue). This is the correct teardown order in oimdb, and doing it by hand is
 * the classic source of leaks and use-after-destroy bugs.
 *
 * Register as you build, capturing the value inline:
 *
 * ```ts
 * const scope = new OIMDisposeScope();
 * const queue = scope.add(new OIMEventQueue());
 * const users = scope.add(new OIMReactiveCollection(queue, { selectPk: u => u.id }));
 * const byTeam = scope.add(users.indexFactory.setBasedIndex());
 * scope.add(selector.watch(v => render(v)));   // bare unsubscribe fn also works
 * // …later, one call tears everything down, LIFO:
 * scope.destroy();
 * ```
 *
 * Accepts both `{ destroy(): void }` objects and bare `() => void` unsubscribe
 * functions (selectors, per-key subscriptions and scheduler tasks only expose
 * the latter). Idempotent; every registered item is disposed even if one throws
 * (the first error is rethrown afterwards). Nestable via `child()`.
 */
export class OIMDisposeScope implements IOIMDisposable {
    private readonly disposables: TOIMDisposable[] = [];
    private disposed = false;

    /** Number of not-yet-disposed items currently held. */
    public get size(): number {
        return this.disposables.length;
    }

    public get isDisposed(): boolean {
        return this.disposed;
    }

    /**
     * Register a disposable (object with `destroy()` or an unsubscribe function)
     * and return it unchanged, so it can be captured inline. If the scope is
     * already disposed the item is disposed immediately, so nothing leaks.
     */
    public add<T extends TOIMDisposable>(disposable: T): T {
        if (this.disposed) {
            this.disposeOne(disposable);
            return disposable;
        }
        this.disposables.push(disposable);
        return disposable;
    }

    /** A nested scope, itself registered here — dispose it early or with the parent. */
    public child(): OIMDisposeScope {
        return this.add(new OIMDisposeScope());
    }

    /**
     * Dispose everything in reverse registration order, then clear. Idempotent.
     * If any `destroy()`/unsubscribe throws, the rest are still disposed and the
     * first error is rethrown once teardown completes.
     */
    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;

        let firstError: unknown;
        let hasError = false;
        for (let i = this.disposables.length - 1; i >= 0; i--) {
            try {
                this.disposeOne(this.disposables[i]);
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        }
        this.disposables.length = 0;

        if (hasError) throw firstError;
    }

    private disposeOne(disposable: TOIMDisposable): void {
        if (typeof disposable === 'function') disposable();
        else disposable.destroy();
    }
}

export function createOIMDisposeScope(): OIMDisposeScope {
    return new OIMDisposeScope();
}
