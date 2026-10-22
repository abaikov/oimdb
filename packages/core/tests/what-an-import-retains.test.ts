/**
 * WHAT A CONSUMER RETAINS BY IMPORTING ONE NAME — asserted, not hoped for.
 *
 * A consumer who never sorts a bucket must never ship the ordered service, and a
 * consumer who never groups anything must ship no bucket machinery at all. That
 * property is bought by making every strategy an ARGUMENT rather than an
 * `order?` option the callee branches on — because an optional argument the
 * callee branches on names both services from both paths and is a tree-shaking
 * barrier, since a bundler cannot see past a runtime test.
 *
 * THE ENTRY POINTS. `engine/channel/OIMChannelService.ts` is what every consumer
 * has, `facade/*` is what they reach for, `factories/*` is what they opt into —
 * and the rule is unchanged: what the unavoidable module drags, everybody ships.
 *
 * It is a property that decays SILENTLY. One `import { X }` where
 * `import type { X }` was meant, or one convenience reaching for a strategy
 * from a module everyone already has, and the whole closure comes back. Nothing
 * else in this repository would notice: the types still check, every test still
 * passes, and the only symptom is a number in someone else's bundle.
 *
 * WHY A STATIC READ AND NOT A BUILD. A byte budget over a real bundle measures
 * the symptom and needs a build, a bundler and a threshold that drifts. This
 * measures the CAUSE — module reachability through value imports — in
 * milliseconds, with no toolchain, and it names the offending import when it
 * fails instead of reporting that a number grew. `import type` is erased by the
 * compiler and is therefore free; only value imports are followed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const SRC = join(__dirname, '..', 'src');

const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (path.endsWith('.ts')) found.push(path);
        }
    };
    walk(SRC);
    return found;
};

/**
 * The value imports of one module, resolved to absolute paths.
 *
 * Three things are deliberately NOT followed, because a bundler does not follow
 * them either: a whole-clause `import type`, a brace clause whose every slot
 * is `type X`, and anything resolving outside this package.
 */
const valueImportsOf = (file: string): string[] => {
    const text = readFileSync(file, 'utf8');
    const out: string[] = [];
    const pattern = /^import\s+(type\s+)?([\s\S]*?)from\s+'([^']+)'/gm;
    let match = pattern.exec(text);
    while (match !== null) {
        const isTypeOnly = match[1] !== undefined;
        const clause = match[2];
        const specifier = match[3];
        const braced = clause.match(/\{([\s\S]*)\}/);
        const everySlotIsAType = braced !== null
            && braced[1].split(',').map(part => part.trim()).filter(Boolean).length > 0
            && braced[1].split(',').map(part => part.trim()).filter(Boolean)
                .every(name => name.startsWith('type '));
        if (!isTypeOnly && !everySlotIsAType && specifier.startsWith('.')) {
            out.push(`${resolve(dirname(file), specifier)}.ts`);
        }
        match = pattern.exec(text);
    }
    return out;
};

const graph = new Map(sourceFiles().map(file => [file, valueImportsOf(file)]));

/** Every module a bundler must keep, given that this one is kept. */
const retainedBy = (entry: string): Set<string> => {
    const seen = new Set<string>();
    const pending = [join(SRC, entry)];
    while (pending.length > 0) {
        const file = pending.pop() as string;
        if (seen.has(file) || !graph.has(file)) continue;
        seen.add(file);
        for (const next of graph.get(file) as string[]) pending.push(next);
    }
    return seen;
};

const retains = (entry: string, module: string): boolean => retainedBy(entry).has(join(SRC, module));

const relative = (files: Set<string>): string[] => [...files].map(file => file.slice(SRC.length + 1)).sort();

/** The ordered service and the modules only it reaches. */
const ORDERED = [
    'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts',
    'engine/bucket/array/utils/oimAssertWholePosition.ts',
    'engine/bucket/array/OIMBucketArrayMembershipNonUnique.ts',
];

/** Every strategy a caller may construct — none of which anybody must ship. */
const STRATEGIES = [
    'engine/store/OIMSlotStoreServiceMapDriven.ts',
    'engine/store/OIMSlotStoreServiceTreeDriven.ts',
    'facade/bucket/OIMSlotContentBucketServiceSetDriven.ts',
    'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts',
    'facade/bucket/OIMSlotContentBucketServiceSortedArrayDriven.ts',
    'engine/bucket/array/OIMBucketArrayMembershipUnique.ts',
];

/** The lazy-getter module every default now comes from. */
const DEFAULTS = 'factories/OIMDefaults.ts';

