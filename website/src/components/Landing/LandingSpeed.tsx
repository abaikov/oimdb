import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import {
    benchPrices,
    benchResults,
    formatMs,
    HAND_WRITTEN_STORE_NOTE,
    runsOurHandWrittenStore,
    type BenchPricePair,
    type BenchRow,
} from '@site/src/components/Bench/data';
import Reveal, { useRevealed } from './Reveal';
import styles from './styles.module.css';

type TOperation = {
    pairId: string;
    title: string;
    ours: string;
    handWritten: string;
    buys?: string;
};

type TShownOperation = TOperation & {
    pair: BenchPricePair;
};

type TStoryText = {
    title: string;
    what: string;
};

type TStory = TStoryText & {
    scenario: string;
    oimdbRow: BenchRow;
    handWrittenRow: BenchRow | undefined;
    rivalRow: BenchRow | undefined;
    targetRow: BenchRow;
    targetName: string;
};

const HEADLINE_OPERATIONS: TOperation[] = [
    {
        pairId: 'find.vs-map-get',
        title: 'to read',
        ours: 'entityService.slotContentService.findEntityByKey(storeSlot, id)',
        handWritten: 'map.get(id)',
        buys: 'The same Map lookup, one call deeper.',
    },
    {
        pairId: 'update.entity-column-vs-tracked-store',
        title: 'to update',
        ours: "entityService.slotContentService.updateEntityColumn(slot, 'title', value)",
        handWritten: 'if (entity.title !== value) { entity.title = value; if (frameOf[i] !== frame) { frameOf[i] = frame; changed.push(i) } }',
        buys: 'Both compare the column with its old value, write it and add the entity to the frame’s list of changed entities once, guarded by a per-entity frame stamp. The extra time is what lets db.flush() reach every list and component watching that entity.',
    },
    {
        pairId: 'upsert.insert-by-reference-vs-map-set',
        title: 'to insert',
        ours: 'entityService.slotContentService.upsertEntity(storeSlot, entity)',
        handWritten: 'if (!map.get(id)) map.set(id, entity)',
        buys: 'The extra time registers the entity so a component can subscribe to it, and announces the insert at db.flush() to every list and component watching the collection.',
    },
];

const OPERATIONS: TOperation[] = [
    {
        pairId: 'remove.vs-map-delete',
        title: 'to delete',
        ours: 'entityService.slotContentService.deleteEntity(slot)',
        handWritten: 'map.delete(id)',
        buys: 'With a plain Map nothing tells the component, so it keeps showing the deleted object. Here it gets undefined at the next db.flush().',
    },
    {
        pairId: 'memberCount.vs-set-size',
        title: 'to count a list',
        ours: 'index.getBucketMemberSlotCount(bucket)',
        handWritten: 'set.size',
        buys: 'The same Set read. A list here is an index, like tasks grouped by columnId.',
    },
    {
        pairId: 'subscribe.by-key.deliver-vs-changed-ids-at-flush',
        title: 'to update by id and notify the watching component',
        ours: 'entityService.slotContentService.updateEntity(slot, patch); db.flush()',
        handWritten: 'a Set of changed ids and a Map of handlers per id, called at flush',
    },
];

