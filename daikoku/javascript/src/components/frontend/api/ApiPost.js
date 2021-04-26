import React, { useState, useEffect } from 'react';
import { t } from '../../../locales';
import * as Services from '../../../services/index';
import { converter } from '../../../services/showdown';

export function ApiPost({ api, currentLanguage }) {
  const [posts, setPosts] = useState([]);

  const [pagination, setPagination] = useState({
    limit: 1,
    offset: 0,
    total: 0,
  });

  useEffect(() => {
    Services.getAPIPosts(api._id, pagination.offset, pagination.limit).then((data) => {
      setPosts(
        [...posts, ...data.posts].reduce((acc, post) => {
          if (!acc.find((p) => p._id === post._id)) acc.push(post);
          return acc;
        }, [])
      );
      setPagination({
        ...pagination,
        total: data.total,
      });
    });
  }, [pagination.offset, pagination.limit]);

  function formatDate(lastModificationAt) {
    const date = new Date(lastModificationAt);
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(date);
  }

  return (
    <div className="container-fluid">
      {posts.map((post, i) => (
        <div key={i} className="jumbotron">
          <div className="d-flex justify-content-between align-items-center">
            <h1>{post.title}</h1>
            <span>{formatDate(post.lastModificationAt)}</span>
          </div>
          <div
            className="api-post"
            dangerouslySetInnerHTML={{ __html: converter.makeHtml(post.content) }}
          />
        </div>
      ))}
      {posts.length < pagination.total && (
        <button
          className="btn btn-outline-info"
          onClick={() => {
            setPagination({
              limit: 1,
              offset: pagination.offset + 1,
            });
          }}>
          {t('Load older posts', currentLanguage)}
        </button>
      )}
    </div>
  );
}
