import React, { useContext, useEffect, useState } from 'react';
import { Routes, useParams, Route, Navigate } from 'react-router-dom';
import { ApiFilter } from './ApiFilter';
import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';
import { NewIssue } from './NewIssue';
import { TeamApiIssueTags } from './TeamApiIssueTags';
import * as Services from '../../../../services';
import { toastr } from 'react-redux-toastr';
import { Can, manage, api as API } from '../../../utils';
import { I18nContext } from '../../../../core';
import { NavContext } from '../../../../contexts';

export function ApiIssue({ ownerTeam, ...props }) {
  const { issueId, versionId, apiId } = useParams();
  const [api, setRootApi] = useState();
  const params= useParams();

  const [filter, setFilter] = useState('open');
  const [selectedVersion, setSelectedVersion] = useState({ value: 'all', label: 'All' });
  const { addMenu } = useContext(NavContext);

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getRootApi(apiId)
      .then((rootApi) => {
        setRootApi(rootApi);
      });
  }, []);

  const onChange = (editedApi) => {
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
  }

  const basePath = `/${ownerTeam._humanReadableId}/${api ? api._humanReadableId : ''}/${versionId}`;

  const showLabels = location.pathname.endsWith('labels');

  if (!api) return null;

  if (showLabels)
    return (
      <div className="container-fluid">
        <Can I={manage} a={API} team={ownerTeam} orElse={<Navigate to="/" />}>
          <TeamApiIssueTags value={api} onChange={onChange} basePath={`${basePath}/issues`} />
        </Can>
      </div>
    );

  return (
    <div className="container-fluid">
      <Routes>
        <Route
          path={'/new'}
          element={<NewIssue api={api} basePath={`${basePath}/issues`} />}
        />
        <Route
          path="/:issueId"
          element={
            <ApiTimelineIssue
              issueId={issueId}
              team={ownerTeam}
              api={api}
              connectedUser={props.connectedUser}
              basePath={basePath}
            />
          }
        />
        <Route
          path="/"
          element={
            <>
              <ApiFilter
                pathname={basePath}
                tags={api.issuesTags}
                handleFilter={(value) => setFilter(value)}
                filter={filter}
                connectedUser={props.connectedUser}
                api={api}
                team={ownerTeam._id}
                ownerTeam={ownerTeam}
                selectedVersion={selectedVersion}
                setSelectedVersion={setSelectedVersion}
              />
              <ApiIssues filter={filter} api={api} selectedVersion={selectedVersion} />
            </>
          }
        />
      </Routes>
    </div>
  );
}
