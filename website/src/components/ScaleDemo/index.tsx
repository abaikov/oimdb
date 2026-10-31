import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import liveStyles from '../LiveDemo/styles.module.css';
import styles from './styles.module.css';
import { createOIMScaleStore, createZustandScaleStore, type TScaleChange, type TScaleItem, type TScaleStore } from './stores';

type TLibrary = 'oimdb' | 'zustand';

type TStats = { loadMs: number; writeMs: number; fps: number; rowRendersPerFrame: number };

const ROW_HEIGHT = 30;
const VIEWPORT_HEIGHT = 360;
const OVERSCAN = 4;
const ROW_COUNTS = [10_000, 100_000] as const;
const WRITES_PER_FRAME = [1, 10, 100] as const;
const NAMES = ['Apple', 'Birch', 'Cobalt', 'Delta', 'Ember', 'Fjord', 'Garnet', 'Harbor', 'Indigo', 'Juniper'];

const createItems = (count: number): TScaleItem[] => Array.from({ length: count }, (_, i) => ({
    id: `r${i}`, name: `${NAMES[i % NAMES.length]} ${i}`, price: 100 + (i % 97), qty: 1 + (i % 13),
}));

const createStore = (library: TLibrary): TScaleStore => (library === 'oimdb' ? createOIMScaleStore() : createZustandScaleStore());

const renderRow = (item: TScaleItem): ReactNode => (
    <>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.number}>{item.price.toFixed(2)}</span>
        <span className={styles.number}>{item.qty}</span>
        <span className={styles.number}>{(item.price * item.qty).toFixed(2)}</span>
    </>
);

