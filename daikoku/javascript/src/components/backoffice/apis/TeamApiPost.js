import React, { useEffect, useState } from 'react';
import { toastr } from 'react-redux-toastr';
import { Route, Link, Switch, useLocation, useHistory } from 'react-router-dom';
import { Spinner } from '../..';
import { t } from '../../../locales';
import * as Services from '../../../services/index';

const LazySingleMarkdownInput = React.lazy(() => import('../../inputs/SingleMarkdownInput'));
const LazyForm = React.lazy(() => import('../../../components/inputs/Form'));

const ApiPost = ({ currentLanguage, publishPost, params, team }) => {
  const [selected, setSelected] = useState({
    title: "",
    content: ""
  });

  const flow = ['title', 'content'];

  const schema = {
    title: {
      type: 'string',
      props: { label: t('team_api_post.title', currentLanguage) },
    },
    content: {
      type: 'markdown',
      props: {
        currentLanguage,
        label: t('team_api_post.content', currentLanguage),
        height: '320px',
        team
      },
    },
  };

  return <div>
    <React.Suspense fallback={<Spinner />}>
      <LazyForm
        flow={flow}
        schema={schema}
        value={selected}
        onChange={setSelected}
      />
    </React.Suspense>
    <div className="d-flex justify-content-end my-3">
      <Link className="btn btn-outline-danger mr-1" to={`/${params.teamId}/settings/apis/${params.apiId}/${params.versionId}/news`}>
        {t('Cancel', currentLanguage)}
      </Link>
      <button className="btn btn-outline-success" onClick={() => publishPost(selected)}>
        {t('team_api_post.publish', currentLanguage)}
      </button>
    </div>
  </div>
}

export function TeamApiPost({ currentLanguage, team, params, api, ...props }) {
  const history = useHistory()
  const location = useLocation()

  const [state, setState] = useState({
    posts: [],
    pagination: {
      limit: 1,
      offset: 0,
      total: 0,
    },
  });

  useEffect(() => {
    if (location.pathname.split("/").slice(-1)[0] === 'news')
      loadPosts(0, 1, true)
  }, [params.versionId, location.pathname])

  function loadPosts(offset = 0, limit = 1, reset = false) {
    Services.getAPIPosts(api._humanReadableId, offset, limit, params.versionId).then((data) => {
      setState({
        posts: [
          ...(reset ? [] : state.posts),
          ...data.posts
            .filter((p) => !state.posts.find((o) => o._id === p._id))
            .map((p) => ({
              ...p,
              isOpen: false,
            })),
        ],
        pagination: {
          ...state.pagination,
          total: data.total,
        },
      });
    });
  };

  function loadOldPosts() {
    const { posts, pagination } = state;
    loadPosts(posts.length < 10 ? 0 : pagination.offset + 1, 10);
  };

  function handleContent(i, code) {
    setState({
      ...state,
      posts: state.posts.map((post, j) => {
        if (j === i) post.content = code;
        return post;
      })
    });
  };

  function handleTitle(i, title) {
    setState({
      ...state,
      posts: state.posts.map((post, j) => {
        if (j === i) post.title = title;
        return post;
      }),
    });
  };

  function togglePost(i) {
    setState({
      ...state,
      posts: state.posts.map((post, j) => {
        if (j === i) post.isOpen = !post.isOpen;
        return post;
      }),
    });
  };

  function savePost(i) {
    const post = state.posts.find((_, j) => j === i);
    Services.savePost(api._id, team._id, post._id, post)
      .then(res => {
        if (res.error === 200)
          toastr.error(t('team_api_post.failed', currentLanguage))
        else
          toastr.success(t('team_api_post.saved', currentLanguage))
      });
  };

  function publishPost(selected) {
    Services.publishNewPost(api._id, team._id, {
      ...selected,
      _id: '',
    }).then((res) => {
      if (res.error)
        toastr.error(t('team_api_post.failed', currentLanguage));
      else {
        toastr.success(t('team_api_post.saved', currentLanguage));
        history.push(`/${params.teamId}/settings/apis/${params.apiId}/${params.versionId}/news`)
      }
    });
  };

  function removePost(postId, i) {
    window.confirm(t('team_api_post.delete.confirm', currentLanguage))
      .then((ok) => {
        if (ok)
          Services.removePost(api._id, team._id, postId).then((res) => {
            if (res.error)
              toastr.error(t('team_api_post.failed', currentLanguage));
            else {
              toastr.success(t('team_api_post.saved', currentLanguage));
              setState({
                ...state,
                posts: state.posts.filter(p => p._id !== postId)
              })
            }
          });
      });
  };

  const { posts, pagination } = state;

  const basePath = "/:teamId/settings/apis/:apiId/:versionId/news"

  return (
    <div>
      <Switch>
        <Route path={`${basePath}/new`} render={props =>
          <ApiPost {...props} currentLanguage={currentLanguage} publishPost={publishPost} params={params} />
        } />
        <Route path={basePath} render={() => (
          <div className="p-3">
            <div className="d-flex align-items-center justify-content-between">
              <h2>{t('News', currentLanguage)}</h2>
              <Link className="btn btn-outline-success" to={`/${params.teamId}/settings/apis/${params.apiId}/${params.versionId}/news/new`}>
                {t('team_api_post.new', currentLanguage)}
              </Link>
            </div>
            <div>
              {posts.length === 0 && <p>{t('team_api_post.empty_posts_list', currentLanguage)}</p>}
              {posts.map((post, i) => (
                <div key={i}>
                  <div className="d-flex justify-content-between align-items-center pb-1">
                    {post.isOpen ? (
                      <input
                        type="text"
                        value={post.title}
                        onChange={(e) => handleTitle(i, e.target.value)}
                        className="form-control mr-1"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <p>{post.title}</p>
                    )}
                    <div>
                      {post.isOpen && (
                        <button
                          className="btn btn-outline-success mr-1"
                          onClick={() => savePost(i)}>
                          <i className="fas fa-save" />
                        </button>
                      )}
                      <button
                        className="btn btn-outline-danger mr-1"
                        onClick={() => removePost(post._id, i)}>
                        <i className="fas fa-trash" />
                      </button>
                      <button className="btn btn-outline-info" onClick={() => togglePost(i)}>
                        <i className={`fas fa-chevron-${post.isOpen ? 'up' : 'down'}`} />
                      </button>
                    </div>
                  </div>
                  {post.isOpen && (
                    <React.Suspense fallback={<div>loading ...</div>}>
                      <LazySingleMarkdownInput
                        currentLanguage={currentLanguage}
                        team={team}
                        height={window.innerHeight - 300 + 'px'}
                        value={post.content}
                        onChange={(code) => handleContent(i, code)}
                      />
                    </React.Suspense>
                  )}
                </div>
              ))}
            </div>
            {posts.length > 0 && posts.length < pagination.total && (
              <button className="btn btn-outline-info" onClick={loadOldPosts}>
                {t('team_api_post.load_old_posts', currentLanguage)}
              </button>
            )}
          </div>
        )} />
      </Switch>
    </div>
  )
}
