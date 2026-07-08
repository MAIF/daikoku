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
import { deleteApi } from '../../utils/apiUtils';
import { Share, Trash2 } from "lucide-react";

export const TeamApis = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice()

  const { tenant } = useContext(GlobalContext);

  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate({ key: 'API', plural: true })}`;
  }, [currentTeam]);

  let table = useRef<TableRef>(undefined);

  const columnHelper = createColumnHelper<IApi>();

  const columns = (currentTeam: ITeamSimple) => [
    columnHelper.accessor(api => api.apis ? api.name : `${api.name} - (${api.currentVersion})`, {
      header: translate('Name'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => {
        const api = info.row.original;
        return (
          <div className="d-flex flex-row justify-content-between">
            <div className="d-flex gap-2 align-items-center">
              <span>{info.getValue()}</span>
              {api.apis && <div className="tag --primary --ghost">{translate('apis.list.apigroup.badge.label')}</div>}
            </div>
            <div className='d-flex gap-1'>

              {api.isDefault && <div className="badge --primary">{translate('apis.list.currentVersion.badge.label')}</div>}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("smallDescription", {
      header: translate('Description'),
      meta: { style: { textAlign: 'left' } }
    }),
    columnHelper.accessor('state', {
      header: translate('State'),
      meta: { style: { textAlign: 'center', width: '60px' } },
      cell: (info) => {
        const api = info.row.original
        const apiState = api.state
        return (
          <div className="d-flex gap-1 status">
            {(apiState === 'created') && (
              <span className="badge --inactive --state d-flex align-items-center gap-2" style={{ border: 'none' }}>
                <span>{translate('api.created')}</span>
              </span>
            )}
            {(apiState === 'published') && (
              <span className="badge --success --state d-flex align-items-center gap-2" style={{ border: 'none' }}>
                <span>{translate('api.published')}</span>
              </span>
            )}
            {apiState === 'deprecated' && (
              <span className="badge --warning --state d-flex align-items-center gap-2" style={{ border: 'none' }}>
                <span>{translate('api.deprecated')}</span>
              </span>
            )}
            {(apiState === 'blocked') && (
              <span className="badge --inactive --state d-flex align-items-center gap-2" style={{ border: 'none' }}>
                <span>{translate('api.blocked')}</span>
              </span>
            )}
            {!apiState && (
              <span className="badge --info --state d-flex align-items-center gap-2" style={{ border: 'none' }}>
                <span>{'Stateless'}</span>
              </span>
            )}
          </div>
        )
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
        return (
          <div className='d-flex justify-content-end gap-2'>
            <Link
              rel="noopener"
              to={viewUrl}
              className="btn --secondary --small --icon-only"
              title="View this Api"
            >
              <Share />
            </Link>
            <Can I={manage} a={API} team={currentTeam}>
              {api.visibility !== 'AdminOnly' && (
                <button
                  key={`delete-${api._humanReadableId}`}
                  type="button"
                  className="btn --secondary --small --icon-only"
                  title={translate("Delete this Api")}
                  onClick={() => getVersionsAndDeleteApi(api)}
                >
                  <Trash2 />
                </button>
              )}
            </Can>
          </div>
        );
      },
    }),
  ];

  const getVersionsAndDeleteApi = (api: IApi) => {
    const team = currentTeam as ITeamSimple

    Services.getAllApiVersions(team._id, api._id)
      .then(versions => deleteApi({
        api, versions, team, translate, openFormModal, handleSubmit: () => table.current?.update()
      }))
  }

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