const STORY_TEXTS: Record<string, TStoryText> = {
    patchColumn: {
        title: 'Edit a field on a live list',
        what: 'A card’s text changes. The list that shows it re-renders; a list over another group is not even woken.',
    },
    moveGroup: {
        title: 'Drag a card to another column',
        what: 'It leaves one list and lands at the top of another. Both lists update in the same frame.',
    },
    sortKeyMove: {
        title: 'Reorder by priority',
        what: 'A card changes priority inside the visible window. Only the order changes.',
    },
    moveAndReorder: {
        title: 'Drop a card mid-list',
        what: 'It changes column and position in one step and lands in the middle of the other list.',
    },
    batchInsert: {
        title: 'Load the first page',
        what: 'Ten thousand entities arrive at once in an empty store, and both lists fill.',
    },
    insertIntoPopulated: {
        title: 'Add to a full store',
        what: 'A hundred new entities land in a store of ten thousand, fifty sorted groups and live subscribers.',
    },
    growUnderSubscription: {
        title: 'Load in batches under live subscriptions',
        what: 'Batch after batch arrives under live subscriptions until the store is forty per cent larger.',
    },
    consumerPerGroup: {
        title: 'Fifty columns on screen',
        what: 'Every group has its own subscriber. A reorder in one column wakes that column and no other.',
    },
    resortWindow: {
        title: 'Re-sort the whole visible list',
        what: 'Every card in view gets a new rank in one frame, and the list comes back in a new order.',
    },
    mixedFrame: {
        title: 'A mixed frame',
        what: 'Inserts, deletes, edits, moves between columns and reorders, all in one frame.',
    },
    batchPatch: {
        title: 'Sync a server response',
        what: 'A thousand entities across the store change in one batch, as a sync or a bulk edit does.',
    },
    batchPatchNote: {
        title: 'Change data nobody shows',
        what: 'A thousand entities change a field no view reads. Nothing on screen re-renders.',
    },
    patchMostRows: {
        title: 'Change half the store',
        what: 'Half of ten thousand entities change in one frame, and both views redraw.',
    },
    readByKey: {
        title: 'Read a page by key',
        what: 'A page of entities fetched by ID from the whole population and rendered.',
    },
    filterTwoAxes: {
        title: 'Filter on two conditions',
        what: 'Two views over one group; only the view whose filter an edit touches is woken.',
    },
    scrollWindow: {
        title: 'Scroll a list',
        what: 'The visible window moves over a group; nothing is written.',
    },
    deepScroll: {
        title: 'Scroll deep into a long list',
        what: 'The window jumps far from the top of a large group.',
    },
    viewSwitch: {
        title: 'Switch tabs',
        what: 'A view re-points at another group, the way a tab or a filter changes.',
    },
    coldStart: {
        title: 'Open the app',
        what: 'From nothing: create the store and both lists, subscribe them, load every entity and render the first page.',
    },
    tearDown: {
        title: 'Close the screen',
        what: 'A full store with both lists and every subscription is disposed, and nothing renders afterwards.',
    },
    churnColumn: {
        title: 'Components that watch one field',
        what: 'Components mount and unmount, each subscribed to a single field of an entity rather than the whole entity.',
    },
    compositeKeyWrite: {
        title: 'Write by a two-part key',
        what: 'A record identified by an (owner, item) pair is found and changed; only the view showing it updates.',
    },
    relationWrite: {
        title: 'Rename a related entity',
        what: 'An owner’s name changes; the list showing it next to each item updates, the other list does not.',
    },
    churnWide: {
        title: 'One component over many entities',
        what: 'A component that reads many entities mounts, sees a change, unmounts and must not see the next one.',
    },
    deleteOneRow: {
        title: 'Delete a card',
        what: 'One visible card is deleted; the list pulls up the next one and the other list is not touched.',
    },
    appRound: {
        title: 'A busy screen',
        what: 'Tags mount and unmount, every deck is renamed, every card toggled and a setting changes, all in one update.',
    },
};

const HAND_WRITTEN = 'baseline-indexed';

const MAX_STORIES = 6;

const PAR_TOLERANCE = 0.05;

const formatNs = (ns: number): string => (ns < 1000 ? `${Math.round(ns)} ns` : formatMs(ns / 1e6));

