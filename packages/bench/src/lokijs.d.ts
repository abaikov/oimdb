/**
 * LokiJS ships no type declarations and `@types/lokijs` is not a dependency
 * here, so `tsc --noEmit` failed on the one untyped import in the tree.
 *
 * DECLARED RATHER THAN INSTALLED: the adapter already writes out every shape it
 * uses (`TLokiDb`, `TLokiCollection`, `TLokiView`), so the only thing missing
 * was a name for the constructor — and a `@types` dependency would type the
 * whole library rather than the six methods this benchmark touches.
 *
 * The constructor is deliberately loose; the adapter narrows it to its own
 * `TLokiDb`, which is where the real shape is stated and checked.
 */
declare module 'lokijs' {
    export default class Loki {
        constructor(filename?: string, options?: Record<string, unknown>);
    }
}
