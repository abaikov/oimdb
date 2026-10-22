/**
 * Devtools against the real engine.
 *
 * Every fixture here is an actual `OIMDB` with actual populations, bucket
 * collections and derivations. Hand-written literals shaped like collections
 * would touch no core type, so nothing in the suite could fail when those types
 * changed. A registry whose whole
 * job is to report the engine's state has to be tested against the engine's
 * state.
 */
import type {
    TOIMBucketSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
    TOIMStoreSlot,
    TOIMBucketSlotsSetStore,
    TOIMComputedSlot,
    TOIMEntityColumnName,
    TOIMSingleSlotStore,
    TOIMSlotStoreTree,
} from '@oimdb/core';
import {
    OIMDB,
    OIMEffectService,
    OIMDefaults,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceSingleSlotDriven,
    OIMSlotStoreServiceTreeDriven,
    createOIMBucketService,
    createOIMComputedService,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    oimSameValueZeroGuard,
    oimIsSlotEmpty,
    type IOIMEntityWriter,
} from '@oimdb/core';
import { OIMDevRegistry } from '../src';

type TUser = { id: string; name: string; role: string };
type TRoom = { id: string; label: string };
type TEnrollment = { userId: string; roomId: string; since: number };

type TUserSlot = TOIMEntitySlot<TUser>;
type TUserSlots = TOIMBucketSlotsSetStore<TUserSlot>;
type TRoleBucket = TOIMBucketSlot<TUserSlots, TOIMStoreKey>;
type TEnrollmentSlot = TOIMEntitySlot<TEnrollment, readonly TOIMEntitySlot[]>;

/** The write stack that makes a collection deliver — every fixture uses it. */
const delivering = (): IOIMEntityWriter =>
    createOIMEntityWriterInPlace();

/**
 * A database with no scheduler: every frame in this file is asked for by hand.
 *
 * A bucket's slots are the caller's. A write moves a value and touches no bucket, so
 * the fixture keeps the roles it has filed and re-files them itself after every
 * `put` and every `drop` — which is what an application does, and what
 * `put`/`drop` stand in for here. A role that lost its last row is emptied by
 * hand and its hold given back, which is what lets the bucket collection unfile
 * the bucket.
 */
const createRoleBucketService = (db: OIMDB) => createOIMBucketService<
    TUserSlot, TOIMStoreKey, TUserSlots, OIMSlotContentBucketServiceSetDriven<TUserSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TUserSlot>() });

function buildUsers() {
    const db = new OIMDB();
    const usersService = createOIMEntityService<TUser>(db, { keyOf: (u) => u.id, entityWriter: delivering() });
    const users = usersService.createStoreSlot(db);

    const byRoleService = createRoleBucketService(db);
    const byRole = byRoleService.createStoreSlot(db);

    const everyRoleService = createRoleBucketService(db);
    const everyRole = everyRoleService.createStoreSlot(db);
    const everyUserBucket = everyRoleService.holdSlotByKey(everyRole, 'every');
    const byRoleIndex = { bucketCollectionService: byRoleService, bucketStoreSlot: byRole };

    /** What the application intends the population to be, kept beside it. */
    const present = new Map<string, TUser>();
    /** The buckets this fixture is holding, so an empty one is not unfiled under it. */
    const filedRoles = new Map<string, TRoleBucket>();

    const refile = (): void => {
        const wanted = new Map<string, TOIMEntitySlot<TUser>[]>();
        for (const user of present.values()) {
            const slot = usersService.findSlotByKey(users, user.id);
            if (slot === undefined) continue;
            const inRole = wanted.get(user.role);
            if (inRole === undefined) wanted.set(user.role, [slot]);
            else inRole.push(slot);
        }
        for (const [role, bucket] of Array.from(filedRoles)) {
            if (wanted.has(role)) continue;
            byRoleService.slotContentService.clearBucketMemberSlots(bucket);
            bucket.owner.unholdSlot(bucket);
            filedRoles.delete(role);
        }
        for (const [role, inRole] of wanted) {
            let bucket = filedRoles.get(role);
            if (bucket === undefined) {
                bucket = byRoleService.holdSlotByKey(byRole, role);
                filedRoles.set(role, bucket);
            }
            byRoleService.slotContentService.writeBucketMemberSlots(bucket, inRole);
        }
        const everyPresentSlot: TOIMEntitySlot<TUser>[] = [];
        for (const inRole of wanted.values()) everyPresentSlot.push(...inRole);
        everyRoleService.slotContentService.writeBucketMemberSlots(everyUserBucket, everyPresentSlot);
    };

    const put = (...entities: readonly TUser[]): void => {
        for (const user of entities) present.set(user.id, user);
        usersService.slotContentService.upsertEntities(users, entities);
        refile();
    };

    const drop = (id: string): void => {
        present.delete(id);
        const slot = usersService.findSlotByKey(users, id);
        if (slot !== undefined) usersService.slotContentService.deleteEntity(slot);
        refile();
    };

    return { db, usersService, users, byRoleIndex, everyUserBucket, put, drop };
}

