import { CLOSE_MODAL, OPEN_MODAL } from './';

export const openModal = ({ modalProps, modalType }) => dispatch => {
  return dispatch({
    type: OPEN_MODAL,
    modalProps,
    modalType,
  });
};

export const closeModal = () => dispatch => {
  return dispatch({
    type: CLOSE_MODAL,
  });
};
