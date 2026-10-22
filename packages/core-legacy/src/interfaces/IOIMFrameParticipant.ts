/**
 * Something that accumulates state for the duration of one frame and must put it
 * away before the frame is announced as over.
 *
 * A frame — the queue's task drain plus the effect phase — is closed to writes
 * precisely so that carriers can keep their change records throughout it. Those
 * records have to be cleared, and *when* is not a matter of taste: anything
 * reacting to `FRAME_END` may write to a store, and a write lands correctly only
 * if the carrier it targets has already been settled. A participant that cleared
 * itself from an ordinary `FRAME_END` listener would be racing every other
 * listener for position, and losing that race drops an update with no error.
 *
 * So clearing is not a reaction to the end of the frame — it IS the end of the
 * frame. The queue drains its participants first and emits `FRAME_END` after,
 * which makes the guarantee positional rather than a matter of who subscribed
 * first.
 */
export interface IOIMFrameParticipant {
    /** Put away this frame's accumulated state. Called before `FRAME_END`. */
    endFrame(): void;
}
