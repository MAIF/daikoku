import React, { useRef } from 'react';
import { Flow, Form, FormRef, Schema, Option, TBaseObject } from '@maif/react-forms';
import { useDispatch } from 'react-redux';

import {closeModal} from '../../../core';

export interface IFormModalProps<T> {
  title: string,
  value?: T,
  schema: Schema,
  flow?: Flow,
  onSubmit: (x: T) => void,
  options?: Option,
  actionLabel: string
}

export const FormModal = <T extends TBaseObject>({
  title,
  value,
  schema,
  flow,
  onSubmit,
  options,
  actionLabel
}: IFormModalProps<T>) => {
  const dispatch = useDispatch();
  const ref = useRef<FormRef>();

  
  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={() => dispatch(closeModal())} />
      </div>
      <div className="modal-body">
        <Form
          ref={ref}
          schema={schema}
          flow={flow}
          value={value}
          onSubmit={(data) => {
            onSubmit(data)
            dispatch(closeModal())
          }}
          options={{
            ...(options || {}),
            actions: {
              submit: { display: false },
            }
          }}
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-success" onClick={() => ref.current?.handleSubmit()}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
