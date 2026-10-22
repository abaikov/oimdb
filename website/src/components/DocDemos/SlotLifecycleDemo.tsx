import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
    OIMDB,
    createOIMEntityService,
    oimIsSlotEmpty,
    oimIsSlotReleased,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';
import styles from './styles.module.css';

type TCard = { id: string; title: string };

type TView = {
    identity: number;
    holdCount: number;
    isEmpty: boolean;
    isReleased: boolean;
    log: string[];
};

const KEY = 'ace';

class LifecycleModel {
    private readonly db = new OIMDB();

    private readonly cardService = createOIMEntityService<TCard>(this.db, { keyOf: (card) => card.id });

    private readonly cards = this.cardService.createStoreSlot(this.db);

    private slot: TOIMEntitySlot<TCard, TOIMStoreKey> | undefined = undefined;

    private identity = 0;

    private readonly log: string[] = [];

    public constructor(private readonly onChange: (view: TView) => void) {
        this.emit();
    }

    public get(): void {
        this.track(this.cardService.getSlotByKey(this.cards, KEY), "getSlotByKey('ace') — minted or found; the collector keeps it until flush");
    }

    public hold(): void {
        this.track(this.cardService.holdSlotByKey(this.cards, KEY), "holdSlotByKey('ace') — the hold is yours to give back");
    }

    public unhold(): void {
        const slot = this.slot;
        if (slot === undefined || oimIsSlotReleased(slot) || slot.holdCount === 0) return this.note('nothing to give back');
        try {
            slot.owner.unholdSlot(slot);
            this.note('unholdSlot — one reference fewer');
        } catch (error) {
            this.note(`unholdSlot threw: ${(error as Error).message.split('.')[0]}`);
        }
    }

    public write(): void {
        this.track(
            this.cardService.slotContentService.upsertEntity(this.cards, { id: KEY, title: 'Ace' }),
            'upsertEntity — the value keeps it under the default policy',
        );
    }

    public remove(): void {
        const slot = this.cardService.findSlotByKey(this.cards, KEY);
        if (slot !== undefined) this.cardService.slotContentService.deleteEntity(slot);
        this.note('deleteEntity — the value leaves; the identity stays while something keeps it');
    }

    public flush(): void {
        this.db.flush();
        this.note('flush() — the collector gives back what getters minted');
    }

    private track(slot: TOIMEntitySlot<TCard, TOIMStoreKey>, message: string): void {
        if (slot !== this.slot) {
            this.slot = slot;
            this.identity++;
            this.note(`${message} — identity #${this.identity}`);
            return;
        }
        this.note(message);
    }

    private note(message: string): void {
        this.log.unshift(message);
        this.log.length = Math.min(this.log.length, 6);
        this.emit();
    }

    private emit(): void {
        const slot = this.slot;
        this.onChange({
            identity: this.identity,
            holdCount: slot?.holdCount ?? 0,
            isEmpty: slot === undefined || oimIsSlotEmpty(slot),
            isReleased: slot !== undefined && oimIsSlotReleased(slot),
            log: [...this.log],
        });
    }
}

export default function SlotLifecycleDemo(): ReactNode {
    const modelRef = useRef<LifecycleModel | undefined>(undefined);
    const [view, setView] = useState<TView | undefined>(undefined);

    useEffect(() => {
        modelRef.current = new LifecycleModel(setView);
    }, []);

    if (view === undefined) return <div className={styles.panel} />;
    const model = modelRef.current;
    const stage = view.identity === 0 ? 'not minted' : view.isReleased ? 'released' : view.holdCount > 0 ? 'kept' : view.isEmpty ? 'empty, unkept' : 'kept by its value';

    return (
        <div className={styles.panel}>
            <div className={styles.kicker}>Live</div>
            <div className={styles.buttons}>
                <button type="button" onClick={() => model?.get()}>getSlotByKey</button>
                <button type="button" onClick={() => model?.hold()}>holdSlotByKey</button>
                <button type="button" onClick={() => model?.unhold()}>unholdSlot</button>
                <button type="button" onClick={() => model?.write()}>upsertEntity</button>
                <button type="button" onClick={() => model?.remove()}>deleteEntity</button>
                <button type="button" className={styles.primary} onClick={() => model?.flush()}>flush()</button>
            </div>
            <div className={styles.facts}>
                <div><span>identity</span><b>{view.identity === 0 ? '—' : `#${view.identity}`}</b></div>
                <div><span>holdCount</span><b>{view.holdCount}</b></div>
                <div><span>isEmpty</span><b className={view.isEmpty ? styles.no : styles.yes}>{String(view.isEmpty)}</b></div>
                <div><span>isReleased</span><b className={clsx(view.isReleased && styles.dead)}>{String(view.isReleased)}</b></div>
                <div><span>stage</span><b className={styles.stage}>{stage}</b></div>
            </div>
            <ol className={styles.log}>
                {view.log.map((line, i) => <li key={`${view.log.length}-${i}`}>{line}</li>)}
            </ol>
        </div>
    );
}
