import React from 'react';
import { Form } from '@maif/react-forms';

export const FormModal = ({ title, value, schema, flow, onSubmit, options, closeModal }) => {
  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      <div className="modal-body">
        <Form 
          schema={schema}
          flow={flow}
          value={value}
          onSubmit={(data) => {
            onSubmit(data)
            closeModal()
          }}
          options={options}
        />
      </div>
    </div>
  );
};
