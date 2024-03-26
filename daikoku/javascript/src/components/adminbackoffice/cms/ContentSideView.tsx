import { CodeInput, SelectInput } from '@maif/react-forms';
import RefAutoComplete from 'antd/lib/auto-complete';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Select, { SingleValue } from 'react-select';
import { ModalContext } from '../../../contexts';

import { I18nContext } from '../../../contexts';
import Editor from './Editor';
import Helpers from './helpers.json';

const CONTENT_TYPES_TO_MODE = {
  'application/json': 'json',
  'text/html': 'html',
  'text/javascript': 'javascript',
  'text/css': 'css',
  'text/markdown': 'mardown',
  'text/plain': 'plain_text',
  'text/xml': 'xml',
};

const LinksView = ({
  editor,
  onChange
}: any) => {
  const { translate } = useContext(I18nContext);

  return (
    <div>
      <span>{translate('cms.content_side_view.choose_link')}</span>
      <Copied>
        {(setShow: any) => <Select
          options={[
            {
              label: translate('cms.content_side_view.notifications'),
              value: 'notifications',
            },
            { label: translate('cms.content_side_view.sign_in'), value: 'login' },
            { label: translate('cms.content_side_view.logout'), value: 'logout' },
            { label: translate('cms.content_side_view.language'), value: 'language' },
            { label: translate('cms.content_side_view.back_office'), value: 'backoffice' },
            { label: translate('cms.content_side_view.sign_up'), value: 'signup' },
            { label: translate('cms.content_side_view.home'), value: 'home' },
          ]}
          onChange={(link: SingleValue<{ label: string, value: string }>) => {
            setShow(true);
            onChange();
            copy(editor, `{{daikoku-links-${link?.value}}}`);
          }}
        />}
      </Copied>
    </div>
  );
};

const Copied = ({
  children
}: any) => {
  const { translate } = useContext(I18nContext);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) setTimeout(() => setShow(false), 500);
  }, [show]);

  if (show)
    return (
      <div
        className="my-2 text-center py-2"
        style={{
          backgroundColor: '#fff',
          borderRadius: '6px',
        }}
      >
        <span>{translate('cms.inserted')}</span>
      </div>
    );
  else return children(setShow);
};
interface Range {
  from: any;
  to: any;
}
const copy = (editor: any, text: string) => {
  editor.dispatch(editor.state.changeByRange((range: Range) => ({
    changes: [{ from: range.from, insert: text }],
    range
  })))
  editor.focus()

  // r.session.insert(r.getCursorPosition(), text);
};

const PagesView = ({
  editor,
  pages,
  prefix,
  title,
  onChange
}: any) => (
  <div>
    <span>{title}</span>
    <Copied>
      {(setShow: any) => <Select
        options={pages.map((page: any) => ({
          label: page.name,
          value: page.id
        }))}
        onChange={(page: SingleValue<{ label: string, value: string }>) => {
          setShow(true);
          onChange();
          copy(editor, `{{${prefix} "${page?.value}"}}`);
        }}
      />}
    </Copied>
  </div>
);

const TopActions = ({
  setSideView,
  publish,
  setSelector
}: any) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const navigate = useNavigate();
  const select = (id: any) => {
    setSelector(undefined);
    setSideView(true);
  };

  return (
    <div
      className="d-flex justify-content-between"
      style={{
        position: 'absolute',
        top: '-42px',
        right: 0,
        left: 0,
      }}
      id="content_sideview_parent"
    >
      <button className="btn btn-sm btn-outline-primary me-1" type="button" onClick={select}>
        <i className="fas fa-plus pe-1" />
        {translate('cms.content_side.new_action')}
      </button>
      <div className="d-flex">
        <button className="btn btn-sm btn-outline-primary" onClick={() => navigate('revisions')}>
          Révisions
        </button>
        <button
          className="btn btn-sm btn-outline-success ms-1"
          type="button"
          onClick={() => {
            (confirm({ message: translate('cms.content_side.publish_label') }))
              .then((ok) => {
                if (ok) {
                  publish();
                }
              });
          }}
        >
          {translate('cms.content_side.publish_button')}
        </button>
      </div>
    </div>
  );
};

