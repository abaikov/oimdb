import type {ReactNode} from 'react';
import styles from './styles.module.css';

export default function Term({name, type, children}: {name: string; type?: string; children: ReactNode}): ReactNode {
  return (
    <div className={styles.term} id={`term-${name.replace(/\s+/g, '-')}`}>
      <dt className={styles.termName}>
        {name}
        {type && <code>{type}</code>}
      </dt>
      <dd className={styles.termBody}>{children}</dd>
    </div>
  );
}
