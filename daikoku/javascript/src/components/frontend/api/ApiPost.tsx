import { constraints, Form, format, Schema, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useContext, useState } from 'react';
import ArrowLeft from 'react-feather/dist/icons/arrow-left';
import ArrowRight from 'react-feather/dist/icons/arrow-right';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services/index';
import { converter } from '../../../services/showdown';
import { IApi, IApiPost, IApiPostCursor, isError, ITeamSimple } from '../../../types';
import { api as API, Can, manage } from '../../utils/permissions';
import { Spinner } from '../../utils/Spinner';

type ApiPostProps = {
  api: IApi
  versionId: string
  ownerTeam: ITeamSimple
}


export function ApiPost(props: ApiPostProps) {
  const { translate, language } = useContext(I18nContext);
  const { openRightPanel, closeRightPanel, confirm } = useContext(ModalContext);
  const { connectedUser } = useContext(GlobalContext);
  const queryClient = useQueryClient();

  const [currentPage, setCurrentPage] = useState(0);

  const postQuery = useQuery({
    queryKey: ['posts', currentPage],
    queryFn: () => Services.getAPIPosts(props.api._humanReadableId, props.versionId, currentPage, 1),
  })

  const schema: Schema = {
    title: {
      type: type.string,
      label: translate('team_api_post.title'),
      constraints: [
        constraints.required(translate('constraints.required.title'))
      ]
    },
    content: {
      type: type.string,
      format: format.markdown,
      label: translate('team_api_post.content'),
      constraints: [
        constraints.required(translate('constraints.required.content'))
      ]
    },
  };

  const formatDate = (lastModificationAt: string) => {
    moment.locale(language);
    return moment(lastModificationAt).format(translate('moment.date.format'))
  }

  function savePost(post: any) {
    Services.savePost(props.api._id, props.ownerTeam._id, post._id, post)
      .then((res) => {
        if (res.error) {
          toast.error(translate('team_api_post.failed'));
        } else {
          toast.success(translate('team_api_post.saved'));
        }
      });
  }

  function publishPost(post: IApiPost) {
    Services.publishNewPost(props.api._id, props.ownerTeam._id, {
      ...post,
      _id: '',
    })
      .then((res) => {
        if (res.error) {
          toast.error(translate('team_api_post.failed'));
        } else {
          toast.success(translate('team_api_post.saved'));
        }
      })
      .then(() => closeRightPanel())
      .then(() => queryClient.invalidateQueries({ queryKey: ['posts'] }))
  }

  function removePost(post: IApiPost) {
    return confirm({ message: translate('team_api_post.delete.confirm') })
      .then((ok) => {
        if (ok)
          Services.removePost(props.api._id, props.ownerTeam._id, post._id)
            .then((res) => {
              if (res.error) {
                toast.error(translate('team_api_post.failed'));
              }
              else {
                toast.success(translate('team_api_post.deleted'));
              }
            })
            .then(() => queryClient.invalidateQueries({ queryKey: ["posts"] }));
      });
  }

  const createorUpdatePostForm = (value?: IApiPost, creation: boolean = true) => openRightPanel({
    title: creation ? translate("api.home.config.api.news.menu.create") : translate("api.home.config.api.news.menu.update"),
    content:
      <Form
        schema={schema}
        onSubmit={publishPost}
        value={value}
        options={{
          actions: {
            submit: { label: translate('Save')}
          }
        }}
      />
  })

  const isDataError = postQuery.data && isError(postQuery.data);


  if (postQuery.isLoading) {
    return (
      <Spinner />
    )
  } else if (!!postQuery.data && !isError(postQuery.data)) {
    const currentPost = (postQuery.data as IApiPostCursor).posts[0];

    return (
      <div className="d-flex flex-column w-10" style={{position: 'relative'}}>
        <Can I={manage} a={API} team={props.ownerTeam}>
          <div className="mb-2 d-flex justify-content-end">
            <button
              className="btn btn-sm btn-outline-primary px-3"
              aria-label={translate('api.home.config.api.news.btn.label')}
              data-bs-toggle="dropdown"
              aria-expanded="false"
              id={`${props.api._id}-dropdownMenuButton`}>
              {translate('api.home.config.api.news.btn.label')}
            </button>
            <div className="dropdown-menu" aria-labelledby={`${props.api._id}-dropdownMenuButton`}>
              {!isDataError && currentPost && <>
                <span
                  onClick={() => createorUpdatePostForm(currentPost, false)}
                  className="dropdown-item cursor-pointer"
                  aria-label={translate("api.home.config.api.news.menu.update")}
                >
                  {translate('api.home.config.api.news.menu.update')}
                </span>
                <div className="dropdown-divider" />
              </>}

              <span
                onClick={() => createorUpdatePostForm(undefined, true)}
                className="dropdown-item cursor-pointer"
                aria-label={translate('api.home.config.api.news.menu.create')}
              >
                {translate('api.home.config.api.news.menu.create')}
              </span>
              {!isDataError && currentPost && <>
                <div className="dropdown-divider" />
                <span
                  onClick={() => removePost(currentPost)}
                  className="dropdown-item cursor-pointer danger"
                  aria-label={translate('api.home.config.api.news.menu.delete')}
                >
                  {translate('api.home.config.api.news.menu.delete')}
                </span>
              </>}
            </div>
          </div>
        </Can>
        <div className='d-flex flex-row justify-content-between'>
          <button className="btn btn-outline-info" onClick={() => setCurrentPage((postQuery.data as IApiPostCursor).prevCursor || 0)}>
            <ArrowLeft />
          </button>
          <button className="btn btn-outline-info" onClick={() => setCurrentPage((postQuery.data as IApiPostCursor).nextCursor || currentPage)}>
            <ArrowRight />
          </button>
        </div>
        {!postQuery.data.posts.length && (
          <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
            <div>{translate('api.post.not.found.alert')}</div>
            <button className="btn btn-outline-info" onClick={console.debug}>{translate('api.post.create.post.btn.label')}</button>
          </div>
        )}
        {!!postQuery.data.posts.length && postQuery.data.posts.map((post, i) => {
          return (
            <div key={i} className="jumbotron">
              <div className="d-flex justify-content-between align-items-center">
                <h1>{post.title}</h1>
                <span>{formatDate(post.lastModificationAt)}</span>
              </div>
              <div className="api-post" dangerouslySetInnerHTML={{ __html: converter.makeHtml(post.content) }} />
            </div>)
        })}
      </div>
    );
  } else {
    return (
      <div>error while fetching data</div>
    )
  }
}
