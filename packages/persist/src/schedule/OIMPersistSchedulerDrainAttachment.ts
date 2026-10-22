export class OIMPersistSchedulerDrainAttachment {
    private attachedDrain: (() => void) | undefined = undefined;

    public get drain(): (() => void) | undefined {
        return this.attachedDrain;
    }

    public attachDrain(drain: () => void, schedulerName: string): void {
        if (this.attachedDrain !== undefined && this.attachedDrain !== drain) {
            throw new Error(
                `${schedulerName}: this scheduler already drains another persistor. A second one would take the drain `
                + 'over and the first would collect changes nothing comes to write. Construct one scheduler per persistor.',
            );
        }
        this.attachedDrain = drain;
    }
}
