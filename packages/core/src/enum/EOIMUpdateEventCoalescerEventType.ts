/**
 * Event types for update coalescers */
export enum EOIMUpdateEventCoalescerEventType {
    /**
     * @description Emitted when there are any first changes to the updated keys
     */
    HAS_CHANGES,
    /**
     * @description Emitted before the flush of the updated keys
     */
    BEFORE_FLUSH,
    /**
     * @description Emitted after the flush of the updated keys
     */
    AFTER_FLUSH,
}
