import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext, useTeamBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, ITeamSimple, isError } from '../../../types';
import { Table, TableRef } from '../../inputs';
import { api as API, Can, Spinner, manage, read } from '../../utils';

export const TeamApis = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice()

  const { tenant } = useContext(GlobalContext);

  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate({ key: 'API', plural: true })}`;
  }, [currentTeam]);

  let table = useRef<TableRef>();

  const columnHelper = createColumnHelper<IApi>();

  const columns = (currentTeam: ITeamSimple) => [
    columnHelper.accessor(api => api.apis ? api.name : `${api.name} - (${api.currentVersion})`, {
      header: translate('Name'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => {
        const api = info.row.original;
        if (api.apis) {
          return (
            <div className="d-flex flex-row justify-content-between">
              <span>{info.getValue()}</span>
              <div className="badge badge-custom">API Group</div>
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
    columnHelper.accessor('state', {
      header: translate('State'),
      meta: { style: { textAlign: 'center', width: '60px' } },
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
              className="btn btn-sm btn-outline-info me-1"
              title="View this Api"
            >
              <i className="fas fa-eye" />
            </Link>
            <Can I={manage} a={API} team={currentTeam}>
              <Link
                key={`edit-${api._humanReadableId}`}
                to={editUrl}
                className="btn btn-sm btn-outline-info me-1"
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

  const deleteApi = (api: IApi) => {
    confirm({ message: translate('delete.api.confirm'), okLabel: translate('Yes') })
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi((currentTeam as ITeamSimple)._id, api._id)
            .then(() => {
              toast.success(translate({ key: 'delete.api.success', replacements: [api.name] }));
              table.current?.update();
            });
        }
      });
  };

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    if (tenant.creationSecurity && !currentTeam.apisCreationPermission) {
      toast.error(translate('Creation security enabled'))
      return null;
    }
    return (
      <Can I={read} a={API} dispatchError={true} team={currentTeam}>
        <div className="row">
          <div className="col">
            <div className="p-2">
              <Table
                columns={columns(currentTeam)}
                fetchItems={() => Services.teamApis(currentTeam._id)}
                ref={table}
              />
            </div>
          </div>
        </div>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>;
  }
};
