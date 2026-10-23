import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import {
    benchPrices,
    benchResults,
    formatMs,
    HAND_WRITTEN_STORE_NOTE,
    runsOurHandWrittenStore,
    type BenchRow,
} from '@site/src/components/Bench/data';
import Reveal, { useRevealed } from './Reveal';
import { landingNumbersOf, type TStory } from './landingNumbers';
import styles from './styles.module.css';

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
    const { headlineOperations, operations, stories: storyList } = landingNumbersOf(benchResults, benchPrices);
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
