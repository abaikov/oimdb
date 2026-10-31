import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
    OIMChannelService,
    OIMDB,
    OIMEffectService,
    createOIMSlotCollectionService,
    createOIMEntityContentService,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';
import styles from './styles.module.css';

type TCard = { id: string; title: string };

type TSlotView = { id: string; changedAtRevision: number; isChangedInCurrentFrame: boolean; runs: number; ranLastFrame: boolean };

type TView = { revision: number; slotViews: TSlotView[]; writesSinceFlush: number; lastFrameRuns: number };

const IDS = ['a', 'b', 'c'];

class FrameModel {
    private readonly db = new OIMDB();

    private readonly effectService = OIMEffectService.INSTANCE;

    private readonly cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });

    private readonly cards = this.cardService.createStoreSlot(this.db);

    private readonly slots: TOIMEntitySlot<TCard, TOIMStoreKey>[];

    private readonly runs = new Map<string, number>();

    private ranThisFrame = new Set<string>();

    private ranLastFrame = new Set<string>();

    private writesSinceFlush = 0;

    private readonly disposers: (() => void)[] = [];

    public constructor(private readonly onChange: (view: TView) => void) {
        this.slots = IDS.map((id) => this.cardService.writeSlotContentByKey(this.cards, id, { id, title: id.toUpperCase() }));
        for (const slot of this.slots) {
            const effect = this.effectService.createEffect(this.db, () => {
                const id = slot.entity?.id ?? '';
                this.runs.set(id, (this.runs.get(id) ?? 0) + 1);
                this.ranThisFrame.add(id);
            }, [slot]);
            this.disposers.push(() => { this.effectService.disposeEffect(effect); });
        }
        this.db.flush();
        this.ranThisFrame = new Set();
        this.emit();
    }

    public write(index: number): void {
        const slot = this.slots[index];
        slot.updateEntity({ title: `${IDS[index].toUpperCase()}${this.db.defaultChannelSlot.clock.revision}` });
        this.writesSinceFlush++;
        this.emit();
    }

    public flush(): void {
        this.ranThisFrame = new Set();
        this.db.flush();
        this.ranLastFrame = this.ranThisFrame;
        this.writesSinceFlush = 0;
        this.emit();
    }

    public dispose(): void {
        for (const dispose of this.disposers) dispose();
    }

    private emit(): void {
        const channelSlot = this.db.defaultChannelSlot;
        this.onChange({
            revision: channelSlot.clock.revision,
            writesSinceFlush: this.writesSinceFlush,
            lastFrameRuns: this.ranLastFrame.size,
            slotViews: this.slots.map((slot, i) => ({
                id: IDS[i],
                changedAtRevision: slot.changedAtRevision,
                isChangedInCurrentFrame: OIMChannelService.INSTANCE.isChangedInCurrentFrame(channelSlot, slot),
                runs: this.runs.get(IDS[i]) ?? 0,
                ranLastFrame: this.ranLastFrame.has(IDS[i]),
            })),
        });
    }
}

export default function FrameDemo(): ReactNode {
    const modelRef = useRef<FrameModel | undefined>(undefined);
    const [view, setView] = useState<TView | undefined>(undefined);
    const [flushes, setFlushes] = useState(0);

    useEffect(() => {
        const model = new FrameModel(setView);
        modelRef.current = model;
        return () => { model.dispose(); };
    }, []);

    if (view === undefined) return <div className={styles.panel} />;

    return (
        <div className={styles.panel}>
            <div className={styles.kicker}>Live</div>
            <div className={styles.row}>
                <div className={styles.clock}>
                    <span>channelSlot.clock.revision</span>
                    <b>{view.revision}</b>
                </div>
                <div className={styles.buttons}>
                    {IDS.map((id, i) => (
                        <button key={id} type="button" onClick={() => modelRef.current?.write(i)}>write {id}</button>
                    ))}
                    <button
                        type="button"
                        className={clsx(styles.primary, view.writesSinceFlush > 0 && styles.ready)}
                        onClick={() => { modelRef.current?.flush(); setFlushes((n) => n + 1); }}
                    >
                        flush(){view.writesSinceFlush > 0 ? ` · ${view.writesSinceFlush}` : ''}
                    </button>
                </div>
            </div>
            <table className={styles.table}>
                <thead>
                    <tr><th>slot</th><th>changedAtRevision</th><th>isChangedInCurrentFrame</th><th>effect runs</th></tr>
                </thead>
                <tbody>
                    {view.slotViews.map((slotView) => (
                        <tr key={`${slotView.id}-${slotView.ranLastFrame ? flushes : 'still'}`} className={clsx(slotView.ranLastFrame && styles.woke)}>
                            <td><code>{slotView.id}</code></td>
                            <td className={styles.mono}>{slotView.changedAtRevision}</td>
                            <td className={slotView.isChangedInCurrentFrame ? styles.yes : styles.no}>
                                {slotView.isChangedInCurrentFrame ? 'true — enlisted' : 'false'}
                            </td>
                            <td className={styles.mono}>{slotView.runs}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className={styles.note}>
                Write the same slot three times: the clock moves three times, the slot is enlisted once,
                and one flush runs its effect once. Last frame ran {view.lastFrameRuns} of {view.slotViews.length} effects.
            </p>
        </div>
    );
}