/** The runtime — the module every consumer of this package has. */
const RUNTIME = 'engine/channel/OIMChannelService.ts';
/** The root — the module a caller who wires nothing of their own imports. */
const ROOT = 'factories/OIMDB.ts';
/** The doors: one module each, and none of them anybody else's cost. */
const DOORS = [
    'factories/createOIMEntityService.ts',
    'factories/createOIMSingleEntityService.ts',
    'factories/createOIMBucketService.ts',
    'factories/createOIMSingleBucketService.ts',
    'factories/createOIMIndexService.ts',
    'factories/createOIMIndexServiceByCompositeKey.ts',
    'factories/createOIMIndexServiceSortedArrayDriven.ts',
    'factories/createOIMComputedService.ts',
    'factories/createOIMComputedServiceSorted.ts',
    'factories/createOIMComputedServiceBucketMemo.ts',
];
/** The collection a consumer reaches for to hold records by key. */
const COLLECTION = 'facade/slot/OIMSlotCollectionService.ts';
/** What keeps records in an entity slot. */
const ENTITY_CONTENT = 'engine/entity/OIMSlotContentEntityService.ts';
/** What keeps member slots in a bucket slot: the base every bucket strategy extends. */
const BUCKETS = 'facade/bucket/OIMSlotContentBucketService.ts';

