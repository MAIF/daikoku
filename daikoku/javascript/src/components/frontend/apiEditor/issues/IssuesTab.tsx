import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { CircleCheck, CircleDot, MessageSquare, Plus, Tag } from 'lucide-react';
import { useContext, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { IApi, IIssuesTag, isError, Issue, ITeamSimple } from '../../../../types';
import { api as API, CanIDoAction, formatDate, manage, Spinner, Tabs } from '../../../utils';
import { IssueFormValue, IssueSideSheet } from './IssueSideSheet';
import { IssueTagsSideSheet } from './IssueTagsSideSheet';
import { IssueThread } from './IssueThread';

type Filter = 'open' | 'closed' | 'all';

const ALL_VERSIONS = 'all';

type IssuesTabProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
};

export const IssuesTab = (props: IssuesTabProps) => {
  const { translate } = useContext(I18nContext);
  const { connectedUser } = useContext(GlobalContext);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [filter, setFilter] = useState<Filter>('open');
  const [version, setVersion] = useState(ALL_VERSIONS);
  const [sheet, setSheet] = useState<'issue' | 'tags'>();

  const isOwner = CanIDoAction(connectedUser, manage, API, props.ownerTeam);

  const rootApiQuery = useQuery({
    queryKey: ['rootApi', props.api._humanReadableId],
    queryFn: () => Services.getRootApi(props.api._humanReadableId),
  });

  const issuesQuery = useQuery({
    queryKey: ['issues', props.api._humanReadableId],
    queryFn: () => Services.getAPIIssues(props.api._humanReadableId),
  });

  const versionsQuery = useQuery({
    queryKey: ['apiVersions', props.api._humanReadableId],
    queryFn: () => Services.getAllApiVersions(props.ownerTeam._id, props.api._humanReadableId),
  });

  if (rootApiQuery.isLoading || issuesQuery.isLoading || versionsQuery.isLoading) {
    return <Spinner />;
  } else if (
    !rootApiQuery.data ||
    isError(rootApiQuery.data) ||
    !issuesQuery.data ||
    isError(issuesQuery.data)
  ) {
    return <div className="alert alert-danger">{translate('issues.on_error')}</div>;
  }

  const rootApi = rootApiQuery.data;
  const versions = versionsQuery.data ?? [];

  const issues = issuesQuery.data
    .filter((issue) => filter === 'all' || issue.open === (filter === 'open'))
    .filter((issue) => version === ALL_VERSIONS || issue.apiVersion === version)
    .sort((a, b) => b.seqId - a.seqId);

  const selectedId = params['*'] || issues[0]?._id;

  const selectIssue = (issueId: string) =>
    navigate({
      pathname: `/${params.teamId}/${params.apiId}/${params.versionId}/issues/${issueId}`,
      search: location.search,
    });

  const dateOf = (issue: Issue) =>
    formatDate(issue.createdAt, translate('date.locale'), translate('date.format.without.hours'));

  const createIssue = (value: IssueFormValue) =>
    Services.fetchNewIssue()
      .then((newIssue: Issue) => {
        const payload = {
          ...newIssue,
          title: value.title,
          apiVersion: value.apiVersion,
          tags: value.tags,
          comments: [{ content: value.comment, by: connectedUser._id }],
        };

        return Services.createNewIssue(props.api._humanReadableId, props.ownerTeam._id, payload as unknown as Issue);
      })
      .then((response) => {
        if (response.error) {
          toast.error(response.error);
          return;
        }

        toast.success(translate('issues.created'));
        setSheet(undefined);
        return queryClient.invalidateQueries({ queryKey: ['issues'] });
      });

  const saveTags = (issuesTags: Array<IIssuesTag>) =>
    Services.getRootApi(props.api._humanReadableId)
      .then((fresh) =>
        isError(fresh)
          ? fresh
          : Services.saveTeamApi(props.ownerTeam._id, { ...fresh, issuesTags }, fresh.currentVersion)
      )
      .then((response) => {
        if (isError(response)) {
          toast.error(response.error);
          return;
        }

        toast.success(translate('Api saved'));
        setSheet(undefined);
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: ['rootApi'] }),
          queryClient.invalidateQueries({ queryKey: ['issues'] }),
          queryClient.invalidateQueries({ queryKey: ['issue'] }),
        ]);
      });

  const sheets = (
    <>
      {sheet === 'issue' && (
        <IssueSideSheet
          versions={versions}
          tags={rootApi.issuesTags}
          canManageTags={isOwner}
          onSave={createIssue}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet === 'tags' && (
        <IssueTagsSideSheet tags={rootApi.issuesTags} onSave={saveTags} onClose={() => setSheet(undefined)} />
      )}
    </>
  );

  if (issuesQuery.data.length === 0) {
    return (
      <div className="api-doc">
        <div className="api-doc__empty">
          <MessageSquare size={32} aria-hidden="true" />
          <h3 className="api-doc__empty-title">{translate('issues.empty.title')}</h3>
          <p className="api-doc__empty-text">{translate('issues.empty.description')}</p>

          {!connectedUser.isGuest && (
            <button type="button" className="btn --primary" onClick={() => setSheet('issue')}>
              <Plus size={16} />
              {translate('issues.empty.create')}
            </button>
          )}
        </div>

        {sheets}
      </div>
    );
  }

  return (
    <div className="api-doc">
      <nav className="api-doc__sidebar" aria-label={translate('issues.tree.title')}>
        <div className="api-doc__sidebar-header">
          <span className="api-doc__sidebar-title">{translate('issues.tree.title')}</span>

          {!connectedUser.isGuest && (
            <button type="button" className="btn --tertiary --small" onClick={() => setSheet('issue')}>
              <Plus size={14} />
              {translate('issues.create')}
            </button>
          )}
        </div>

        <Tabs
          idPrefix="issues-filter"
          label={translate('issues.filter.label')}
          variant="segmented"
          tabs={[
            { id: 'open', label: translate('issues.open') },
            { id: 'closed', label: translate('issues.closed') },
            { id: 'all', label: translate('All') },
          ]}
          activeTab={filter}
          onChange={setFilter}
        />

        {versions.length > 1 && (
          <select
            className="form-select form-select-sm"
            aria-label={translate('issues.apiVersion')}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value={ALL_VERSIONS}>{translate('All version')}</option>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}

        <ul className="doc-tree">
          {issues.map((issue) => {
            const active = issue._id === selectedId;

            return (
              <li key={issue._id} className="doc-tree__item">
                <button
                  type="button"
                  className={classNames('doc-tree__link issue__link', { active })}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => selectIssue(issue._id)}
                >
                  {issue.open ? (
                    <CircleDot size={14} className="issue__status --open" aria-label={translate('issues.open')} />
                  ) : (
                    <CircleCheck size={14} className="issue__status" aria-label={translate('issues.closed')} />
                  )}
                  <span className="issue__link-text">
                    {issue.title}
                    <span className="doc-tree__meta">
                      #{issue.seqId} · {dateOf(issue)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {issues.length === 0 && <p className="doc-tree__meta">{translate('issues.nothing_matching_filter')}</p>}

        {isOwner && (
          <div className="api-doc__sidebar-actions">
            <button type="button" className="btn --tertiary --small" onClick={() => setSheet('tags')}>
              <Tag size={14} />
              {translate('issues.tags')}
            </button>
          </div>
        )}
      </nav>

      {selectedId ? (
        <IssueThread
          key={selectedId}
          rootApi={rootApi}
          ownerTeam={props.ownerTeam}
          issueId={selectedId}
          versions={versions}
          isOwner={isOwner}
        />
      ) : (
        <div className="api-doc__content" />
      )}

      {sheets}
    </div>
  );
};
