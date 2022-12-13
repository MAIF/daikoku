import React, { useContext, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

import * as Services from '../../../services';
import { Table, TableRef } from '../../inputs';
import { Can, manage, apikey, isUserIsTeamAdmin } from '../../utils';
import { I18nContext } from '../../../core';
import { ModalContext, useTeamBackOffice } from '../../../contexts';
import { createColumnHelper } from '@tanstack/react-table';
import { IApi } from '../../../types';

export const TeamApiKeys = () => {
  const { currentTeam, connectedUser } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);

  const tableRef = useRef<TableRef>();
  const [showApiKey, setShowApiKey] = useState(false);

  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  useEffect(() => {
    setShowApiKey(
      connectedUser.isDaikokuAdmin ||
      !currentTeam.showApiKeyOnlyToAdmins ||
      isUserIsTeamAdmin(connectedUser, currentTeam)
    );
  }, [connectedUser.isDaikokuAdmin, currentTeam.showApiKeyOnlyToAdmins]);

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate('API key')}`;
  }, []);

  const columnHelper = createColumnHelper<IApi>();
  const columns = [
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
                className="btn btn-sm btn-access-negative"
              >
                <i className="fas fa-eye me-1" />
                <Translation i18nkey="Api keys">Api keys</Translation>
              </Link>
            </div>
          )
        );
      },
    }),
  ];

  const cleanSubs = () => {
    confirm({ message: translate('clean.archived.sub.confirm') })
      .then((ok) => {
        if (ok) {
          Services.cleanArchivedSubscriptions(currentTeam._id)
            .then(() => tableRef.current?.update());
        }
      });
  }

  return (
    <Can I={manage} a={apikey} team={currentTeam} dispatchError={true}>
      <div className="row">
        <div className="col">
          <h1>
            <Translation i18nkey="Subscribed Apis">Subscribed Apis</Translation>
          </h1>
          <Link
            to={`/${currentTeam._humanReadableId}/settings/consumption`}
            className="btn btn-sm btn-access-negative mb-2"
          >
            <i className="fas fa-chart-bar me-1" />
            <Translation i18nkey="See Stats">See Stats</Translation>
          </Link>
          <div className="section p-2">
            <Table
              defaultSort="name"
              columns={columns}
              fetchItems={() => Services.subscribedApis(currentTeam._id)}
              ref={tableRef}
            />
            <button className="btn btn-sm btn-danger-negative mt-1" onClick={cleanSubs}>
              <Translation i18nkey="clean archived apikeys">clean archived apikeys</Translation>
            </button>
          </div>
        </div>
      </div>
    </Can>
  );
};
