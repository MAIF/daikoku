import { constraints, Form, format, FormRef, Schema, type } from '@maif/react-forms';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { ChevronLeft, ChevronRight, Newspaper, Pencil, Plus, Trash2 } from 'lucide-react';
import { useContext, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { converter } from '../../../../services/showdown';
import { IApi, IApiPost, isError, ITeamSimple } from '../../../../types';
import { api as API, CanIDoAction, formatDate, manage, SideSheet, SideSheetActions, Spinner } from '../../../utils';

const PAGE_SIZE = 20;

type NewsTabProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
};

type PostSheet = {
  post?: IApiPost;
};

export const NewsTab = (props: NewsTabProps) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const { connectedUser } = useContext(GlobalContext);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sheet, setSheet] = useState<PostSheet>();

  const isOwner = CanIDoAction(connectedUser, manage, API, props.ownerTeam);

  const postsQuery = useQuery({
    queryKey: ['posts', props.api._id, limit],
    queryFn: () => Services.getAPIPosts(props.api._humanReadableId, props.api.currentVersion, 0, limit),
    placeholderData: keepPreviousData,
    enabled: !connectedUser.isGuest,
  });

  const dateOf = (post: IApiPost) => formatDate(post.lastModificationAt, translate('date.locale'), translate('date.format'));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['posts'] });

  const selectPost = (postId?: string) =>
    setSearchParams((params) => {
      if (postId) {
        params.set('post', postId);
      } else {
        params.delete('post');
      }

      return params;
    });

  const savePost = (value: IApiPost, current: PostSheet) => {
    const save = current.post
      ? Services.savePost(props.api._id, props.ownerTeam._id, current.post._id, value)
      : Services.publishNewPost(props.api._id, props.ownerTeam._id, value);

    return save
      .then((response) => {
        if (isError(response)) {
          throw response;
        }

        toast.success(translate('team_api_post.saved'));
        setSheet(undefined);

        if (!current.post) {
          selectPost(undefined);
        }

        return refresh();
      })
      .catch(() => toast.error(translate('team_api_post.failed')));
  };

  const deletePost = (post: IApiPost) =>
    confirm({ message: translate('team_api_post.delete.confirm') }).then((ok) => {
      if (!ok) {
        return;
      }

      return Services.removePost(props.api._id, props.ownerTeam._id, post._id)
        .then((response) => {
          if (isError(response)) {
            throw response;
          }

          toast.success(translate('team_api_post.deleted'));
          return refresh();
        })
        .catch(() => toast.error(translate('team_api_post.failed')));
    });

  if (connectedUser.isGuest) {
    return null;
  } else if (postsQuery.isLoading) {
    return <Spinner />;
  } else if (!postsQuery.data || isError(postsQuery.data)) {
    return <div className="alert alert-danger">{translate('news.loading.error')}</div>;
  }

  const cursor = postsQuery.data;
  const posts = cursor.posts;
  const currentIndex = Math.max(
    0,
    posts.findIndex((post) => post._id === searchParams.get('post'))
  );
  const currentPost = posts[currentIndex];
  const newerPost = posts[currentIndex - 1];
  const olderPost = posts[currentIndex + 1];

  const sheetNode = sheet && (
    <PostSideSheet post={sheet.post} onSave={(value) => savePost(value, sheet)} onClose={() => setSheet(undefined)} />
  );

  if (!currentPost) {
    return (
      <div className="api-doc">
        <div className="api-doc__empty">
          <Newspaper size={32} aria-hidden="true" />
          <h3 className="api-doc__empty-title">{translate('news.empty.title')}</h3>
          <p className="api-doc__empty-text">
            {translate(isOwner ? 'news.empty.owner.description' : 'news.empty.description')}
          </p>

          {isOwner && (
            <button type="button" className="btn --primary" onClick={() => setSheet({})}>
              <Plus size={16} />
              {translate('news.empty.create')}
            </button>
          )}
        </div>

        {sheetNode}
      </div>
    );
  } else {
    return (
      <div className="api-doc">
        <nav className="api-doc__sidebar" aria-label={translate('news.tree.title')}>
          <div className="api-doc__sidebar-header">
            <span className="api-doc__sidebar-title">{translate('news.tree.title')}</span>

            {isOwner && (
              <button type="button" className="btn --tertiary --small" onClick={() => setSheet({})}>
                <Plus size={14} />
                {translate('news.create')}
              </button>
            )}
          </div>

          <ul className="doc-tree">
            {posts.map((post) => {
              const active = post._id === currentPost._id;

              return (
                <li key={post._id} className="doc-tree__item">
                  <button
                    type="button"
                    className={classNames('doc-tree__link', { active })}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => selectPost(post._id)}
                  >
                    {post.title}
                    <span className="doc-tree__meta">{dateOf(post)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {cursor.nextCursor != null && (
            <button
              type="button"
              className="btn --tertiary --small"
              disabled={postsQuery.isFetching}
              onClick={() => setLimit(limit + PAGE_SIZE)}
            >
              {translate('news.more')}
            </button>
          )}
        </nav>

        <article className="api-doc__content">
          <header className="api-doc__content-header">
            <div>
              <h2 className="api-doc__page-title">{currentPost.title}</h2>
              <span className="api-doc__page-meta">{dateOf(currentPost)}</span>
            </div>

            {isOwner && (
              <div className="d-flex gap-2">
                <button type="button" className="btn --secondary --small" onClick={() => setSheet({ post: currentPost })}>
                  <Pencil size={14} />
                  {translate('Edit')}
                </button>
                <button
                  type="button"
                  className="btn --tertiary --small --icon-only"
                  aria-label={translate('api.home.config.api.news.menu.delete')}
                  onClick={() => deletePost(currentPost)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </header>

          <div className="api-post" dangerouslySetInnerHTML={{ __html: converter.makeHtml(currentPost.content) }} />

          {(newerPost || olderPost) && (
            <footer className="api-doc__pager">
              {newerPost && (
                <button type="button" className="api-doc__pager-link" onClick={() => selectPost(newerPost._id)}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  <span>
                    <span className="api-doc__pager-label">{translate('news.newer')}</span>
                    {newerPost.title}
                  </span>
                </button>
              )}

              {olderPost && (
                <button type="button" className="api-doc__pager-link --next" onClick={() => selectPost(olderPost._id)}>
                  <span>
                    <span className="api-doc__pager-label">{translate('news.older')}</span>
                    {olderPost.title}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </footer>
          )}
        </article>

        {sheetNode}
      </div>
    );
  }
};

type PostSideSheetProps = {
  post?: IApiPost;
  onSave: (value: IApiPost) => Promise<unknown>;
  onClose: () => void;
};

const PostSideSheet = (props: PostSideSheetProps) => {
  const { translate } = useContext(I18nContext);

  const formRef = useRef<FormRef | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const schema: Schema = {
    title: {
      type: type.string,
      label: translate('team_api_post.title'),
      constraints: [constraints.required(translate('constraints.required.title'))],
    },
    content: {
      type: type.string,
      format: format.markdown,
      label: translate('team_api_post.content'),
      props: { height: '480px' },
      constraints: [constraints.required(translate('constraints.required.content'))],
    },
  };

  const submit = (value: IApiPost) => {
    setSaving(true);
    props.onSave(value).finally(() => setSaving(false));
  };

  return (
    <SideSheet
      title={translate(props.post ? 'api.home.config.api.news.menu.update' : 'api.home.config.api.news.menu.create')}
      size="wide"
      onClose={props.onClose}
      isDirty={() => !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) => (
        <SideSheetActions
          onCancel={requestClose}
          onSave={() => formRef.current?.handleSubmit()}
          saveDisabled={saving}
        />
      )}
    >
      <Form ref={formRef} schema={schema} value={props.post} onSubmit={submit} footer={() => <></>} />
    </SideSheet>
  );
};
