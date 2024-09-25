import React, { useContext, useRef } from 'react';
import { Flow, Form, FormRef, Schema, Option, TBaseObject } from '@maif/react-forms';

import { I18nContext } from '../../contexts';
import { IBaseModalProps, IFormModalProps } from './types';

export const FormModal = <T extends TBaseObject>({
  title,
  value,
  schema,
  flow,
  onSubmit,
  options,
  actionLabel,
  close,
  noClose
}: IFormModalProps<T> & IBaseModalProps) => {
  const ref = useRef<FormRef>();

  const { translate } = useContext(I18nContext);

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={() => close()} />
      </div>
      <div className="modal-body">
        <Form
          ref={ref}
          schema={schema}
          flow={flow}
          value={value}
          onSubmit={(data) => {
            onSubmit(data)
            if (!noClose) {
              close();
            }
          }}
          options={{
            ...(options || {}),
            actions: {
              ...options?.actions || {},
              submit: { display: false },
            }
          }}
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => close()}>
          {translate('Cancel')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={() => ref.current?.handleSubmit()}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
