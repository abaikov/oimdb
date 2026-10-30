export class OIMChannelQueue<TEntry> {
    private readonly entries: (TEntry | undefined)[] = [];

    private entryCount = 0;

    public enqueueEntry(entry: TEntry): void {
        this.entries[this.entryCount++] = entry;
    }

    public getEntryCount(): number {
        return this.entryCount;
    }

    public getEntryAt(index: number): TEntry {
        return this.entries[index] as TEntry;
    }

    public setEntryAt(index: number, entry: TEntry): void {
        this.entries[index] = entry;
    }

    public takeEntryAt(index: number): TEntry | undefined {
        const entries = this.entries;
        const entry = entries[index];
        entries[index] = undefined;
        return entry;
    }

    public forgetTakenEntries(): void {
        this.entryCount = 0;
    }

    public keepFirstEntries(keptCount: number): void {
        const entries = this.entries;
        for (let i = keptCount; i < this.entryCount; i++) entries[i] = undefined;
        this.entryCount = keptCount;
    }
}
