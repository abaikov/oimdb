import type {ReactNode} from 'react';
import DiagramNode from './DiagramNode';
import DiagramArrow from './DiagramArrow';
import styles from './styles.module.css';

export default function IndexDiagram(): ReactNode {
  return (
    <figure className={styles.diagram}>
      <div className={styles.flow}>
        <DiagramNode title="Entity collection" note={<><code>upsertEntity</code>, <code>updateEntity</code>, <code>deleteEntityByKey</code></>} />
        <DiagramArrow />
        <DiagramNode tone="accent" title="Index" note={<><code>keyOf</code> or <code>columns</code> gives each entity its key; a write that moves the key refiles it</>} />
        <DiagramArrow />
        <div className={styles.flowColumn}>
          <DiagramNode tone="gold" title={<>bucket <code>'todo'</code></>} note="the entity slots with that key" />
          <DiagramNode tone="gold" title={<>bucket <code>'done'</code></>} note="one bucket per key, minted when the key is first filed or asked for" />
        </div>
        <DiagramArrow />
        <DiagramNode
          title="Sorted view"
          note={<><code>createOIMComputedServiceSorted</code>: one ordered array per bucket, re-sorted only when membership or a sort column moves</>}
        />
        <DiagramArrow />
        <DiagramNode tone="muted" title="Component" note="subscribes to the one bucket or view it shows" />
      </div>
    </figure>
  );
}
