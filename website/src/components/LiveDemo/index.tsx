import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { COLUMNS, DemoEngine, type TDemoView } from './engine';
import styles from './styles.module.css';

const EXPLAIN: Record<string, string> = {
    rename: 'A title edit. Only that task re-renders. The columns do not depend on titles, so their order is not computed again.',
    reprioritise: 'A priority change. The task re-renders, and its column re-sorts on the next read; the column re-renders only if the order changed.',
    move: 'A column change. The index moves the task between two columns: both re-render, the third does not.',
    burst: 'A hundred title edits before one flush. Each edited task re-renders once, however many times it was written. The three columns ignore all of it: their order depends on priority, and no edit touched a priority.',
};

export default function LiveDemo(): ReactNode {
    const engineRef = useRef<DemoEngine | undefined>(undefined);
    const [view, setView] = useState<TDemoView | undefined>(undefined);
    const [autoFlush, setAutoFlush] = useState(false);
    const [explain, setExplain] = useState<string>('Make a change, then press flush(). Highlighted items are the ones that re-rendered.');
    const [pulse, setPulse] = useState(0);

    useEffect(() => {
        const engine = new DemoEngine(setView);
        engineRef.current = engine;
        return () => { engine.dispose(); };
    }, []);

    const flush = (): void => {
        engineRef.current?.flush();
        setPulse((n) => n + 1);
    };

    const act = (action: 'rename' | 'reprioritise' | 'move' | 'burst'): void => {
        const engine = engineRef.current;
        if (engine === undefined) return;
        engine[action]();
        setExplain(EXPLAIN[action]);
        if (autoFlush) flush();
    };

    if (view === undefined) return <div className={styles.shell} />;
    const frame = view.lastFrame;
    const tasksRendered = frame?.taskRuns.size ?? 0;
    const columnsRendered = frame?.columnRuns.size ?? 0;
    const taskCount = view.effectCount - COLUMNS.length;

    return (
        <div className={styles.shell}>
            <div className={styles.header}>
                <div>
                    <div className={styles.kicker}>Live</div>
                    <h3 className={styles.title}>A task board on @oimdb/core</h3>
                </div>
                <label className={styles.toggle}>
                    <input type="checkbox" checked={autoFlush} onChange={(e) => setAutoFlush(e.target.checked)} />
                    <span>flush after every change</span>
                </label>
            </div>

            <div className={styles.actions}>
                <button type="button" onClick={() => act('rename')}>Edit a title</button>
                <button type="button" onClick={() => act('reprioritise')}>Change a priority</button>
                <button type="button" onClick={() => act('move')}>Move a task</button>
                <button type="button" onClick={() => act('burst')}>100 edits</button>
                <button
                    type="button"
                    className={clsx(styles.flush, view.pendingWrites > 0 && styles.flushReady)}
                    onClick={flush}
                >
                    flush()
                    {view.pendingWrites > 0 && <span className={styles.badge}>{view.pendingWrites}</span>}
                </button>
            </div>

            <p className={styles.explain}>{explain}</p>

            <div className={styles.board}>
                {COLUMNS.map((column) => (
                    <div
                        key={`${column}-${frame?.columnRuns.has(column) ? pulse : 'still'}`}
                        className={clsx(styles.deck, frame?.columnRuns.has(column) && styles.deckWoke)}
                    >
                        <div className={styles.deckName}>
                            <span>{column}</span>
                            <span className={styles.deckCount}>{view.columns[column]?.length ?? 0}</span>
                        </div>
                        {(view.columns[column] ?? []).map((task) => (
                            <div
                                key={`${task.id}-${frame?.taskRuns.has(task.id) ? pulse : 'still'}`}
                                className={clsx(styles.card, frame?.taskRuns.has(task.id) && styles.cardWoke)}
                            >
                                <span className={styles.cardTitle}>{task.title}</span>
                                <span className={styles.cardRank}>P{task.priority}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            <div className={styles.stats}>
                <div><b>{view.totalWrites}</b><span>writes</span></div>
                <div><b>{view.frames}</b><span>flushes</span></div>
                <div className={styles.statGold}><b>{tasksRendered}</b><span>of {taskCount} tasks re-rendered</span></div>
                <div className={styles.statGold}><b>{columnsRendered}</b><span>of {COLUMNS.length} columns re-rendered</span></div>
            </div>
        </div>
    );
}
