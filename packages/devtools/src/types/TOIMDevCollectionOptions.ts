import { IOIMDevIndexLike } from '../interfaces/IOIMDevIndexLike';

export type TOIMDevCollectionOptions = {
    indexes?: Record<string, IOIMDevIndexLike>;
    /** fieldName → registered collection name (e.g. { assigneeId: 'users' }) */
    relations?: Record<string, string>;
    description?: string;
};
