import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getApolloContext } from '@apollo/client';
import moment from 'moment';
import * as Services from '../../../services';
// @ts-expect-error TS(6142): Module '../../utils/Spinner' was resolved to '/Use... Remove this comment to see the full error message
import { Spinner } from '../../utils/Spinner';
import { SwitchButton } from '../../inputs';
import { I18nContext } from '../../../core';

const CURRENT_VERSION_ITEM = {
  value: {
    id: 'LATEST',
  },
  label: 'Current version',
};

export default ({}) => {
  const { client } = useContext(getApolloContext());
  const params = useParams();
  const navigate = useNavigate();
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const [reloading, setReloading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState({});
  const [html, setHtml] = useState({
    html: '',
    hasDiff: false,
  });
  const [selectedDiff, setSelectedDiff] = useState(CURRENT_VERSION_ITEM);

  const [latestVersion, setLatestVersion] = useState();
  const [showDiffs, toggleDiffs] = useState(false);

  useEffect(() => {
    const id = params.id;
    if (id) {
      setLoading(true);
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({ query: Services.graphql.getCmsPageHistory(id) }).then((res) => {
        if (res.data) {
          setSelectedDiff(CURRENT_VERSION_ITEM);
          setLatestVersion({
            // @ts-expect-error TS(2345): Argument of type '{ value: { id: string; }; label:... Remove this comment to see the full error message
            draft: res.data.cmsPage.draft,
            ...CURRENT_VERSION_ITEM,
          });
          setHtml({
            html: res.data.cmsPage.draft,
            hasDiff: false,
          });
          setValue(
            res.data.cmsPage.history.slice(1).reduce(
              (diffsByMonth: any, current: any) => {
                const month = moment(current.date).format('MMMM');
                return {
                  ...diffsByMonth,
                  [month]: [
                    ...(diffsByMonth[month] || []),
                    {
                      value: current,
                      label: moment(current.date).format('DD MMMM, HH:mm:ss'),
                    },
                  ],
                };
              },
              {
                latest: [CURRENT_VERSION_ITEM],
              }
            )
          );
        }
        setLoading(false);
      });
    }
  }, [params.id, reloading]);

  const loadDiff = (item: any, nearValue: any) => {
    if (item.value.id === 'LATEST') {
      // @ts-expect-error TS(2345): Argument of type 'undefined' is not assignable to ... Remove this comment to see the full error message
      setSelectedDiff(latestVersion);
      setHtml({
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        html: latestVersion.draft,
        hasDiff: false,
      });
    } else {
      setLoading(true);
      Services.getDiffOfCmsPage(
        params.id,
        item.value.id,
        nearValue !== undefined ? nearValue : showDiffs
      ).then((res) => {
        if (res.html) {
          setHtml({
            html: res.html.replace(/&para;/g, ''),
            hasDiff: res.hasDiff,
          });
        }
        setLoading(false);
      });
      setSelectedDiff(item);
    }
  };

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <>
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <nav className="col-md-3 d-md-block">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-column">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex p-3 align-items-baseline">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div style={{
        backgroundColor: '#fff',
        borderRadius: '50%',
        maxHeight: '42px',
        maxWidth: '42px',
        cursor: 'pointer',
    }} className="p-3 me-2 d-flex align-items-center" onClick={() => navigate(-1)}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-arrow-left"/>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h5 className="m-0">{translateMethod('cms.revisions.version_history')}</h5>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {Object.entries(value).map(([month, diffs]) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div key={month}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="py-2 px-3 d-flex" style={{
                border: '1px solid rgb(225,225,225)',
                borderLeft: 'none',
                background: '#fff',
            }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="me-1" style={{ fontWeight: 'bold' }}>{`${month.toLocaleUpperCase()}`}</span>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span>{`(${moment(diffs[0].value.date).format('YYYY')})`}</span>
                </div>
                {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                {diffs.map((item: any) => {
                const isCurrentVersion = item.value.id === 'LATEST';
                const isSelected = selectedDiff.value.id === item.value.id;
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<div key={item.value.id} style={{
                        backgroundColor: '#fff',
                        borderBottom: '1px solid rgb(225,225,225)',
                        borderRight: '1px solid rgb(225,225,225)',
                        cursor: 'pointer',
                        marginBottom: isCurrentVersion ? '12px' : 0,
                        minHeight: '50px',
                    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
                    }} onClick={() => loadDiff(item)} className="p-1 px-3 d-flex flex-column">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>{item.label}</span>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        {isSelected && <i className="fas fa-arrow-right"/>}
                      </div>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      {item.value.user && (<div style={{ fontStyle: 'italic', fontWeight: 'bold' }}>
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <span>{item.value.user.name}</span>
                        </div>)}
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      {!isCurrentVersion && isSelected && (<button className="btn btn-sm btn-outline-info mt-2" onClick={() => {
                            window
                                .confirm(translateMethod('cms.revisions.delete_sentence'))
                                // @ts-expect-error TS(2339): Property 'then' does not exist on type 'boolean'.
                                .then((ok: any) => {
                                if (ok) {
                                    Services.restoreCmsDiff(params.id, item.value.id).then(() => setReloading(true));
                                }
                            });
                        }}>
                          {translateMethod('cms.revisions.restore')}
                        </button>)}
                    </div>);
            })}
              </div>);
    })}
        </div>
      </div>
    </nav>
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <div className="p-2" style={{ flex: 1, position: 'relative' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {loading ? (<Spinner />) : (<>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="pt-4" style={{ borderBottom: '1px solid #eee' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h5>
              {selectedDiff && moment((selectedDiff.value as any).date).format('DD MMMM, YY, (HH:mm)')}
            </h5>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {selectedDiff && (<div className="d-flex align-items-center pb-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <span className="me-2">Show differences</span>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <SwitchButton checked={showDiffs} disabled={selectedDiff.value.id === 'LATEST'} onSwitch={() => {
                loadDiff(selectedDiff, !showDiffs);
                toggleDiffs(!showDiffs);
            }}/>
              </div>)}
          </div>
          {html &&
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            (html.hasDiff ? (<div dangerouslySetInnerHTML={{ __html: html.html }}></div>) : (<pre>{html.html}</pre>))}
        </>)}
    </div>
  </>;
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<div key={month}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="py-2 px-3 d-flex" style={{
        border: '1px solid rgb(225,225,225)',
        borderLeft: 'none',
        background: '#fff',
    }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="me-1" style={{ fontWeight: 'bold' }}>{`${month.toLocaleUpperCase()}`}</span>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span>{`(${moment((diffs as any)[0].value.date).format('YYYY')})`}</span>
                </div>
                {/* @ts-expect-error TS(2304): Cannot find name 'diffs'. */}
                {(diffs as any).map((item: any) => {
        const isCurrentVersion = item.value.id === 'LATEST';
        const isSelected = selectedDiff.value.id === item.value.id;
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div key={item.value.id} style={{
                backgroundColor: '#fff',
                borderBottom: '1px solid rgb(225,225,225)',
                borderRight: '1px solid rgb(225,225,225)',
                cursor: 'pointer',
                marginBottom: isCurrentVersion ? '12px' : 0,
                minHeight: '50px',
            // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
            }} onClick={() => loadDiff(item)} className="p-1 px-3 d-flex flex-column">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>{item.label}</span>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        {isSelected && <i className="fas fa-arrow-right"/>}
                      </div>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      {item.value.user && (<div style={{ fontStyle: 'italic', fontWeight: 'bold' }}>
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <span>{item.value.user.name}</span>
                        </div>)}
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      {!isCurrentVersion && isSelected && (<button className="btn btn-sm btn-outline-info mt-2" onClick={() => {
                    window
                        .confirm(translateMethod('cms.revisions.delete_sentence'))
                        // @ts-expect-error TS(2339): Property 'then' does not exist on type 'boolean'.
                        .then((ok: any) => {
                        if (ok) {
                            Services.restoreCmsDiff(params.id, item.value.id).then(() => setReloading(true));
                        }
                    });
                }}>
                          {translateMethod('cms.revisions.restore')}
                        </button>)}
                    </div>);
    })}
              </div>);
                            (window
    .confirm(translateMethod('cms.revisions.delete_sentence')) as any).then((ok: any) => {
    if (ok) {
        // @ts-expect-error TS(2304): Cannot find name 'item'.
        Services.restoreCmsDiff(params.id, item.value.id).then(() => setReloading(true));
    }
});
                          }}
                        >
                          // @ts-expect-error TS(7006): Parameter '(Missing)' implicitly has an 'any' type... Remove this comment to see the full error message
                          {translateMethod('cms.revisions.restore')}
                        // @ts-expect-error TS(2304): Cannot find name 'button'.
                        </button>
                      )}
                    // @ts-expect-error TS(2304): Cannot find name 'div'.
                    </div>
                  );
                })}
              // @ts-expect-error TS(2304): Cannot find name 'div'.
              </div>
            );
          })}
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    // @ts-expect-error TS(2304): Cannot find name 'nav'.
    </nav>
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="p-2" style={{ flex: 1, position: 'relative' }}>
      {/* @ts-expect-error TS(2304): Cannot find name 'loading'. */}
      {loading ? (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Spinner />
      ) : (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="pt-4" style={{ borderBottom: '1px solid #eee' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h5>
              {/* @ts-expect-error TS(2304): Cannot find name 'selectedDiff'. */}
              {selectedDiff && moment(selectedDiff.value.date).format('DD MMMM, YY, (HH:mm)')}
            </h5>
            {/* @ts-expect-error TS(2304): Cannot find name 'selectedDiff'. */}
            {selectedDiff && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div className="d-flex align-items-center pb-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <span className="me-2">Show differences</span>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <SwitchButton
                  // @ts-expect-error TS(2304): Cannot find name 'showDiffs'.
                  checked={showDiffs}
                  // @ts-expect-error TS(2304): Cannot find name 'selectedDiff'.
                  disabled={selectedDiff.value.id === 'LATEST'}
                  onSwitch={() => {
                    // @ts-expect-error TS(2304): Cannot find name 'loadDiff'.
                    loadDiff(selectedDiff, !showDiffs);
                    // @ts-expect-error TS(2304): Cannot find name 'toggleDiffs'.
                    toggleDiffs(!showDiffs);
                  }}
                />
              </div>
            )}
          </div>
          {/* @ts-expect-error TS(2304): Cannot find name 'html'. */}
          {html &&
            // @ts-expect-error TS(2304): Cannot find name 'html'.
            (html.hasDiff ? (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div dangerouslySetInnerHTML={{ __html: html.html }}></div>
            ) : (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <pre>{html.html}</pre>
            ))}
        </>
      )}
    </div>
  </>;
};
