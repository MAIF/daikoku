import moment from 'moment';
import React, { useState, useEffect } from 'react';
import { Switch, useParams } from 'react-router-dom';
import { t } from '../../../../locales';
import * as Services from '../../../../services/index';
import { ApiFilter } from './ApiFilter';
import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';

export function ApiIssue({ api, currentLanguage, ownerTeam, ...props }) {
  const [filter, setFilter] = useState("open");

  // const { issuesTags, issues } = api;
  console.log(api)
  const issuesTags = ["ux", "ui", "bug", "enhancement", "hotfix"]

  const { issueId } = useParams()

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
      {issueId ? <ApiTimelineIssue issueId={issueId} currentLanguage={currentLanguage} /> :
        <>
          <ApiFilter
            tags={issuesTags || []}
            handleFilter={value => setFilter(value)}
            filter={filter}
          />
          <ApiIssues
            currentLanguage={currentLanguage}
            issues={issues || []}
            filter={filter}
          />
        </>}
    </div>
  );
}