describe('what an import retains', () => {
    it('names only modules that exist', () => {
        const named = [...ORDERED, ...STRATEGIES, DEFAULTS, RUNTIME, ROOT, ...DOORS, COLLECTION, ENTITY_CONTENT, BUCKETS];
        expect(named.filter(module => !existsSync(join(SRC, module)))).toEqual([]);
    });

    it.each(ORDERED)(
        'a collection alone does not retain %s',
        module => { expect(retains(COLLECTION, module)).toBe(false); },
    );

    it.each(ORDERED)(
        'the bucket base does not retain %s — the service is an argument, not an option',
        module => { expect(retains(BUCKETS, module)).toBe(false); },
    );

    it('the bucket base names no strategy, the column store included', () => {
        for (const strategy of STRATEGIES) {
            expect({ strategy, retained: retains(BUCKETS, strategy) }).toEqual({ strategy, retained: false });
        }
    });

    it('a collection and the entity content retain no strategy, the column store included', () => {
        for (const strategy of STRATEGIES) {
            expect({ strategy, retained: retains(COLLECTION, strategy) }).toEqual({ strategy, retained: false });
            expect({ strategy, retained: retains(ENTITY_CONTENT, strategy) }).toEqual({ strategy, retained: false });
        }
        expect(retains(COLLECTION, BUCKETS)).toBe(false);
        expect(retains(ENTITY_CONTENT, BUCKETS)).toBe(false);
    });

    it('the runtime does not retain the collection or the entity content', () => {
        expect(retains(RUNTIME, COLLECTION)).toBe(false);
        expect(retains(RUNTIME, ENTITY_CONTENT)).toBe(false);
    });

    /**
     * THE RUNTIME IS THE MODULE NOBODY CAN AVOID. Every consumer package imports
     * it, and a class's methods cannot be dropped one at a time, so a single
     * `new X` inside one of them ships X to every application whether or not any
     * line they wrote can reach it.
     *
     * That is why this package's ordered-list diff is a free function and not a
     * method. What that costs in bytes was measured by bundling the same
     * application with and without an ordered list: +655 B gzipped and +1 607 B
     * minified, 5.3% and 3.6% of the package, in
     * `packages/bench/measurements/2026-08-21-bundle/ordered-list/`.
     */
    it.each([
        ['engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts', 'the ordered-list diff — +655 B gzipped, 5.3% of the package'],
    ])('the runtime alone does not retain %s (%s)', module => {
        expect(retains(RUNTIME, module)).toBe(false);
    });

    /**
     * THE WHOLE CLOSURE OF THE RUNTIME, named rather than counted, so that
     * anything ADDED to it is a decision somebody made on purpose.
     */
    it('the runtime retains only the frame, the graph and the subscribers', () => {
        expect(relative(retainedBy(RUNTIME)))
            .toEqual([
                'engine/channel/OIMChannelService.ts',
                'engine/channel/constants/OIM_REVISIONS_PER_EPOCH.ts',
                'engine/channel/utils/oimIsRevisionAfter.ts',
                'engine/collector/OIMUnusedSlotCollectorService.ts',
                'engine/schedule/OIMFlushSchedulerService.ts',
                'engine/slot/constants/OIM_SLOT_FLAG_RELEASED.ts',
                'engine/slot/utils/oimUnholdSlotIfAlive.ts',
            ]);
    });

    it.each(DOORS)('the root does not retain %s', door => {
        expect(retains(ROOT, door)).toBe(false);
    });

    it.each([
        COLLECTION,
        ENTITY_CONTENT,
        BUCKETS,
        'facade/bucket/OIMBucketCommands.ts',
        'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts',
        'facade/bucket/OIMSlotContentBucketServiceSetDriven.ts',
        'engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts',
    ])('the root does not retain %s — a door is a module, not a method', module => {
        expect(retains(ROOT, module)).toBe(false);
    });

    it('the root retains the runtime, the data it mints and their defaults, and nothing else', () => {
        expect(relative(retainedBy(ROOT))).toEqual([
            ROOT,
            ...relative(retainedBy(RUNTIME)),
            'engine/channel/OIMChannelQueue.ts',
            'engine/channel/utils/createOIMChannelSlot.ts',
            'engine/collector/utils/createOIMCollectorSlot.ts',
            'engine/collector/utils/createOIMReleaseSlotCollectorSlot.ts',
            'engine/collector/utils/createOIMUnusedSlotCollectorSlot.ts',
            'engine/error/OIMErrorPolicyLogAndContinue.ts',
            'engine/schedule/constants/OIM_NOTHING_TO_DISPOSE.ts',
            'engine/schedule/constants/OIM_TIMER_ON_TIMEOUT.ts',
            'engine/schedule/utils/oimTimerOfChannelScheduler.ts',
        ].sort());
    });

    it.each(DOORS)('%s retains the class it builds and the root only as a type', door => {
        expect(retains(door, ROOT)).toBe(false);
        expect(retainedBy(door).size).toBeGreaterThan(1);
    });

    /**
     * AND IT RETAINS ITS DEFAULT MEMBERSHIP AND NOT THE OTHER ONE — the shape of
     * a fork shipped as an argument, checked rather than asserted in prose.
     */
    it('the ordered service retains its default membership and no other', () => {
        expect(retains('facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts', 'engine/bucket/array/OIMBucketArrayMembershipNonUnique.ts'))
            .toBe(true);
        expect(retains('facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts', 'engine/bucket/array/OIMBucketArrayMembershipUnique.ts'))
            .toBe(false);
        expect(retains('engine/bucket/array/OIMBucketArrayMembershipUnique.ts', 'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts'))
            .toBe(false);
    });

    /** The reader is checking a real graph, not an empty one. */
    it('reads a graph with something in it', () => {
        expect(graph.size).toBeGreaterThan(50);
        expect(retains('factories/createOIMEntityService.ts', ENTITY_CONTENT)).toBe(true);
        expect(retains('factories/createOIMEntityService.ts', 'engine/slot/OIMSlotOwnerService.ts')).toBe(true);
        expect(retains(BUCKETS, 'engine/bucket/utils/createOIMBucketSlot.ts')).toBe(true);
        expect(retains(COLLECTION, 'engine/slot/utils/createOIMStoreSlot.ts')).toBe(true);
        expect(retains('facade/index/OIMIndexService.ts', BUCKETS)).toBe(false);
        expect(retains('factories/createOIMIndexService.ts', 'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts')).toBe(true);
        expect(retains('engine/store/OIMSlotStoreServiceTreeDriven.ts', 'engine/key/OIMKeyTreeWalkComposite.ts'))
            .toBe(false);
        expect(retains('engine/store/OIMSlotStoreServiceTreeDriven.ts', 'engine/key/OIMKeyTreeWalkScalar.ts'))
            .toBe(false);
        expect(retains('engine/store/OIMSlotStoreServiceMapDriven.ts', 'engine/key/OIMKeyTreeWalkComposite.ts'))
            .toBe(false);
    });

    /**
     * Each default is one OIMDefaultValue in its own file under `factories/defaults/`,
     * whose value is built on first getValue(); `OIMDefaults` holds all of them and is
     * the one door that retains every arm.
     */
    it('a default is one door to its own arm, and the defaults class to all of them', () => {
        expect(retains(DEFAULTS, 'engine/key/OIMKeyTreeWalkComposite.ts')).toBe(true);
        expect(retains(DEFAULTS, 'engine/key/OIMKeyTreeWalkScalar.ts')).toBe(true);
        expect(retains(COLLECTION, 'engine/key/OIMKeyTreeWalkComposite.ts')).toBe(false);
        expect(retains(COLLECTION, 'engine/key/OIMKeyTreeWalkScalar.ts')).toBe(false);
    });
});
