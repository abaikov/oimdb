export interface IOIMSelectorComputedDependency {
    subscribe(onUpdate: () => void): () => void;
}





