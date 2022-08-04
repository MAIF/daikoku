import React, { useContext, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
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
                        <div className="d-flex flex-row justify-content-between">
                            <span>{api.name}</span>
                            <div className="iconized">G</div>
            </div>
          );
        }
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
                    <Can I={manage} a={API} team={currentTeam}>
                        <SwitchButton
              onSwitch={() => togglePublish(api)}
              checked={api.published}
              disabled={api.visibility === 'AdminOnly'}
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
                    <div className="btn-group">
                        <Link
              rel="noopener"
              to={viewUrl}
              className="btn btn-sm btn-access-negative"
              title="View this Api"
            >
                            <i className="fas fa-eye" />
            </Link>
                        <Can I={manage} a={API} team={currentTeam}>
                            <Link
                key={`edit-${api._humanReadableId}`}
                to={editUrl}
                className="btn btn-sm btn-access-negative"
                title="Edit this Api"
              >
                                <i className="fas fa-edit" />
              </Link>
              {api.visibility !== 'AdminOnly' && (
                                <button
                  key={`delete-${api._humanReadableId}`}
                  type="button"
                  className="btn btn-sm btn-access-negative"
                  title="Delete this Api"
                  onClick={() => deleteApi(api)}
                >
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
        ).then(() => table.current.update());
  };

  const deleteApi = (api: any) => {
    (window
    .confirm(translateMethod('delete.api.confirm', false, 'Are you sure you want to delete this api ?')) as any).then((ok: any) => {
    if (ok) {
        Services.deleteTeamApi(currentTeam._id, api._id).then(() => {
            toastr.success(translateMethod('delete.api.success', false, 'API deleted successfully', api.name));
                        table.current.update();
        });
    }
});
  };

  if (tenant.creationSecurity && !currentTeam.apisCreationPermission) {
    setError({ error: { status: 403, message: 'Creation security enabled' } })(dispatch);
  }
  return (
        <Can I={read} a={API} dispatchError={true} team={currentTeam}>
            <div className="row">
                <div className="col">
                    <div className="p-2">
                        <Table
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
