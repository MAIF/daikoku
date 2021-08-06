import React from 'react';
import { Link, useParams } from 'react-router-dom';
import moment from 'moment';
import { useEffect, useState } from 'react';
import { t } from '../../../../locales';
import { converter } from '../../../../services/showdown';
import * as Services from '../../../../services';
import { toastr } from 'react-redux-toastr';
import Select from 'react-select';
import { api as API, manage } from '../../..';
import { Can } from '../../../utils';

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

export function ApiTimelineIssue({
  issueId,
  currentLanguage,
  connectedUser,
  team,
  api,
  basePath,
  history,
}) {
  const [issue, setIssue] = useState({ comments: [] });
  const [editionMode, handleEdition] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showTag, onTagEdit] = useState(false);

  const [tags, setTags] = useState([]);

  const id = issueId || useParams().issueId;

  useEffect(() => {
    Services.getAPIIssue(api._humanReadableId, id).then((res) => {
      const entryTags = res.tags.map((tag) => ({ value: tag.id, label: tag.name }));
      setIssue({ ...res, tags: entryTags });
      setTags(entryTags);
    });
  }, [id]);

  useEffect(() => {
    if (newComment.length > 0) {
      setNewComment('');
      updateIssue();
    }
  }, [issue.comments]);

  function updateIssue() {
    if (issue.title.length <= 0) toastr.error(t('issues.timeline.title.error', currentLanguage));
    else {
      handleEdition(false);
      onTagEdit(false);
      Services.updateIssue(api._id, team._id, id, {
        ...issue,
        tags: tags.map((tag) => tag.value),
      })
        .then(res => {
          if (res.error)
            toastr.error(res.error);
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
      toastr.error(t('issues.timeline.comment_content.error', currentLanguage));
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
    window.confirm(t('issues.confirm_delete', currentLanguage)).then((ok) => {
      if (ok)
        Services.updateIssue(api._humanReadableId, team._id, id, {
          ...issue,
          _deleted: true,
          tags: issue.tags.map((tag) => tag.value),
        }).then((res) => {
          if (res.error)
            toastr.error(t('issues.on_error', currentLanguage));
          else
            history.push(`${basePath}/issues`);
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
    window.confirm(t('issues.comments.confirm_delete', currentLanguage)).then((ok) => {
      if (ok) {
        const updatedIssue = {
          ...issue,
          comments: issue.comments.filter((_, j) => i !== j),
        };
        setIssue(updatedIssue);
        Services.updateIssue(api._humanReadableId, team._id, id, updatedIssue)
          .then(res => {
            if (res.error)
              toastr.error(res.error);
            else
              toastr.success(t('Api saved', currentLanguage));
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
    if (newComment.length <= 0)
      toastr.error(t('issues.on_missing_comment_content', currentLanguage));
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
                  {t('Save', currentLanguage)}
                </button>
                <button className="btn btn-outline-secondary" onClick={() => handleEdition(false)}>
                  {t('Cancel', currentLanguage)}
                </button>
              </div>
            ) : (
              <>
                <button
                  className="btn btn-outline-secondary mr-1"
                  onClick={() => handleEdition(true)}>
                  {t('Edit', currentLanguage)}
                </button>
                <Link
                  to={`/${team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/issues/new`}
                  style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-success">
                    {t('issues.new_issue', currentLanguage)}
                  </button>
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
          {issue.open ? t('issues.open', currentLanguage) : t('issues.closed', currentLanguage)}
        </div>
        <div>
          <span className="pr-1" style={styles.bold}>
            {issue.by ? issue.by._humanReadableId : ''}
          </span>
          {t('issues.opened_message', currentLanguage)}{' '}
          {moment(issue.createdDate).format(t('moment.date.format.without.hours', currentLanguage))}{' '}
          · {issue.comments ? issue.comments.length : 0} {t('issues.comments', currentLanguage)}
        </div>
      </div>

      <div className="row">
        <div className="col-md-9">
          {issue.comments.map((comment, i) => (
            <Comment
              {...comment}
              key={`comment${i}`}
              i={i}
              currentLanguage={currentLanguage}
              editComment={() => editComment(i)}
              removeComment={() => removeComment(i)}
              handleEditCommentContent={(e) => handleEditCommentContent(e, i)}
              updateComment={() => updateComment(i)}
              connectedUser={connectedUser}
            />
          ))}
          {connectedUser && !connectedUser.isGuest && (
            <NewComment
              currentLanguage={currentLanguage}
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
              <label htmlFor="tags">{t('issues.tags', currentLanguage)}</label>
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
                    {t('Cancel', currentLanguage)}
                  </button>
                  <button className="btn btn-outline-success my-3" onClick={updateIssue}>
                    {t('Save', currentLanguage)}
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
                  {tags && tags.length <= 0 && <p>{t('issues.no_tags', currentLanguage)}</p>}
                </>
              )}
            </div>
          </div>

          {connectedUser && !connectedUser.isGuest && (
            <>
              <Can I={manage} a={API} team={team}>
                <hr className="hr-apidescription" />
                <div>
                  <label htmlFor="actions">{t('issues.actions', currentLanguage)}</label>
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
                      {t('issues.delete_issue', currentLanguage)}
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
  currentLanguage,
  editing,
  editComment,
  removeComment,
  handleEditCommentContent,
  updateComment,
  connectedUser,
  i,
}) {
  const [showActions, toggleActions] = useState(false);

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
          <span className="pr-1">{t('issues.commented_on', currentLanguage)}</span>
          {moment(createdDate).format(t('moment.date.format.without.hours', currentLanguage))}
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
            <React.Suspense fallback={<div>{t('loading', currentLanguage)}</div>}>
              <LazySingleMarkdownInput
                currentLanguage={currentLanguage}
                height="300px"
                value={content}
                fixedWitdh="0px"
                onChange={handleEditCommentContent}
              />
            </React.Suspense>
            <div className="d-flex mt-3 justify-content-end">
              <button className="btn btn-outline-danger mr-1" onClick={editComment}>
                {t('Cancel', currentLanguage)}
              </button>
              <button className="btn btn-success" onClick={updateComment}>
                {t('issues.update', currentLanguage)}
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
  currentLanguage,
  createComment,
  closeIssue,
  open,
  openIssue,
  team,
}) {
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
          {t('issues.new_comment', currentLanguage)}
        </div>
        <div
          className="p-3"
          style={{
            border: '1px solid #eee',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            backgroundColor: '#fff',
          }}>
          <React.Suspense fallback={<div>{t('loading', currentLanguage)}</div>}>
            <LazySingleMarkdownInput
              currentLanguage={currentLanguage}
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
                  {t('issues.actions.close', currentLanguage)}
                </button>
              ) : (
                <button className="btn btn-outline-success mr-1" onClick={openIssue}>
                  <i className="fa fa-exclamation-circle mr-2" />
                  {t('issues.actions.reopen', currentLanguage)}
                </button>
              )}
            </Can>
            <button className="btn btn-success" onClick={createComment}>
              {t('issues.actions.comment', currentLanguage)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
