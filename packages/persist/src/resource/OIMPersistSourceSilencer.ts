export class OIMPersistSourceSilencer {
    private isChangingSourceSilently = false;

    public get isSourceSilenced(): boolean {
        return this.isChangingSourceSilently;
    }

    public changeSourceSilently(changeSource: () => void): void {
        this.isChangingSourceSilently = true;
        try {
            changeSource();
        } finally {
            this.isChangingSourceSilently = false;
        }
    }
}