function buildEnrollments() {
    const db = new OIMDB();
    const usersService = createOIMEntityService<TUser>(db, { keyOf: (u) => u.id, entityWriter: delivering() });
    const users = usersService.createStoreSlot(db);
    const roomsService = createOIMEntityService<TRoom>(db, { keyOf: (r) => r.id, entityWriter: delivering() });
    const rooms = roomsService.createStoreSlot(db);
    const enrollmentsService = createOIMEntityService<
        TEnrollment, TOIMEntityColumnName<TEnrollment>, readonly TOIMEntitySlot[], TOIMSlotStoreTree<TEnrollmentSlot, TOIMEntitySlot>
    >(db, {
        entitySlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TEnrollmentSlot>(
            OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue(),
        ),
        keyOf: (m): readonly TOIMEntitySlot[] => [
            usersService.holdSlotByKey(users, m.userId),
            roomsService.holdSlotByKey(rooms, m.roomId),
        ],
        entityWriter: delivering(),
    });
    const enrollments = enrollmentsService.createStoreSlot(db);
    return { db, usersService, users, roomsService, rooms, enrollmentsService, enrollments };
}

/**
 * How many rows this collection holds a value for, as a derivation. A collection
 * is not a slot, so what the derivation watches is the bucket every present row
 * is filed into.
 */
function countOf(
    everyUserBucket: TRoleBucket,
    usersService: ReturnType<typeof buildUsers>['usersService'],
    users: TOIMStoreSlot<Map<TOIMStoreKey, TOIMEntitySlot<TUser, TOIMStoreKey>>, TOIMEntitySlot<TUser, TOIMStoreKey>, Partial<TUser>>,
    db: OIMDB,
) {
    const nonEmptyRows = (): number => {
        let count = 0;
        for (const slot of usersService.getSlots(users)) if (!oimIsSlotEmpty(slot)) count++;
        return count;
    };
    const countService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const count = countService.createComputedStoreSlot(db, nonEmptyRows, () => ({ sourceSlots: [everyUserBucket] }));
    return { countService, count };
}

