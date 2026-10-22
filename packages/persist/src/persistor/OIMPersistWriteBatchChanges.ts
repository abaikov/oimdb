export class OIMPersistWriteBatchChanges<TWriteBatchTarget> {
    private readonly writeBatchChanges: ((writeBatchTarget: TWriteBatchTarget) => void)[] = [];

    public get hasWriteBatchChanges(): boolean {
        return this.writeBatchChanges.length !== 0;
    }

    public addWriteBatchChange(writeBatchChange: (writeBatchTarget: TWriteBatchTarget) => void): void {
        this.writeBatchChanges.push(writeBatchChange);
    }

    public applyWriteBatchChanges(writeBatchTarget: TWriteBatchTarget): void {
        const writeBatchChanges = this.writeBatchChanges;
        for (let i = 0; i < writeBatchChanges.length; i++) writeBatchChanges[i](writeBatchTarget);
    }
}
