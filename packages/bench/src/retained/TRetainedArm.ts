/**
 * WHICH OF A PAIR'S TWO POPULATIONS A PROCESS WAS ASKED TO BUILD.
 *
 * NOT `ours` and `floor`: one population has the thing under test present and one
 * has it absent. **The delta is always `on` minus `off`, so a positive delta is
 * what the thing COSTS.**
 *
 * WHICH ARM CARRIES THE SHIPPED CODE IS A PER-PAIR DECISION, stated in each
 * pair's prose — `on` for the legacy change tracker, and it has been the other way
 * round. A reader who assumes one arm is always ours will misread the table.
 *
 * EVERY ARM IS ALWAYS MEASURED IN ITS OWN PROCESS, with no equivalent of a price
 * pair's shared-process mode. A heap reading is a statement about a whole
 * process, so two populations in one cannot be told apart, and building one after
 * the other leaves the second measuring a heap the first had already grown.
 */
export type TRetainedArm = 'on' | 'off';
