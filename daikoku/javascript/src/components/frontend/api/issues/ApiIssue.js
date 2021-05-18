import React, { useState } from 'react';
import { Switch, useParams, Route } from 'react-router-dom';
import { ApiFilter } from './ApiFilter';
import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';
import { NewIssue } from './NewIssue';

export function ApiIssue({ api, currentLanguage, ownerTeam, ...props }) {
  const [filter, setFilter] = useState("all");

  const { issuesTags } = api;

  const { issueId } = useParams()
  const basePath = `/${ownerTeam._humanReadableId}/${api._humanReadableId}`

  return (
    <div className="container-fluid">
      <Switch>
        <Route exact path={`${basePath}/issues/new`} component={() =>
          <NewIssue
            api={api}
            user={props.connectedUser}
            currentLanguage={currentLanguage}
            basePath={basePath}
            {...props} />
        } />
        <Route exact path={`${basePath}/issues/:issueId`} component={() => <ApiTimelineIssue
          issueId={issueId}
          team={ownerTeam}
          api={api}
          currentLanguage={currentLanguage}
          connectedUser={props.connectedUser}
          basePath={basePath}
          history={props.history} />}
        />
        <Route exact path={`${basePath}/issues/`} render={() => <>
          <ApiFilter
            teamPath={`/${ownerTeam._humanReadableId}`}
            api={api}
            pathname={basePath}
            tags={issuesTags || []}
            handleFilter={value => setFilter(value)}
            filter={filter}
            connectedUser={props.connectedUser}
            currentLanguage={currentLanguage}
          />
          <ApiIssues
            currentLanguage={currentLanguage}
            filter={filter}
            api={api}
          />
        </>} />
      </Switch>
    </div>
  );
}
