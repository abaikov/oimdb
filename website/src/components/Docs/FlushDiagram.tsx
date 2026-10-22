import type {ReactNode} from 'react';
import DiagramNode from './DiagramNode';
import DiagramArrow from './DiagramArrow';
import styles from './styles.module.css';

export default function FlushDiagram(): ReactNode {
  return (
    <figure className={styles.diagram}>
      <div className={styles.flow}>
        <div className={styles.flowColumn}>
          <DiagramNode title="Writes" note={<>any number, in any order: <code>upsertEntity</code>, <code>updateEntity</code>, …</>} />
          <DiagramNode tone="muted" title="The channel" note="stamps each moved slot and schedules the effects filed on it, once each" />
        </div>
        <DiagramArrow />
        <div className={styles.group}>
          <span className={styles.groupLabel}>
            <code>flush()</code>
          </span>
          <div className={styles.groupRow}>
            <DiagramNode title={<code>onBeforeFlush</code>} note="if the channel was given one" />
            <DiagramArrow />
            <div className={styles.group}>
              <span className={styles.groupLabel}>the frame</span>
              <div className={styles.groupRow}>
                <DiagramNode tone="accent" title="Effects" note="each scheduled effect re-checks its sources, then runs once" />
                <DiagramArrow />
                <DiagramNode title="After each frame" note={<><code>subscribeAfterEachFrame</code> handlers</>} />
              </div>
            </div>
            <DiagramArrow />
            <DiagramNode tone="gold" title="Collector" note="the unused-slot collector gives back this frame's reads" />
            <DiagramArrow />
            <DiagramNode title="After each flush" note={<><code>subscribeAfterEachFlush</code> handlers; a write here asks for the next frame</>} />
          </div>
        </div>
      </div>
      <figcaption className={styles.diagramCaption}>
        A hundred writes before a flush are one frame: every effect that any of them woke runs once.
      </figcaption>
    </figure>
  );
}
