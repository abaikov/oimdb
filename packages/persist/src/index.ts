// --- Core engine ---
export { OIMPersistor } from './core/OIMPersistor';
export { OIMPersistResource } from './core/OIMPersistResource';

// --- Interfaces ---
export type { IOIMAnyPersistResource } from './interfaces/IOIMAnyPersistResource';

// --- Contracts / types ---
export type { TOIMPersistUnsubscribe } from './types/TOIMPersistUnsubscribe';
export type { TOIMPersistCodec } from './types/TOIMPersistCodec';
export type { TOIMPersistSourceAdapter } from './types/TOIMPersistSourceAdapter';
export type { TOIMPersistStrategy } from './types/TOIMPersistStrategy';
export type { TOIMPersistResourceOptions } from './types/TOIMPersistResourceOptions';
export type { TOIMPersistorOptions } from './types/TOIMPersistorOptions';
export type { TOIMPersistErrorContext } from './types/TOIMPersistErrorContext';
export type { TOIMPersistHydrateReconcile } from './types/TOIMPersistHydrateReconcile';
export type { TOIMEmitter } from './types/TOIMEmitter';

// --- Snapshot shapes ---
export type { TOIMCollectionPersistSnapshot } from './types/TOIMCollectionPersistSnapshot';
export type { TOIMObjectPersistSnapshot } from './types/TOIMObjectPersistSnapshot';
export type { TOIMIndexPersistSnapshot } from './types/TOIMIndexPersistSnapshot';

// --- Source shapes ---
export type { TOIMCollectionPersistSource } from './types/TOIMCollectionPersistSource';
export type { TOIMObjectPersistSource } from './types/TOIMObjectPersistSource';
export type { TOIMSetIndexPersistSource } from './types/TOIMSetIndexPersistSource';
export type { TOIMArrayIndexPersistSource } from './types/TOIMArrayIndexPersistSource';
export type { TOIMOrderedArrayIndexPersistSource } from './types/TOIMOrderedArrayIndexPersistSource';

// --- Source adapters ---
export { createCollectionSourceAdapter } from './adapters/createCollectionSourceAdapter';
export { createObjectSourceAdapter } from './adapters/createObjectSourceAdapter';
export { createSetIndexSourceAdapter } from './adapters/createSetIndexSourceAdapter';
export { createArrayIndexSourceAdapter } from './adapters/createArrayIndexSourceAdapter';
export { createOrderedArrayIndexSourceAdapter } from './adapters/createOrderedArrayIndexSourceAdapter';

// --- Hydration reconcilers ---
export { byPk } from './reconcile/byPk';

// --- Versioned codec ---
export { createVersionedCodec } from './utils/createVersionedCodec';
export type { TOIMVersionedPersistedShape } from './types/TOIMVersionedPersistedShape';
export type { TOIMVersionedCodecOptions } from './types/TOIMVersionedCodecOptions';
