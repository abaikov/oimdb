import { OIMEventQueueScheduler } from '../abstract/OIMEventQueueScheduler';
import { TOIMEventQueueOptions } from '../types/TOIMEventQueueOptions';
import { EOIMEventQueueSchedulerEventType } from '../enums/EOIMEventQueueSchedulerEventType';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMEventQueueEventType } from '../enums/EOIMEventQueueEventType';
import { IOIMFrameParticipant } from '../interfaces/IOIMFrameParticipant';
import { TOIMFlushError } from '../types/TOIMFlushError';

/**
 * Event queue that can optionally integrate with a scheduler for automatic flushing.
 */
export class OIMEventQueue {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMEventQueueEventType.BEFORE_FLUSH]: void;
        [EOIMEventQueueEventType.AFTER_FLUSH]: void;
        [EOIMEventQueueEventType.FRAME_END]: void;
        [EOIMEventQueueEventType.FLUSH_ERROR]: TOIMFlushError;
    }>();
    protected readonly onError?: (error: unknown) => void;
    protected tasks = new Set<() => void>();
    // Reused buffer swapped in during flush so the pending set is never copied
    // (no per-flush array snapshot) and new enqueues land in a fresh set.
    protected tasksSpare = new Set<() => void>();
    // The set currently being drained, so cancel() can also remove a task
    // mid-flush (a Set's for..of skips entries deleted before they're reached).
    protected flushing?: Set<() => void>;
    protected readonly scheduler?: OIMEventQueueScheduler;
    protected flushBound?: () => void;
    protected isFlushing = false;
    protected isRunningEffects = false;

    constructor(options: TOIMEventQueueOptions = {}) {
        this.scheduler = options.scheduler;
        this.onError = options.onError;

        if (this.scheduler) {
            // Bind flush method once to avoid creating new functions on each subscription
            this.flushBound = () => this.flush();
            this.scheduler.on(
                EOIMEventQueueSchedulerEventType.FLUSH,
                this.flushBound
            );
        }
    }

    /**
     * Enqueue a one-shot task to run on the next flush. The function is stored
     * directly (no wrapper, no returned closure) and cancelled via {@link cancel}
     * by passing the same reference. Enqueuing the same reference twice is
     * idempotent — it is Set-deduped and runs once per flush.
     */
    public enqueue(fn: () => void): void {
        this.tasks.add(fn);
        this.ensureScheduled();
    }

    /** Cancel a previously enqueued task by its reference; safe to call mid-flush. */
    public cancel(fn: () => void): void {
        this.tasks.delete(fn);
        this.flushing?.delete(fn);
    }

    /**
     * How many flushes this queue has run. Used as a generation stamp by state
     * that lives for exactly one frame.
     */
    public flushCount = 0;
    /**
     * Things holding state for the duration of the current frame. Registered
     * only while they actually hold something, so a queue whose emitters never
     * deliver iterates an empty set.
     */
    private readonly frameParticipants = new Set<IOIMFrameParticipant>();

    /**
     * True while the queue is delivering, INCLUDING the effect phase.
     *
     * Effects run after the task drain, when the queue is technically idle, but
     * they are part of the same frame: their dependencies' change records are
     * still readable and a write from there would mutate state that the frame
     * has already reported. Writers therefore treat the whole span as "in flush".
     */
    public get isInFlush(): boolean {
        return this.isFlushing || this.isRunningEffects;
    }

    /** True only while the effect phase runs — for error messages that name it. */
    public get isInEffectPhase(): boolean {
        return this.isRunningEffects;
    }

    /**
     * Execute the tasks pending at the moment the flush starts — a single pass,
     * not a drain-to-empty.
     *
     * The pending set is swapped out for an empty spare up front and the flush
     * iterates that captured set. Tasks enqueued during the flush land in the
     * fresh set and run on the NEXT flush, not this one. (Contrast
     * `OIMComputeRuntime.flush()`, which re-reads its bucket per level and so
     * does drain same-level tasks scheduled mid-flush.)
     */
    /**
     * Register something that must settle before `FRAME_END` is announced. Safe
     * to call repeatedly — membership is a set. See {@link IOIMFrameParticipant}
     * for why this is not just a `FRAME_END` listener.
     */
    public registerFrameParticipant(participant: IOIMFrameParticipant): void {
        this.frameParticipants.add(participant);
    }

    public unregisterFrameParticipant(participant: IOIMFrameParticipant): void {
        this.frameParticipants.delete(participant);
    }

    /**
     * Settle every participant. They typically unregister themselves from inside
     * `endFrame()`, which a `Set` iteration tolerates: removing the element being
     * visited (or any already visited) is well-defined.
     */
    private endFrame(): void {
        if (this.frameParticipants.size === 0) return;
        for (const participant of this.frameParticipants) {
            participant.endFrame();
        }
    }

    public flush(): void {
        // If a flush was scheduled, manual flush supersedes it.
        this.scheduler?.cancel();
        // Monotonic frame counter. Anything holding per-flush state compares it
        // instead of subscribing: the stale-vs-current question is answered by a
        // read, not by a handler call on every flush.
        this.flushCount++;

        this.isFlushing = true;
        this.emitter.emit(EOIMEventQueueEventType.BEFORE_FLUSH, undefined);

        // Swap the pending set out for an empty spare: tasks enqueued during the
        // drain land in the fresh set (run next flush), exactly as before — but
        // without copying the pending set into a snapshot array.
        const flushing = this.tasks;
        this.tasks = this.tasksSpare;
        this.flushing = flushing;

        // Each task is isolated: one throwing task neither aborts the rest nor
        // (via the finally) leaves the queue wedged. Errors are collected and
        // dealt with AFTER state is restored.
        let errors: unknown[] | undefined;
        try {
            for (const task of flushing) {
                try {
                    task();
                } catch (error) {
                    (errors ??= []).push(error);
                    // Observation channel — emitted regardless of `onError` so
                    // tooling (devtools / MCP) always sees the failure.
                    this.emitter.emit(EOIMEventQueueEventType.FLUSH_ERROR, {
                        error,
                    });
                    this.onError?.(error);
                }
            }
        } finally {
            // Runs even if the loop body itself throws (e.g. a throwing
            // `onError`) — the queue never stays in a half-flushed state.
            flushing.clear();
            this.tasksSpare = flushing;
            this.flushing = undefined;
            this.isFlushing = false;
        }

        // The effect phase belongs to the frame: writes are refused here just as
        // they are during the task drain, and the carriers keep their change
        // records until it is over so an effect can read what moved.
        this.isRunningEffects = true;
        try {
            this.emitter.emit(EOIMEventQueueEventType.AFTER_FLUSH, undefined);
        } finally {
            this.isRunningEffects = false;
            // Participants settle BEFORE the frame is announced. A `FRAME_END`
            // listener is allowed to write, and a write only lands if the carrier
            // it targets has already been cleared — so this ordering is a
            // guarantee, not an artefact of who subscribed first.
            this.endFrame();
            this.emitter.emit(EOIMEventQueueEventType.FRAME_END, undefined);
        }

        // Loud by default: with no handler installed the error is NOT swallowed —
        // it propagates (uncaught in async/scheduled mode, thrown to the caller
        // of a manual `flush()`). A handler opts the app into handling it.
        if (errors && this.onError === undefined) {
            if (errors.length === 1) throw errors[0];
            // Combine into an AggregateError when the runtime has it (all the
            // individual errors were already surfaced via FLUSH_ERROR). Referenced
            // via globalThis so consumers on an older `lib` still type-check.
            const AggregateErrorCtor = (
                globalThis as {
                    AggregateError?: new (
                        errors: Iterable<unknown>,
                        message?: string
                    ) => Error;
                }
            ).AggregateError;
            throw AggregateErrorCtor
                ? new AggregateErrorCtor(
                      errors,
                      'Errors thrown during queue flush'
                  )
                : errors[0];
        }
    }

    /**
     * Get the current number of queued functions.
     */
    public get length(): number {
        return this.tasks.size;
    }

    /**
     * Check if the queue is empty.
     */
    public get isEmpty(): boolean {
        return this.tasks.size === 0;
    }

    /**
     * Clear the queue without executing functions and cancel any scheduled flush.
     */
    public clear(): void {
        this.tasks.clear();
        this.scheduler?.cancel();
    }

    protected ensureScheduled(): void {
        if (!this.scheduler) return;
        if (this.isFlushing) return;
        if (this.tasks.size === 1) {
            // Only schedule when transitioning from empty to non-empty.
            this.scheduler.schedule();
        }
    }

    /**
     * Clean up scheduler subscription when queue is no longer needed.
     */
    public destroy(): void {
        if (this.scheduler && this.flushBound) {
            this.scheduler.off(
                EOIMEventQueueSchedulerEventType.FLUSH,
                this.flushBound
            );
        }
        this.clear();
    }
}
