import React, { useContext, useEffect, useState } from 'react';
import { Form, constraints, format, type } from '@maif/react-forms';
import moment from 'moment';
//@ts-ignore
import RefreshCcw from 'react-feather/dist/icons/refresh-ccw';
//@ts-ignore
import X from 'react-feather/dist/icons/x';
import { useDispatch } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { useNavigate, useParams } from 'react-router-dom';
import Select from 'react-select/creatable';

import { api as API, manage } from '../../..';
import { I18nContext, openFormModal } from '../../../../core';
import * as Services from '../../../../services';
import { converter } from '../../../../services/showdown';
import { Can, getColorByBgColor, randomColor } from '../../../utils';
import { IApi, ITeamSimple, IUserSimple } from '../../../../types';

const styles = {
  commentHeader: {
    backgroundColor: '#eee',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
  },
  bold: {
    fontWeight: 'bold',
  },
  getStatus: (open: any) => ({
    textTransform: 'capitalize' as any,
    backgroundColor: open ? '#28a745' : '#dc3545',
    width: 'fit-content',
    padding: '6px 12px',
    borderRadius: '2em',
    color: '#fff'
  }),
  commentBody: {
    border: '1px solid #eee',
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    backgroundColor: '#fff',
  },
};

type Issue = {
  comments: Array<any>,
  title: string,
  by: IUserSimple
}

type Tag = { value: string, label: string }

type IApiTimelineIssueProps= {
  issueId: string,
  connectedUser: IUserSimple,
  team: ITeamSimple,
  api: IApi,
  basePath: string,
  onChange: (api: IApi) => void
}

