import React, { useState, useEffect, useContext, useRef } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

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
import { Table, BooleanColumnFilter, SwitchButton, TableRef } from '../../inputs';
import { I18nContext, openSubMetadataModal } from '../../../core';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';

type TeamApiSubscriptionsProps = {
  api: any,
}
export const TeamApiSubscriptions = ({ api }: TeamApiSubscriptionsProps) => {
  const currentTeam = useSelector((s: any) => s.context.currentTeam);
  const dispatch = useDispatch();

  const [teams, setTeams] = useState<Array<any>>([]);
  const [columns, setColumns] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const tableRef = useRef<TableRef>()

  const { translate, language } = useContext(I18nContext);

  useEffect(() => {
    Services.teams().then((teams) => {
      setTeams(teams);
      setLoading(false);
    });

    document.title = `${currentTeam.name} - ${translate('Subscriptions')}`;
  }, []);

  useEffect(() => {
    if (api && tableRef.current && teams.length) {
      setColumns([
        {
          id: 'name',
          Header: translate('Name'),
          style: { textAlign: 'left' },
          accessor: (sub: any) => sub.team === currentTeam._id
            ? sub.customName || sub.apiKey.clientName
            : sub.apiKey.clientName,
          sortType: 'basic',
        },
        {
          Header: translate('Plan'),
          style: { textAlign: 'left' },
          accessor: (sub: any) => Option(api.possibleUsagePlans.find((pp: any) => pp._id === sub.plan))
            .map((p: any) => p.customName || formatPlanType(p, translate))
            .getOrNull(),
        },
        {
          Header: translate('Team'),
          style: { textAlign: 'left' },
          accessor: (sub: any) => Option(teams.find((t) => t._id === sub.team))
            .map((t: any) => t.name)
            .getOrElse('unknown team'),
        },
        {
          Header: translate('Enabled'),
          style: { textAlign: 'center' },
          accessor: (api: any) => api.enabled,
          disableSortBy: true,
          Filter: BooleanColumnFilter,
          filter: 'equals',
          // eslint-disable-next-line react/display-name
          Cell: ({ cell: { row: { original }, } }: any) => {
            const sub = original;
            return (
              <SwitchButton
                onSwitch={() => Services.archiveSubscriptionByOwner(currentTeam._id, sub._id, !sub.enabled)
                  .then(() => tableRef.current?.update())}
                checked={sub.enabled} />);
          },
        },
        {
          Header: translate('Created at'),
          style: { textAlign: 'left' },
          accessor: (sub: any) => formatDate(sub.createdAt, language),
        },
        {
          Header: translate('Actions'),
          style: { textAlign: 'center' },
          disableSortBy: true,
          disableFilters: true,
          accessor: (item: any) => item._id,
          // eslint-disable-next-line react/display-name
          Cell: ({ cell: { row: { original }, } }: any) => {
            const sub = original;
            return (<div className="btn-group">
              <BeautifulTitle title={translate('Update metadata')}>
                <button key={`edit-meta-${sub._humanReadableId}`} type="button" className="btn btn-sm btn-access-negative" onClick={() => updateMeta(sub)}>
                  <i className="fas fa-edit" />
                </button>
              </BeautifulTitle>
              <BeautifulTitle title={translate('Refresh secret')}>
                <button key={`edit-meta-${sub._humanReadableId}`} type="button" className="btn btn-sm btn-access-negative btn-danger" onClick={() => regenerateSecret(sub)}>
                  <i className="fas fa-sync" />
                </button>
              </BeautifulTitle>
            </div>);
          },
        },
      ]);
    }
  }, [tableRef.current]);

  const updateMeta = (sub: any) => dispatch(openSubMetadataModal({
    save: (updates: any) => {
      Services.updateSubscription(currentTeam, { ...sub, ...updates }).then(() => tableRef.current?.update());
    },
    api: sub.api,
    plan: sub.plan,
    team: teams.find((t) => t._id === sub.team),
    subscription: sub,
  }));

  const regenerateSecret = (sub: any) => {
    //@ts-ignore //FIXME when ts & monkey patch will be compatible ;)
    (window.confirm(translate('secret.refresh.confirm', false, 'Are you sure you want to refresh secret for this subscription ?'))).then((ok: any) => {
        if (ok) {
          Services.regenerateApiKeySecret(currentTeam._id, sub._id).then(() => {
            toastr.success(translate('Success'), translate('secret.refresh.success'));
            tableRef.current?.update();
          });
        }
      });
  };

  return (
    <Can I={manage} a={API} dispatchError={true} team={currentTeam}>
      {!loading && (
        <div className="row">
          <div className="col-12">
            <Table
              defaultSort="name"
              columns={columns}
              fetchItems={() =>
                Services.apiSubscriptions(api._id, currentTeam._id, api.currentVersion)
              }
              injectTable={(t: TableRef) => tableRef.current = t}
            />
          </div>
        </div>
      )}
    </Can>
  );
};
