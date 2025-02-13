import Select from 'react-select';
import { useContext, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import sortBy from 'lodash/sortBy';

import * as Services from '../../../services';
import { IApi, isError, ISubscriptionExtended, ITeamSimple } from '../../../types';
import { Spinner } from '../../utils/Spinner';
import { ApiKeyCard, ApiKeysListForApi } from '../../backoffice/apikeys/TeamApiKeysForApi';
import { PaginatedComponent } from '../../utils/PaginatedComponent';
import { I18nContext } from '../../../contexts';
import { Link } from 'react-router-dom';
import { formatPlanType } from '../../utils/formatters';
import { apikey, Can, read } from '../../utils/permissions';

type ISubscriptionWithChildren = ISubscriptionExtended & {
  children: Array<ISubscriptionExtended>;
};

type ApiSubscriptions = {
  api: IApi
  ownerTeam: ITeamSimple
  subscribingTeams: ITeamSimple[]
}


export const ApiSubscriptions = (props: ApiSubscriptions) => {
  const { translate, Translation } = useContext(I18nContext)

  const [selectedTeam, setSelectedTeam] = useState<ITeamSimple>()

  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions", selectedTeam?._id],
    queryFn: () => Services.getTeamSubscriptions(props.api._id, selectedTeam!._id, props.api.currentVersion),
    enabled: !!selectedTeam
  })

  return (
    <div>
      <Select
        options={props.subscribingTeams.map(value => ({ label: value.name, value }))}
        onChange={t => setSelectedTeam(t?.value)} />

      {!selectedTeam && (<span>please select a team</span>)}

      {subscriptionsQuery.isLoading && <Spinner />}
      
      {selectedTeam && subscriptionsQuery.data && !isError(subscriptionsQuery.data) && (
        // <ApiKeyList subscriptions={subscriptionsQuery.data} currentTeam={selectedTeam!} api={props.api} subscribedApis={[]} />
        <ApiKeysListForApi 
        team={selectedTeam}
        api={props.api}
        ownerTeam={props.ownerTeam}/>
      )}
    </div>
  )
}

type ApiKeyListprops = {
  api: IApi
  subscriptions: ISubscriptionExtended[]
  currentTeam: ITeamSimple
  subscribedApis: IApi[]
}
const ApiKeyList = (props: ApiKeyListprops) => {
  const { translate, Translation } = useContext(I18nContext)

  const [search, setSearched] = useState('')

  const filteredApiKeys =
    search === ''
      ? props.subscriptions
      : props.subscriptions.filter((subs) => {
        return subs.apiKey.clientName === search ||
          subs.apiKey.clientId === search ||
          subs.customName?.toLocaleLowerCase() === search.toLocaleLowerCase() ||
          formatPlanType(subs.planType, translate)
            .toLowerCase()
            .includes(search.toLocaleLowerCase()) ||
          subs.tags.map(t => t.toLocaleLowerCase()).includes(search.toLocaleLowerCase())
      });

  const sorted = sortBy(filteredApiKeys, ['plan', 'customName', 'parent']);
  const sortedApiKeys = sorted
    .filter((f) => f.parent)
    .reduce<Array<ISubscriptionWithChildren>>(
      (acc, sub) => {
        return acc.find((a) => a._id === sub.parent)
          ? acc.map((a) => {
            if (a._id === sub.parent) a.children.push(sub);
            return a;
          })
          : [...acc, { ...sub, children: [] }];
      },
      sorted
        .filter((f) => !f.parent)
        .map((sub) => ({ ...sub, children: [] }))
    );

  const apiLink = '';
  const updateCustomName = (sub, name) => Promise.resolve(console.debug(sub, name))
  const toggleApiKey = (sub) => Promise.resolve(console.debug(sub))
  const makeUniqueApiKey = (sub) => Promise.resolve(console.debug(sub))
  const deleteApiKey = (sub) => Promise.resolve(console.debug(sub))
  const toggleApiKeyRotation = (sub, plan, enabled, rotationEvery, gracePeriod) => Promise.resolve(console.debug(sub))
  const regenerateApiKeySecret = (sub) => Promise.resolve(console.debug(sub))
  const transferApiKey = (sub) => Promise.resolve(console.debug(sub))



  return (
    <Can I={read} a={apikey} team={props.currentTeam} dispatchError>
      <div className="row">
        <div className="col-12 mt-2 mb-4">
          {/* <input
            type="text"
            className="form-control col-5"
            placeholder={translate('Search your apiKey...')}
            aria-label="Search your apikey"
            value={searched}
            onChange={(e) => setSearched(e.target.value)}
          /> */}
        </div>

        <div className="col-12">
          <PaginatedComponent
            items={sortedApiKeys}
            count={5}
            formatter={(subscription: ISubscriptionWithChildren) => {
              return (
                <ApiKeyCard
                  api={props.api}
                  currentTeam={props.currentTeam}
                  apiLink={apiLink}
                  statsLink={`/${props.currentTeam._humanReadableId}/settings/apikeys/${props.api._humanReadableId}/${props.api.currentVersion}/subscription/${subscription._id}/consumptions`}
                  key={subscription.apiKey.clientId}
                  subscription={subscription}
                  subscribedApis={props.subscribedApis}
                  updateCustomName={(name) =>
                    updateCustomName(subscription, name)
                  }
                  toggle={() => toggleApiKey(subscription)}
                  makeUniqueApiKey={() => makeUniqueApiKey(subscription)}
                  deleteApiKey={() => deleteApiKey(subscription)}
                  toggleRotation={(
                    plan,
                    enabled,
                    rotationEvery,
                    gracePeriod
                  ) =>
                    toggleApiKeyRotation(
                      subscription,
                      plan,
                      enabled,
                      rotationEvery,
                      gracePeriod
                    )
                  }
                  regenerateSecret={() => regenerateApiKeySecret(subscription)}
                  transferKey={() => transferApiKey(subscription)}
                  handleTagClick={(tag) => setSearched(tag)}
                />
              );
            }}
          />
        </div>
      </div>
    </Can>
  );
}