export function ApiTimelineIssue({
  issueId,
  connectedUser,
  team,
  api,
  basePath,
  onChange
}: IApiTimelineIssueProps) {
  const [issue, setIssue] = useState<Issue>({ title: '', comments: [] , by: connectedUser});
  const [editionMode, handleEdition] = useState(false);
  const [tags, setTags] = useState<Array<Tag>>([]);

  const navigate = useNavigate();
  const id = issueId || useParams().issueId;

  const dispatch = useDispatch();

  const { translate } = useContext(I18nContext);

  useEffect(() => {
    Services.getAPIIssue(api._humanReadableId, id)
      .then((res) => {
        if (res.error) {
          navigate(`${basePath}/issues`);
        } else {
          const entryTags = res.tags.map((tag: any) => ({
            value: tag.id,
            label: tag.name
          }));
          setIssue({ ...res, tags: entryTags });
          setTags(entryTags);
        }
      });
  }, [id]);

  useEffect(() => {
    if (tags.length !== api.tags.length) {
      updateIssue({ ...issue, tags: tags.map(t => (t as any).value) });
    }
  }, [tags])

  function updateIssue(updatedIssue: any) {
    handleEdition(false);
    Services.updateIssue(api._id, team._id, id, updatedIssue)
      .then((res) => {
        if (res.error) {
          toastr.error(translate('Error'), res.error);
        } else
          setIssue(updatedIssue);
      });
  }

  function updateComment(i: any, newContent: any) {
    const updatedIssue = {
      ...issue,
      comments: issue.comments.map((comment, j) => {
        if (i === j) {
          return { ...comment, content: newContent, editing: false }
        }
        return comment;
      }),
    };

    updateIssue(updatedIssue);
  }

  function editComment(i: any) {
    setIssue({
      ...issue,
      comments: issue.comments.map((comment, j) => {
        if (i === j) (comment as any).editing = (comment as any).editing !== undefined ? !(comment as any).editing : true;
        return comment;
      }),
    });
  }

  function removeComment(i: any) {
    (window.confirm(translate('issues.comments.confirm_delete')) as any).then((ok: any) => {
      if (ok) {
        const updatedIssue = {
          ...issue,
          comments: issue.comments.filter((_, j) => i !== j),
        };
        setIssue(updatedIssue);
        Services.updateIssue(api._humanReadableId, team._id, id, updatedIssue).then((res) => {
          if (res.error)
            toastr.error(translate('Error'), res.error);
          else
            toastr.success(translate('Success'), translate('Api saved'));
        });
      }
    });
  }

  function createComment(content: any) {
    const updatedIssue = {
      ...issue,
      comments: [
        ...issue.comments,
        {
          by: connectedUser,
          content,
        }
      ]
    }
    updateIssue(updatedIssue);
  }

  function closeIssue() {
    const closedIssue = {
      ...issue,
      open: false,
      tags: (issue as any).tags.map((tag: any) => tag.value),
    };
    updateIssue(closedIssue)
  }

  const handleTagCreation = (name: any) => {
    dispatch(openFormModal({
      title: translate('issues.create_tag'),
      schema: {
        name: {
          type: type.string,
          label: translate('Name'),
          constraints: [
            constraints.required(translate('constraints.required.name'))
          ]
        },
        color: {
          type: type.string,
          label: translate('Color'),
          defaultValue: '#fd0643',
          render: ({
            value,
            onChange
          }: any) => {
            return (
              <div className='d-flex flex-row'>
                <div className='cursor-pointer me-2 d-flex align-items-center justify-content-center'
                  style={{ borderRadius: '4px', backgroundColor: value, padding: '0 8px' }}
                  onClick={() => onChange(randomColor())}>
                  <RefreshCcw />
                </div>
                <input className='mrf-input' value={value} onChange={e => onChange(e.target.value)} />
              </div>
            )
          },
          constraints: [
            constraints.matches(/^#(?:[a-fA-F\d]{6}|[a-fA-F\d]{3})$/gm, translate('color.unavailable'))
          ]
        }
      },
      onSubmit: (data: any) => {
        const updatedApi = { ...api, issuesTags: [...api.issuesTags, data] };
        onChange(updatedApi);
      },
      value: { name, color: randomColor() },
      actionLabel: translate('Create')
    }))
  }

  return (<div className="container">
    <div className="d-flex align-items-center justify-content-between mb-2">
      {editionMode ? (<input type="text" className="form-control" placeholder="Title" value={(issue as any).title} onChange={(e) => setIssue({ ...issue, title: e.target.value })} />) : (<h1 style={{ fontSize: '1.5rem', margin: 0 }} className="pe-3">
        {(issue as any).title} <span style={{ fontWeight: 'bold' }}>#{(issue as any).seqId}</span>
      </h1>)}
      {connectedUser && !connectedUser.isGuest && (<Can I={manage} a={API} team={team}>
        <div className="d-flex">
          {editionMode ? (<div className="d-flex ms-3">
            <button className="btn btn-success me-1" onClick={() => updateIssue(issue)}>
              {translate('Save')}
            </button>
            <button className="btn btn-outline-secondary" onClick={() => handleEdition(false)}>
              {translate('Cancel')}
            </button>
          </div>) : (<>
            <button className="btn btn-outline-secondary me-1" onClick={() => handleEdition(true)}>
              {translate('Edit')}
            </button>
          </>)}
        </div>
      </Can>)}
    </div>
    <div className="d-flex align-items-center pb-3 mb-3">
      <div style={styles.getStatus((issue as any).open)} className="d-flex justify-content-center align-items-center me-3">
        <i className="fa fa-exclamation-circle me-2" style={{ color: '#fff' }} />
        {(issue as any).open ? translate('issues.open') : translate('issues.closed')}
      </div>
      <div>
        <span className="pe-1" style={styles.bold}>
          {(issue as any).by ? (issue as any).by._humanReadableId : ''}
        </span>
        {translate('issues.opened_message')}{' '}
        {moment((issue as any).createdDate).format(translate('moment.date.format.without.hours'))} ·{' '}
        {issue.comments ? issue.comments.length : 0} {translate('issues.comments')}
      </div>
    </div>

    <div className="row">
      <div className="col-md-9">
        {issue.comments.map((comment, i) => (<Comment {...comment} key={`comment${i}`} i={i} editComment={() => editComment(i)} removeComment={() => removeComment(i)} updateComment={(content: any) => updateComment(i, content)} connectedUser={connectedUser} />))}
        {connectedUser && !connectedUser.isGuest && (<NewComment picture={connectedUser.picture} open={(issue as any).open} createComment={createComment} closeIssue={closeIssue} openIssue={() => updateIssue({ ...issue, open: true })} team={team} />)}
      </div>
      <div className="col-md-3">
        <div>
          <div className="d-flex flex-column align-items-start mb-2">
            <label htmlFor="tags" className='me-1'>{translate('issues.tags')}</label>
            {connectedUser && !connectedUser.isGuest && (
              <Select
                id="tags"
                //@ts-ignore
                onChange={(value: Tag) => setTags([...tags, value])}
                options={api.issuesTags
                  .filter((tag: any) => !tags.some((t: Tag) => tag.id === t.value))
                  .map((tag: any) => ({
                    value: tag.id,
                    label: tag.name
                  }))}
                className="input-select reactSelect w-100"
                classNamePrefix="reactSelect" onCreateOption={handleTagCreation} />)}
          </div>
          <div id="tags" className='d-flex flex-column flex-wrap'>
            {tags.map((tag) => {
              const bgColor = api.issuesTags.find((t) => t.id === tag.value)?.color || '#fff';
              return (<div className="issue__tag me-1 mt-1 d-flex justify-content-between align-items-center" style={{
                backgroundColor: bgColor,
                color: getColorByBgColor(bgColor)
              }} key={tag.value}>
                <span className='me-2'>{tag.label}</span>
                <span className='cursor-pointer' onClick={() => setTags(tags.filter(t => t.value !== tag.value))}><X /></span>
              </div>);
            })}
            {tags && tags.length <= 0 && <p>{translate('issues.no_tags')}</p>}
          </div>
        </div>
      </div>
    </div>
  </div>);
}

function Comment({
  by,
  createdDate,
  content,
  editing,
  editComment,
  removeComment,
  updateComment,
  connectedUser,
  i
}: any) {
  const [showActions, toggleActions] = useState(false);

  const { translate } = useContext(I18nContext);

  return (
    <div className="d-flex pb-4">
      <div className="dropdown pe-2">
        <img
          style={{ width: 42 }}
          src={by.picture}
          className="dropdown-toggle logo-anonymous user-logo"
          data-toggle="dropdown"
          alt="user menu"
        />
      </div>
      <div className="container">
        <div className="d-flex px-3 py-2" style={styles.commentHeader}>
          <span className="pe-1" style={styles.bold}>
            {by._humanReadableId}
          </span>
          <span className="pe-1">{translate('issues.commented_on')}</span>
          {moment(createdDate).format(translate('moment.date.format.without.hours'))}
          {by._id === connectedUser._id && editing !== true && (
            <>
              {showActions ? (
                <div className="ml-auto">
                  <button className="btn btn-xs btn-outline-secondary me-1" onClick={editComment}>
                    <i className="fas fa-edit align-self-center" />
                  </button>
                  {i !== 0 && (
                    <button className="btn btn-xs btn-outline-danger" onClick={removeComment}>
                      <i className="fas fa-trash align-self-center" />
                    </button>
                  )}
                </div>
              ) : (
                <i
                  className="fas fa-ellipsis-h align-self-center ml-auto"
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleActions(true)}
                />
              )}
            </>
          )}
        </div>
        {editing ? (
          <div className="p-3" style={styles.commentBody}>
            <Form
              schema={{
                content: {
                  type: type.string,
                  format: format.markdown,
                  label: null
                }
              }}
              value={{ content }}
              options={{
                actions: {
                  cancel: {
                    display: true,
                    action: editComment
                  }
                }
              }}
              onSubmit={data => updateComment(data.content)}
            />
          </div>
        ) : (
          <div
            className="p-3"
            style={styles.commentBody}
            dangerouslySetInnerHTML={{ __html: converter.makeHtml(content) }}
          />
        )}
      </div>
    </div>
  );
}

