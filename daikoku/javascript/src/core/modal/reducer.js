import { CLOSE_MODAL, OPEN_MODAL } from './action-types';

const initialState = {
  modalType: null,
  modalProps: {},
};

export function modalReducer(state = initialState, action) {
  switch (action.type) {
  case OPEN_MODAL:
    return {
      modalProps: action.modalProps,
      modalType: action.modalType,
      type: action.type,
    };

  case CLOSE_MODAL:
    return initialState;

  default:
    return state;
  }
}
