import type { EOIMReduxReducerActionType } from '../enums/EOIMReduxReducerActionType';

/** Dispatched once per frame that touched anything a registered reducer watches. */
export type TOIMReduxUpdateAction = {
    type: EOIMReduxReducerActionType.UPDATE;
};
