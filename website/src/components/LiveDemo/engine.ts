import {
    OIMDB,
    OIMEffectService,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMIndexService,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';

export const COLUMNS = ['To do', 'In progress', 'Done'] as const;

export type TColumn = (typeof COLUMNS)[number];

export type TTask = { id: string; column: TColumn; title: string; priority: number };

export type TDemoFrame = {
    taskRuns: Set<string>;
    columnRuns: Set<TColumn>;
};

export type TDemoView = {
    columns: Record<TColumn, TTask[]>;
    pendingWrites: number;
    totalWrites: number;
    frames: number;
    lastFrame: TDemoFrame | undefined;
    effectCount: number;
};

const TITLES = [
    'Fix login redirect', 'Write release notes', 'Review pull request', 'Update dependencies',
    'Add search filter', 'Profile list rendering', 'Remove dead code', 'Translate settings page',
    'Design empty state', 'Set up error tracking', 'Split large component', 'Add keyboard shortcuts',
];

const pick = <T,>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)];

export class DemoEngine {
    private readonly db = new OIMDB();

    private readonly effectService = OIMEffectService.INSTANCE;

    private readonly taskService = createOIMEntityService<TTask>(this.db, { keyOf: (task) => task.id });

    private readonly tasks = this.taskService.createStoreSlot(this.db);

    private readonly tasksByColumnService = createOIMIndexService(this.db, {
        entityService: this.taskService,
        columns: ['column'],
    });

    private readonly tasksByColumn = this.tasksByColumnService.createIndexStoreSlot(this.tasks);

    private readonly tasksByPriorityService = createOIMComputedServiceSorted({
        indexService: this.tasksByColumnService,
        sortColumns: [{ column: 'priority', direction: 'asc' }],
    });

    private readonly tasksByPriority = this.tasksByPriorityService.createSortedStoreSlot(this.tasksByColumn);

    private readonly taskSlots: TOIMEntitySlot<TTask, TOIMStoreKey>[] = [];

    private readonly columns = {} as Record<TColumn, TTask[]>;

    private frame: TDemoFrame = { taskRuns: new Set(), columnRuns: new Set() };

    private pendingWrites = 0;

    private totalWrites = 0;

    private frames = 0;

    private lastFrame: TDemoFrame | undefined = undefined;

    private readonly disposers: (() => void)[] = [];

    public constructor(private readonly onChange: (view: TDemoView) => void) {
        const seeded = TITLES.map((title, i): TTask => ({ id: `t${i}`, column: COLUMNS[i % 3], title, priority: i + 1 }));
        for (const task of seeded) this.taskSlots.push(this.taskService.slotContentService.upsertEntity(this.tasks, task));
        for (const column of COLUMNS) {
            const sortedSlot = this.tasksByPriorityService.computedCollectionService.holdSlotByKey(this.tasksByPriority, column);
            const effect = this.effectService.createEffectImmediate(this.db, [], [sortedSlot], () => {
                const ordered = sortedSlot.computedValueService.getValueForSlot(sortedSlot);
                this.columns[column] = ordered.flatMap((slot) => (slot.entity === undefined ? [] : [{ ...slot.entity }]));
                this.frame.columnRuns.add(column);
            });
            this.disposers.push(() => {
                this.effectService.disposeEffect(effect);
                sortedSlot.owner.unholdSlot(sortedSlot);
            });
        }
        for (const slot of this.taskSlots) {
            const effect = this.effectService.createEffect(this.db, [slot], [], () => {
                if (slot.entity !== undefined) this.frame.taskRuns.add(slot.entity.id);
            });
            this.disposers.push(() => { this.effectService.disposeEffect(effect); });
        }
        this.db.flush();
        this.frame = { taskRuns: new Set(), columnRuns: new Set() };
        this.emit();
    }

    public rename(): void {
        const slot = pick(this.taskSlots);
        const title = slot.entity?.title ?? '';
        this.taskService.slotContentService.updateEntity(slot, { title: title.endsWith(' (edited)') ? title.slice(0, -9) : `${title} (edited)` });
        this.wrote(1);
    }

    public reprioritise(): void {
        const slot = pick(this.taskSlots);
        this.taskService.slotContentService.updateEntity(slot, { priority: Math.floor(Math.random() * 20) + 1 });
        this.wrote(1);
    }

    public move(): void {
        const slot = pick(this.taskSlots);
        const current = slot.entity?.column;
        this.taskService.slotContentService.updateEntity(slot, { column: pick(COLUMNS.filter((column) => column !== current)) });
        this.wrote(1);
    }

    public burst(): void {
        for (let i = 0; i < 100; i++) {
            const slot = pick(this.taskSlots);
            const title = slot.entity?.title ?? '';
            this.taskService.slotContentService.updateEntity(slot, { title: title.endsWith(' (edited)') ? title.slice(0, -9) : `${title} (edited)` });
        }
        this.wrote(100);
    }

    public flush(): void {
        this.frame = { taskRuns: new Set(), columnRuns: new Set() };
        this.db.flush();
        this.lastFrame = this.frame;
        this.frames++;
        this.pendingWrites = 0;
        this.emit();
    }

    public dispose(): void {
        for (const dispose of this.disposers) dispose();
    }

    private wrote(count: number): void {
        this.pendingWrites += count;
        this.totalWrites += count;
        this.emit();
    }

    private emit(): void {
        this.onChange({
            columns: { ...this.columns },
            pendingWrites: this.pendingWrites,
            totalWrites: this.totalWrites,
            frames: this.frames,
            lastFrame: this.lastFrame,
            effectCount: COLUMNS.length + this.taskSlots.length,
        });
    }
}
