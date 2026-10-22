import { OIMDB, createOIMEntityService } from '@oimdb/core';
import { OIMDevRegistry } from '../src';

type TUser = { id: string; visits: number };

const HISTORY_LIMIT = 50;

describe('a history keeps only the newest fifty', () => {
    test('a flush past the fiftieth drops the oldest record and keeps the newest first', () => {
        const db = new OIMDB();
        const usersService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
        const users = usersService.createStoreSlot(db);
        const registry = new OIMDevRegistry();
        registry.collection('users', usersService, users);
        const stop = registry.trackFlushes(db);

        for (let visit = 1; visit <= HISTORY_LIMIT + 1; visit++) {
            usersService.slotContentService.upsertEntity(users, { id: `u${visit}`, visits: visit });
            db.flush();
        }

        const history = registry.inspect().history;
        expect(history).toHaveLength(HISTORY_LIMIT);
        expect(history[0].counts['users']).toBe(HISTORY_LIMIT + 1);
        expect(history[HISTORY_LIMIT - 1].counts['users']).toBe(2);
        stop();
    });

    test('an error past the fiftieth drops the oldest message and keeps the newest first', () => {
        const registry = new OIMDevRegistry();

        for (let failure = 1; failure <= HISTORY_LIMIT + 1; failure++) registry.recordError(new Error(`failure ${failure}`));

        const errors = registry.inspect().errors;
        expect(errors).toHaveLength(HISTORY_LIMIT);
        expect(errors[0].message).toBe(`failure ${HISTORY_LIMIT + 1}`);
        expect(errors[HISTORY_LIMIT - 1].message).toBe('failure 2');
    });
});
