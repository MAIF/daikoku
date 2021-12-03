import React, { useContext, useEffect, useState } from 'react';
import { Routes, useParams, Route, Redirect } from 'react-router-dom';
import { ApiFilter } from './ApiFilter';
import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';
import { NewIssue } from './NewIssue';
import { TeamApiIssueTags } from './TeamApiIssueTags';
import * as Services from '../../../../services';
import { toastr } from 'react-redux-toastr';
import { Can, manage, api as API } from '../../../utils';
import { I18nContext } from '../../../../core';

export function ApiIssue({ ownerTeam, ...props }) {
  const { issueId, versionId, apiId } = useParams();
  const [api, setRootApi] = useState({});

  const [filter, setFilter] = useState('open');
  const [selectedVersion, setSelectedVersion] = useState({ value: 'all', label: 'All' });

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getRootApi(apiId).then((rootApi) => {
      setRootApi(rootApi);
    });
  }, []);

  function onChange(editedApi) {
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

  if (!api)
    return null


  return (
    <div className="container-fluid">
      <Routes>
        <Route
          path={`${basePath}/labels`}
          element={
            <Can
              I={manage}
              a={API}
              team={ownerTeam}
              orElse={<Redirect to={`${basePath}/issues`} />}>
              <TeamApiIssueTags value={api} onChange={onChange} />
            </Can>
          }
        />
        <Route
          path={`${basePath}/issues/new`}
          element={
            <NewIssue api={api} user={props.connectedUser} basePath={basePath} {...props} />
          }
        />
        <Route
          path={`${basePath}/issues/:issueId`}
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
          path={`${basePath}/issues`}
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
