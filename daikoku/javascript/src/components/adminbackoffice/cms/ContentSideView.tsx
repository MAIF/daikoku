import { CodeInput, SelectInput } from '@maif/react-forms';
import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../core';
// @ts-expect-error TS(6142): Module './Editor' was resolved to '/Users/qaubert/... Remove this comment to see the full error message
import Editor from './Editor';
// @ts-expect-error TS(2732): Cannot find module './helpers.json'. Consider usin... Remove this comment to see the full error message
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span>{translateMethod('cms.content_side_view.choose_link')}</span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Copied>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {(setShow: any) => <SelectInput
          possibleValues={[
            {
              label: translateMethod('cms.content_side_view.notifications'),
              value: 'notifications',
            },
            { label: translateMethod('cms.content_side_view.sign_in'), value: 'login' },
            { label: translateMethod('cms.content_side_view.logout'), value: 'logout' },
            { label: translateMethod('cms.content_side_view.language'), value: 'language' },
            { label: translateMethod('cms.content_side_view.back_office'), value: 'backoffice' },
            { label: translateMethod('cms.content_side_view.sign_up'), value: 'signup' },
            { label: translateMethod('cms.content_side_view.home'), value: 'home' },
          ]}
          onChange={(link) => {
            setShow(true);
            onChange();
            copy(editor, `{{daikoku-links-${link}}}`);
          }}
        />}
      </Copied>
    </div>
  );
};

const Copied = ({
  children
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) setTimeout(() => setShow(false), 500);
  }, [show]);

  if (show)
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div
        className="my-2 text-center py-2"
        style={{
          backgroundColor: '#fff',
          borderRadius: '6px',
        }}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span>{translateMethod('cms.inserted')}</span>
      </div>
    );
  else return children(setShow);
};

const copy = (r: any, text: any) => {
  r.session.insert(r.getCursorPosition(), text);
};

