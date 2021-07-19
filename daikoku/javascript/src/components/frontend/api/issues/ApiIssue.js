import React, { useState } from 'react';
import { Switch, useParams, Route } from 'react-router-dom';
import { ApiFilter } from './ApiFilter';
import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';
import { NewIssue } from './NewIssue';
import { TeamApiIssueTags } from './TeamApiIssueTags';
import * as Services from '../../../../services';
import { toastr } from 'react-redux-toastr';
import { t } from '../../../../locales';

export function ApiIssue({ api, currentLanguage, ownerTeam, ...props }) {
  const [filter, setFilter] = useState('open');

  function onChange(editedApi) {
    Services.saveTeamApi(ownerTeam._id, editedApi)
      .then((res) => props.onChange(res))
      .then(() => toastr.success(t('Api saved', currentLanguage)));
  }

  const { issueId, versionId } = useParams();
  const basePath = `/${ownerTeam._humanReadableId}/${api ? api._humanReadableId : ''}/${versionId}`;

  return (
    <div className="container-fluid">
      {api ? (
        <Switch>
          <Route
            exact
            path={`${basePath}/labels`}
            component={() => (
              <TeamApiIssueTags value={api} onChange={onChange} currentLanguage={currentLanguage} />
            )}
          />
          <Route
            exact
            path={`${basePath}/issues/new`}
            component={() => (
              <NewIssue
                api={api}
                user={props.connectedUser}
                currentLanguage={currentLanguage}
                basePath={basePath}
                {...props}
              />
            )}
          />
          <Route
            exact
            path={`${basePath}/issues/:issueId`}
            component={() => (
              <ApiTimelineIssue
                issueId={issueId}
                team={ownerTeam}
                api={api}
                currentLanguage={currentLanguage}
                connectedUser={props.connectedUser}
                basePath={basePath}
                history={props.history}
              />
            )}
          />
          <Route
            exact
            path={`${basePath}/issues/`}
            render={() => (
              <>
                <ApiFilter
                  pathname={basePath}
                  tags={api.issuesTags}
                  handleFilter={(value) => setFilter(value)}
                  filter={filter}
                  connectedUser={props.connectedUser}
                  currentLanguage={currentLanguage}
                />
                <ApiIssues currentLanguage={currentLanguage} filter={filter} api={api} versionId={versionId} />
              </>
            )}
          />
        </Switch>
      ) : null}
    </div>
  );
}
