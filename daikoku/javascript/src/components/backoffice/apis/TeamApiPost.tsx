import React, { useContext, useEffect, useState, useRef } from 'react';
import { toastr } from 'react-redux-toastr';
import { useLocation, useParams } from 'react-router-dom';
import { constraints, type, format } from "@maif/react-forms";
import moment from 'moment';

import { Table, TableRef } from '../../inputs';
import { I18nContext } from '../../../core';
import * as Services from '../../../services/index';
import { ModalContext } from '../../../contexts';
import { createColumnHelper } from '@tanstack/react-table';
import { IApi, IApiPost, isError, ITeamSimple } from '../../../types';

type TeamApiPostProps = {
  team: ITeamSimple,
  api: IApi
}
export function TeamApiPost({
  team,
  api
}: TeamApiPostProps) {
  const location = useLocation();
  const params = useParams();
  const { translate } = useContext(I18nContext);
  const { confirm, openFormModal } = useContext(ModalContext);
  const table = useRef<TableRef>();

  const schema = {
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

  const [state, setState] = useState<any>({
    posts: [],
    pagination: {
      limit: 1,
      offset: 0,
      total: 0,
    },
  });

  useEffect(() => {
    if (location.pathname.split('/').slice(-1)[0] === 'news') loadPosts(0, 1, true);
  }, [params.versionId, location.pathname]);

  function loadPosts(offset = 0, limit = 1, reset = false) {
    Services.getAPIPosts(api._humanReadableId, params.versionId, offset, limit)
      .then((data) => {
        setState({
          posts: [
            ...(reset ? [] : state.posts),
            ...data.posts
              .filter((p: any) => !state.posts.find((o: any) => o._id === p._id))
              .map((p: any) => ({
                ...p,
                isOpen: false
              })),
          ],
          pagination: {
            ...state.pagination,
            total: data.total,
          },
        });
      });
  }

  function savePost(post: any) {
    Services.savePost(api._id, team._id, post._id, post)
      .then((res) => {
        if (res.error) {
          toastr.error(translate('Error'), translate('team_api_post.failed'));
        } else {
          toastr.success(translate('Success'), translate('team_api_post.saved'));
          table.current?.update();
        }
      });
  }

  function publishPost(post: any) {
    Services.publishNewPost(api._id, team._id, {
      ...post,
      _id: '',
    }).then((res) => {
      if (res.error) {
        toastr.error(translate('Error'), translate('team_api_post.failed'));
      } else {
        toastr.success(translate('success'), translate('team_api_post.saved'));
        table.current?.update()
      }
    });
  }

  function removePost(postId: string) {
    return confirm({ message: translate('team_api_post.delete.confirm') })
      .then((ok) => {
        if (ok)
          Services.removePost(api._id, team._id, postId)
            .then((res) => {
              if (res.error) {
                toastr.error(translate('Error'), translate('team_api_post.failed'));
              }
              else {
                toastr.success(translate('Success'), translate('team_api_post.saved'));
                table.current?.update();
              }
            });
      });
  }

  const columnHelper = createColumnHelper<IApiPost>()
  const columns = [
    columnHelper.accessor('title', {
      header: translate('Title'),
      meta: { style: { textAlign: 'left' } },
    }),
    columnHelper.accessor(row => {
      return moment(row.lastModificationAt).format(
        translate({ key: 'moment.date.format', defaultResponse: 'DD MMM. YYYY à HH:mm z' })
      );
    }, {
      header: translate('Last modification'),
      meta: { style: { textAlign: 'left' } },
    }),
    columnHelper.display({
      header: translate('Actions'),
      meta: { style: { textAlign: 'center', width: '120px' } },
      cell: (info) => {
        const post = info.row.original;
        return (
          <div>
            <button
              className='btn btn-sm btn-outline-primary me-2'
              onClick={() => openFormModal({
                title: translate('team_api_post.update'),
                schema,
                onSubmit: savePost,
                value: post,
                actionLabel: translate('team_api_post.publish')
              })}><i className="fas fa-pen" /></button>
            <button
              className="btn btn-sm btn-outline-danger me-1"
              onClick={() => {
                removePost(post._id)
              }}
            >
              <i className="fas fa-trash" />
            </button>
          </div>
        )
      }
    })
  ]

  return (
    <div>
      <div className="p-3">
        <div className="d-flex align-items-center justify-content-end mb-2">
          <button
            className="btn btn-outline-success btn-sm"
            onClick={() => openFormModal({
              title: translate('team_api_post.new'),
              schema,
              onSubmit: publishPost,
              actionLabel: translate('team_api_post.publish')
            })}
          >
            {translate('team_api_post.new')}
          </button>
        </div>
        <Table
          defaultSort="lastModificationAt"
          defaultSortDesc={true}
          columns={columns}
          fetchItems={() => Services.getAllAPIPosts(api._humanReadableId, params.versionId!)
            .then(r => isError(r) ? r : r.posts)}
          ref={table}
        />
      </div>
    </div>
  );
}
