import { Form, FormRef, type } from '@maif/react-forms';
import React, { useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { I18nContext } from '../../../contexts';
import { ContentSideView } from './ContentSideView';
import DragAndDropWrapper from './DragAndDropWrapper';

export type BodyRef = {
  handleSubmit: () => void
}
export default React.forwardRef<BodyRef, any>(({ contentType, setFinalValue, show, pages, inValue, publish, history, editable }, ref) => {
  const { translate } = useContext(I18nContext);
  const r = useRef<FormRef>();

  useEffect(() => {
    setValue({ draft: inValue || '' });
  }, [inValue]);

  const [value, setValue] = useState<any>({});

  useImperativeHandle(ref, () => ({
    handleSubmit() {
      r.current?.handleSubmit();
    },
  }));

  const handleDrop = (file: any) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      setValue({ draft: text });
    };
    reader.readAsText(file);
  };

  const schema = {
    draft: {
      type: type.string,
      label: null,
      help: translate('cms.create.draft_help'),
      render: (formProps: any) => {
        const [draft, setDraft] = useState('');

        useEffect(() => {
          setDraft(value.draft);
        }, [value.draft]);

        return (
          <DragAndDropWrapper handleDrop={handleDrop}>
            <ContentSideView
              {...formProps}
              pages={pages}
              editable={editable}
              contentType={contentType}
              publish={publish}
              value={draft}
              onChange={(e: any) => {
                setDraft(e);
                formProps.onChange(e);
              }}
            />
          </DragAndDropWrapper>
        );
      },
    },
  };

  const flow = ['draft'];

  return (
    <div
      style={{
        display: show ? 'block' : 'none',
        flex: 1,
      }}
    >
      <Form
        schema={schema}
        value={value}
        flow={flow}
        onSubmit={(body) => {
          setValue(body);
          setFinalValue(body);
        }}
        ref={r}
        footer={() => <></>}
      />
    </div>
  );
}
);
