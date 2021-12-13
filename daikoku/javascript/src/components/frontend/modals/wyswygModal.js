import React, { useState } from 'react';
import { PropTypes } from 'prop-types';
import { Spinner } from '../../utils';

const LazySingleMarkdownInput = React.lazy(() => import('../../inputs/SingleMarkdownInput'));

export const WysiwygModal = ({ closeModal, action, value, team, title }) => {
  const [newValue, setNewValue] = useState(value);

  const actionAndClose = () => {
    if (action instanceof Promise) {
      action(newValue).then(() => closeModal());
    } else {
      closeModal();
      action(newValue);
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <div className="team-selection__container">
          <React.Suspense fallback={<Spinner />}>
            <LazySingleMarkdownInput
              team={team}
              height={window.innerHeight - 300 + 'px'}
              value={newValue}
              onChange={(code) => setNewValue(code)}
            />
          </React.Suspense>
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
          Close
        </button>
        <button type="button" className="btn btn-outline-success" onClick={() => actionAndClose()}>
          Update asset
        </button>
      </div>
    </div>
  );
};

WysiwygModal.propTypes = {
  closeModal: PropTypes.func.isRequired,
  action: PropTypes.func.isRequired,
  value: PropTypes.string.isRequired,
  title: PropTypes.string,
};
