export interface IOIMSelectorSourceDependency {
    subscribe(onUpdate: () => void): () => void;
}





