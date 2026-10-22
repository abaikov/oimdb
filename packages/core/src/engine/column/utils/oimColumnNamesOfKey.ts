import { OIM_COLUMN_GROUP_KEY_SEPARATOR } from '../constants/OIM_COLUMN_GROUP_KEY_SEPARATOR';

export function oimColumnNamesOfKey(columnKey: string): readonly string[] {
    if (!columnKey.startsWith(OIM_COLUMN_GROUP_KEY_SEPARATOR)) return [columnKey];
    const joinedColumnNames = columnKey.slice(OIM_COLUMN_GROUP_KEY_SEPARATOR.length);
    return joinedColumnNames === '' ? [] : joinedColumnNames.split(OIM_COLUMN_GROUP_KEY_SEPARATOR);
}
