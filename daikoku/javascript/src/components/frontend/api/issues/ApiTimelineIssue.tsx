import React, { useContext, useEffect, useState } from 'react';
import { Form, constraints, format, type } from '@maif/react-forms';
import moment from 'moment';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import RefreshCcw from 'react-feather/dist/icons/refresh-ccw';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import X from 'react-feather/dist/icons/x';
import { useDispatch } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import { useNavigate, useParams } from 'react-router-dom';
import Select from 'react-select/creatable';

import { api as API, manage } from '../../..';
import { I18nContext, openFormModal } from '../../../../core';
import * as Services from '../../../../services';
import { converter } from '../../../../services/showdown';
import { Can, getColorByBgColor, randomColor } from '../../../utils';

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
    textTransform: 'capitalize',
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

export function ApiTimelineIssue({
  issueId,
  connectedUser,
  team,
  api,
  basePath,
  onChange
}: any) {
  const [issue, setIssue] = useState({ comments: [] });
  const [editionMode, handleEdition] = useState(false);
  const [tags, setTags] = useState([]);

  const navigate = useNavigate();
  const id = issueId || useParams().issueId;

  const dispatch = useDispatch();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

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
          toastr.error(res.error);
        } else
          setIssue(updatedIssue);
      });
  }

  function updateComment(i: any, newContent: any) {
    const updatedIssue = {
      ...issue,
      comments: issue.comments.map((comment, j) => {
        if (i === j) {
          // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
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
    (window.confirm(translateMethod('issues.comments.confirm_delete')) as any).then((ok: any) => {
    if (ok) {
        const updatedIssue = {
            ...issue,
            comments: issue.comments.filter((_, j) => i !== j),
        };
        setIssue(updatedIssue);
        Services.updateIssue(api._humanReadableId, team._id, id, updatedIssue).then((res) => {
            if (res.error)
                toastr.error(res.error);
            else
                toastr.success(translateMethod('Api saved'));
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
      title: translateMethod('issues.create_tag'),
      schema: {
        name: {
          type: type.string,
          label: translateMethod('Name'),
          constraints: [
            constraints.required(translateMethod('constraints.required.name'))
          ]
        },
        color: {
          type: type.string,
          label: translateMethod('Color'),
          defaultValue: '#fd0643',
          render: ({
            value,
            onChange
          }: any) => {
            return (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div className='d-flex flex-row'>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className='cursor-pointer me-2 d-flex align-items-center justify-content-center'
                  style={{ borderRadius: '4px', backgroundColor: value, padding: '0 8px' }}
                  onClick={() => onChange(randomColor())}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <RefreshCcw />
                </div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <input className='mrf-input' value={value} onChange={e => onChange(e.target.value)} />
              </div>
            )
          },
          constraints: [
            constraints.matches(/^#(?:[a-fA-F\d]{6}|[a-fA-F\d]{3})$/gm, translateMethod('color.unavailable'))
          ]
        }
      },
      onSubmit: (data: any) => {
        const updatedApi = { ...api, issuesTags: [...api.issuesTags, data] };
        onChange(updatedApi);
      },
      value: { name, color: randomColor() },
      actionLabel: translateMethod('Create')
    }))
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="container">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex align-items-center justify-content-between mb-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {editionMode ? (<input type="text" className="form-control" placeholder="Title" value={(issue as any).title} onChange={(e) => setIssue({ ...issue, title: e.target.value })}/>) : (<h1 style={{ fontSize: '1.5rem', margin: 0 }} className="pe-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {(issue as any).title} <span style={{ fontWeight: 'bold' }}>#{(issue as any).seqId}</span>
          </h1>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {connectedUser && !connectedUser.isGuest && (<Can I={manage} a={API} team={team}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {editionMode ? (<div className="d-flex ms-3">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button className="btn btn-success me-1" onClick={() => updateIssue(issue)}>
                    {translateMethod('Save')}
                  </button>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button className="btn btn-outline-secondary" onClick={() => handleEdition(false)}>
                    {translateMethod('Cancel')}
                  </button>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                </div>) : (<>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button className="btn btn-outline-secondary me-1" onClick={() => handleEdition(true)}>
                    {translateMethod('Edit')}
                  </button>
                </>)}
            </div>
          </Can>)}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex align-items-center pb-3 mb-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div style={styles.getStatus((issue as any).open)} className="d-flex justify-content-center align-items-center me-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fa fa-exclamation-circle me-2" style={{ color: '#fff' }}/>
          {(issue as any).open ? translateMethod('issues.open') : translateMethod('issues.closed')}
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="pe-1" style={styles.bold}>
            {(issue as any).by ? (issue as any).by._humanReadableId : ''}
          </span>
          {translateMethod('issues.opened_message')}{' '}
          {moment((issue as any).createdDate).format(translateMethod('moment.date.format.without.hours'))} ·{' '}
          {issue.comments ? issue.comments.length : 0} {translateMethod('issues.comments')}
        </div>
      </div>

      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-md-9">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {issue.comments.map((comment, i) => (<Comment {...comment} key={`comment${i}`} i={i} editComment={() => editComment(i)} removeComment={() => removeComment(i)} updateComment={(content: any) => updateComment(i, content)} connectedUser={connectedUser}/>))}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {connectedUser && !connectedUser.isGuest && (<NewComment picture={connectedUser.picture} open={(issue as any).open} createComment={createComment} closeIssue={closeIssue} openIssue={() => updateIssue({ ...issue, open: true })} team={team}/>)}
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-md-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex flex-column align-items-start mb-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <label htmlFor="tags" className='me-1'>{translateMethod('issues.tags')}</label>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {connectedUser && !connectedUser.isGuest && (<Select id="tags" onChange={(value) => setTags([...tags, value])} options={api.issuesTags
            .filter((tag: any) => !tags.some(t => tag.id === (t as any).value))
            .map((tag: any) => ({
            value: tag.id,
            label: tag.name
        }))} className="input-select reactSelect w-100" classNamePrefix="reactSelect" onCreateOption={handleTagCreation}/>)}
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div id="tags" className='d-flex flex-column flex-wrap'>
              {tags.map((tag) => {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'never'.
        const bgColor = api.issuesTags.find((t: any) => t.id === tag.value).color;
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div className="issue__tag me-1 mt-1 d-flex justify-content-between align-items-center" style={{
                backgroundColor: bgColor,
                color: getColorByBgColor(bgColor)
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'never'.
            }} key={tag.value}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className='me-2'>{tag.label}</span>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className='cursor-pointer' onClick={() => setTags(tags.filter(t => t.value !== tag.value))}><X /></span>
                  </div>);
    })}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {tags && tags.length <= 0 && <p>{translateMethod('issues.no_tags')}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>);
                // @ts-expect-error TS(2552): Cannot find name 'tag'. Did you mean 'tags'?
                const bgColor = api.issuesTags.find((t: any) => t.id === (tag as any).value).color;
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<div className="issue__tag me-1 mt-1 d-flex justify-content-between align-items-center" style={{
        backgroundColor: bgColor,
        color: getColorByBgColor(bgColor)
    // @ts-expect-error TS(2552): Cannot find name 'tag'. Did you mean 'tags'?
    }} key={(tag as any).value}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className='me-2'>{(tag as any).label}</span>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className='cursor-pointer' onClick={() => setTags(tags.filter(t => (t as any).value !== (tag as any).value))}><X /></span>
                  </div>);
              })}
              // @ts-expect-error TS(2304): Cannot find name 'tags'.
              {tags && tags.length <= 0 && <p>{translateMethod('issues.no_tags')}</p>}
            // @ts-expect-error TS(2304): Cannot find name 'div'.
            </div>
          // @ts-expect-error TS(2304): Cannot find name 'div'.
          </div>
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    // @ts-expect-error TS(2304): Cannot find name 'div'.
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
  updateComment,
  connectedUser,
  i
}: any) {
  const [showActions, toggleActions] = useState(false);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex pb-4">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="dropdown pe-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <img
          style={{ width: 42 }}
          src={by.picture}
          className="dropdown-toggle logo-anonymous user-logo"
          data-toggle="dropdown"
          alt="user menu"
        />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="container">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex px-3 py-2" style={styles.commentHeader}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="pe-1" style={styles.bold}>
            {by._humanReadableId}
          </span>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="pe-1">{translateMethod('issues.commented_on')}</span>
          {moment(createdDate).format(translateMethod('moment.date.format.without.hours'))}
          {by._id === connectedUser._id && editing !== true && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <>
              {showActions ? (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div className="ml-auto">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button className="btn btn-xs btn-outline-secondary me-1" onClick={editComment}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-edit align-self-center" />
                  </button>
                  {i !== 0 && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <button className="btn btn-xs btn-outline-danger" onClick={removeComment}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-trash align-self-center" />
                    </button>
                  )}
                </div>
              ) : (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="p-3" style={styles.commentBody}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex pb-4">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="dropdown pe-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <img
          style={{ width: 42 }}
          src={picture}
          className="dropdown-toggle logo-anonymous user-logo"
          data-toggle="dropdown"
          alt="user menu"
        />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="container">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex px-3 py-2" style={styles.commentHeader}>
          {translateMethod('issues.new_comment')}
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div
          className="p-3"
          style={{
            border: '1px solid #eee',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            backgroundColor: '#fff',
          }}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Form
            schema={{
              content: {
                type: type.string,
                format: format.markdown,
                label: null,
                constraints: [
                  constraints.required(translateMethod('constraints.required.content'))
                ]
              }
            }}
            footer={({ valid }) => {
              return (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div className="d-flex mt-3 justify-content-end">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Can I={manage} a={API} team={team}>
                    {open && (
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <button type="button" className="btn btn-outline-danger me-1" onClick={closeIssue}>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <i className="fa fa-exclamation-circle me-2" />
                        {translateMethod('issues.actions.close')}
                      </button>
                    )}
                    {!open && (
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <button type="button" className="btn btn-outline-success me-1" onClick={openIssue}>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <i className="fa fa-exclamation-circle me-2" />
                        {translateMethod('issues.actions.reopen')}
                      </button>
                    )}
                  </Can>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button type="button" className="btn btn-success" onClick={valid}>
                    {translateMethod('issues.actions.comment')}
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
