import type {ReactNode} from 'react';
import styles from './styles.module.css';

export default function Glossary({children}: {children: ReactNode}): ReactNode {
  return <dl className={styles.glossary}>{children}</dl>;
}
