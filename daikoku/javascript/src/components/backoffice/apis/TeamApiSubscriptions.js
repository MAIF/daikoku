import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { useParams } from 'react-router-dom';

import {
  Can,
  manage,
  api as API,
  BeautifulTitle,
  formatPlanType,
  Option,
  formatDate,
} from '../../utils';
import * as Services from '../../../services';
import { Table, BooleanColumnFilter, SwitchButton } from '../../inputs';
import { I18nContext, openSubMetadataModal } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

const TeamApiSubscriptionsComponent = (props) => {
  const [api, setApi] = useState(undefined);
  const [teams, setTeams] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [table, setTable] = useState(undefined);

  const params = useParams();

  const { translateMethod, language, Translation } = useContext(I18nContext);

  useTeamBackOffice(props.currentTeam)

  useEffect(() => {
    Promise.all([
      Services.teamApi(props.currentTeam._id, params.apiId, params.versionId),
      Services.teams(),
    ]).then(([api, teams]) => {
      setApi(api);
      setTeams(teams);
      setLoading(false);
    });

    document.title = `${props.currentTeam.name} - ${translateMethod('Subscriptions')}`;
  }, []);

  useEffect(() => {
    if (api && table && teams.length) {
      setColumns([
        {
          id: 'name',
          Header: translateMethod('Name'),
          style: { textAlign: 'left' },
          accessor: (sub) =>
            sub.team === props.currentTeam._id
              ? sub.customName || sub.apiKey.clientName
              : sub.apiKey.clientName,
          sortType: 'basic',
        },
        {
          Header: translateMethod('Plan'),
          style: { textAlign: 'left' },
          accessor: (sub) =>
            Option(api.possibleUsagePlans.find((pp) => pp._id === sub.plan))
              .map((p) => p.customName || formatPlanType(p, translateMethod))
              .getOrNull(),
        },
        {
          Header: translateMethod('Team'),
          style: { textAlign: 'left' },
          accessor: (sub) =>
            Option(teams.find((t) => t._id === sub.team))
              .map((t) => t.name)
              .getOrElse('unknown team'),
        },
        {
          Header: translateMethod('Enabled'),
          style: { textAlign: 'center' },
          accessor: (api) => api.enabled,
          disableSortBy: true,
          Filter: BooleanColumnFilter,
          filter: 'equals',
          // eslint-disable-next-line react/display-name
          Cell: ({
            cell: {
              row: { original },
            },
          }) => {
            const sub = original;
            return (
              <SwitchButton
                onSwitch={() =>
                  Services.archiveSubscriptionByOwner(
                    props.currentTeam._id,
                    sub._id,
                    !sub.enabled
                  ).then(() => table.update())
                }
                checked={sub.enabled}
                large
                noText
              />
            );
          },
        },
        {
          Header: translateMethod('Created at'),
          style: { textAlign: 'left' },
          accessor: (sub) => formatDate(sub.createdAt, language),
        },
        {
          Header: translateMethod('Actions'),
          style: { textAlign: 'center' },
          disableSortBy: true,
          disableFilters: true,
          accessor: (item) => item._id,
          // eslint-disable-next-line react/display-name
          Cell: ({
            cell: {
              row: { original },
            },
          }) => {
            const sub = original;
            return (
              <div className="btn-group">
                <BeautifulTitle title={translateMethod('Update metadata')}>
                  <button
                    key={`edit-meta-${sub._humanReadableId}`}
                    type="button"
                    className="btn btn-sm btn-access-negative"
                    onClick={() => updateMeta(sub)}
                  >
                    <i className="fas fa-edit" />
                  </button>
                </BeautifulTitle>
                <BeautifulTitle title={translateMethod('Refresh secret')}>
                  <button
                    key={`edit-meta-${sub._humanReadableId}`}
                    type="button"
                    className="btn btn-sm btn-access-negative btn-danger"
                    onClick={() => regenerateSecret(sub)}
                  >
                    <i className="fas fa-sync" />
                  </button>
                </BeautifulTitle>
              </div>
            );
          },
        },
      ]);
    }
  }, [table]);

  const updateMeta = (sub) =>
    props.openSubMetadataModal({
      save: (updates) => {
        Services.updateSubscription(props.currentTeam, { ...sub, ...updates }).then(() =>
          table.update()
        );
      },
      api: sub.api,
      plan: sub.plan,
      team: teams.find((t) => t._id === sub.team),
      subscription: sub,
    });

  const regenerateSecret = (sub) => {
    window
      .confirm(
        translateMethod(
          'secret.refresh.confirm',
          false,
          'Are you sure you want to refresh secret for this subscription ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.regenerateApiKeySecret(props.currentTeam._id, sub._id).then(() => {
            toastr.success(
              translateMethod('secret.refresh.success', false, 'Secret is successfuly refreshed')
            );
            table.update();
          });
        }
      });
  };

  return (
    <Can I={manage} a={API} dispatchError={true} team={props.currentTeam}>
      {!loading && (
        <div className="row">
          <div className="col-12">
            <h1>
              <Translation i18nkey="Api subscriptions">Api subscriptions</Translation> - {api.name}
            </h1>
          </div>
          <div className="col-12">
            <Table
              selfUrl="apis"
              defaultTitle="Ai subscriptions"
              defaultValue={() => ({})}
              defaultSort="name"
              itemName="sub"
              columns={columns}
              fetchItems={() =>
                Services.apiSubscriptions(params.apiId, props.currentTeam._id, params.versionId)
              }
              showActions={false}
              showLink={false}
              extractKey={(item) => item._id}
              injectTable={(t) => setTable(t)}
            />
          </div>
        </div>
      )}
    </Can>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openSubMetadataModal: (modalProps) => openSubMetadataModal(modalProps),
};

export const TeamApiSubscriptions = connect(
  mapStateToProps,
  mapDispatchToProps
)(TeamApiSubscriptionsComponent);
