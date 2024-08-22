import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { I18nContext, ModalContext, useTeamBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, ITeamSimple, isError } from '../../../types';
import { Table, TableRef } from '../../inputs';
import { Can, Spinner, apikey, isUserIsTeamAdmin, manage, teamPermissions } from '../../utils';
import { toast } from 'sonner';

export const TeamApiKeys = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice()

  const { connectedUser } = useContext(GlobalContext);

  const tableRef = useRef<TableRef>();
  const [showApiKey, setShowApiKey] = useState(false);

  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  useEffect(() => {
    setShowApiKey(
      connectedUser.isDaikokuAdmin ||
      (currentTeam && !isError(currentTeam) && currentTeam.apiKeyVisibility !== teamPermissions.administrator) ||
      isUserIsTeamAdmin(connectedUser, currentTeam)
    );
  }, [connectedUser.isDaikokuAdmin, currentTeam]);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate('API key')}`;
  }, [currentTeam]);

  const columnHelper = createColumnHelper<IApi>();
  const columns = (currentTeam: ITeamSimple) => [
    columnHelper.accessor("name", {
      header: translate('Api Name'),
      meta: { style: { textAlign: 'left' } }
    }),
    columnHelper.accessor("currentVersion", {
      header: translate('Version'),
      meta: { style: { textAlign: 'left' } }
    }),
    columnHelper.display({
      header: translate('Actions'),
      meta: { style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const api = info.row.original;
        return (
          showApiKey && (
            <div style={{ minWidth: 100 }}>
              <Link
                to={`/${currentTeam._humanReadableId}/settings/apikeys/${api._humanReadableId}/${api.currentVersion}`}
                className="btn btn-sm btn-outline-primary"
              >
                <i className="fas fa-eye me-1" />
                <Translation i18nkey="Api key" plural={true}>Api keys</Translation>
              </Link>
            </div>
          )
        );
      },
    }),
  ];
  
  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <Can I={manage} a={apikey} team={currentTeam} dispatchError={true}>
        <div className="row">
          <div className="col">
            <h1>
              <Translation i18nkey="Subscribed Apis">Subscribed Apis</Translation>
            </h1>
            <Link
              to={`/${currentTeam._humanReadableId}/settings/consumption`}
              className="btn btn-sm btn-outline-primary mb-2"
            >
              <i className="fas fa-chart-bar me-1" />
              <Translation i18nkey="See Stats">See Stats</Translation>
            </Link>
            <div className="section p-2">
              <Table
                defaultSort="name"
                columns={columns(currentTeam)}
                fetchItems={() => Services.subscribedApis(currentTeam._id)}
                ref={tableRef}
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
