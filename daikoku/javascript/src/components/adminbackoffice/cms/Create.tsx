import React, { useContext, useEffect, useRef, useState } from 'react';
import { I18nContext } from '../../../core';
import { useNavigate, useParams } from 'react-router-dom';
import * as Services from '../../../services';
import { getApolloContext } from '@apollo/client';

// @ts-expect-error TS(6142): Module './Sidebar' was resolved to '/Users/qaubert... Remove this comment to see the full error message
import Sidebar from './Sidebar';
// @ts-expect-error TS(6142): Module './Body' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
import Body from './Body';
import { Spinner } from '../..';

export const Create = (props: any) => {
  const { client } = useContext(getApolloContext());
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const params = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  const sideRef = useRef();
  const bodyRef = useRef();

  const [inValue, setInValue] = useState({});
  const [savePath, setSavePath] = useState();
  const [contentType, setContentType] = useState();

  const [finalSideValue, setFinalSideValue] = useState();
  const [finalBodyValue, setFinalBodyValue] = useState();
  const [action, setFormAction] = useState();

  useEffect(() => {
    const id = params.id;
    if (id) {
      setLoading(true);
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({ query: Services.graphql.getCmsPage(id) }).then((res) => {
        if (res.data) {
          const { draft, history, ...side } = res.data.cmsPage;
          setFinalBodyValue(undefined);
          setFinalSideValue(undefined);
          setFormAction(undefined);
          setInValue({
            side: {
              ...side,
              metadata: side.metadata ? JSON.parse(side.metadata) : {},
              isBlockPage: !side.path || side.path.length === 0,
            },
            history,
            draft,
          });
          setContentType(side.contentType);
          setSavePath(side.path);
        }
        setLoading(false);
      });
    }
  }, [params.id]);

  useEffect(() => {
    const onUpdatePreview = action === 'update_before_preview';
    const onPublish = action === 'publish';

    if ((action === 'update' || onUpdatePreview || onPublish) && finalSideValue && finalBodyValue) {
      if (onPublish) {
        const lastPublishedDate = Date.now();
        const updatedPage = {
    // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
    ...finalSideValue,
    // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
    ...finalBodyValue,
    body: (finalBodyValue as any).draft,
    lastPublishedDate,
};
        Services.createCmsPage(params.id, updatedPage).then(() => {
          const { draft, ...side } = updatedPage;
          setInValue({
            draft,
            side,
          });
          reset();
        });
      } else {
        Services.createCmsPage(params.id, {
          // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
          ...finalSideValue,
          // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
          ...finalBodyValue,
        }).then((res) => {
          reset();
          if (!res.error && !params.id)
            navigate('/settings/pages', {
              state: {
                reload: true,
              },
            });
          else if (res.error) window.alert(res.error);
          else setSavePath((finalSideValue as any).path);

          if (onUpdatePreview) setTimeout(() => setTab(1), 100);
        });
      }
    }
  }, [action, finalSideValue, finalBodyValue]);

  const reset = () => {
    setFormAction(undefined);
    setFinalSideValue(undefined);
    setFinalBodyValue(undefined);
  };

  const updatePage = () => {
    // @ts-expect-error TS(2345): Argument of type '"update"' is not assignable to p... Remove this comment to see the full error message
    setFormAction('update');
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    [bodyRef, sideRef].map((r) => r.current.handleSubmit());
  };

  const onPublish = () => {
    // @ts-expect-error TS(2345): Argument of type '"publish"' is not assignable to ... Remove this comment to see the full error message
    setFormAction('publish');
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    [bodyRef, sideRef].map((r) => r.current.handleSubmit());
  };

  const TabButton = ({
    title,
    onClose,
    onClick,
    selected
  }: any) => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div
      style={{
        height: '42px',
        backgroundColor: '#fff',
        display: 'flex',
        alignItems: 'center',
        boxShadow: selected ? '0 1px 3px rgba(25,25,25,.5)' : 'none',
        // @ts-expect-error TS(1117): An object literal cannot have multiple properties ... Remove this comment to see the full error message
        backgroundColor: 'var(--sidebar-bg-color, #f8f9fa)',
        zIndex: selected ? 2 : 0,
      }}
      onClick={onClick}
      className="px-3"
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <button className="btn btn-sm" type="button">
        {title}
      </button>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {onClose && <i className="fas fa-times" />}
    </div>
  );

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  if (loading) return <Spinner />;

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Sidebar setFinalValue={setFinalSideValue} updatePage={updatePage} ref={sideRef} savePath={savePath} pages={props.pages} setContentType={setContentType} inValue={(inValue as any).side}/>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="p-2 d-flex flex-column" style={{ flex: 1, overflow: 'hidden' }}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex align-items-center mt-2">
          {[
        { title: translateMethod('cms.create.draft'), id: 0, showPreview: () => setTab(0) },
        {
            title: translateMethod('cms.create.draft_preview'),
            id: 1,
            showPreview: () => {
                // @ts-expect-error TS(2345): Argument of type '"update_before_preview"' is not ... Remove this comment to see the full error message
                setFormAction('update_before_preview');
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                [bodyRef, sideRef].map((r) => r.current.handleSubmit());
            },
        },
        { title: translateMethod('cms.create.content'), id: 2 },
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    ].map(({ title, id, showPreview }) => !savePath ? null : (<TabButton title={title} selected={tab === id} key={`tabButton${id}`} onClick={() => {
            if (showPreview)
                showPreview();
            else {
                setFormAction(undefined);
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                [bodyRef, sideRef].map((r) => r.current.handleSubmit());
                setTab(id);
            }
        }}/>))}
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Body show={tab === 0} ref={bodyRef} pages={props.pages} contentType={contentType} setFinalValue={setFinalBodyValue} inValue={(inValue as any).draft} history={(inValue as any).history} publish={onPublish}/>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {tab === 1 && (<iframe className="mt-3" style={{ flex: 1 }} src={`/_${savePath || '/'}?draft=true`}/>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {tab === 2 && (<iframe className="mt-3" style={{ flex: 1 }} src={`/_${savePath || '/'}?force_reloading=true`}/>)}
      </div>
    </>);
};
