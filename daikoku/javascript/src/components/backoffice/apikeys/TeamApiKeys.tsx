import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { toast } from 'sonner';
import {
  I18nContext,
  useTeamBackOffice
} from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, ITeamSimple, isError } from '../../../types';
import { clientFetchData, DynamicTable, DynamicTableFeatures, FilterDef } from '../../inputs';
import {
  Can,
  Spinner,
  access,
  apikey,
  isUserIsTeamAdmin,
  manage,
  read,
  teamPermissions,
} from '../../utils';
import {ExternalLink, KeyRound, BarChart} from "lucide-react";

export const TeamApiKeys = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();

  const { connectedUser } = useContext(GlobalContext);

  const [showApiKey, setShowApiKey] = useState(false);

  const { translate, Translation } = useContext(I18nContext);

  useEffect(() => {
    setShowApiKey(
      connectedUser.isDaikokuAdmin ||
      (currentTeam &&
        !isError(currentTeam) &&
        currentTeam.apiKeyVisibility !== teamPermissions.administrator) ||
      isUserIsTeamAdmin(connectedUser, currentTeam)
    );
  }, [connectedUser.isDaikokuAdmin, currentTeam]);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate('API key')}`;
  }, [currentTeam]);

  const filters: FilterDef[] = [
    { id: 'search', type: 'text', placeholder: translate('Search') },
  ];

  const columnHelper = createColumnHelper<DynamicTableFeatures, IApi>();
  const columns = (currentTeam: ITeamSimple) => [
    columnHelper.accessor('name', {
      meta: { title: translate('Api Name'), size: 30 },
    }),
    columnHelper.accessor('currentVersion', {
      meta: { title: translate('Version'), size: 10 },
    }),
    columnHelper.display({
      id: 'actions',
      meta: { title: translate('Actions'), size: 8, className: 'action-cell' },
      cell: (info) => {
        const api = info.row.original;
        return (
          showApiKey && (
            <>
              <div className='d-flex justify-content-end gap-2'>
                <Link
                  to={`/${currentTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/description`}
                  className="btn --secondary --small --icon-only"
                  title={translate("apikeys.view.api")}
                  aria-label={translate("apikeys.view.api")}
                >
                  <ExternalLink />
                </Link>
                <Link
                  to={`/${currentTeam._humanReadableId}/settings/apikeys/${api._humanReadableId}/${api.currentVersion}`}
                  className="btn --secondary --small --icon-only"
                  title={translate("apikeys.view.apikeys")}
                  aria-label={translate("apikeys.view.apikeys")}
                >
                  <KeyRound />
                </Link>
              </div>
            </>
          )
        );
      },
    }),
  ];

  if (isLoading) {
    return <Spinner />;
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <Can I={access} a={apikey} team={currentTeam} dispatchError={true}>
        <div className="row">
          <div className="col">
            <h1>
              <Translation i18nkey="Subscribed Apis">
                Subscribed Apis
              </Translation>
            </h1>
            <Link
              to={`/${currentTeam._humanReadableId}/settings/consumption`}
              className="btn --tertiary"
            >
              <BarChart className="me-1" />
              <Translation i18nkey="See Stats">See Stats</Translation>
            </Link>
            <div className="section p-2">
              <DynamicTable<IApi>
                queryKey={['subscribed-apis', currentTeam._id]}
                columns={columns(currentTeam)}
                fetchData={clientFetchData<IApi>(
                  () => Services.subscribedApis(currentTeam._id),
                  { searchable: (api) => [api.name, api.currentVersion] }
                )}
                filters={filters}
                defaultSorting={[{ id: 'name', desc: false }]}
                getRowId={row => row._id}
                getRowAriaLabel={row => row.name}
              />
            </div>
          </div>
        </div>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error);
    return <></>;
  }
};
