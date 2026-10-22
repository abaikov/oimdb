import type {ReactNode} from 'react';
import DiagramNode from './DiagramNode';
import styles from './styles.module.css';

export default function LifecycleDiagram(): ReactNode {
  return (
    <figure className={styles.diagram}>
      <div className={styles.doors}>
        <span className={styles.groupLabel}>Four doors mint a slot:</span>
        <span className={styles.door}>a write</span>
        <span className={styles.door}>a subscription</span>
        <span className={styles.door}>a hold</span>
        <span className={styles.door}>
          <code>getSlotByKey</code>, held by the collector for the turn
        </span>
      </div>
      <div className={styles.states}>
        <DiagramNode className={styles.state} tone="accent" title="Minted" note="the collection creates the slot and files it under its key" />
        <DiagramNode className={styles.state} title="Kept" note="a hold, an effect, a column slot or a bucket counts on it" />
        <DiagramNode className={styles.state} tone="gold" title="Asked to go" note="the last reference is given back, or its value leaves while nothing keeps it" />
        <DiagramNode
          className={styles.state}
          tone="muted"
          title="Released"
          note={<>the release policy agrees: the slot leaves the store and <code>isReleased</code> is set</>}
        />
      </div>
      <p className={styles.loopNote}>
        Filling and emptying happen while the slot is kept, and never change its identity. After a release, the next
        door for that key mints a new slot.
      </p>
    </figure>
  );
}
