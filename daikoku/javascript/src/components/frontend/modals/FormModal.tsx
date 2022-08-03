import React, { useRef } from 'react';
import { Form } from '@maif/react-forms';

export const FormModal = ({
  title,
  value,
  schema,
  flow,
  onSubmit,
  options,
  closeModal,
  actionLabel
}: any) => {
  const ref = useRef();
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">{title}</h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-success" onClick={() => ref.current.handleSubmit()}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
