import React, { useContext, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { Can, read, manage, api as API } from '../../utils';
import { SwitchButton, Table, BooleanColumnFilter, TableRef } from '../../inputs';
import { I18nContext, setError } from '../../../core';
import { ModalContext, useTeamBackOffice } from '../../../contexts';
import { IApi, IState, IStateContext } from '../../../types';
import { createColumnHelper } from '@tanstack/react-table';

export const TeamApis = () => {
  const { currentTeam, tenant } = useSelector<IState, IStateContext>((state) => state.context);
  const dispatch = useDispatch();
  useTeamBackOffice(currentTeam);

  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate({ key: 'API', plural: true })}`;
  }, []);

  let table = useRef<TableRef>();

  const columnHelper = createColumnHelper<IApi>();

  const columns = [
    columnHelper.accessor(api => api.apis ? api.name : `${api.name} - (${api.currentVersion})`, {
      header: translate('Name'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => {
        const api = info.row.original;
        if (api.apis) {
          return (
            <div className="d-flex flex-row justify-content-between">
              <span>{info.getValue()}</span>
              <div className="badge iconized">API Group</div>
            </div>
          );
        }
        return <div>{info.getValue()}</div>;
      },
    }),
    columnHelper.accessor("smallDescription", {
      header: translate('Description'),
      meta: { style: { textAlign: 'left' } }
    }),
    columnHelper.accessor('published', {
      header: translate('Published'),
      meta: { style: { textAlign: 'center', width: '60px' } },
      enableColumnFilter: false,
      cell: (info) => {
        const api = info.row.original;
        return (
          <Can I={manage} a={API} team={currentTeam}>
            <SwitchButton
              onSwitch={() => togglePublish(api)}
              checked={api.published}
              disabled={api.visibility === 'AdminOnly'}
            />
          </Can>
        );
      },
    }),
    columnHelper.display({
      header: translate('Actions'),
      meta: { style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const api = info.row.original;
        const viewUrl = api.apis
          ? `/${currentTeam._humanReadableId}/apigroups/${api._humanReadableId}/apis`
          : `/${currentTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/description`;
        const editUrl = api.apis
          ? `/${currentTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/infos`
          : `/${currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`;
        return (
          <div>
            <Link
              rel="noopener"
              to={viewUrl}
              className="btn btn-sm btn-outline-primary me-1"
              title="View this Api"
            >
              <i className="fas fa-eye" />
            </Link>
            <Can I={manage} a={API} team={currentTeam}>
              <Link
                key={`edit-${api._humanReadableId}`}
                to={editUrl}
                className="btn btn-sm btn-outline-primary me-1"
                title="Edit this Api"
              >
                <i className="fas fa-pen" />
              </Link>
              {api.visibility !== 'AdminOnly' && (
                <button
                  key={`delete-${api._humanReadableId}`}
                  type="button"
                  className="btn btn-sm btn-outline-danger"
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
    }),
  ];

  const togglePublish = (api: IApi) => {
    Services.saveTeamApi(
      currentTeam._id,
      {
        ...api,
        published: !api.published,
      },
      api.currentVersion
    ).then(() => table.current?.update());
  };

  const deleteApi = (api: IApi) => {
    confirm({ message: translate('delete.api.confirm'), okLabel: translate('Yes') })
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi(currentTeam._id, api._id)
            .then(() => {
              toastr.success(translate('Success'), translate({ key: 'delete.api.success', replacements: [api.name] }));
              table.current?.update();
            });
        }
      });
  };

  if (tenant.creationSecurity && !currentTeam.apisCreationPermission) {
    dispatch(setError({ error: { status: 403, message: 'Creation security enabled' } }));
  }
  return (
    <Can I={read} a={API} dispatchError={true} team={currentTeam}>
      <div className="row">
        <div className="col">
          <div className="p-2">
            <Table
              columns={columns}
              fetchItems={() => Services.teamApis(currentTeam._id)}
              ref={table}
            />
          </div>
        </div>
      </div>
    </Can>
  );
};