function NewComment({
  picture,
  createComment,
  closeIssue,
  open,
  openIssue,
  team
}: any) {
  const { translate } = useContext(I18nContext);
  return (
    <div className="d-flex pb-4">
      <div className="dropdown pe-2">
        <img
          style={{ width: 42 }}
          src={picture}
          className="dropdown-toggle logo-anonymous user-logo"
          data-toggle="dropdown"
          alt="user menu"
        />
      </div>
      <div className="container">
        <div className="d-flex px-3 py-2" style={styles.commentHeader}>
          {translate('issues.new_comment')}
        </div>
        <div
          className="p-3"
          style={{
            border: '1px solid #eee',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            backgroundColor: '#fff',
          }}
        >
          <Form
            schema={{
              content: {
                type: type.string,
                format: format.markdown,
                label: null,
                constraints: [
                  constraints.required(translate('constraints.required.content'))
                ]
              }
            }}
            footer={({ valid }) => {
              return (
                <div className="d-flex mt-3 justify-content-end">
                  <Can I={manage} a={API} team={team}>
                    {open && (
                      <button type="button" className="btn btn-outline-danger me-1" onClick={closeIssue}>
                        <i className="fa fa-exclamation-circle me-2" />
                        {translate('issues.actions.close')}
                      </button>
                    )}
                    {!open && (
                      <button type="button" className="btn btn-outline-success me-1" onClick={openIssue}>
                        <i className="fa fa-exclamation-circle me-2" />
                        {translate('issues.actions.reopen')}
                      </button>
                    )}
                  </Can>
                  <button type="button" className="btn btn-success" onClick={valid}>
                    {translate('issues.actions.comment')}
                  </button>
                </div>
              )
            }}
            onSubmit={data => createComment(data.content)}
          />
        </div>
      </div>
    </div>
  );
}
