import React, { useContext, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { Can, read, manage, api as API } from '../../utils';
import { SwitchButton, Table, BooleanColumnFilter } from '../../inputs';
import { I18nContext, setError } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

export const TeamApis = () => {
  const { currentTeam, tenant } = useSelector((state) => (state as any).context);
  const dispatch = useDispatch();
  useTeamBackOffice(currentTeam);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translateMethod('API', true)}`;
  }, []);

  let table = useRef();

  const columns = [
    {
      id: 'name',
      Header: translateMethod('Name'),
      style: { textAlign: 'left' },
      accessor: (api: any) => api.apis ? api.name : `${api.name} - (${api.currentVersion})`,
      sortType: 'basic',
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const api = original;
        if (api.apis) {
          return (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="d-flex flex-row justify-content-between">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span>{api.name}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="iconized">G</div>
            </div>
          );
        }
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return <div>{`${api.name} - (${api.currentVersion})`}</div>;
      },
    },
    {
      Header: translateMethod('Description'),
      style: { textAlign: 'left' },
      accessor: (api: any) => api.smallDescription,
    },
    {
      Header: translateMethod('Published'),
      style: { textAlign: 'center' },
      accessor: (api: any) => api.published,
      disableSortBy: true,
      Filter: BooleanColumnFilter,
      filter: 'equals',
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const api = original;
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Can I={manage} a={API} team={currentTeam}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <SwitchButton
              onSwitch={() => togglePublish(api)}
              checked={api.published}
              disabled={api.visibility === 'AdminOnly'}
              // @ts-expect-error TS(2322): Type '{ onSwitch: () => void; checked: any; disabl... Remove this comment to see the full error message
              large
              noText
            />
          </Can>
        );
      },
    },
    {
      Header: translateMethod('Actions'),
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item: any) => item._id,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const api = original;
        const viewUrl = api.apis
          ? `/${currentTeam._humanReadableId}/apigroups/${api._humanReadableId}/apis`
          : `/${currentTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/description`;
        const editUrl = api.apis
          ? `/${currentTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/infos`
          : `/${currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`;
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="btn-group">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link
              rel="noopener"
              to={viewUrl}
              className="btn btn-sm btn-access-negative"
              title="View this Api"
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-eye" />
            </Link>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Can I={manage} a={API} team={currentTeam}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Link
                key={`edit-${api._humanReadableId}`}
                to={editUrl}
                className="btn btn-sm btn-access-negative"
                title="Edit this Api"
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-edit" />
              </Link>
              {api.visibility !== 'AdminOnly' && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <button
                  key={`delete-${api._humanReadableId}`}
                  type="button"
                  className="btn btn-sm btn-access-negative"
                  title="Delete this Api"
                  onClick={() => deleteApi(api)}
                >
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <i className="fas fa-trash" />
                </button>
              )}
            </Can>
          </div>
        );
      },
    },
  ];

  const togglePublish = (api: any) => {
    Services.saveTeamApi(
      currentTeam._id,
      {
        ...api,
        published: !api.published,
      },
      api.currentVersion
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    ).then(() => table.current.update());
  };

  const deleteApi = (api: any) => {
    (window
    .confirm(translateMethod('delete.api.confirm', false, 'Are you sure you want to delete this api ?')) as any).then((ok: any) => {
    if (ok) {
        Services.deleteTeamApi(currentTeam._id, api._id).then(() => {
            toastr.success(translateMethod('delete.api.success', false, 'API deleted successfully', api.name));
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            table.current.update();
        });
    }
});
  };

  if (tenant.creationSecurity && !currentTeam.apisCreationPermission) {
    setError({ error: { status: 403, message: 'Creation security enabled' } })(dispatch);
  }
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={read} a={API} dispatchError={true} team={currentTeam}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="p-2">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Table
              // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
              selfUrl="apis"
              defaultTitle="Team Apis"
              defaultValue={() => ({})}
              defaultSort="name"
              itemName="api"
              columns={columns}
              fetchItems={() => Services.teamApis(currentTeam._id)}
              showActions={false}
              showLink={false}
              extractKey={(item: any) => item._id}
              injectTable={(t: any) => table.current = t}
            />
          </div>
        </div>
      </div>
    </Can>
  );
};
