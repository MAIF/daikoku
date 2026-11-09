import { Form, FormRef, TBaseObject } from '@maif/react-forms';
import { useContext, useRef, useState } from 'react';

import { DismissibleError } from '../../components/utils/DismissibleError';
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
  noClose,
  description,
  moreAction
}: IFormModalProps<T> & IBaseModalProps) => {
  const ref = useRef<FormRef>(undefined);
  const [error, setError] = useState<string>();

  const { translate } = useContext(I18nContext);

  const submit = (data: T) => {
    Promise.resolve(onSubmit(data)).then((message) => {
      if (message) {
        setError(message);
        return;
      }

      if (!noClose) {
        close();
      }
    });
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={() => close()} />
      </div>
      <div className="modal-body">
        {!!description && description}
        <Form
          ref={ref}
          schema={schema}
          flow={flow}
          value={value}
          onSubmit={submit}
          options={{
            ...options,
            actions: {
              ...options?.actions,
              submit: { display: false },
            }
          }}
        />
        {!!error && <DismissibleError message={error} onClose={() => setError(undefined)} />}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn --secondary" onClick={() => close()}>
          {translate('Cancel')}
        </button>
        {!!moreAction && moreAction}
        <button type="button" className="btn --primary" onClick={() => ref.current?.handleSubmit()}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
