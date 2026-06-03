/**
 * Configuration options for different scheduler types. */
export type TOIMSchedulerOptions = {
    microtask: never;
    animationFrame: never;
    timeout: { delay?: number };
    immediate: never;
};
