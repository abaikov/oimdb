// Prose: ./README.md#pricereportcells
/** Re-exported from the harness so a report needs ONE import for its cells. */
export { formatMs } from '../harness/measure';

/** The row of a table, already stringified, ready to be padded into columns. */
export type TCells = readonly string[];

export const asColumns = (rows: readonly TCells[], rightAlign: readonly boolean[]): string => {
    const widths: number[] = [];
    for (const row of rows) {
        for (let i = 0; i < row.length; i++) {
            widths[i] = Math.max(widths[i] ?? 0, row[i].length);
        }
    }
    return rows
        .map(row =>
            row
                .map((cell, i) =>
                    rightAlign[i] === true ? cell.padStart(widths[i]) : cell.padEnd(widths[i]),
                )
                .join('  ')
                .trimEnd(),
        )
        .join('\n');
};

/**
 * A ratio, with precision falling away as the number grows. Two decimals near
 * 1.00, where a reading is decided against the noise floor; none past 100x,
 * where a digit after the point claims precision this instrument lacks.
 */
export const formatRatio = (ratio: number): string => {
    if (!Number.isFinite(ratio)) return 'n/a';
    if (ratio >= 100) return `${ratio.toFixed(0)}x`;
    if (ratio >= 10) return `${ratio.toFixed(1)}x`;
    return `${ratio.toFixed(2)}x`;
};

export const formatFraction = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

export const formatBytes = (bytes: number): string => {
    const sign = bytes < 0 ? '-' : '';
    const size = Math.abs(bytes);
    if (size < 1024) return `${sign}${size.toFixed(0)} B`;
    if (size < 1024 * 1024) return `${sign}${(size / 1024).toFixed(1)} KiB`;
    return `${sign}${(size / (1024 * 1024)).toFixed(2)} MiB`;
};

/** Soft-wrap prose to a width, on spaces, so a caveat is readable in a terminal. */
export const wrap = (text: string, width: number): string[] => {
    const words = text.split(/\s+/);
    const out: string[] = [];
    let line = '';
    for (const word of words) {
        if (line.length === 0) line = word;
        else if (line.length + 1 + word.length <= width) line = `${line} ${word}`;
        else {
            out.push(line);
            line = word;
        }
    }
    if (line.length > 0) out.push(line);
    return out;
};
