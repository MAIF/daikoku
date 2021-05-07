import moment from 'moment';
import React, { useState, useEffect } from 'react';
import { Switch, useParams, Route, useLocation } from 'react-router-dom';
import { t } from '../../../../locales';
import * as Services from '../../../../services/index';
import { ApiFilter } from './ApiFilter';
import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';
import { NewIssue } from './NewIssue';

export function ApiIssue({ api, currentLanguage, ownerTeam, ...props }) {
  const [filter, setFilter] = useState("open");

  // const { issuesTags, issues } = api;
  console.log(api)
  const issuesTags = ["ux", "ui", "bug", "enhancement", "hotfix"]

  const { issueId } = useParams()

  const basePath = `/${ownerTeam._humanReadableId}/${api._humanReadableId}`

  console.log(basePath)

  const issues = [
    {
      seqId: 0,
      title: "Subscriptions must be cross API dut to otoroshi service groups usages",
      tags: ["bug", "enhancement", "global", "otoroshi"],
      status: "open",
      openedBy: { "_humanReadableId": "quentinfoobar" },
      createdDate: Date.now()
    },
    {
      seqId: 1,
      title: "Support mTLS for PG connection",
      tags: ["datastore", "enhancement", "security"],
      status: "open",
      openedBy: { "_humanReadableId": "mathieuancelin" },
      createdDate: Date.now()
    },
    {
      seqId: 10,
      title: "Tenant title so ugly",
      tags: ["bug", "priority"],
      status: "closed",
      openedBy: { "_humanReadableId": "mathieuancelin" },
      createdDate: moment(Date.now()).subtract('1', 'day'),
      closedDate: Date.now()
    },
  ]

  return (
    <div className="container-fluid">
      <Switch>
        <Route exact path={`${basePath}/issues/new`} component={() =>
          <NewIssue
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
          connectedUser={props.connectedUser} />} />
        <Route exact path={`${basePath}/issues/`} render={() => <>
          <ApiFilter
            pathname={basePath}
            tags={issuesTags || []}
            handleFilter={value => setFilter(value)}
            filter={filter}
          />
          <ApiIssues
            currentLanguage={currentLanguage}
            issues={issues || []}
            filter={filter}
          />
        </>} />
      </Switch>
    </div>
  );
}
