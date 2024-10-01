import React, { useContext, useEffect, useState } from 'react';
import { Routes, useParams, Route, Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiIssues } from './ApiIssues';
import { ApiTimelineIssue } from './ApiTimelineIssue';
import { TeamApiIssueTags } from './TeamApiIssueTags';
import * as Services from '../../../../services';
import { Can, manage, api as API } from '../../../utils';
import { I18nContext } from '../../../../contexts';
import { IApi, isError } from '../../../../types';

export function ApiIssue({
  ownerTeam,
  ...props
}: any) {
  const { issueId, versionId } = useParams();
  const [api, setRootApi] = useState<IApi>();

  const [filter, setFilter] = useState('open');
  const { translate } = useContext(I18nContext);
  
  const [selectedVersion, setSelectedVersion] = useState({ value: 'all version', label: `${translate('All version')}` });

  useEffect(() => {
    Services.getRootApi(props.api._humanReadableId)
      .then((rootApi) => {
        if (!isError(rootApi)) {
          setRootApi(rootApi)
        }
      });
  }, []);

  const onChange = (editedApi: any) => {
    Services.saveTeamApi(ownerTeam._id, editedApi, versionId!)
      .then((res) => {
        if (!isError(res)) {
          setRootApi(res)
        }
      })
      .then(() => toast.success(translate('Api saved')));
  };

  const basePath = `/${ownerTeam._humanReadableId}/${api ? (api as any)._humanReadableId : ''}/${versionId}`;

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
          path="/:issueId"
          element={
            <ApiTimelineIssue
              issueId={issueId!}
              team={ownerTeam}
              api={api}
              connectedUser={props.connectedUser}
              basePath={basePath}
              onChange={onChange}
            />
          }
        />
        <Route
          path="/"
          element={
            <ApiIssues filter={filter} api={api} selectedVersion={selectedVersion} ownerTeam={ownerTeam} setSelectedVersion={setSelectedVersion} setFilter={setFilter} />
          }
        />
      </Routes>
    </div>
  );
}
