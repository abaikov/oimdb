import { createHash } from 'node:crypto';
import { arch, cpus, hostname } from 'node:os';
import type { TEnvironment } from './types';

export const CURRENT_ENVIRONMENT: TEnvironment = {
    node: process.version,
    machine: `${arch()} ${cpus().length}× ${cpus()[0]?.model ?? 'unknown cpu'}`,
    host: createHash('sha256').update(hostname()).digest('hex').slice(0, 8),
};

export const sameEnvironment = (a: TEnvironment, b: TEnvironment): boolean =>
    a.node === b.node && a.machine === b.machine && a.host === b.host;
