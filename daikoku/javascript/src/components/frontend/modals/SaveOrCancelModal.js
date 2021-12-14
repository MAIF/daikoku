import React from 'react';
import { PropTypes } from 'prop-types';

export const SaverOrCancelModal = (props) => {
  const actionAndClose = (action) => {
    if (action instanceof Promise) {
      action().then(() => props.closeModal());
    } else {
      props.closeModal();
      action();
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{props.title}</h5>
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <div className="modal-description">{props.message}</div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-outline-danger"
          onClick={() => actionAndClose(props.dontsave)}
        >
          don't save
        </button>
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={() => actionAndClose(props.save)}
        >
          Save
        </button>
      </div>
    </div>
  );
};

SaverOrCancelModal.propTypes = {
  closeModal: PropTypes.func.isRequired,
  dontsave: PropTypes.func.isRequired,
  save: PropTypes.func.isRequired,
  message: PropTypes.string,
  title: PropTypes.string,
};
