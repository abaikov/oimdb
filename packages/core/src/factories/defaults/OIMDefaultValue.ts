export class OIMDefaultValue<TValue> {
    private readonly name: string;

    private readonly createValue: () => TValue;

    private defaultValue: TValue | undefined = undefined;

    private isHandedOut = false;

    public constructor(name: string, createValue: () => TValue) {
        this.name = name;
        this.createValue = createValue;
    }

    public getValue(): TValue {
        this.isHandedOut = true;
        return this.defaultValue ??= this.createValue();
    }

    public setValue(value: TValue): void {
        this.assertNoLateOverride();
        this.defaultValue = value;
    }

    private assertNoLateOverride(): void {
        if (!this.isHandedOut) return;
        throw new Error(
            `OIMDefaults.${this.name} has already been handed out, and whoever took it keeps it — so `
            + 'replacing it now leaves two implementations live in one process, the older one inside '
            + 'every object built before this call. Set it at startup, before anything reads it.',
        );
    }
}
