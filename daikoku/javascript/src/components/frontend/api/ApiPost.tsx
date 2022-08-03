import React, { useState, useEffect, useContext } from 'react';
import { I18nContext } from '../../../core';
import * as Services from '../../../services/index';
import { converter } from '../../../services/showdown';

export function ApiPost({
  api,
  versionId
}: any) {
  const [posts, setPosts] = useState([]);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const [pagination, setPagination] = useState({
    limit: 1,
    offset: 0,
    total: 0,
  });

  useEffect(() => {
    Services.getAPIPosts(api._humanReadableId, versionId, pagination.offset, pagination.limit).then(
      (data) => {
        setPosts(
          [...posts, ...data.posts].reduce((acc, post) => {
            if (!acc.find((p: any) => p._id === post._id)) acc.push(post);
            return acc;
          }, [])
        );
        setPagination({
          ...pagination,
          total: data.total,
        });
      }
    );
  }, [pagination.offset, pagination.limit]);

  function formatDate(lastModificationAt: any) {
    const date = new Date(lastModificationAt);
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(date);
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="container-fluid">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {posts.map((post, i) => (<div key={i} className="jumbotron">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex justify-content-between align-items-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h1>{(post as any).title}</h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span>{formatDate((post as any).lastModificationAt)}</span>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="api-post" dangerouslySetInnerHTML={{ __html: converter.makeHtml((post as any).content) }}/>
        </div>))}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {posts.length < pagination.total && (<button className="btn btn-outline-info" onClick={() => {
            // @ts-expect-error TS(2345): Argument of type '{ limit: number; offset: number;... Remove this comment to see the full error message
            setPagination({
                limit: 1,
                offset: pagination.offset + 1,
            });
        }}>
          {translateMethod('Load older posts')}
        </button>)}
    </div>);
}
