import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import { TeamBackOffice } from '../TeamBackOffice';
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
import { Translation, t } from '../../../locales';
import { Table, BooleanColumnFilter, SwitchButton } from '../../inputs';
import { openSubMetadataModal } from '../../../core';

const TeamApiSubscriptionsComponent = (props) => {
  const [api, setApi] = useState(undefined);
  const [teams, setTeams] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [table, setTable] = useState(undefined);

  useEffect(() => {
    Promise.all([
      Services.teamApi(props.currentTeam._id, props.match.params.apiId),
      Services.teams(),
    ]).then(([api, teams]) => {
      setApi(api);
      setTeams(teams);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (api && table && teams.length) {
      setColumns([
        {
          id: 'name',
          Header: t('Name', props.currentLanguage),
          style: { textAlign: 'left' },
          accessor: (sub) =>
            sub.team === props.currentTeam._id
              ? sub.customName || sub.apiKey.clientName
              : sub.apiKey.clientName,
          sortType: 'basic',
        },
        {
          Header: t('Plan', props.currentLanguage),
          style: { textAlign: 'left' },
          accessor: (sub) =>
            Option(api.possibleUsagePlans.find((pp) => pp._id === sub.plan))
              .map((p) => p.customName || formatPlanType(p, props.currentLanguage))
              .getOrNull(),
        },
        {
          Header: t('Team', props.currentLanguage),
          style: { textAlign: 'left' },
          accessor: (sub) =>
            Option(teams.find((t) => t._id === sub.team))
              .map((t) => t.name)
              .getOrElse('unknown team'),
        },
        {
          Header: t('Enabled', props.currentLanguage),
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
          Header: t('Created at', props.currentLanguage),
          style: { textAlign: 'left' },
          accessor: (sub) => formatDate(sub.createdAt, props.currentLanguage),
        },
        {
          Header: t('Actions', props.currentLanguage),
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
                <BeautifulTitle title={t('Update metadata', props.currentLanguage)}>
                  <button
                    key={`edit-meta-${sub._humanReadableId}`}
                    type="button"
                    className="btn btn-sm btn-access-negative"
                    onClick={() => updateMeta(sub)}>
                    <i className="fas fa-edit" />
                  </button>
                </BeautifulTitle>
                <BeautifulTitle title={t('Refresh secret', props.currentLanguage)}>
                  <button
                    key={`edit-meta-${sub._humanReadableId}`}
                    type="button"
                    className="btn btn-sm btn-access-negative btn-danger"
                    onClick={() => regenerateSecret(sub)}>
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
      currentLanguage: props.currentLanguage,
    });

  const regenerateSecret = (sub) => {
    window
      .confirm(
        t(
          'secret.refresh.confirm',
          props.currentLanguage,
          false,
          'Are you sure you want to refresh secret for this subscription ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.regenerateApiKeySecret(props.currentTeam._id, sub._id).then(() => {
            toastr.success(
              t(
                'secret.refresh.success',
                props.currentLanguage,
                false,
                'Secret is successfuly refreshed'
              )
            );
            table.update();
          });
        }
      });
  };

  return (
    <TeamBackOffice
      tab="Apis"
      apiId={props.match.params.apiId}
      isLoading={loading}
      title={`${props.currentTeam.name} - ${t('Subscriptions', this.props.currentLanguage)}`}>
      <Can I={manage} a={API} dispatchError={true} team={props.currentTeam}>
        {!loading && (
          <div className="row">
            <div className="col-12">
              <h1>
                <Translation i18nkey="Api subscriptions" language={props.currentLanguage}>
                  Api subscriptions
                </Translation>{' '}
                - {api.name}
              </h1>
            </div>
            <div className="col-12">
              <Table
                currentLanguage={props.currentLanguage}
                selfUrl="apis"
                defaultTitle="Ai subscriptions"
                defaultValue={() => ({})}
                defaultSort="name"
                itemName="sub"
                columns={columns}
                fetchItems={() =>
                  Services.apiSubscriptions(props.match.params.apiId, props.currentTeam._id)
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
    </TeamBackOffice>
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
