export class OIMDefaultValue<TValue> {
    private readonly createValue: () => TValue;

    private defaultValue: TValue | undefined = undefined;

    public constructor(createValue: () => TValue) {
        this.createValue = createValue;
    }

    public getValue(): TValue {
        return this.defaultValue ??= this.createValue();
    }
}