const Table = memo(function Table({ store, ids, onRowRender }: { store: TScaleStore; ids: readonly string[]; onRowRender: () => void }): ReactNode {
    const [scrollTop, setScrollTop] = useState(0);
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(ids.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
    const { Row, Provider } = store;
    const visible: ReactNode[] = [];
    for (let i = first; i < last; i++) {
        visible.push(
            <div key={ids[i]} className={styles.row} style={{ top: i * ROW_HEIGHT }}>
                <Row id={ids[i]} onRender={onRowRender} render={renderRow} />
            </div>,
        );
    }
    return (
        <Provider>
            <div className={styles.viewport} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                <div style={{ height: ids.length * ROW_HEIGHT }}>{visible}</div>
            </div>
        </Provider>
    );
});

export default function ScaleDemo(): ReactNode {
    const [library, setLibrary] = useState<TLibrary>('oimdb');
    const [rowCount, setRowCount] = useState<number>(ROW_COUNTS[1]);
    const [writesPerFrame, setWritesPerFrame] = useState<number>(WRITES_PER_FRAME[1]);
    const [running, setRunning] = useState(false);
    const [shown, setShown] = useState(false);
    const [loaded, setLoaded] = useState<{ store: TScaleStore; key: string } | undefined>(undefined);
    const store = loaded?.store;
    const shellRef = useRef<HTMLDivElement>(null);
    const [stats, setStats] = useState<TStats>({ loadMs: 0, writeMs: 0, fps: 0, rowRendersPerFrame: 0 });
    const items = useMemo(() => (shown ? createItems(rowCount) : []), [shown, rowCount]);
    const ids = useMemo(() => items.map((item) => item.id), [items]);
    const rowRenders = useRef(0);
    const loadMs = useRef(0);

    useEffect(() => {
        const shell = shellRef.current;
        if (shell === null) return undefined;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setShown(true);
                observer.disconnect();
            }
        }, { rootMargin: '200px' });
        observer.observe(shell);
        return () => { observer.disconnect(); };
    }, []);

    useEffect(() => {
        if (!shown) return undefined;
        const created = createStore(library);
        const started = performance.now();
        created.load(items);
        loadMs.current = performance.now() - started;
        setLoaded({ store: created, key: `${library}-${rowCount}` });
        setStats({ loadMs: loadMs.current, writeMs: 0, fps: 0, rowRendersPerFrame: 0 });
        return () => { created.dispose(); };
    }, [shown, library, items, rowCount]);

    useEffect(() => {
        if (!running || store === undefined) return undefined;
        let frame = 0;
        let frames = 0;
        let writeMsSum = 0;
        let windowStarted = performance.now();
        let rendersAtWindowStart = rowRenders.current;
        const tick = (): void => {
            const changes: TScaleChange[] = [];
            for (let i = 0; i < writesPerFrame; i++) {
                changes.push({ index: Math.floor(Math.random() * rowCount), price: 50 + Math.random() * 150, qty: 1 + Math.floor(Math.random() * 20) });
            }
            const started = performance.now();
            store.write(changes);
            writeMsSum += performance.now() - started;
            frames++;
            const now = performance.now();
            if (now - windowStarted >= 500) {
                setStats({
                    loadMs: loadMs.current,
                    writeMs: writeMsSum / frames,
                    fps: (frames * 1000) / (now - windowStarted),
                    rowRendersPerFrame: (rowRenders.current - rendersAtWindowStart) / frames,
                });
                frames = 0;
                writeMsSum = 0;
                windowStarted = now;
                rendersAtWindowStart = rowRenders.current;
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(frame); };
    }, [running, store, writesPerFrame, rowCount]);

    const onRowRender = useCallback((): void => { rowRenders.current++; }, []);

    return (
        <div ref={shellRef} className={liveStyles.shell}>
            <div className={liveStyles.header}>
                <div>
                    <div className={liveStyles.kicker}>Live</div>
                    <h3 className={liveStyles.title}>{rowCount.toLocaleString('en-US')} items, prices ticking every frame</h3>
                </div>
                <div className={styles.switch} role="group" aria-label="Library">
                    {(['oimdb', 'zustand'] as const).map((name) => (
                        <button key={name} type="button" className={clsx(library === name && styles.active)} onClick={() => setLibrary(name)}>
                            {name}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.controls}>
                <button type="button" className={clsx(styles.start, running && styles.stop)} onClick={() => setRunning((value) => !value)}>
                    {running ? 'Stop' : 'Start ticking'}
                </button>
                <div className={styles.switch} role="group" aria-label="Rows">
                    {ROW_COUNTS.map((count) => (
                        <button key={count} type="button" className={clsx(rowCount === count && styles.active)} onClick={() => setRowCount(count)}>
                            {count.toLocaleString('en-US')} items
                        </button>
                    ))}
                </div>
                <div className={styles.switch} role="group" aria-label="Writes per frame">
                    {WRITES_PER_FRAME.map((count) => (
                        <button key={count} type="button" className={clsx(writesPerFrame === count && styles.active)} onClick={() => setWritesPerFrame(count)}>
                            {count} / frame
                        </button>
                    ))}
                </div>
            </div>

            <p className={liveStyles.explain}>
                The same virtualised table, the same random writes, two stores. zustand is written the way its docs write a
                normalised collection: one store, a record by id, an immutable update and one selector per item. zustand has no
                batching of its own, so every frame&apos;s writes go into one <code>setState</code>, its best case. Switch the
                library, start ticking, and scroll.
            </p>

            <div className={styles.head}>
                <span>Name</span><span>Price</span><span>Qty</span><span>Total</span>
            </div>
            {loaded === undefined ? <div className={styles.viewport} /> : <Table key={loaded.key} store={loaded.store} ids={ids} onRowRender={onRowRender} />}

            <div className={styles.stats}>
                <div><b>{stats.writeMs.toFixed(3)}</b><span>ms per frame&apos;s writes</span></div>
                <div className={liveStyles.statGold}><b>{Math.round(stats.fps)}</b><span>frames per second</span></div>
                <div><b>{stats.rowRendersPerFrame.toFixed(1)}</b><span>item renders per frame</span></div>
                <div><b>{stats.loadMs.toFixed(1)}</b><span>ms to load all items</span></div>
            </div>
            <p className={styles.note}>
                Measured in your browser, on this page. The same comparison on 47 tasks and 17 libraries is
                on <Link to="/docs/benchmarks">the benchmarks page</Link>.
            </p>
        </div>
    );
}