describe('OIMDevRegistry — populations', () => {
    test('a registered population reports its rows, their keys and their entities', () => {
        const { db, usersService, users, put } = buildUsers();
        const reg = new OIMDevRegistry();
        put(
            { id: 'u1', name: 'Alice', role: 'admin' },
            { id: 'u2', name: 'Bob', role: 'member' },
        );
        db.flush();

        reg.collection('users', usersService, users);

        const info = reg.inspect().collections['users'];
        expect(info.count).toBe(2);
        expect(info.samplePks).toEqual(['u1', 'u2']);
        expect(info.sampleEntity).toEqual({ id: 'u1', name: 'Alice', role: 'admin' });
        expect(info.entities).toEqual([
            { id: 'u1', name: 'Alice', role: 'admin' },
            { id: 'u2', name: 'Bob', role: 'member' },
        ]);
    });

    /**
     * The whole reason this package exists. Registration hands the registry a
     * READ of the population, not a copy of it — so a write and a frame after
     * the fact show up, and a report taken later is a report of the engine as
     * it is now.
     */
    test('the report follows the engine after a write and a flush', () => {
        const { db, usersService, users, byRoleIndex, put, drop } = buildUsers();
        const reg = new OIMDevRegistry();
        put({ id: 'u1', name: 'Alice', role: 'admin' });
        db.flush();

        reg.collection('users', usersService, users, { indexes: { byRole: byRoleIndex } });
        expect(reg.inspect().collections['users'].count).toBe(1);
        expect(reg.inspect().collections['users'].indexes['byRole'].keys).toEqual(['admin']);

        put({ id: 'u2', name: 'Bob', role: 'member' });
        db.flush();

        const after = reg.inspect().collections['users'];
        expect(after.count).toBe(2);
        expect(after.samplePks).toEqual(['u1', 'u2']);
        expect([...after.indexes['byRole'].keys].sort()).toEqual(['admin', 'member']);

        drop('u1');
        db.flush();

        const emptied = reg.inspect().collections['users'];
        expect(emptied.count).toBe(1);
        expect(emptied.samplePks).toEqual(['u2']);
        expect(emptied.indexes['byRole'].keys).toEqual(['member']);
    });

    test('a key-addressed bucket collection reports one entry per bucket it holds', () => {
        const { db, usersService, users, byRoleIndex, put } = buildUsers();
        const reg = new OIMDevRegistry();
        put(
            { id: 'u1', name: 'Alice', role: 'admin' },
            { id: 'u2', name: 'Bob', role: 'member' },
            { id: 'u3', name: 'Carol', role: 'member' },
        );
        db.flush();

        reg.collection('users', usersService, users, { indexes: { byRole: byRoleIndex } });

        const index = reg.inspect().collections['users'].indexes['byRole'];
        expect(index.keyCount).toBe(2);
        expect([...index.keys].sort()).toEqual(['admin', 'member']);
    });

    /**
     * Filing is not deferred: `write` unlinks, links and writes inside the
     * call, and refuses to run inside a frame at all. So the slots a report
     * shows are whatever the last write into the bucket collection made them, and
     * there is no flush between the two for it to be waiting on.
     */
    test('a bucket collection reports the slots written into it, with no frame in between', () => {
        const { byRoleIndex, usersService, users, put } = buildUsers();
        const reg = new OIMDevRegistry();
        reg.collection('users', usersService, users, { indexes: { byRole: byRoleIndex } });

        put({ id: 'u1', name: 'Alice', role: 'admin' });
        // No flush.
        expect(reg.inspect().collections['users'].indexes['byRole'].keys).toEqual(['admin']);
    });

    /**
     * A population addressed by a chain of identities has no scalar key on its
     * rows — two chains ending on the same identity are two different addresses.
     * The registry reports the keys of the identities in the chain, in order,
     * which is the one name a reader could resolve back.
     *
     * A chain-addressed BUCKET collection cannot be registered at all:
     * `TOIMDevCollectionOptions.indexes` is typed over `OIMSlotCollectionService<TOIMStoreKey, …>`,
     * so core refuses one at compile time rather than offering a read that
     * throws.
     */
    test('a chain-addressed population reports the identities of each row, in order', () => {
        const { db, usersService, users, roomsService, rooms, enrollmentsService, enrollments } = buildEnrollments();
        const reg = new OIMDevRegistry();
        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', role: 'admin' });
        roomsService.slotContentService.upsertEntity(rooms, { id: 'r1', label: 'General' });
        enrollmentsService.slotContentService.upsertEntity(enrollments, { userId: 'u1', roomId: 'r1', since: 7 });
        db.flush();

        reg.collection('enrollments', enrollmentsService, enrollments);

        const info = reg.inspect().collections['enrollments'];
        expect(info.count).toBe(1);
        expect(info.samplePks).toEqual([['u1', 'r1']]);
        expect(info.sampleEntity).toEqual({ userId: 'u1', roomId: 'r1', since: 7 });
    });

    test('relations and description come back out of inspect()', () => {
        const { db, usersService, users, byRoleIndex } = buildUsers();
        const reg = new OIMDevRegistry();
        db.flush();

        reg.collection('users', usersService, users, {
            indexes: { byRole: byRoleIndex },
            relations: { teamId: 'teams' },
            description: 'App users',
        });

        const info = reg.inspect().collections['users'];
        expect(info.relations).toEqual({ teamId: 'teams' });
        expect(info.description).toBe('App users');
    });

    test('samplePks caps at 5 while entities keeps every row', () => {
        const { db, usersService, users, put } = buildUsers();
        const reg = new OIMDevRegistry();
        put(...Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, name: `n${i}`, role: 'member' })));
        db.flush();

        reg.collection('users', usersService, users);

        const info = reg.inspect().collections['users'];
        expect(info.samplePks).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
        expect(info.count).toBe(10);
        expect(info.entities).toHaveLength(10);
    });

    test('an empty population reports a null sample', () => {
        const { db, usersService, users } = buildUsers();
        const reg = new OIMDevRegistry();
        db.flush();

        reg.collection('users', usersService, users);

        const info = reg.inspect().collections['users'];
        expect(info.count).toBe(0);
        expect(info.sampleEntity).toBeNull();
        expect(info.entities).toEqual([]);
    });

    test('collection() is chainable and keeps registration order', () => {
        const { db, usersService, users } = buildUsers();
        const roomsService = createOIMEntityService<TRoom>(db, { keyOf: (r) => r.id, entityWriter: delivering() });
        const rooms = roomsService.createStoreSlot(db);
        const reg = new OIMDevRegistry();

        reg.collection('users', usersService, users).collection('rooms', roomsService, rooms);

        expect(Object.keys(reg.inspect().collections)).toEqual(['users', 'rooms']);
    });
});

