import { Form, type } from '@maif/react-forms';
import React, { useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { I18nContext } from '../../../core';
// @ts-expect-error TS(6142): Module './ContentSideView' was resolved to '/Users... Remove this comment to see the full error message
import { ContentSideView } from './ContentSideView';
// @ts-expect-error TS(6142): Module './DragAndDropWrapper' was resolved to '/Us... Remove this comment to see the full error message
import DragAndDropWrapper from './DragAndDropWrapper';

export default React.forwardRef(
  // @ts-expect-error TS(2345): Argument of type '({ contentType, setFinalValue, s... Remove this comment to see the full error message
  ({ contentType, setFinalValue, show, pages, inValue, publish, history }, ref) => {
    // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
    const { translateMethod } = useContext(I18nContext);
    const r = useRef();

    useEffect(() => {
      setValue({ draft: inValue || '' });
    }, [inValue]);

    const [value, setValue] = useState({});

    useImperativeHandle(ref, () => ({
      handleSubmit() {
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        r.current.handleSubmit();
      },
    }));

    const handleDrop = (file: any) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        // @ts-expect-error TS(2531): Object is possibly 'null'.
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
    // @ts-expect-error TS(2339): Property 'draft' does not exist on type '{}'.
    setDraft(value.draft);
}, [(value as any).draft]);
            setDraft((value as any).draft);
          // @ts-expect-error TS(2339): Property 'draft' does not exist on type '{}'.
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
