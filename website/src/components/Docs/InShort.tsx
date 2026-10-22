import type {ReactNode} from 'react';
import styles from './styles.module.css';

export default function InShort({children}: {children: ReactNode}): ReactNode {
  return (
    <aside className={styles.inShort}>
      <span className={styles.inShortLabel}>In short</span>
      {children}
    </aside>
  );
}
