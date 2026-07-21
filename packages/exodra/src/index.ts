// Core adapter
export { fromOimdb } from './fromOimdb';
export { fromSelector } from './fromSelector';
export { fromSelectorFactory } from './fromSelectorFactory';
export { fromComputed } from './fromComputed';
export { combine } from './combine';
export { isExoBindable } from './isExoBindable';

// Hook-mirror selectors → bindables
export { bindSelectors } from './bindSelectors';

// Low-level read/subscribe pairs (drop-in for an app's inline oimdb bridge)
export { readEntityByPk } from './readEntityByPk';
export { subscribeEntityByPk } from './subscribeEntityByPk';
export { readPksByIndexKey } from './readPksByIndexKey';
export { subscribePksByIndexKey } from './subscribePksByIndexKey';
export { readEntitiesByIndexKey } from './readEntitiesByIndexKey';
export { subscribeEntitiesByIndexKey } from './subscribeEntitiesByIndexKey';

// Identity-stable list children (snapshot path) + O(delta) command-stream path
export { keyedChildren } from './keyedChildren';
export { entityRows } from './entityRows';
export { listFromCommandStream } from './listFromCommandStream';

// Types & interfaces
export type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';
export type { IOIMExodraReadableCollection } from './interfaces/IOIMExodraReadableCollection';
export type { IOIMExodraSetBasedIndex } from './interfaces/IOIMExodraSetBasedIndex';
