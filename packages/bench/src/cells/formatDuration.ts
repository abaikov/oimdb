export const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds)) return '∞';
    if (seconds < 90) return `${Math.round(seconds)} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 90) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
};

export const parseDuration = (text: string): number => {
    const match = /^(\d+(?:\.\d+)?)(s|m|h)?$/.exec(text.trim());
    if (match === null) throw new Error(`Cannot read the duration "${text}". Use 90s, 30m or 2h.`);
    const value = Number(match[1]);
    const unit = match[2] ?? 'm';
    return unit === 's' ? value : unit === 'm' ? value * 60 : value * 3600;
};
