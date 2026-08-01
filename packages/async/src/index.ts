/**
 * `@oimdb/async` is deprecated and no longer maintained.
 *
 * It carried async variants of the collection and index — `OIMCollectionAsync`,
 * `OIMReactiveCollectionAsync`, `OIMPkIndexManualAsync` and friends — built when
 * the store itself was expected to be asynchronous. That turned out to be the
 * wrong seam. A reactive store's job is to hold what the application already has
 * and to report changes to it synchronously; waiting on I/O belongs to whatever
 * fetches or persists, not to the collection that answers reads. Making the
 * collection async pushed a promise into every read and, with it, a whole
 * parallel set of primitives that had to be kept in step with the synchronous
 * ones forever.
 *
 * Use `@oimdb/core` and keep the asynchrony outside it: await your I/O, then
 * write the result into a normal collection. For persistence and hydration use
 * `@oimdb/persist`, which is built for exactly that boundary.
 *
 * Nothing is exported here. The package remains published so existing installs
 * keep resolving; it will not receive further releases.
 */
export {};
