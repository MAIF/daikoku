import React, { useContext, useEffect, useState } from 'react';
import { Routes, useParams, Route, Navigate } from 'react-router-dom';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

// @ts-expect-error TS(6142): Module './ApiIssues' was resolved to '/Users/qaube... Remove this comment to see the full error message
import { ApiIssues } from './ApiIssues';
// @ts-expect-error TS(6142): Module './ApiTimelineIssue' was resolved to '/User... Remove this comment to see the full error message
import { ApiTimelineIssue } from './ApiTimelineIssue';
// @ts-expect-error TS(6142): Module './TeamApiIssueTags' was resolved to '/User... Remove this comment to see the full error message
import { TeamApiIssueTags } from './TeamApiIssueTags';
import * as Services from '../../../../services';
import { Can, manage, api as API } from '../../../utils';
import { I18nContext } from '../../../../core';

export function ApiIssue({
  ownerTeam,
  ...props
}: any) {
  const { issueId, versionId } = useParams();
  const [api, setRootApi] = useState();

  const [filter, setFilter] = useState('open');
  const [selectedVersion, setSelectedVersion] = useState({ value: 'all', label: 'All' });

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getRootApi(props.api._humanReadableId).then((rootApi) => {
      setRootApi(rootApi);
    });
  }, []);

  const onChange = (editedApi: any) => {
    Services.saveTeamApi(ownerTeam._id, editedApi, versionId)
      .then((res) => {
        props.onChange({
          ...props.api,
          issues: res.issues,
          issuesTags: res.issuesTags,
        });
        setRootApi(res);
      })
      .then(() => toastr.success(translateMethod('Api saved')));
  };

  const basePath = `/${ownerTeam._humanReadableId}/${api ? (api as any)._humanReadableId : ''}/${versionId}`;

  const showLabels = location.pathname.endsWith('labels');

  if (!api) return null;

  if (showLabels)
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="container-fluid">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Can I={manage} a={API} team={ownerTeam} orElse={<Navigate to="/" />}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <TeamApiIssueTags value={api} onChange={onChange} basePath={`${basePath}/issues`} />
        </Can>
      </div>
    );

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="container-fluid">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Routes>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Route
          path="/:issueId"
          element={
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ApiTimelineIssue
              issueId={issueId}
              team={ownerTeam}
              api={api}
              connectedUser={props.connectedUser}
              basePath={basePath}
              onChange={onChange}
            />
          }
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Route
          path="/"
          element={
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ApiIssues filter={filter} api={api} selectedVersion={selectedVersion} ownerTeam={ownerTeam} setSelectedVersion={setSelectedVersion} setFilter={setFilter}/>
          }
        />
      </Routes>
    </div>
  );
}
