import { OIM_COLUMN_GROUP_KEY_SEPARATOR } from '../constants/OIM_COLUMN_GROUP_KEY_SEPARATOR';

export function getOIMColumnGroupKey(sortedColumnNames: readonly string[]): string {
    return `${OIM_COLUMN_GROUP_KEY_SEPARATOR}${sortedColumnNames.join(OIM_COLUMN_GROUP_KEY_SEPARATOR)}`;
}