describe('OIMDevRegistry — computeds', () => {
    /**
     * A derivation is produced by the READ that asks for it, and the registry's
     * report is one of those. So there is no window in which the report lags the
     * engine: it answers what the graph would answer to anybody asking at that
     * instant, before a frame as much as after one.
     */
    test('a computed reports what the graph answers at the moment of the report', () => {
        const { db, usersService, users, everyUserBucket, put } = buildUsers();
        const reg = new OIMDevRegistry();
        const userCount = countOf(everyUserBucket, usersService, users, db);

        reg.computed('userCount', userCount.countService, userCount.count);
        expect(reg.inspect().computeds['userCount'].currentValue).toBe(0);

        put(
            { id: 'u1', name: 'Alice', role: 'admin' },
            { id: 'u2', name: 'Bob', role: 'member' },
        );
        expect(reg.inspect().computeds['userCount'].currentValue).toBe(2);

        db.flush();
        expect(reg.inspect().computeds['userCount'].currentValue).toBe(2);
    });

    test('computed() is chainable and an empty registry reports no computeds', () => {
        const { db, usersService, users, everyUserBucket } = buildUsers();
        const reg = new OIMDevRegistry();
        const total = countOf(everyUserBucket, usersService, users, db);

        expect(new OIMDevRegistry().inspect().computeds).toEqual({});

        reg.computed('a', total.countService, total.count).computed('b', total.countService, total.count);
        expect(Object.keys(reg.inspect().computeds)).toEqual(['a', 'b']);
    });
});

