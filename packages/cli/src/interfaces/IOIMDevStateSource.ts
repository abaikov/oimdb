export interface IOIMDevStateSource {
    readInspect(): Promise<unknown>;
    readDump(): Promise<string>;
}
