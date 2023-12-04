import { getApolloContext } from "@apollo/client";
import { format, type } from "@maif/react-forms";
import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import { ModalContext } from '../../../contexts';
import { CustomSubscriptionData } from '../../../contexts/modals/SubscriptionMetadataModal';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { IApi, IState, ISubscriptionWithApiInfo, ITeamSimple, IUsagePlan, isError } from "../../../types";
import { SwitchButton, Table, TableRef } from '../../inputs';
import {
  api as API,
  BeautifulTitle,
  Can,
  Option,
  Spinner,
  formatDate,
  formatPlanType,
  manage,
  queryClient,
} from '../../utils';
import { useQuery } from "@tanstack/react-query";

type TeamApiSubscriptionsProps = {
  api: IApi,
}
type SubscriptionsFilter = {
  metadata: Array<{ key: string, value: string }>,
  tags: Array<string>,
  clientIds: Array<string>
}
type LimitedPlan = {
  _id: string
  customName?: string
  type: string

}
interface IApiSubscriptionGql {
  _id: string
  apiKey: {
    clientName: string
    clientId: string
    clientSecret: string
  }
  plan: LimitedPlan
  team: {
    _id: string
    name: string
    type: string
  }
  createdAt: string
  api: {
    _id: string
  }
  customName: string
  enabled: boolean
  customMetadata?: JSON
  adminCustomName?: string
  customMaxPerSecond?: number
  customMaxPerDay?: number
  customMaxPerMonth?: number
  tags: Array<string>
  metadata?: JSON
  parent: {
    _id: string
    adminCustomName: string
    api: {
      _id: string
      name: string
    }
    plan: {
      _id: string
      customName: string
      type: string
    }
  }
}

interface IApiSubscriptionGqlWithUsage extends IApiSubscriptionGql {
  lastUsage?: number
}

