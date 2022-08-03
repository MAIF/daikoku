import React, { useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import moment from 'moment';
import { SelectInput } from '@maif/react-forms';
import { constraints, Form, format, type } from '@maif/react-forms';
import { I18nContext } from '../../../core';
import { DivideCircle } from 'react-feather';
// @ts-expect-error TS(2339): Property 'setFinalValue' does not exist on type '{... Remove this comment to see the full error message
export default React.memo(React.forwardRef(({ setFinalValue, updatePage, setContentType, pages, inValue, savePath }, ref) => {
    // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
    const { translateMethod } = useContext(I18nContext);
    const params = useParams();
    const navigate = useNavigate();
    const r = useRef();
    useEffect(() => {
        setValue(inValue || {
            name: '',
            path: '',
            contentType: 'text/html',
            visible: true,
            authenticated: false,
            metadata: {},
            tags: [],
            isBlockPage: false,
            exact: true,
            history: [],
        });
    }, [inValue]);
    const schema = {
        lastPublishedDate: {
            type: type.string,
        },
        body: {
            type: type.string,
        },
        name: {
            type: type.string,
            placeholder: translateMethod('cms.create.name_placeholder'),
            label: translateMethod('Name'),
            constraints: [constraints.required()],
        },
        isBlockPage: {
            type: type.bool,
            label: translateMethod('cms.sidebar.is_block_page'),
        },
        path: {
            type: type.string,
            placeholder: '/index',
            visible: {
                ref: 'isBlockPage',
                test: (v: any) => !v,
            },
            help: translateMethod('cms.create.path_placeholder'),
            label: translateMethod('cms.create.path'),
            constraints: [
                constraints.when('isBlockPage', (v) => !!v, [
                    // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
                    constraints.matches('^/', translateMethod('cms.create.path_slash_constraints')),
                    constraints.test('path', translateMethod('cms.create.path_paths_constraints'), (value) => (value === savePath ? true : !pages.find((p: any) => p.path === value))),
                ]),
            ],
        },
        exact: {
            type: type.bool,
            label: translateMethod('cms.create.exact'),
            help: translateMethod('cms.create.exact'),
            visible: {
                ref: 'isBlockPage',
                test: (v: any) => !v,
            },
        },
        contentType: {
            type: type.string,
            label: translateMethod('Content type'),
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            render: ({ rawValues, value, onChange, error }: any) => (<SelectInput value={value} possibleValues={[
                    { label: 'HTML document', value: 'text/html' },
                    { label: 'CSS stylesheet', value: 'text/css' },
                    { label: 'Javascript script', value: 'text/javascript' },
                    { label: 'Markdown document', value: 'text/markdown' },
                    { label: 'Text plain', value: 'text/plain' },
                    { label: 'XML content', value: 'text/xml' },
                    { label: 'JSON content', value: 'application/json' },
                ]} onChange={(contentType) => {
                    setContentType(contentType);
                    onChange(contentType);
                }}/>),
        },
        visible: {
            type: type.bool,
            label: translateMethod('Visible'),
            help: translateMethod('cms.create.visible_label'),
        },
        authenticated: {
            type: type.bool,
            label: translateMethod('cms.create.authenticated'),
            help: translateMethod('cms.create.authenticated_help'),
        },
        metadata: {
            type: type.object,
            label: 'Metadata',
            help: translateMethod('cms.create.metadata_help'),
        },
        tags: {
            type: type.string,
            format: format.select,
            createOption: true,
            isMulti: true,
            label: 'Tags',
            help: translateMethod('cms.create.tags_help'),
        },
    };
    const flow = [
        'name',
        'isBlockPage',
        'exact',
        'path',
        'contentType',
        'visible',
        'authenticated',
        {
            label: translateMethod('cms.create.advanced'),
            flow: ['tags', 'metadata'],
            collapsed: true,
        },
    ];
    const [value, setValue] = useState({});
    useImperativeHandle(ref, () => ({
        handleSubmit() {
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            r.current.handleSubmit();
        },
    }));
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <nav className="col-md-3 d-md-block">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex flex-column">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ul className="nav d-flex flex-column mb-2 px-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <li className="nav-item">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Form schema={schema} value={value} flow={flow} onSubmit={(v) => {
            setValue(v);
            setFinalValue(v);
        // @ts-expect-error TS(2322): Type '() => null' is not assignable to type '(prop... Remove this comment to see the full error message
        }} ref={r} footer={() => null}/>
                </li>
              </ul>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="px-2 mb-4 mt-auto">
                {/* @ts-expect-error TS(2339): Property 'lastPublishedDate' does not exist on typ... Remove this comment to see the full error message */}
                {value.lastPublishedDate && (<div>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>{translateMethod('cms.create.last_update')} </span>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>
                      {/* @ts-expect-error TS(2339): Property 'lastPublishedDate' does not exist on typ... Remove this comment to see the full error message */}
                      {value.lastPublishedDate &&
                // @ts-expect-error TS(2339): Property 'lastPublishedDate' does not exist on typ... Remove this comment to see the full error message
                moment(value.lastPublishedDate).format('DD/MM/yy kk:mm')}
                    </span>
                  </div>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="d-flex mt-3">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button className="btn btn-sm btn-outline-primary me-1" style={{ flex: 1 }} type="button" onClick={() => navigate('/settings/pages', { state: { reload: true } })}>
                    {translateMethod('cms.create.back_to_pages')}
                  </button>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button className="btn btn-sm btn-outline-success" style={{ flex: 1 }} type="button" onClick={updatePage}>
                    {params.id
            ? translateMethod('cms.create.save_modifications')
            : translateMethod('cms.create.create_page')}
                  </button>
                </div>
              </div>
            </div>
          </nav>
        </>);
}), (prevProps, nextProps) => JSON.stringify((prevProps as any).inValue) === JSON.stringify((nextProps as any).inValue) &&
    (prevProps as any).savePath === (nextProps as any).savePath);



      return (<>
          <nav className="col-md-3 d-md-block">
            <div className="d-flex flex-column">
              <ul className="nav d-flex flex-column mb-2 px-3">
                <li className="nav-item">
                  <Form schema={schema} value={value} flow={flow} onSubmit={(v) => {
        setValue(v);
        setFinalValue(v);
    }} ref={r} footer={() => null}/>
                </li>
              </ul>
              <div className="px-2 mb-4 mt-auto">
                {(value as any).lastPublishedDate && (<div>
                    <span>{translateMethod('cms.create.last_update')} </span>
                    <span>
                      {(value as any).lastPublishedDate &&
            moment((value as any).lastPublishedDate).format('DD/MM/yy kk:mm')}
                    </span>
                  </div>)}
                <div className="d-flex mt-3">
                  <button className="btn btn-sm btn-outline-primary me-1" style={{ flex: 1 }} type="button" onClick={() => navigate('/settings/pages', { state: { reload: true } })}>
                    {translateMethod('cms.create.back_to_pages')}
                  </button>
                  <button className="btn btn-sm btn-outline-success" style={{ flex: 1 }} type="button" onClick={updatePage}>
                    {params.id
        ? translateMethod('cms.create.save_modifications')
        : translateMethod('cms.create.create_page')}
                  </button>
                </div>
              </div>
            </div>
          </nav>
        </>);
    }
  ),
  // @ts-expect-error TS(7006): Parameter 'prevProps' implicitly has an 'any' type... Remove this comment to see the full error message
  (prevProps, nextProps) =>
    JSON.stringify(prevProps.inValue) === JSON.stringify(nextProps.inValue) &&
    prevProps.savePath === nextProps.savePath
);
