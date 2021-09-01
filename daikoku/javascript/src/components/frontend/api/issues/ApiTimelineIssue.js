import React, { useContext } from 'react';
import { Link, useParams } from 'react-router-dom';
import moment from 'moment';
import { useEffect, useState } from 'react';
import { converter } from '../../../../services/showdown';
import * as Services from '../../../../services';
import { toastr } from 'react-redux-toastr';
import Select from 'react-select';
import { api as API, manage } from '../../..';
import { Can } from '../../../utils';
import { I18nContext } from '../../../../core';

const LazySingleMarkdownInput = React.lazy(() => import('../../../inputs/SingleMarkdownInput'));

const styles = {
  commentHeader: {
    backgroundColor: '#eee',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
  },
  bold: {
    fontWeight: 'bold',
  },
  getStatus: (open) => ({
    textTransform: 'capitalize',
    borderRadius: '12px',
    backgroundColor: open ? '#28a745' : '#dc3545',
    width: 'fit-content',
    padding: '6px 12px',
    borderRadius: '2em',
    color: '#fff',
  }),
  commentBody: {
    border: '1px solid #eee',
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    backgroundColor: '#fff',
  },
};

export function ApiTimelineIssue({ issueId, connectedUser, team, api, basePath, history }) {
  const [issue, setIssue] = useState({ comments: [] });
  const [editionMode, handleEdition] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showTag, onTagEdit] = useState(false);

  const [tags, setTags] = useState([]);

  const id = issueId || useParams().issueId;

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getAPIIssue(api._humanReadableId, id).then((res) => {
      if (res.error) history.push(`${basePath}/issues`);
      else {
        const entryTags = res.tags.map((tag) => ({ value: tag.id, label: tag.name }));
        setIssue({ ...res, tags: entryTags });
        setTags(entryTags);
      }
    });
  }, [id]);

  useEffect(() => {
    if (newComment.length > 0) {
      setNewComment('');
      updateIssue();
    }
  }, [issue.comments]);

  function updateIssue() {
    if (issue.title.length <= 0) toastr.error(translateMethod('issues.timeline.title.error'));
    else {
      handleEdition(false);
      onTagEdit(false);
      Services.updateIssue(api._id, team._id, id, {
        ...issue,
        tags: tags.map((tag) => tag.value),
      }).then((res) => {
        if (res.error) toastr.error(res.error);
        else
          setIssue({
            ...issue,
            tags: tags.length > 0 ? tags : issue.tags,
          });
      });
    }
  }

  function updateComment(i) {
    if (issue.comments[i].content.length <= 0)
      toastr.error(translateMethod('issues.timeline.comment_content.error'));
    else {
      setIssue({
        ...issue,
        comments: issue.comments.map((comment, j) => {
          if (i === j) comment.editing = false;
          return comment;
        }),
      });
      updateIssue();
    }
  }

  function deleteIssue() {
    window.confirm(translateMethod('issues.confirm_delete')).then((ok) => {
      if (ok)
        Services.updateIssue(api._humanReadableId, team._id, id, {
          ...issue,
          _deleted: true,
          tags: issue.tags.map((tag) => tag.value),
        }).then((res) => {
          if (res.error) toastr.error(translateMethod('issues.on_error'));
          else history.push(`${basePath}/issues`);
        });
    });
  }

  function editComment(i) {
    setIssue({
      ...issue,
      comments: issue.comments.map((comment, j) => {
        if (i === j) comment.editing = comment.editing !== undefined ? !comment.editing : true;
        return comment;
      }),
    });
  }

  function removeComment(i) {
    window.confirm(translateMethod('issues.comments.confirm_delete')).then((ok) => {
      if (ok) {
        const updatedIssue = {
          ...issue,
          comments: issue.comments.filter((_, j) => i !== j),
        };
        setIssue(updatedIssue);
        Services.updateIssue(api._humanReadableId, team._id, id, updatedIssue).then((res) => {
          if (res.error) toastr.error(res.error);
          else toastr.success(translateMethod('Api saved'));
        });
      }
    });
  }

  function handleEditCommentContent(newValue, i) {
    setIssue({
      ...issue,
      comments: issue.comments.map((comment, j) => {
        if (i === j) comment.content = newValue;
        return comment;
      }),
    });
  }

  function createComment() {
    if (newComment.length <= 0) toastr.error(translateMethod('issues.on_missing_comment_content'));
    else {
      setIssue({
        ...issue,
        comments: [
          ...issue.comments,
          {
            by: connectedUser,
            content: newComment,
          },
        ],
      });
    }
  }

  function setIssueStatus(value) {
    Services.updateIssue(api._humanReadableId, team._id, id, {
      ...issue,
      open: value,
      tags: issue.tags.map((tag) => tag.value),
    }).then(() => setIssue({ ...issue, open: value }));
  }

  function closeIssue() {
    const newIssue = {
      ...issue,
      open: false,
      comments:
        newComment.length > 0
          ? [
              ...issue.comments,
              {
                by: connectedUser,
                content: newComment,
              },
            ]
          : issue.comments,
    };
    Services.updateIssue(api._humanReadableId, team._id, id, {
      ...newIssue,
      tags: issue.tags.map((tag) => tag.value),
    }).then(() => setIssue(newIssue));
  }

  return (
    <div className="container">
      <div className="d-flex align-items-center justify-content-between mb-2">
        {editionMode ? (
          <input
            type="text"
            className="form-control"
            placeholder="Title"
            value={issue.title}
            onChange={(e) => setIssue({ ...issue, title: e.target.value })}
          />
        ) : (
          <h1 style={{ fontSize: '1.5rem', margin: 0 }} className="pr-3">
            {issue.title} <span style={{ fontWeight: 'bold' }}>#{issue.seqId}</span>
          </h1>
        )}
        {connectedUser && !connectedUser.isGuest && (
          <div className="d-flex">
            {editionMode ? (
              <div className="d-flex ml-3">
                <button className="btn btn-success mr-1" onClick={updateIssue}>
                  {translateMethod('Save')}
                </button>
                <button className="btn btn-outline-secondary" onClick={() => handleEdition(false)}>
                  {translateMethod('Cancel')}
                </button>
              </div>
            ) : (
              <>
                <button
                  className="btn btn-outline-secondary mr-1"
                  onClick={() => handleEdition(true)}>
                  {translateMethod('Edit')}
                </button>
                <Link
                  to={`/${team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/issues/new`}
                  style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-success">{translateMethod('issues.new_issue')}</button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
      <div className="d-flex align-items-center pb-3 mb-3">
        <div
          style={styles.getStatus(issue.open)}
          className="d-flex justify-content-center align-items-center mr-3">
          <i className="fa fa-exclamation-circle mr-2" style={{ color: '#fff' }} />
          {issue.open ? translateMethod('issues.open') : translateMethod('issues.closed')}
        </div>
        <div>
          <span className="pr-1" style={styles.bold}>
            {issue.by ? issue.by._humanReadableId : ''}
          </span>
          {translateMethod('issues.opened_message')}{' '}
          {moment(issue.createdDate).format(translateMethod('moment.date.format.without.hours'))} ·{' '}
          {issue.comments ? issue.comments.length : 0} {translateMethod('issues.comments')}
        </div>
      </div>

      <div className="row">
        <div className="col-md-9">
          {issue.comments.map((comment, i) => (
            <Comment
              {...comment}
              key={`comment${i}`}
              i={i}
              editComment={() => editComment(i)}
              removeComment={() => removeComment(i)}
              handleEditCommentContent={(e) => handleEditCommentContent(e, i)}
              updateComment={() => updateComment(i)}
              connectedUser={connectedUser}
            />
          ))}
          {connectedUser && !connectedUser.isGuest && (
            <NewComment
              content={newComment}
              picture={connectedUser.picture}
              open={issue.open}
              handleContent={setNewComment}
              createComment={createComment}
              closeIssue={closeIssue}
              openIssue={() => setIssueStatus(true)}
              team={team}
            />
          )}
        </div>
        <div className="col-md-3">
          <div>
            <div className="d-flex">
              <label htmlFor="tags">{translateMethod('issues.tags')}</label>
              {!showTag && connectedUser && !connectedUser.isGuest && (
                <Can I={manage} a={API} team={team}>
                  <i
                    className="fas fa-cog ml-auto"
                    onClick={() => {
                      setTags(issue.tags);
                      onTagEdit(true);
                    }}></i>
                </Can>
              )}
            </div>
            <div id="tags">
              {showTag ? (
                <>
                  <Select
                    id="tags"
                    isMulti
                    onChange={(values) => setTags(values ? [...values] : [])}
                    options={api.issuesTags.map((iss) => ({ value: iss.id, label: iss.name }))}
                    value={tags}
                    className="input-select reactSelect"
                    classNamePrefix="reactSelect"
                  />
                  <button
                    className="btn btn-outline-danger my-3 mr-1"
                    onClick={() => {
                      setTags([]);
                      onTagEdit(false);
                    }}>
                    {translateMethod('Cancel')}
                  </button>
                  <button className="btn btn-outline-success my-3" onClick={updateIssue}>
                    {translateMethod('Save')}
                  </button>
                </>
              ) : (
                <>
                  {(tags || []).map((tag) => (
                    <span
                      className="badge badge-primary mr-1"
                      style={{
                        backgroundColor: api.issuesTags.find((t) => t.id === tag.value).color,
                      }}
                      key={tag.value}>
                      {tag.label}
                    </span>
                  ))}
                  {tags && tags.length <= 0 && <p>{translateMethod('issues.no_tags')}</p>}
                </>
              )}
            </div>
          </div>

          {connectedUser && !connectedUser.isGuest && (
            <>
              <Can I={manage} a={API} team={team}>
                <hr className="hr-apidescription" />
                <div>
                  <label htmlFor="actions">{translateMethod('issues.actions')}</label>
                  <div id="actions">
                    <i className="fa fa-trash"></i>
                    <button
                      style={{
                        ...styles.bold,
                        border: 0,
                        background: 'transparent',
                        outline: 'none',
                      }}
                      onClick={deleteIssue}>
                      {translateMethod('issues.delete_issue')}
                    </button>
                  </div>
                </div>
              </Can>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Comment({
  by,
  createdDate,
  content,
  editing,
  editComment,
  removeComment,
  handleEditCommentContent,
  updateComment,
  connectedUser,
  i,
}) {
  const [showActions, toggleActions] = useState(false);

  const { translateMethod } = useContext(I18nContext);

  return (
    <div className="d-flex pb-4">
      <div className="dropdown pr-2">
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
          <span className="pr-1" style={styles.bold}>
            {by._humanReadableId}
          </span>
          <span className="pr-1">{translateMethod('issues.commented_on')}</span>
          {moment(createdDate).format(translateMethod('moment.date.format.without.hours'))}
          {by._id === connectedUser._id && editing !== true && (
            <>
              {showActions ? (
                <div className="ml-auto">
                  <button className="btn btn-xs btn-outline-secondary mr-1" onClick={editComment}>
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
            <React.Suspense fallback={<div>{translateMethod('loading')}</div>}>
              <LazySingleMarkdownInput
                fullWidth
                height="300px"
                value={content}
                fixedWitdh="0px"
                onChange={handleEditCommentContent}
              />
            </React.Suspense>
            <div className="d-flex mt-3 justify-content-end">
              <button className="btn btn-outline-danger mr-1" onClick={editComment}>
                {translateMethod('Cancel')}
              </button>
              <button className="btn btn-success" onClick={updateComment}>
                {translateMethod('issues.update')}
              </button>
            </div>
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
  handleContent,
  content,
  picture,
  createComment,
  closeIssue,
  open,
  openIssue,
  team,
}) {
  const { translateMethod } = useContext(I18nContext);
  return (
    <div className="d-flex pb-4">
      <div className="dropdown pr-2">
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
          {translateMethod('issues.new_comment')}
        </div>
        <div
          className="p-3"
          style={{
            border: '1px solid #eee',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            backgroundColor: '#fff',
          }}>
          <React.Suspense fallback={<div>{translateMethod('loading')}</div>}>
            <LazySingleMarkdownInput
              fullWidth={true}
              height="300px"
              value={content}
              fixedWitdh="0px"
              onChange={handleContent}
            />
          </React.Suspense>
          <div className="d-flex mt-3 justify-content-end">
            <Can I={manage} a={API} team={team}>
              {open ? (
                <button className="btn btn-outline-danger mr-1" onClick={closeIssue}>
                  <i className="fa fa-exclamation-circle mr-2" />
                  {translateMethod('issues.actions.close')}
                </button>
              ) : (
                <button className="btn btn-outline-success mr-1" onClick={openIssue}>
                  <i className="fa fa-exclamation-circle mr-2" />
                  {translateMethod('issues.actions.reopen')}
                </button>
              )}
            </Can>
            <button className="btn btn-success" onClick={createComment}>
              {translateMethod('issues.actions.comment')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