export const TeamApiSubscriptions = ({ api }: TeamApiSubscriptionsProps) => {
  const currentTeam = useSelector<IState, ITeamSimple>((s) => s.context.currentTeam);

  const { client } = useContext(getApolloContext());

  const [filters, setFilters] = useState<SubscriptionsFilter>()
  const tableRef = useRef<TableRef>()

  const { translate, language, Translation } = useContext(I18nContext);
  const { confirm, openFormModal, openSubMetadataModal, } = useContext(ModalContext);

  const plansQuery = useQuery(['plans'], () => Services.getAllPlanOfApi(api.team, api._id, api.currentVersion))
  const subscriptionsQuery = useQuery(['subscriptions'], () => client!.query<{ apiApiSubscriptions: Array<IApiSubscriptionGql>; }>({
    query: Services.graphql.getApiSubscriptions,
    fetchPolicy: "no-cache",
    variables: {
      apiId: api._id,
      teamId: currentTeam._id,
      version: api.currentVersion
    }
  })
    .then(({ data: { apiApiSubscriptions } }) => {
      if (!filters || (!filters.tags.length && !Object.keys(filters.metadata).length && !filters.clientIds.length)) {
        return apiApiSubscriptions
      } else {
        const filterByMetadata = (subscription: IApiSubscriptionGql) => {
          const meta = { ...(subscription.metadata || {}), ...(subscription.customMetadata || {}) };

          return !Object.keys(meta) || (!filters.metadata.length || filters.metadata.every(item => {
            const value = meta[item.key]
            return value && value.includes(item.value)
          }))
        }

        const filterByTags = (subscription: IApiSubscriptionGql) => {
          return filters.tags.every(tag => subscription.tags.includes(tag))
        }

        const filterByClientIds = (subscription: IApiSubscriptionGql) => {
          return filters.clientIds.includes(subscription.apiKey.clientId)
        }


        return apiApiSubscriptions
          .filter(filterByMetadata)
          .filter(filterByTags)
          .filter(filterByClientIds)
      }
    })
    .then((apiApiSubscriptions) => Services.getSubscriptionsLastUsages(api.team, subscriptionsQuery.data?.map(s => s._id) || [])
      .then(lastUsages => {
        if (isError(lastUsages)) {
          return subscriptionsQuery.data as IApiSubscriptionGqlWithUsage[]
        } else {
          const value = (apiApiSubscriptions ?? [])
            .map(s => ({ ...s, lastUsage: lastUsages.find(u => u.subscription === s._id)?.date } as IApiSubscriptionGqlWithUsage))
          console.debug({ value })
          return value;
        }
      }))
  )

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate('Subscriptions')}`;
  }, []);

  useEffect(() => {
    if (api && subscriptionsQuery.data) {
      tableRef.current?.update()
    }
  }, [api, subscriptionsQuery.data])

  useEffect(() => {
    tableRef.current?.update()
  }, [filters])

  const columnHelper = createColumnHelper<IApiSubscriptionGqlWithUsage>()
  const columns = (usagePlans) => [
    columnHelper.accessor(row => row.adminCustomName || row.apiKey.clientName, {
      id: 'adminCustomName',
      header: translate('Name'),
      meta: { style: { textAlign: 'left' } },
      filterFn: (row, _, value) => {
        const sub = row.original
        const displayed: string = sub.team._id === currentTeam._id ? sub.customName || sub.apiKey.clientName : sub.apiKey.clientName

        return displayed.toLocaleLowerCase().includes(value.toLocaleLowerCase())
      },
      sortingFn: 'basic',
      cell: (info) => {
        const sub = info.row.original;
        if (sub.parent) {
          const title = `<div>
            <strong>${translate('aggregated.apikey.badge.title')}</strong>
            <ul>
              <li>${translate('Api')}: ${sub.parent.api.name}</li>
              <li>${translate('Plan')}: ${sub.parent.plan.customName}</li>
              <li>${translate('aggregated.apikey.badge.apikey.name')}: ${sub.parent.adminCustomName}</li>
            </ul>
          </div>`
          return (
            <div className="d-flex flex-row justify-content-between">
              <span>{info.getValue()}</span>
              <BeautifulTitle title={title} html>

                <div className="badge iconized">A</div>
              </BeautifulTitle>
            </div>
          );
        }
        return <div>{info.getValue()}</div>;
      }
    }),
    columnHelper.accessor('plan', {
      header: translate('Plan'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => Option(usagePlans.find((pp) => pp._id === info.getValue()._id))
        .map((p: IUsagePlan) => p.customName || formatPlanType(p, translate))
        .getOrNull(),
      filterFn: (row, columnId, value) => {
        const displayed: string = Option(usagePlans.find((pp) => pp._id === row.original.plan._id))
          .map((p: IUsagePlan) => p.customName || formatPlanType(p, translate))
          .getOrElse("")

        return displayed.toLocaleLowerCase().includes(value.toLocaleLowerCase())
      }
    }),
    columnHelper.accessor('team', {
      header: translate('Team'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => info.getValue().name,
      filterFn: (row, columnId, value) => {
        const displayed: string = row.original.team.name

        return displayed.toLocaleLowerCase().includes(value.toLocaleLowerCase())
      }
    }),
    columnHelper.accessor('enabled', {
      header: translate('Enabled'),
      enableColumnFilter: false,
      enableSorting: false,
      meta: { style: { textAlign: 'center' } },
      cell: (info) => {
        const sub = info.row.original;
        return (
          <SwitchButton
            onSwitch={() => Services.archiveSubscriptionByOwner(currentTeam._id, sub._id, !sub.enabled)
              .then(() => tableRef.current?.update())}
            checked={sub.enabled} />);
      },
    }),
    columnHelper.accessor('createdAt', {
      enableColumnFilter: false,
      header: translate('Created at'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => {
        const date = info.getValue()
        if (!!date) {
          return formatDate(date, language)
        }
        return translate('N/A')
      },
    }),
    columnHelper.accessor('lastUsage', {
      enableColumnFilter: false,
      header: translate('apisubscription.lastUsage.label'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => {
        const date = info.getValue()
        if (!!date) {
          return formatDate(date, language)
        }
        return translate('N/A')
      },
    }),
    columnHelper.display({
      header: translate('Actions'),
      meta: { style: { textAlign: 'center', width: '120px' } },
      cell: (info) => {
        const sub = info.row.original;
        return (<div className="btn-group">
          <BeautifulTitle title={translate('Update metadata')}>
            <button key={`edit-meta-${sub._id}`} type="button" className="btn btn-sm btn-access-negative me-1" onClick={() => updateMeta(sub)}>
              <i className="fas fa-pen" />
            </button>
          </BeautifulTitle>
          <BeautifulTitle title={translate('Refresh secret')}>
            <button key={`edit-meta-${sub._id}`} type="button" className="btn btn-sm btn-access-negative btn-outline-danger me-1" onClick={() => regenerateSecret(sub)}>
              <i className="fas fa-sync" />
            </button>
          </BeautifulTitle>
          <BeautifulTitle title={translate('api.delete.subscription')}>
            <button key={`edit-meta-${sub._id}`} type="button" className="btn btn-sm btn-access-negative btn-outline-danger" onClick={() => deleteSubscription(sub)}>
              <i className="fas fa-trash-alt"></i>
            </button>
          </BeautifulTitle>
        </div>);
      },
    }),
  ]

  const updateMeta = (sub: IApiSubscriptionGql) => openSubMetadataModal({
    save: (updates: CustomSubscriptionData) => {
      Services.updateSubscription(currentTeam, { ...sub, ...updates })
        .then(() => {
          queryClient.invalidateQueries(['subscriptions'])
        });
    },
    api: sub.api._id,
    plan: sub.plan._id,
    team: sub.team,
    subscription: sub,
    creationMode: false,
    value: (plansQuery.data as Array<IUsagePlan>)
      .find(p => sub.plan._id === p._id)!
  });

  const regenerateSecret = (sub: IApiSubscriptionGql) => {

    const plan = sub.plan

    confirm({
      message: translate({ key: 'secret.refresh.confirm', replacements: [sub.team.name, plan.customName ? plan.customName : plan.type] }),
      okLabel: translate('Yes'),
      cancelLabel: translate('No'),
    })
      .then((ok) => {
        if (ok) {
          Services.regenerateApiKeySecret(currentTeam._id, sub._id).then(() => {
            toastr.success(translate('Success'), translate('secret.refresh.success'));
            tableRef.current?.update();
          });
        }
      });
  };

  const deleteSubscription = (sub: IApiSubscriptionGql) => {
    confirm({
      title: translate('api.delete.subscription.form.title'),
      message: translate({ key: 'api.delete.subscription.message', replacements: [sub.team.name, sub.plan.customName ? sub.plan.customName : sub.plan.type] }),
      okLabel: translate('Yes'),
      cancelLabel: translate('No'),
    }).then((ok) => {
      if (ok) {
        Services.deleteApiSubscription(sub.team._id, sub._id)
          .then((res) => {
            if (!isError(res)) {
              toastr.success(translate('deletion successful'), translate('api.delete.subscription.deleted'));
              tableRef.current?.update();
            } else {
              toastr.error(
                translate('Error'),
                res.error
              )
            }
          })
      }
    })
  }


  if (plansQuery.isLoading) {
    return (<Spinner />)
  } else if (plansQuery.data && !isError(plansQuery.data)) {
    const usagePlans = plansQuery.data;

    const options = usagePlans.flatMap(plan => {
      return [
        ...(plan.otoroshiTarget?.apikeyCustomization.customMetadata.map(({ key }) => key) || []),
        ...Object.keys(plan.otoroshiTarget?.apikeyCustomization.metadata || {})
      ]
    });

    return (
      <Can I={manage} a={API} dispatchError={true} team={currentTeam}>
        <div className="px-2">
          <div className='d-flex flex-row justify-content-start align-items-center mb-2'>
            <button className='btn btn-sm btn-outline-primary' onClick={() => openFormModal({
              actionLabel: translate("Filter"),
              onSubmit: data => {
                setFilters(data)
              },
              schema: {
                metadata: {
                  type: type.object,
                  format: format.form,
                  label: translate('Filter metadata'),
                  array: true,
                  schema: {
                    key: {
                      type: type.string,
                      createOption: true
                    },
                    value: {
                      type: type.string,
                    }
                  }
                },
                tags: {
                  type: type.string,
                  label: translate('Filter tags'),
                  array: true,
                },
                clientIds: {
                  type: type.string,
                  array: true,
                  label: translate('Filter Client Ids')
                }
              },
              title: translate("Filter data"),
              value: filters
            })}> {translate('Filter')} </button>
            {!!filters && (
              <div className="clear cursor-pointer ms-1" onClick={() => setFilters(undefined)}>
                <i className="far fa-times-circle me-1" />
                <Translation i18nkey="clear filter">clear filter</Translation>
              </div>
            )}
          </div>
          <div className="col-12">
            <Table
              defaultSort="name"
              columns={columns(usagePlans)}
              fetchItems={() => {
                if (subscriptionsQuery.isLoading || subscriptionsQuery.error) {
                  return []
                } else {
                  return subscriptionsQuery.data ?? []
                }
              }}
              ref={tableRef}
            />
          </div>
        </div>
      </Can>
    );
  } else {
    return <div>error while fetching usage plan</div>
  }
};
