import { constraints, Form, format, FormRef, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleDot, Pencil, Trash2 } from 'lucide-react';
import { useContext, useRef, useState } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { converter } from '../../../../services/showdown';
import { Comment, IApi, isError, Issue, ITeamSimple, IUserSimple } from '../../../../types';
import {
  formatDate,
  getColorByBgColor,
  getInitials,
  SideSheet,
  SideSheetActions,
  Spinner,
  userHasAvatar,
} from '../../../utils';
import { IssueFormValue, IssueSideSheet } from './IssueSideSheet';

type IssueThreadProps = {
  rootApi: IApi;
  ownerTeam: ITeamSimple;
  issueId: string;
  versions: Array<string>;
  isOwner: boolean;
};

export const IssueThread = (props: IssueThreadProps) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const { connectedUser } = useContext(GlobalContext);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [editedComment, setEditedComment] = useState<number>();

  const issueQuery = useQuery({
    queryKey: ['issue', props.issueId],
    queryFn: () => Services.getAPIIssue(props.rootApi._humanReadableId, props.issueId),
  });

  if (issueQuery.isLoading) {
    return <Spinner />;
  } else if (!issueQuery.data || isError(issueQuery.data)) {
    return <div className="alert alert-danger">{translate('issues.on_error')}</div>;
  }

  const issue = issueQuery.data;

  const dateOf = (date: number) => formatDate(date, translate('date.locale'), translate('date.format.without.hours'));

  const save = (change: Partial<Issue>) => {
    const updated = { ...issue, ...change };

    return Services.updateIssue(props.rootApi._id, props.ownerTeam._id, issue._id, {
      ...updated,
      tags: updated.tags.map((tag) => tag.id),
    }).then((response) => {
      if (response.error) {
        toast.error(response.error);
        return false;
      }

      queryClient.invalidateQueries({ queryKey: ['issue', issue._id] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      return true;
    });
  };

  const saveIssue = (value: IssueFormValue) =>
    save({
      title: value.title,
      apiVersion: value.apiVersion ?? issue.apiVersion,
      tags: props.rootApi.issuesTags.filter((tag) => value.tags.includes(tag.id)),
    }).then((saved) => saved && setEditing(false));

  const toggleOpen = () => save({ open: !issue.open, closedAt: issue.open ? Date.now() : issue.closedAt });

  const addComment = (content: string) =>
    save({
      comments: [...issue.comments, { by: connectedUser, content, createdAt: Date.now() } as Comment],
    });

  const updateComment = (index: number, content: string) =>
    save({
      comments: issue.comments.map((comment, i) => (i === index ? { ...comment, content } : comment)),
    }).then((saved) => saved && setEditedComment(undefined));

  const removeComment = (index: number) =>
    confirm({ message: translate('issues.comments.confirm_delete') }).then(
      (ok) => ok && save({ comments: issue.comments.filter((_, i) => i !== index) })
    );

  const canEdit = props.isOwner || issue.by._id === connectedUser._id;

  return (
    <article className="api-doc__content">
      <header className="api-doc__content-header">
        <div className="d-flex flex-column gap-2">
          <h2 className="api-doc__page-title">
            {issue.title} <span className="issue__seq">#{issue.seqId}</span>
          </h2>

          <div className="d-flex flex-wrap align-items-center gap-2 api-doc__page-meta">
            <span className={`badge ${issue.open ? '--success' : '--inactive'}`}>
              {issue.open ? translate('issues.open') : translate('issues.closed')}
            </span>
            <span>
              {issue.by.name} {translate('issues.opened_message')} {dateOf(issue.createdAt)}
            </span>
            <span className="badge --info">{issue.apiVersion}</span>
            {issue.tags.map((tag) => (
              <span
                key={tag.id}
                className="badge"
                style={{ backgroundColor: tag.color, color: getColorByBgColor(tag.color) }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        <div className="d-flex gap-2">
          {canEdit && (
            <button type="button" className="btn --secondary --small" onClick={() => setEditing(true)}>
              <Pencil size={14} />
              {translate('Edit')}
            </button>
          )}
          {props.isOwner && (
            <button type="button" className="btn --secondary --small" onClick={toggleOpen}>
              {issue.open ? <CircleCheck size={14} /> : <CircleDot size={14} />}
              {translate(issue.open ? 'issues.actions.close' : 'issues.actions.reopen')}
            </button>
          )}
        </div>
      </header>

      <ol className="issue__comments">
        {issue.comments.map((comment, index) => (
          <IssueComment
            key={`${comment.createdAt}-${index}`}
            comment={comment}
            date={dateOf(comment.createdAt)}
            mine={comment.by._id === connectedUser._id}
            removable={index > 0}
            onEdit={() => setEditedComment(index)}
            onRemove={() => removeComment(index)}
          />
        ))}
      </ol>

      {!connectedUser.isGuest && <NewComment onSubmit={addComment} />}

      {editing && (
        <IssueSideSheet
          issue={issue}
          versions={props.versions}
          tags={props.rootApi.issuesTags}
          canManageTags={props.isOwner}
          onSave={saveIssue}
          onClose={() => setEditing(false)}
        />
      )}

      {editedComment !== undefined && (
        <CommentSideSheet
          content={issue.comments[editedComment].content}
          onSave={(content) => updateComment(editedComment, content)}
          onClose={() => setEditedComment(undefined)}
        />
      )}
    </article>
  );
};

const Avatar = ({ user }: { user: IUserSimple }) =>
  userHasAvatar(user) ? (
    <img className="issue__avatar" src={user.picture} alt="" />
  ) : (
    <span className="issue__avatar avatar-without-img">{getInitials(user.name)}</span>
  );

type IssueCommentProps = {
  comment: Comment;
  date: string;
  mine: boolean;
  removable: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

const IssueComment = (props: IssueCommentProps) => {
  const { translate } = useContext(I18nContext);

  return (
    <li className="issue__comment">
      <Avatar user={props.comment.by} />

      <div className="issue__comment-card">
        <div className="issue__comment-header">
          <span>
            <strong>{props.comment.by.name}</strong> {translate('issues.commented_on')} {props.date}
          </span>

          {props.mine && (
            <div className="d-flex gap-1">
              <button
                type="button"
                className="btn --tertiary --small --icon-only"
                aria-label={translate('Edit')}
                onClick={props.onEdit}
              >
                <Pencil size={14} />
              </button>
              {props.removable && (
                <button
                  type="button"
                  className="btn --tertiary --small --icon-only"
                  aria-label={translate('Delete')}
                  onClick={props.onRemove}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        <div
          className="issue__comment-body api-post"
          dangerouslySetInnerHTML={{ __html: converter.makeHtml(props.comment.content) }}
        />
      </div>
    </li>
  );
};

const NewComment = (props: { onSubmit: (content: string) => Promise<boolean> }) => {
  const { translate } = useContext(I18nContext);

  const formRef = useRef<FormRef | undefined>(undefined);

  return (
    <div className="issue__new-comment">
      <Form
        ref={formRef}
        schema={{
          content: {
            type: type.string,
            format: format.markdown,
            label: translate('issues.new_comment'),
            constraints: [constraints.required(translate('constraints.required.content'))],
          },
        }}
        onSubmit={(data) =>
          props.onSubmit(data.content).then((saved) => saved && formRef.current?.methods.reset({ content: '' }))
        }
        footer={({ valid }) => (
          <div className="d-flex justify-content-end mt-2">
            <button type="button" className="btn --primary" onClick={valid}>
              {translate('issues.actions.comment')}
            </button>
          </div>
        )}
      />
    </div>
  );
};

type CommentSideSheetProps = {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  onClose: () => void;
};

const CommentSideSheet = (props: CommentSideSheetProps) => {
  const { translate } = useContext(I18nContext);

  const formRef = useRef<FormRef | undefined>(undefined);

  return (
    <SideSheet
      title={translate('issues.comment.edit')}
      size="wide"
      onClose={props.onClose}
      isDirty={() => !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) => (
        <SideSheetActions onCancel={requestClose} onSave={() => formRef.current?.handleSubmit()} />
      )}
    >
      <Form
        ref={formRef}
        schema={{
          content: {
            type: type.string,
            format: format.markdown,
            label: null,
            props: { height: '320px' },
            constraints: [constraints.required(translate('constraints.required.content'))],
          },
        }}
        value={{ content: props.content }}
        onSubmit={(data) => props.onSave(data.content)}
        footer={() => <></>}
      />
    </SideSheet>
  );
};
