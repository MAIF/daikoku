import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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

const TeamApiSubscriptionsComponent = ({
  api,
  ...props
}: any) => {
  const [teams, setTeams] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [table, setTable] = useState(undefined);

  const params = useParams();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, language, Translation } = useContext(I18nContext);

  useEffect(() => {
    Services.teams().then((teams) => {
      setTeams(teams);
      setLoading(false);
    });

    document.title = `${props.currentTeam.name} - ${translateMethod('Subscriptions')}`;
  }, []);

  useEffect(() => {
    if (api && table && teams.length) {
      setColumns([
    {
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        id: 'name',
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        Header: translateMethod('Name'),
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        style: { textAlign: 'left' },
        // @ts-expect-error TS(2322): Type '(sub: any) => any' is not assignable to type... Remove this comment to see the full error message
        accessor: (sub: any) => sub.team === props.currentTeam._id
            ? sub.customName || sub.apiKey.clientName
            : sub.apiKey.clientName,
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        sortType: 'basic',
    },
    {
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        Header: translateMethod('Plan'),
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        style: { textAlign: 'left' },
        // @ts-expect-error TS(2322): Type '(sub: any) => any' is not assignable to type... Remove this comment to see the full error message
        accessor: (sub: any) => Option(api.possibleUsagePlans.find((pp: any) => pp._id === sub.plan))
            .map((p: any) => p.customName || formatPlanType(p, translateMethod))
            .getOrNull(),
    },
    {
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        Header: translateMethod('Team'),
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        style: { textAlign: 'left' },
        // @ts-expect-error TS(2322): Type '(sub: any) => any' is not assignable to type... Remove this comment to see the full error message
        accessor: (sub: any) => Option(teams.find((t) => (t as any)._id === sub.team))
            .map((t: any) => t.name)
            .getOrElse('unknown team'),
    },
    {
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        Header: translateMethod('Enabled'),
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        style: { textAlign: 'center' },
        // @ts-expect-error TS(2322): Type '(api: any) => any' is not assignable to type... Remove this comment to see the full error message
        accessor: (api: any) => api.enabled,
        // @ts-expect-error TS(2322): Type 'boolean' is not assignable to type 'never'.
        disableSortBy: true,
        // @ts-expect-error TS(2322): Type '({ column: { filterValue, setFilter } }: any... Remove this comment to see the full error message
        Filter: BooleanColumnFilter,
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        filter: 'equals',
        // @ts-expect-error TS(2322): Type '({ cell: { row: { original }, } }: any) => J... Remove this comment to see the full error message
        // eslint-disable-next-line react/display-name
        Cell: ({ cell: { row: { original }, } }: any) => {
            const sub = original;
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<SwitchButton onSwitch={() => Services.archiveSubscriptionByOwner(props.currentTeam._id, sub._id, !sub.enabled).then(() => table.update())} checked={sub.enabled} large noText/>);
        },
    },
    {
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        Header: translateMethod('Created at'),
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        style: { textAlign: 'left' },
        // @ts-expect-error TS(2322): Type '(sub: any) => string' is not assignable to t... Remove this comment to see the full error message
        accessor: (sub: any) => formatDate(sub.createdAt, language),
    },
    {
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        Header: translateMethod('Actions'),
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
        style: { textAlign: 'center' },
        // @ts-expect-error TS(2322): Type 'boolean' is not assignable to type 'never'.
        disableSortBy: true,
        // @ts-expect-error TS(2322): Type 'boolean' is not assignable to type 'never'.
        disableFilters: true,
        // @ts-expect-error TS(2322): Type '(item: any) => any' is not assignable to typ... Remove this comment to see the full error message
        accessor: (item: any) => item._id,
        // @ts-expect-error TS(2322): Type '({ cell: { row: { original }, } }: any) => J... Remove this comment to see the full error message
        // eslint-disable-next-line react/display-name
        Cell: ({ cell: { row: { original }, } }: any) => {
            const sub = original;
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<div className="btn-group">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <BeautifulTitle title={translateMethod('Update metadata')}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button key={`edit-meta-${sub._humanReadableId}`} type="button" className="btn btn-sm btn-access-negative" onClick={() => updateMeta(sub)}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-edit"/>
                  </button>
                </BeautifulTitle>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <BeautifulTitle title={translateMethod('Refresh secret')}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button key={`edit-meta-${sub._humanReadableId}`} type="button" className="btn btn-sm btn-access-negative btn-danger" onClick={() => regenerateSecret(sub)}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-sync"/>
                  </button>
                </BeautifulTitle>
              </div>);
        },
    },
]);
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<SwitchButton onSwitch={() => Services.archiveSubscriptionByOwner(props.currentTeam._id, sub._id, !sub.enabled).then(() => (table as any).update())} checked={sub.enabled} large noText/>);
          },
        },
        {
          Header: translateMethod('Created at'),
          style: { textAlign: 'left' },
          accessor: (sub: any) => formatDate(sub.createdAt, language),
        },
        // @ts-expect-error TS(2554): Expected 1-2 arguments, but got 3.
        {
          Header: translateMethod('Actions'),
          style: { textAlign: 'center' },
          disableSortBy: true,
          disableFilters: true,
          accessor: (item: any) => item._id,
          // eslint-disable-next-line react/display-name
          Cell: ({
            cell: {
              row: { original },
            }
          }: any) => {
            const sub = original;
            return (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div className="btn-group">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <BeautifulTitle title={translateMethod('Update metadata')}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button
                    key={`edit-meta-${sub._humanReadableId}`}
                    type="button"
                    className="btn btn-sm btn-access-negative"
                    onClick={() => updateMeta(sub)}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-edit" />
                  </button>
                </BeautifulTitle>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <BeautifulTitle title={translateMethod('Refresh secret')}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button
                    key={`edit-meta-${sub._humanReadableId}`}
                    type="button"
                    className="btn btn-sm btn-access-negative btn-danger"
                    onClick={() => regenerateSecret(sub)}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-sync" />
                  </button>
                </BeautifulTitle>
              </div>
            );
          },
        },
      ]);
    }
  // @ts-expect-error TS(2552): Cannot find name 'table'. Did you mean 'Table'?
  }, [table]);

  // @ts-expect-error TS(2304): Cannot find name 'props'.
  const updateMeta = (sub: any) => props.openSubMetadataModal({
    save: (updates: any) => {
        // @ts-expect-error TS(2304): Cannot find name 'props'.
        Services.updateSubscription(props.currentTeam, { ...sub, ...updates }).then(() => table.update());
    },
    api: sub.api,
    plan: sub.plan,
    // @ts-expect-error TS(2304): Cannot find name 'teams'.
    team: teams.find((t) => (t as any)._id === sub.team),
    subscription: sub,
});

  const regenerateSecret = (sub: any) => {
    (window
    // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
    .confirm(translateMethod('secret.refresh.confirm', false, 'Are you sure you want to refresh secret for this subscription ?')) as any).then((ok: any) => {
    if (ok) {
        // @ts-expect-error TS(2304): Cannot find name 'props'.
        Services.regenerateApiKeySecret(props.currentTeam._id, sub._id).then(() => {
            // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
            toastr.success(translateMethod('secret.refresh.success', false, 'Secret is successfuly refreshed'));
            // @ts-expect-error TS(2552): Cannot find name 'table'. Did you mean 'Table'?
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
            <Table
              selfUrl="apis"
              defaultTitle="Ai subscriptions"
              defaultValue={() => ({})}
              defaultSort="name"
              itemName="sub"
              columns={columns}
              fetchItems={() =>
                Services.apiSubscriptions(api._id, props.currentTeam._id, api.currentVersion)
              }
              showActions={false}
              showLink={false}
              extractKey={(item: any) => item._id}
              injectTable={(t: any) => setTable(t)}
            />
          </div>
        </div>
      )}
    </Can>
  );
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  openSubMetadataModal: (modalProps: any) => openSubMetadataModal(modalProps),
};

export const TeamApiSubscriptions = connect(
  mapStateToProps,
  mapDispatchToProps
// @ts-expect-error TS(2345): Argument of type '({ api, ...props }: any) => void... Remove this comment to see the full error message
)(TeamApiSubscriptionsComponent);