function OursCall({ call }: { call: string }): ReactNode {
    return (
        <code className={styles.oursCall}>
            {call.split(/(?<=[.(,])/).map((part, at) => (
                <span key={at}>{at !== 0 && <wbr />}{part}</span>
            ))}
        </code>
    );
}

const shownOperations = (operations: readonly TOperation[]): TShownOperation[] =>
    operations.flatMap(operation => {
        const pair = benchPrices.pairs.find(candidate => candidate.id === operation.pairId);
        return pair === undefined || pair.isStale ? [] : [{ ...operation, pair }];
    });

const isLibrary = (row: BenchRow): boolean =>
    !row.adapter.startsWith('baseline') && !row.adapter.startsWith('oimdb');

const stories = (): TStory[] => {
    const defaultPoint = benchResults.points[0]?.key;
    const found: TStory[] = [];
    for (const table of benchResults.tables) {
        const storyText = STORY_TEXTS[table.scenario];
        if (table.point !== defaultPoint || storyText === undefined) continue;
        const oimdbRow = table.rows.find(row => row.adapter === 'oimdb');
        if (oimdbRow === undefined || oimdbRow.stale.length !== 0) continue;
        const handWrittenRow = table.rows.find(row => row.adapter === HAND_WRITTEN);
        const rivalRow = table.rows
            .filter(isLibrary)
            .reduce<BenchRow | undefined>((best, row) => (best === undefined || row.ms < best.ms ? row : best), undefined);
        if (rivalRow === undefined || rivalRow.stale.length !== 0 || oimdbRow.ms > rivalRow.ms) continue;
        found.push({ ...storyText, scenario: table.scenario, oimdbRow, handWrittenRow, rivalRow, targetRow: rivalRow, targetName: rivalRow.adapter });
    }
    return found
        .sort((left, right) => left.oimdbRow.ms / left.targetRow.ms - right.oimdbRow.ms / right.targetRow.ms)
        .slice(0, MAX_STORIES);
};

function StoryBar({ name, row, maxMs, isOurs, isBehind = false, isShown }: {
    name: string;
    row: BenchRow;
    maxMs: number;
    isOurs: boolean;
    isBehind?: boolean;
    isShown: boolean;
}): ReactNode {
    return (
        <div className={styles.storyBar}>
            <div className={styles.storyBarHead}>
                <span
                    className={isOurs
                        ? clsx(styles.storyBarNameOurs, isBehind && styles.storyBarNameOursBehind)
                        : styles.storyBarName}
                >
                    {name}
                </span>
                <span className={styles.storyBarValue}>{formatMs(row.ms)}</span>
            </div>
            <span className={styles.storyBarTrack}>
                <span
                    className={isOurs
                        ? clsx(styles.storyBarFillOurs, isBehind && styles.storyBarFillOursBehind)
                        : styles.storyBarFill}
                    style={{ width: isShown ? `${Math.max(2, (row.ms / maxMs) * 100)}%` : '0%' }}
                />
            </span>
        </div>
    );
}

function StoryBlock({ story, isFlipped }: { story: TStory; isFlipped: boolean }): ReactNode {
    const [barsRef, , isShown] = useRevealed<HTMLDivElement>();
    const maxMs = Math.max(story.oimdbRow.ms, story.handWrittenRow?.ms ?? 0, story.rivalRow?.ms ?? 0);
    const ratio = story.oimdbRow.ms / story.targetRow.ms;
    const gapMs = Math.abs(story.oimdbRow.ms - story.targetRow.ms);
    const isWin = ratio <= 1;
    return (
        <Reveal from={isFlipped ? 'right' : 'left'}>
            <article className={clsx(styles.story, isFlipped && styles.storyFlipped)}>
                <div className={styles.storyText}>
                    <h4 className={styles.storyTitle}>{story.title}</h4>
                    <p className={styles.storyWhat}>{story.what}</p>
                    <span className={clsx(styles.storyVerdict, isWin ? styles.storyVerdictWin : styles.storyVerdictLoss)}>
                        {Math.abs(1 - ratio) < PAR_TOLERANCE
                            ? `On par with ${story.targetName}`
                            : isWin
                                ? `${(1 / ratio).toFixed(1)}× faster than ${story.targetName}`
                                : `+${formatMs(gapMs)} over ${story.targetName}`}
                    </span>
                </div>
                <div ref={barsRef} className={styles.storyBars}>
                    <StoryBar
                        name="OIMDB"
                        row={story.oimdbRow}
                        maxMs={maxMs}
                        isOurs
                        isBehind={!isWin && Math.abs(1 - ratio) >= PAR_TOLERANCE}
                        isShown={isShown}
                    />
                    {story.handWrittenRow !== undefined && (
                        <StoryBar name="A Map with an array per group, no library" row={story.handWrittenRow} maxMs={maxMs} isOurs={false} isShown={isShown} />
                    )}
                    {story.rivalRow !== undefined && (
                        <StoryBar
                            name={runsOurHandWrittenStore(story.rivalRow.adapter)
                                ? `${story.rivalRow.adapter} ${HAND_WRITTEN_STORE_NOTE}`
                                : story.rivalRow.adapter}
                            row={story.rivalRow}
                            maxMs={maxMs}
                            isOurs={false}
                            isShown={isShown}
                        />
                    )}
                </div>
            </article>
        </Reveal>
    );
}

export default function LandingSpeed(): ReactNode {
    const headlineOperations = shownOperations(HEADLINE_OPERATIONS);
    const operations = shownOperations(OPERATIONS);
    const storyList = stories();
    if (headlineOperations.length === 0 && operations.length === 0 && storyList.length === 0) return null;
    const environment = benchResults.environment;
    const point = benchResults.points[0];
    return (
        <section className={styles.section}>
            <div className="container">
                <Reveal>
                    <p className={styles.eyebrow}>Benchmarks</p>
                    <h2 className={styles.statement}>Close to the cost of a plain Map.</h2>
                    <p className={styles.lead}>
                        Every operation, next to the hand-written code it replaces.
                    </p>
                </Reveal>
                {headlineOperations.length !== 0 && (
                    <Reveal className={styles.trio}>
                        {headlineOperations.map(operation => (
                            <div key={operation.pairId} className={styles.trioItem}>
                                <span className={styles.trioValue}>{formatNs(operation.pair.oursNs)}</span>
                                <span className={styles.trioLabel}>{operation.title}</span>
                                <OursCall call={operation.ours} />
                                <span className={styles.trioFloor}>
                                    <code>{operation.handWritten}</code>: {formatNs(operation.pair.floorNs)}
                                </span>
                                <span className={styles.buys}>{operation.buys}</span>
                            </div>
                        ))}
                    </Reveal>
                )}
                {operations.length !== 0 && (
                    <div className={styles.priceGrid}>
                        {operations.map((operation, at) => (
                            <Reveal key={operation.pairId} delayMs={(at % 3) * 80} className={styles.priceCard}>
                                <span className={styles.priceTitle}>{operation.title}</span>
                                <span className={styles.priceValue}>{formatNs(operation.pair.oursNs)}</span>
                                <OursCall call={operation.ours} />
                                <span className={styles.priceCaption}>
                                    <code>{operation.handWritten}</code>: {formatNs(operation.pair.floorNs)}
                                </span>
                                {operation.buys !== undefined && <span className={styles.buys}>{operation.buys}</span>}
                            </Reveal>
                        ))}
                    </div>
                )}
                {storyList.length !== 0 && (
                    <>
                        <Reveal>
                            <h3 className={styles.subStatement}>
                                Tasks from a real board app, timed end to end.
                            </h3>
                            <p className={styles.lead}>
                                Most libraries here ship no collections, groups or sorted lists. In those rows the
                                collections are written by hand on top of the library&apos;s primitives, without OIMDB,
                                so a row measures that code, not a feature the library ships.
                            </p>
                        </Reveal>
                        <div className={styles.stories}>
                            {storyList.map((story, at) => (
                                <StoryBlock key={story.scenario} story={story} isFlipped={at % 2 === 1} />
                            ))}
                        </div>
                    </>
                )}
                <Reveal>
                    <p className={styles.footnote}>
                        {environment.machine}, Node {environment.node}
                        {point !== undefined && `, ${point.n.toLocaleString('en-US')} entities in the store`}.{' '}
                        <Link to="/docs/benchmarks">Full benchmark →</Link>
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
