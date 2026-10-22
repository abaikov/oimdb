export function oimIsPlain(source: object): boolean {
    const proto = Object.getPrototypeOf(source) as object | null;
    return proto === Object.prototype || proto === null;
}