import React, { useContext, useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { Table } from '../../inputs';
import { Can, manage, apikey, isUserIsTeamAdmin } from '../../utils';
import { I18nContext } from '../../../core';

export function TeamApiKeysComponent(props) {
  const tableRef = useRef();
  const [showApiKey, setShowApiKey] = useState(false);

  const { translateMethod, Translation } = useContext(I18nContext);

  let table;

  useEffect(() => {
    setShowApiKey(
      props.connectedUser.isDaikokuAdmin ||
      !props.currentTeam.showApiKeyOnlyToAdmins ||
      isUserIsTeamAdmin(props.connectedUser, props.currentTeam)
    );
  }, [props.connectedUser.isDaikokuAdmin, props.currentTeam.showApiKeyOnlyToAdmins]);

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${translateMethod('API key')}`;
  }, []);

  const columns = [
    {
      Header: translateMethod('Api Name'),
      style: { textAlign: 'left' },
      accessor: (api) => api.name,
    },
    {
      Header: translateMethod('Version'),
      style: { textAlign: 'left' },
      accessor: (api) => api.currentVersion,
    },
    {
      Header: translateMethod('Actions'),
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item) => item._id,
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const api = original;
        return (
          showApiKey && (
            <div style={{ minWidth: 100 }}>
              <Link
                to={`/${props.currentTeam._humanReadableId}/settings/apikeys/${api._humanReadableId}/${api.currentVersion}`}
                className="btn btn-sm btn-access-negative"
              >
                <i className="fas fa-eye mr-1" />
                <Translation i18nkey="Api keys">Api keys</Translation>
              </Link>
            </div>
          )
        );
      },
    },
  ];

  const cleanSubs = () => {
    window
      .confirm(
        translateMethod(
          'clean.archived.sub.confirm',
          false,
          'Are you sure you want to clean archived subscriptions ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.cleanArchivedSubscriptions(props.currentTeam._id)
            .then(() => tableRef?.current?.update());
        }
      });
  };

  const params = useParams();

  return (
    <Can I={manage} a={apikey} team={props.currentTeam} dispatchError={true}>
      <div className="row">
        <div className="col">
          <h1>
            <Translation i18nkey="Subscribed Apis">Subscribed Apis</Translation>
          </h1>
          <Link
            to={`/${props.currentTeam._humanReadableId}/settings/consumption`}
            className="btn btn-sm btn-access-negative mb-2"
          >
            <i className="fas fa-chart-bar mr-1" />
            <Translation i18nkey="See Stats">See Stats</Translation>
          </Link>
          <div className="section p-2">
            <Table
              selfUrl="apikeys"
              defaultTitle="Apikeys"
              defaultValue={() => ({})}
              defaultSort="name"
              itemName="apikey"
              columns={columns}
              fetchItems={() => Services.subscribedApis(props.currentTeam._id)}
              showActions={false}
              showLink={false}
              extractKey={(item) => item._id}
              // injectTable={(t) => (table = t)}
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
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TeamApiKeys = connect(mapStateToProps)(TeamApiKeysComponent);
