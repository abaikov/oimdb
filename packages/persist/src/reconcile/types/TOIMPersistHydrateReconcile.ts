export type TOIMPersistHydrateReconcile<TSnapshot> = (currentSnapshot: TSnapshot, incomingSnapshot: TSnapshot) => TSnapshot;
