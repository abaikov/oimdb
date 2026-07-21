import { IOIMDisposable } from '../interfaces/IOIMDisposable';

/**
 * A unit of teardown a dispose scope can hold: either an object with `destroy()`
 * (collection, index, object, stream, effect, computed…) or a bare unsubscribe
 * function — the `() => void` returned by `subscribeOnKey`, `emitter.on`,
 * `selector.watch`, `runtime.schedule`, etc. Many resources (selectors, per-key
 * subscriptions, scheduler tasks) expose ONLY the function form.
 */
export type TOIMDisposable = IOIMDisposable | (() => void);
