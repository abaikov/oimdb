export const chainLevelOf = (input: string, level: number): string => `${input}>${level}`;

export const chainWindowOf = (labels: readonly string[], from: number, count: number): string => {
    let text = labels[from];
    for (let i = from + 1; i < from + count; i++) text = `${text},${labels[i]}`;
    return text;
};

export const chainHeadOf = (label: string, depth: number): string => {
    let text = label;
    for (let level = 1; level <= depth; level++) text = chainLevelOf(text, level);
    return text;
};

export const diamondLeftOf = (label: string): string => `${label}<`;

export const diamondRightOf = (label: string): string => `>${label}`;

export const diamondJoinOf = (left: string, right: string): string => `${left}|${right}`;

export const diamondHeadOf = (label: string): string => diamondJoinOf(diamondLeftOf(label), diamondRightOf(label));
