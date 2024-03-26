import React, { MutableRefObject, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import moment from 'moment';
import { constraints, Form, format, type, FormRef } from '@maif/react-forms';
import { I18nContext } from '../../../contexts';

export type SideBarRef = {
  handleSubmit: () => void
}

export default React.memo(React.forwardRef<SideBarRef, any>(({ setFinalValue, updatePage, setContentType, pages, inValue, savePath }, ref) => {
  const { translate } = useContext(I18nContext);
  const params = useParams();
  const navigate = useNavigate();
  const r: MutableRefObject<any> = useRef<FormRef>();
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
      placeholder: translate('cms.create.name_placeholder'),
      label: translate('Name'),
      constraints: [constraints.required()],
    },
    isBlockPage: {
      type: type.bool,
      label: translate('cms.sidebar.is_block_page'),
    },
    path: {
      type: type.string,
      placeholder: '/index',
      deps: ['isBlockPage'],
      visible: ({ rawValues }) => !rawValues.isBlockPage,
      help: translate('cms.create.path_placeholder'),
      label: translate('cms.create.path'),
      constraints: [
        constraints.when('isBlockPage', (v) => !!v, [
          constraints.matches(/^\//, translate('cms.create.path_slash_constraints')),
          constraints.test('path', translate('cms.create.path_paths_constraints'), (value) => (value === savePath ? true : !pages.find((p: any) => p.path === value))),
        ]),
      ],
    },
    exact: {
      type: type.bool,
      label: translate('cms.create.exact'),
      help: translate('cms.create.exact.help'),
      deps: ['isBlockPage'],
      visible: ({ rawValues }) => !rawValues.isBlockPage,
    },
    contentType: {
      type: type.string,
      format: format.select,
      label: translate('Content type'),
      options: [
        { label: 'HTML document', value: 'text/html' },
        { label: 'CSS stylesheet', value: 'text/css' },
        { label: 'Javascript script', value: 'text/javascript' },
        { label: 'Markdown document', value: 'text/markdown' },
        { label: 'Text plain', value: 'text/plain' },
        { label: 'XML content', value: 'text/xml' },
        { label: 'JSON content', value: 'application/json' },
      ],
      onAfterChange: ({ value }) => setContentType(value), //FIXME: test if entry works well
    },
    visible: {
      type: type.bool,
      label: translate('Visible'),
      help: translate('cms.create.visible_label'),
    },
    authenticated: {
      type: type.bool,
      label: translate('cms.create.authenticated'),
      help: translate('cms.create.authenticated_help'),
    },
    metadata: {
      type: type.object,
      label: 'Metadata',
      help: translate('cms.create.metadata_help'),
    },
    tags: {
      type: type.string,
      format: format.select,
      createOption: true,
      isMulti: true,
      label: 'Tags',
      help: translate('cms.create.tags_help'),
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
      label: translate('cms.create.advanced'),
      flow: ['tags', 'metadata'],
      collapsed: true,
    },
  ];
  const [value, setValue] = useState<any>({});

  useImperativeHandle(ref, () => ({
    handleSubmit() {
      r.current?.handleSubmit();
    },
  }));

  return (<>
    <nav className="col-md-3 d-md-block">
      <div className="d-flex flex-column">
        <ul className="nav d-flex flex-column mb-2 px-3">
          <li className="nav-item">
            <Form
              schema={schema}
              value={value}
              flow={flow}
              onSubmit={(v) => {
                setValue(v);
                setFinalValue(v);
              }}
              ref={r}
              footer={() => <></>} />
          </li>
        </ul>
        <div className="px-2 mb-4 mt-auto">
          {value.lastPublishedDate && (<div>
            <span>{translate('cms.create.last_update')} </span>
            <span>
              {value.lastPublishedDate && moment(value.lastPublishedDate).format('DD/MM/yy kk:mm')}
            </span>
          </div>)}
          <div className="d-flex mt-3">
            <button className="btn btn-sm btn-outline-primary me-1" style={{ flex: 1 }} type="button" onClick={() => navigate('/settings/pages', { state: { reload: true } })}>
              {translate('cms.create.back_to_pages')}
            </button>
            <button className="btn btn-sm btn-outline-success" style={{ flex: 1 }} type="button" onClick={updatePage}>
              {params.id
                ? translate('cms.create.save_modifications')
                : translate('cms.create.create_page')}
            </button>
          </div>
        </div>
      </div>
    </nav>
  </>);
}), (prevProps, nextProps) => JSON.stringify((prevProps as any).inValue) === JSON.stringify((nextProps as any).inValue) &&
  (prevProps as any).savePath === (nextProps as any).savePath);