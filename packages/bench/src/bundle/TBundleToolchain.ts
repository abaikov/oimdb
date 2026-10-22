/**
 * WHO PRODUCED THESE BYTES — the bundle harness's answer to `machine.json`.
 *
 * NO LOAD GATE AND NO REFUSAL, unlike every price run: the same bundler over the
 * same source at the same settings emits the same bytes on a busy laptop and an
 * idle one. A reader arriving from `measurements/README.md` will look for the
 * gate, so its absence is stated rather than left to be read as a skip.
 *
 * WHAT REPLACES IT IS THE SETTINGS, every one of which moves the number. A byte
 * count quoted without them is as unreproducible as a nanosecond quoted without
 * a CPU. `sourceBytes` and `sourceFiles` describe the package measured, so a
 * later run can say whether a moved number came from the engine or the
 * toolchain.
 */
export type TBundleToolchain = {
    readonly bundler: string;
    readonly bundlerVersion: string;
    readonly format: string;
    readonly platform: string;
    readonly target: string;
    readonly minifier: string;
    readonly gzipLevel: number;
    readonly node: string;
    /** Total bytes of `packages/core/src`, comments and all. */
    readonly sourceBytes: number;
    readonly sourceFiles: number;
};
