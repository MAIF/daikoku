import React, { useContext, useEffect, useState, useRef } from 'react';
import { toastr } from 'react-redux-toastr';
import { useDispatch } from 'react-redux';
import { useLocation, useParams } from 'react-router-dom';
import { constraints, type, format } from "@maif/react-forms";
import moment from 'moment';

import { Table, DefaultColumnFilter } from '../../inputs';
import { I18nContext, openFormModal } from '../../../core';
import * as Services from '../../../services/index';


export function TeamApiPost({ team, api }) {
  const location = useLocation();
  const params = useParams();
  const dispatch = useDispatch();
  const { translateMethod } = useContext(I18nContext);
  const table = useRef();

  const schema = {
    title: {
      type: type.string,
      label: translateMethod('team_api_post.title'),
      constraints: [
        constraints.required(translateMethod('constraints.required.title'))
      ]
    },
    content: {
      type: type.string,
      format: format.markdown,
      label: translateMethod('team_api_post.content'),
      constraints: [
        constraints.required(translateMethod('constraints.required.content'))
      ]
    },
  };

  const [state, setState] = useState({
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
  }

  function savePost(post) {
    Services.savePost(api._id, team._id, post._id, post)
      .then((res) => {
        if (res.error) {
          toastr.error(translateMethod('team_api_post.failed'));
        } else {
          toastr.success(translateMethod('team_api_post.saved'));
          table.current.update();
        }
      });
  }

  function publishPost(post) {
    Services.publishNewPost(api._id, team._id, {
      ...post,
      _id: '',
    }).then((res) => {
      if (res.error) {
        toastr.error(translateMethod('team_api_post.failed'));
      } else {
        toastr.success(translateMethod('team_api_post.saved'));
        table.current.update()
      }
    });
  }

  function removePost(postId) {
    return window.confirm(translateMethod('team_api_post.delete.confirm'))
      .then((ok) => {
        if (ok)
          Services.removePost(api._id, team._id, postId).then((res) => {
            if (res.error) {
              toastr.error(translateMethod('team_api_post.failed'));
            } else {
              toastr.success(translateMethod('team_api_post.saved'));
              table.current.update()
            }
          });
      });
  }

  const columns = [
    {
      id: 'title',
      Header: translateMethod('Title'),
      style: { textAlign: 'left' },
      accessor: (post) => post.title
    },
    {
      id: 'lastModificationAt',
      Header: translateMethod('Last modification'),
      style: { textAlign: 'left' },
      disableFilters: true,
      Filter: DefaultColumnFilter,
      accessor: (post) => post.lastModificationAt,
      filter: 'equals',
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const post = original;
        return moment(post.lastModificationAt).format(
          translateMethod('moment.date.format', 'DD MMM. YYYY à HH:mm z')
        );
      },
    },
    {
      id: 'actions',
      Header: translateMethod('Actions'),
      style: { textAlign: 'right' },
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const post = original;
        return (
          <div>
            <button
              className='btn btn-sm btn-outline-primary me-2'
              onClick={() => dispatch(openFormModal({
                title: translateMethod('team_api_post.update'),
                schema,
                onSubmit: savePost,
                value: post,
                actionLabel: translateMethod('team_api_post.publish')
              }))}><i className="fas fa-pen" /></button>
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
    }
  ]

  return (
    <div>
      <div className="p-3">
        <div className="d-flex align-items-center justify-content-end">
          <button
            className="btn btn-outline-success"
            onClick={() => dispatch(openFormModal({
              title: translateMethod('team_api_post.new'),
              schema,
              onSubmit: publishPost,
              actionLabel: translateMethod('team_api_post.publish')
            }))}
          >
            {translateMethod('team_api_post.new')}
          </button>
        </div>
        <Table
          selfUrl="posts"
          defaultTitle="Team news"
          defaultValue={() => ({})}
          defaultSort="lastModificationAt"
          defaultSortDesc={true}
          itemName="post"
          columns={columns}
          fetchItems={() => Services.getAllAPIPosts(api._humanReadableId, params.versionId).then(r => r.posts)}
          showActions={false}
          showLink={false}
          extractKey={(item) => item._id}
          injectTable={t => table.current = t}
        />
      </div>
    </div>
  );
}
