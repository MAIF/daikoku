import { Form, type } from '@maif/react-forms';
import React, { useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { I18nContext } from '../../../core';
import { ContentSideView } from './ContentSideView';
import DragAndDropWrapper from './DragAndDropWrapper';

export default React.forwardRef(
    ({ contentType, setFinalValue, show, pages, inValue, publish, history }, ref) => {
        const { translateMethod } = useContext(I18nContext);
    const r = useRef();

    useEffect(() => {
      setValue({ draft: inValue || '' });
    }, [inValue]);

    const [value, setValue] = useState({});

    useImperativeHandle(ref, () => ({
      handleSubmit() {
                r.current.handleSubmit();
      },
    }));

    const handleDrop = (file: any) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
                const text = e.target.result;
        setValue({ draft: text });
      };
      reader.readAsText(file);
    };

    const schema = {
      draft: {
        type: type.string,
        label: null,
        help: translateMethod('cms.create.draft_help'),
        render: (formProps: any) => {
          const [draft, setDraft] = useState('');

          useEffect(() => {
        setDraft(value.draft);
}, [(value as any).draft]);
            setDraft((value as any).draft);
                    }, [value.draft]);

          return (
            <DragAndDropWrapper handleDrop={handleDrop}>
              <ContentSideView
                {...formProps}
                pages={pages}
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
          footer={() => null}
        />
      </div>
    );
  }
);