describe('OIMDevRegistry — frames and errors', () => {
    test('trackFlushes() records one entry per flush, newest first, until disposed', () => {
        const { db, usersService, users, put } = buildUsers();
        const reg = new OIMDevRegistry();
        reg.collection('users', usersService, users);

        const stop = reg.trackFlushes(db);

        put({ id: 'u1', name: 'Alice', role: 'admin' });
        db.flush();
        put({ id: 'u2', name: 'Bob', role: 'member' });
        db.flush();

        const history = reg.inspect().history;
        expect(history).toHaveLength(2);
        expect(history[0].counts['users']).toBe(2);
        expect(history[1].counts['users']).toBe(1);

        stop();
        put({ id: 'u3', name: 'Carol', role: 'member' });
        db.flush();
        expect(reg.inspect().history).toHaveLength(2);
    });

    /**
     * The engine's error hook is a CONSTRUCTION option, so nothing can
     * subscribe to it after the fact. The registry is a sink the caller wires
     * from the error policy's `onError`, and this test wires it the way the README
     * says to.
     */
    test('recordError() surfaces what a subscriber threw during a frame', () => {
        const reg = new OIMDevRegistry();
        const db = new OIMDB({ errorPolicy: { onErrorCaught: (error: unknown) => { reg.recordError(error); } } });
        const usersService = createOIMEntityService<TUser>(db, { keyOf: (u) => u.id, entityWriter: delivering() });
        const users = usersService.createStoreSlot(db);

        const heldSlot = usersService.holdSlotByKey(users, 'u1');
        const effectService = OIMEffectService.INSTANCE;
        const effect = effectService.createEffect(db, [heldSlot], [], () => { throw new Error('boom'); });
        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', role: 'admin' });
        db.flush();

        const errors = reg.inspect().errors;
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe('boom');
        expect(typeof errors[0].time).toBe('number');

        effectService.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    test('recordError() reports a thrown non-Error as its string form', () => {
        const reg = new OIMDevRegistry();

        reg.recordError('disk is on fire');

        expect(reg.inspect().errors[0].message).toBe('disk is on fire');
    });
});

describe('OIMDevRegistry — output', () => {
    test('dumpString() prints every fact the registry holds about a population', () => {
        const { db, usersService, users, byRoleIndex, everyUserBucket, put } = buildUsers();
        const reg = new OIMDevRegistry();
        const userCount = countOf(everyUserBucket, usersService, users, db);

        put(
            { id: 'u1', name: 'Alice', role: 'admin' },
            { id: 'u2', name: 'Bob', role: 'member' },
        );
        db.flush();

        reg.collection('users', usersService, users, {
            indexes: { byRole: byRoleIndex },
            relations: { teamId: 'teams' },
            description: 'App users',
        }).computed('userCount', userCount.countService, userCount.count);

        const printed = reg.dumpString();
        expect(printed).toContain('users (2 entities)');
        expect(printed).toContain('description: App users');
        expect(printed).toContain('fields:      id, name, role');
        expect(printed).toContain('byRole (2 keys)');
        expect(printed).toContain('teamId → teams');
        expect(printed).toContain('userCount');
        expect(printed).toContain('value: 2');
        // A derivation has no state to report beside its value: it is settled by
        // the read that asks for it.
        expect(printed).not.toContain('not computed yet');
        expect(printed).not.toContain('stale');
    });

    test('dump() prints what dumpString() built', () => {
        const { db, usersService, users, put } = buildUsers();
        const reg = new OIMDevRegistry();
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- the spy must stay silent; the test reads what was logged instead.
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        put({ id: 'u1', name: 'Alice', role: 'admin' });
        db.flush();

        reg.collection('users', usersService, users);
        reg.dump();

        expect(consoleSpy).toHaveBeenCalledWith(reg.dumpString());
        consoleSpy.mockRestore();
    });

    test('an empty registry reports nothing rather than failing', () => {
        const reg = new OIMDevRegistry();

        expect(reg.inspect()).toEqual({ collections: {}, computeds: {}, history: [], errors: [] });
        expect(reg.dumpString()).toBe('[OIMDB DevRegistry]');
    });

    test('the exported registry is one shared instance, not a fresh one per import', () => {
        // `oimDevRegistry` is the singleton apps reach for from the console. What
        // matters is not its class but that a second import sees the same
        // registrations — a factory export would type-check identically and
        // silently hand every caller its own empty registry.
        const { db, usersService, users, put } = buildUsers();
        put({ id: 'u1', name: 'Alice', role: 'admin' });
        db.flush();

        // eslint-disable-next-line @typescript-eslint/no-var-requires -- two independent imports is the whole assertion.
        const { oimDevRegistry } = require('../src') as { oimDevRegistry: OIMDevRegistry };
        oimDevRegistry.collection('shared-users', usersService, users);

        // eslint-disable-next-line @typescript-eslint/no-var-requires -- see above.
        const { oimDevRegistry: sameRegistry } = require('../src') as { oimDevRegistry: OIMDevRegistry };
        expect(sameRegistry.inspect().collections['shared-users'].count).toBe(1);
    });
});