const HelperView = ({
  content,
  onChange,
  editor
}: any) => {
  const [value, setValue] = useState(content.example);
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    setValue(content.example);
  }, [content.example]);

  return (
    <div>
      <h5>{translate(`cms.content_side_view.${content.name}`)}</h5>
      {content.parameters && (
        <div>
          <h6>Parameters</h6>
          <ul>
            {(content.parameters || []).map((name: any) => <li key={`${name}`}>{name}</li>)}
          </ul>
        </div>
      )}
      {content.link && (
        <a
          className="btn btn-sm btn-outline-info my-2"
          href={`https://maif.github.io/daikoku/swagger-ui/index.html${content.link}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Link to the model
        </a>
      )}
      <CodeInput onChange={setValue} value={value} />
      <button
        className="btn btn-sm btn-outline-success mt-3"
        onClick={() => {
          onChange();
          copy(editor, value);
        }}
      >
        Insérer
      </button>
    </div>
  );
};

export const ContentSideView = ({
  value,
  onChange,
  pages,
  publish,
  contentType,
  editable
}: any) => {
  const { translate } = useContext(I18nContext);
  const [sideView, setSideView] = useState(false);
  const [selector, setSelector] = useState<any>('');
  const [search, setSearch] = useState('');
  const [helpersList, setHelpers] = useState<any>([]);

  const editorRef = useRef<any>();

  const [selectedPage, setSelectedPage] = useState<any>({
    top: 0,
    left: 0,
    pageName: undefined,
  });

  const [height, setHeight] = useState(500);

  useEffect(() => {
    setHelpers(
      Helpers.reduce(
        (acc, curr) => ({
          ...acc,

          [curr.important || curr.category]: {
            collapsed: true,
            helpers: [
              ...((acc[curr.important || curr.category] || {}).helpers || []),
              {
                ...curr,
                term: translate(`cms.content_side_view.${curr.name}`)
                  .toLowerCase()
                  .replace(/[\[\]&]+/g, ''),
              },
            ],
          }
        }), {}
      )
    );

    searchHeight();
  }, []);

  const searchHeight = () => {
    const elem = document.getElementById('content_sideview_parent')
    if (!elem) {
      setTimeout(searchHeight, 250);
    } else {
      setHeight(window.innerHeight - elem.getBoundingClientRect().top - 75);
    }
  };

  //@ts-ignore //FIXME???
  window.pages = pages;

  const navigate = useNavigate()

  const filterHelpers = (value: any) => {
    const term = value.toLowerCase().replace(/[\[\]&]+/g, '');
    setSearch(value);

    setHelpers(Object.fromEntries(Object.entries(helpersList).map(([g, { helpers, ...rest }]: any) => [
      g,
      {
        ...rest,
        collapsed: term.length > 0 ? false : true,
        helpers: (helpers as any).map((helper: any) => ({
          ...helper,
          filtered: term.length === 0 ? false : !helper.term.includes(term)
        })),
      },
    ])));
  };

  return (<div className="d-flex flex-column" style={{
    position: 'relative',
    marginTop: editable ? '52px' : 0,
    flex: 1,
  }}>
    <button className="btn btn-sm btn-outline-primary m-1" type="button" style={{ maxWidth: 200 }}
      onClick={() => navigate('/settings/pages', { state: { reload: true } })}>
      {translate('cms.create.back_to_pages')}
    </button>
    {editable && <>
      <TopActions setSideView={setSideView} publish={publish} setSelector={setSelector} />
      <span style={{
        fontStyle: 'italic',
        fontSize: '13px',
      }}>
        {translate('cms.body.drag_and_drop_advice')}
      </span>
    </>}
    <div style={{
      position: 'relative',
      border: '1px solid rgba(225,225,225,.5)',
      flex: 1,
    }}>
      {selectedPage.pageName && (
        <Link
          className="btn btn-sm px-1"
          style={{
            position: 'absolute',
            zIndex: 100,
            top: selectedPage.top - 42,
            left: selectedPage.left,
            backgroundColor: '#fff',
            border: '1px solid #f0f1f6',
            boxShadow: '0 1px 3px rgb(0 0 0 / 15%)',
          }}
          to={`/settings/pages/edit/${(selectedPage as any).id}`}
          onClick={() => setSelectedPage({ pageName: undefined })}>
          {`${translate('cms.content_side_view.edit')} ${selectedPage.pageName}`}
        </Link>)}
      <Editor value={value} onChange={onChange} readOnly={!editable} setRef={(editorInstance: any) => {
        editorRef.current = editorInstance
        // editorInstance.container.style.resize = 'both';
        // document.addEventListener('mouseup', (e) => editorInstance.resize());
      }} mode={CONTENT_TYPES_TO_MODE[contentType] || 'html'} height={height} width="-1" />
      {sideView && (<div style={{
        backgroundColor: '#fff',
        position: 'absolute',
        inset: 0,
      }}>
        <div className="d-flex" style={{ height: '100%', position: 'relative' }}>
          {selector !== 'history' && (<div className="p-3" style={{
            flex: !selector ? 1 : 0.75,
            backgroundColor: '#efefef',
            overflowY: 'scroll',
          }}>
            <div>
              <input type="text" className="form-control mb-2" placeholder={translate('cms.content_side_view.search_text')} value={search} onChange={(e) => filterHelpers(e.target.value)} style={{ border: 'none' }} />
            </div>
            <div className="d-flex flex-column">
              {Object.entries(helpersList)
                .map(([groupName, { helpers, collapsed }]: any) => (
                  <div
                    onClick={() => setHelpers(Object.fromEntries(Object.entries(helpersList).map(([g, { collapsed, ...rest }]: any) => {
                      if (g === groupName)
                        return [
                          g,
                          {
                            ...rest,
                            collapsed: !collapsed,
                            helpers: rest.helpers.map((helper: any) => ({
                              ...helper,
                              filtered: false
                            })),
                          },
                        ];
                      return [g, { ...rest, collapsed }];
                    })))}>
                    {helpers.filter((helper) => !helper.filtered).length > 0 && (
                      <div
                        style={{
                          background: '#fff',
                        }}
                        className="p-2 px-3 mb-1 d-flex justify-content-between align-items-center">
                        <span>{groupName}</span>
                        <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'}`}></i>
                      </div>
                    )}
                    {!collapsed &&
                      helpers.filter((helper) => !helper.filtered)
                        .map((helper) => (
                          <button
                            id={helper.name}
                            type="button"
                            key={helper.name}
                            className="py-2 ps-3 mb-2"
                            style={{
                              textAlign: 'left',
                              flex: 1,
                              width: '100%',
                              border: 'none',
                              backgroundColor: selector?.name === helper.name ? '#bdc3c7' : '#ddd',
                              borderRight: `${selector?.name === helper.name ? 2 : 0}px solid`,
                              fontSize: '14px',
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelector(helper);
                            }}>
                            {translate(`cms.content_side_view.${helper.name}`)}
                          </button>
                        ))}
                  </div>))}
            </div>
          </div>)}
          <div style={{ flex: selector ? 1 : 0 }} className="ms-2 p-3">
            <i className="fas fa-times" style={{
              cursor: 'pointer',
              padding: '6px',
              position: 'absolute',
              top: '6px',
              right: '6px',
            }} onClick={() => setSideView(false)} />
            {(selector as any)?.name === 'links' && (<LinksView editor={editorRef.current} onChange={() => setSideView(false)} />)}
            {(selector as any)?.name === 'pages' && (<PagesView pages={pages} prefix="daikoku-page-url" title={translate('cms.content_side_view.link_to_insert')} editor={editorRef.current} onChange={() => setSideView(false)} />)}
            {(selector as any)?.name === 'blocks' && (<PagesView pages={pages} prefix="daikoku-include-block" title={translate('cms.content_side_view.block_to_render')} editor={editorRef.current} onChange={() => setSideView(false)} />)}
            {((selector as any)?.name.startsWith('daikoku') ||
              !['links', 'blocks', 'pages'].includes((selector as any)?.name)) &&
              selector && (<HelperView editor={editorRef.current} onChange={() => setSideView(false)} content={selector} />)}
          </div>
        </div>
      </div>)}
    </div>
  </div>);
};
