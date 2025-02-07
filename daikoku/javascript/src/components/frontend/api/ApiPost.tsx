import { constraints, Form, format, Schema, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useContext, useState } from 'react';
import ArrowLeft from 'react-feather/dist/icons/arrow-left';
import ArrowRight from 'react-feather/dist/icons/arrow-right';
import More from 'react-feather/dist/icons/more-vertical';

import { toast } from 'sonner';
import { I18nContext, ModalContext } from '../../../contexts';
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
    title: creation ? "Create new post" : "Update post",
    content:
      <Form
        schema={schema}
        onSubmit={publishPost}
        value={value}
      />
  })

  const isDataError = postQuery.data && !isError(postQuery.data);
  return (
    <div className="container-fluid">
      <Can I={manage} a={API} team={props.ownerTeam}>
        <More
          className="a-fake"
          aria-label={translate('update.api.testing.btn.label')}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id={`${props.api._id}-dropdownMenuButton`}
          style={{ position: "absolute", right: 0 }} />
        <div className="dropdown-menu" aria-labelledby={`${props.api._id}-dropdownMenuButton`}>
          {isDataError && <>
            <span
              onClick={() => createorUpdatePostForm((postQuery.data as IApiPostCursor).posts[0], false)}
              className="dropdown-item cursor-pointer"
            >
              Modifier le post
            </span>
            <div className="dropdown-divider" />
          </>}

          <span
            onClick={() => createorUpdatePostForm(undefined, true)}
            className="dropdown-item cursor-pointer"
          >
            Créer un nouveau post
          </span>
          {isDataError && <>
            <div className="dropdown-divider" />
            <span
              onClick={() => removePost((postQuery.data as IApiPostCursor).posts[0])}
              className="dropdown-item cursor-pointer btn-outline-danger"
            >
              Supprimer le post
            </span>
          </>}
        </div>
      </Can>
      {postQuery.isLoading && <Spinner />}
      {isDataError && (
        <>
          <div className='d-flex flex-row justify-content-between'>
            <button className="btn btn-outline-info" onClick={() => setCurrentPage((postQuery.data as IApiPostCursor).prevCursor || 0)}>
              <ArrowLeft />
            </button>
            <button className="btn btn-outline-info" onClick={() => setCurrentPage((postQuery.data as IApiPostCursor).nextCursor || currentPage)}>
              <ArrowRight />
            </button>
          </div>
          {(postQuery.data as IApiPostCursor).posts.map((post, i) => {
            return (
              <div key={i} className="jumbotron">
                <div className="d-flex justify-content-between align-items-center">
                  <h1>{post.title}</h1>
                  <span>{formatDate(post.lastModificationAt)}</span>
                </div>
                <div className="api-post" dangerouslySetInnerHTML={{ __html: converter.makeHtml(post.content) }} />
              </div>)
          })}
        </>
      )}
    </div>
  );
}
