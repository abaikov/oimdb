import { TOIMPersistStrategy } from '../types/TOIMPersistStrategy';

/**
 * Type-erased view of an OIMPersistResource.
 *
 * A single OIMPersistor holds many resources, each with its own independent
 * source/persisted snapshot types. TypeScript has no existential types, so it
 * cannot express "an array where every element carries its own type triple".
 * The orchestrator therefore works against this erased view: the two snapshot
 * types collapse to `unknown`, while the persistor type — shared by every
 * resource registered in the same persistor — is preserved as TPersistor.
 *
 * This is sound because a snapshot only ever flows within its own resource
 * (takeSnapshot -> strategy.write, strategy.read -> applySnapshot); it never
 * crosses from one resource to another, so the erased `unknown` is never
 * observed across a type boundary. The same holds for deltas.
 */
export interface IOIMAnyPersistResource<TPersistor> {
    readonly strategy: TOIMPersistStrategy<TPersistor, unknown>;
    takeSnapshot(): unknown;
    /**
     * Build a delta (erased `TOIMPersistDelta`) for the given changed keys.
     * Only valid when `supportsDelta()` is true.
     */
    takeDelta(keys: readonly unknown[]): unknown;
    /**
     * Whether this resource can persist changes as a delta — its source is
     * key-aware AND its strategy implements `writeDelta`.
     */
    supportsDelta(): boolean;
    applySnapshot(snapshot: unknown): void;
    /**
     * Begin tracking source changes. `onDirty` is called with the changed keys
     * when they are available (delta-capable resources) or with no argument for
     * a coarse "something changed" signal (whole-snapshot resources).
     */
    start(onDirty: (keys?: readonly unknown[]) => void): void;
    stop(): void;
}
