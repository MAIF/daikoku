import moment from 'moment';
import React, { useState, useEffect } from 'react';
import { Switch, useParams, Route, useLocation } from 'react-router-dom';
import { t } from '../../../../locales';
import { ApiFilter } from './ApiFilter';
import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';
import { NewIssue } from './NewIssue';

export function ApiIssue({ api, currentLanguage, ownerTeam, ...props }) {
  const [filter, setFilter] = useState("all");

  const { issuesTags } = api;

  const { issueId } = useParams()
  const basePath = `/${ownerTeam._humanReadableId}/${api._humanReadableId}`

  console.log(api)

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