const PagesView = ({
  editor,
  pages,
  prefix,
  title,
  onChange
}: any) => (
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  <div>
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <span>{title}</span>
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <Copied>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {(setShow: any) => <SelectInput
        possibleValues={pages.map((page: any) => ({
          label: page.name,
          value: page.id
        }))}
        onChange={(page) => {
          setShow(true);
          onChange();
          copy(editor, `{{${prefix} "${page}"}}`);
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const navigate = useNavigate();
  const select = (id: any) => {
    setSelector(undefined);
    setSideView(true);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <button className="btn btn-sm btn-outline-primary me-1" type="button" onClick={select}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <i className="fas fa-plus pe-1" />
        {translateMethod('cms.content_side.new_action')}
      </button>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-sm btn-outline-primary" onClick={() => navigate('revisions')}>
          Révisions
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          className="btn btn-sm btn-outline-success ms-1"
          type="button"
          onClick={() => {
            (window.confirm(translateMethod('cms.content_side.publish_label')) as any).then((ok: any) => {
    if (ok) {
        publish();
    }
});
          }}
        >
          {translateMethod('cms.content_side.publish_button')}
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    setValue(content.example);
  }, [content.example]);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h5>{translateMethod(`cms.content_side_view.${content.name}`)}</h5>
      {content.parameters && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h6>Parameters</h6>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ul>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {(content.parameters || []).map((name: any) => <li key={`${name}`}>{name}</li>)}
          </ul>
        </div>
      )}
      {content.link && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <a
          className="btn btn-sm btn-outline-info my-2"
          href={`https://maif.github.io/daikoku/swagger-ui/index.html${content.link}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Link to the model
        </a>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <CodeInput onChange={setValue} value={value} width="-1" height="180px" useWrapMode={true} />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
  contentType
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const [sideView, setSideView] = useState(false);
  const [selector, setSelector] = useState('');
  const [search, setSearch] = useState('');
  const [helpersList, setHelpers] = useState([]);
  const [ref, setRef] = useState();

  const [selectedPage, setSelectedPage] = useState({
    top: 0,
    left: 0,
    pageName: undefined,
  });

  const [height, setHeight] = useState(500);

  useEffect(() => {
    setHelpers(
      Helpers.reduce(
        // @ts-expect-error TS(7006): Parameter 'acc' implicitly has an 'any' type.
        (acc, curr) => ({
          ...acc,

          [curr.important || curr.category]: {
            collapsed: true,
            helpers: [
              ...((acc[curr.important || curr.category] || {}).helpers || []),
              {
                ...curr,
                term: translateMethod(`cms.content_side_view.${curr.name}`)
                  .toLowerCase()
                  .replace(/[\[\]&]+/g, ''),
              },
            ],
          }
        }),
        {}
      )
    );

    searchHeight();
  }, []);

  const searchHeight = () => {
    if (!document.getElementById('content_sideview_parent')) setTimeout(searchHeight, 250);
    else
      setHeight(
        window.innerHeight -
          // @ts-expect-error TS(2531): Object is possibly 'null'.
          document.getElementById('content_sideview_parent').getBoundingClientRect().top -
          75
      );
  };

  (window as any).pages = pages;

  const onMouseDown = () => {
    if (ref) {
      setTimeout(() => {
        const pos = (ref as any).getCursorPosition();
        const token = (ref as any).session.getTokenAt(pos.row, pos.column);

        const value = token ? token.value.trim() : '';
        try {
          const id = value.match(/(?:"[^"]*"|^[^"]*$)/)[0].replace(/"/g, '');
          const page = (window as any).pages.find((p: any) => p.id === id);
          setSelectedPage({
    ...(ref as any).renderer.$cursorLayer.getPixelPosition(),
    pageName: page.name,
    id,
});
        } catch (err) {
          setSelectedPage({ top: 0, left: 0, pageName: undefined });
        }
      }, 10);
    }
  };

  useEffect(() => {
    if (ref) (ref as any).on('mousedown', onMouseDown);
  }, [ref]);

  const filterHelpers = (value: any) => {
    const term = value.toLowerCase().replace(/[\[\]&]+/g, '');
    setSearch(value);

    // @ts-expect-error TS(2345): Argument of type '{ [k: string]: any; }' is not as... Remove this comment to see the full error message
    setHelpers(Object.fromEntries(Object.entries(helpersList).map(([g, { helpers, ...rest }]) => [
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

  console.log(helpersList);

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="d-flex flex-column" style={{
        position: 'relative',
        marginTop: '52px',
        flex: 1,
    }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <TopActions setSideView={setSideView} publish={publish} setSelector={setSelector}/>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span style={{
        fontStyle: 'italic',
        fontSize: '13px',
    }}>
        {translateMethod('cms.body.drag_and_drop_advice')}
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div style={{
        position: 'relative',
        border: '1px solid rgba(225,225,225,.5)',
        flex: 1,
    }}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {selectedPage.pageName && (<Link className="btn btn-sm px-1" style={{
            position: 'absolute',
            zIndex: 100,
            top: selectedPage.top - 42,
            left: selectedPage.left,
            backgroundColor: '#fff',
            border: '1px solid #f0f1f6',
            boxShadow: '0 1px 3px rgb(0 0 0 / 15%)',
        // @ts-expect-error TS(2345): Argument of type '{ pageName: undefined; }' is not... Remove this comment to see the full error message
        }} to={`/settings/pages/edit/${(selectedPage as any).id}`} onClick={() => setSelectedPage({ pageName: undefined })}>{`${translateMethod('cms.content_side_view.edit')} ${selectedPage.pageName}`}</Link>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Editor value={value} onChange={onChange} onLoad={(editorInstance: any) => {
        setRef(editorInstance);
        editorInstance.container.style.resize = 'both';
        document.addEventListener('mouseup', (e) => editorInstance.resize());
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    }} mode={CONTENT_TYPES_TO_MODE[contentType] || 'html'} height={height} width="-1"/>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {sideView && (<div style={{
            backgroundColor: '#fff',
            position: 'absolute',
            inset: 0,
        }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex" style={{ height: '100%', position: 'relative' }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {selector !== 'history' && (<div className="p-3" style={{
                flex: !selector ? 1 : 0.75,
                backgroundColor: '#efefef',
                overflowY: 'scroll',
            }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <input type="text" className="form-control mb-2" placeholder={translateMethod('cms.content_side_view.search_text')} value={search} onChange={(e) => filterHelpers(e.target.value)} style={{ border: 'none' }}/>
                  </div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="d-flex flex-column">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    {Object.entries(helpersList).map(([groupName, { helpers, collapsed }]) => (<div onClick={() => setHelpers(Object.fromEntries(Object.entries(helpersList).map(([g, { collapsed, ...rest }]) => {
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
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        {(helpers as any).filter((helper: any) => !helper.filtered).length > 0 && (<div style={{
                        background: '#fff',
                    }} className="p-2 px-3 mb-1 d-flex justify-content-between align-items-center">
                            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                            <span>{groupName}</span>
                            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                            <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'}`}></i>
                          </div>)}
                        {!collapsed &&
                    (helpers as any).filter((helper: any) => !helper.filtered)
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        .map((helper: any) => <button id={helper.name} type="button" key={helper.name} className="py-2 ps-3 mb-2" style={{
                            textAlign: 'left',
                            flex: 1,
                            width: '100%',
                            border: 'none',
                            backgroundColor: (selector as any)?.name === helper.name ? '#bdc3c7' : '#ddd',
                            borderRight: `${(selector as any)?.name === helper.name ? 2 : 0}px solid`,
                            fontSize: '14px',
                        }} onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelector(helper);
                        }}>
                            {translateMethod(`cms.content_side_view.${helper.name}`)}
                          </button>)}
                      </div>))}
                  </div>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div style={{ flex: selector ? 1 : 0 }} className="ms-2 p-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-times" style={{
            cursor: 'pointer',
            padding: '6px',
            position: 'absolute',
            top: '6px',
            right: '6px',
        }} onClick={() => setSideView(false)}/>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {(selector as any)?.name === 'links' && (<LinksView editor={ref} onChange={() => setSideView(false)}/>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {(selector as any)?.name === 'pages' && (<PagesView pages={pages} prefix="daikoku-page-url" title={translateMethod('cms.content_side_view.link_to_insert')} editor={ref} onChange={() => setSideView(false)}/>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {(selector as any)?.name === 'blocks' && (<PagesView pages={pages} prefix="daikoku-include-block" title={translateMethod('cms.content_side_view.block_to_render')} editor={ref} onChange={() => setSideView(false)}/>)}
                {((selector as any)?.name.startsWith('daikoku') ||
            !['links', 'blocks', 'pages'].includes((selector as any)?.name)) &&
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            selector && (<HelperView editor={ref} onChange={() => setSideView(false)} content={selector}/>)}
              </div>
            </div>
          </div>)}
      </div>
    </div>);
};
