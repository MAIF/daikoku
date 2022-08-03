import React, { useRef } from 'react';
import { Form } from '@maif/react-forms';

export const FormModal = ({ title, value, schema, flow, onSubmit, options, closeModal, actionLabel }) => {
  const ref = useRef();
  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      <div className="modal-body">
        <Form
          ref={ref}
          schema={schema}
          flow={flow}
          value={value}
          onSubmit={(data) => {
            onSubmit(data)
            closeModal()
          }}
          options={{
            ...options, actions: {
              submit: { display: false },
              cancel: { display: false },
              reset: { display: false },
            }
          }}
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-success" onClick={() => ref.current.handleSubmit()}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
