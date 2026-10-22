import type {ReactNode} from 'react';
import DiagramNode from './DiagramNode';
import DiagramArrow from './DiagramArrow';
import styles from './styles.module.css';

export default function SlotDiagram(): ReactNode {
  return (
    <figure className={styles.diagram}>
      <div className={styles.flow}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>entity collection</span>
          <DiagramNode tone="accent" title={<>entity slot <code>'c1'</code></>} note={<>content: <code>slot.entity</code></>} />
          <div className={styles.groupRow}>
            <DiagramNode tone="muted" title="column slot" note={<code>title</code>} />
            <DiagramNode tone="muted" title="column slot" note={<code>rank</code>} />
          </div>
        </div>
        <DiagramArrow />
        <div className={styles.group}>
          <span className={styles.groupLabel}>bucket collection or index</span>
          <DiagramNode tone="gold" title={<>bucket <code>'spades'</code></>} note="content: the entity slots filed under that key" />
        </div>
        <DiagramArrow />
        <div className={styles.group}>
          <span className={styles.groupLabel}>computed collection</span>
          <DiagramNode title={<>computed <code>'spades'</code></>} note="its value is derived from its source slots, refreshed by the read that asks for it" />
        </div>
        <DiagramArrow />
        <div className={styles.flowColumn}>
          <DiagramNode tone="accent" title="effect" note="filed on the slots it reads; a frame runs it when one of them moved" />
        </div>
      </div>
      <figcaption className={styles.diagramCaption}>
        Every box is a slot except the effect. Each slot has an owner, the collection that files it, and a count of what
        holds it.
      </figcaption>
    </figure>
  );
}
