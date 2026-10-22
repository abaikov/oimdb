import type {ReactNode} from 'react';
import styles from './styles.module.css';

export default function DocCards({children}: {children: ReactNode}): ReactNode {
  return <div className={styles.cards}>{children}</div>;
}
