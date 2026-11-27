import { useContext } from 'react';

import { I18nContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { IApi, ITeamSimple, IUsagePlan } from '../../../types';
import { api as API, apikey, CanIDoAction, CanIDoActionForOneOfTeams, manage, read, TabItem } from '../../utils';

export type ApiTab =
  | 'description'
  | 'apis'
  | 'pricing'
  | 'apikeys'
  | 'swagger'
  | 'subscriptions'
  | 'documentation'
  | 'testing'
  | 'news'
  | 'issues';

type ApiTabsParams = {
  api: IApi;
  ownerTeam: ITeamSimple;
  plans: Array<IUsagePlan>;
  myTeams: Array<ITeamSimple>;
  myKeyCount: number;
};

export const useApiTabs = ({ api, ownerTeam, plans, myTeams, myKeyCount }: ApiTabsParams): Array<TabItem<ApiTab>> => {
  const { connectedUser, tenant } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);

  const isOwner = CanIDoAction(connectedUser, manage, API, ownerTeam);
  const isConnected = !connectedUser.isGuest;
  const byEnvironment = tenant.display === 'environment';

  const hasDocumentation = byEnvironment
    ? plans.some((p) => !!p.documentation)
    : !!api.documentation?.pages?.length;
  const hasSpecification = byEnvironment
    ? plans.some((p) => p.swagger?.content || p.swagger?.url)
    : !!(api.swagger?.content || api.swagger?.url);
  const hasTesting = byEnvironment
    ? plans.some((p) => !!p.testing?.enabled)
    : !!api.testing?.enabled;

  const tabs: Array<TabItem<ApiTab> & { visible: boolean }> = [
    { id: 'description', label: translate('Description'), visible: true },
    { id: 'apis', label: translate('APIs'), visible: !!api.apis },
    {
      id: 'pricing',
      label: byEnvironment ? translate('navbar.environments.label') : translate({ key: 'Plan', plural: true }),
      count: api.possibleUsagePlans.length,
      visible: true,
    },
    {
      id: 'apikeys',
      label: translate('api.editor.tab.apikeys'),
      count: myKeyCount,
      visible: isConnected && CanIDoActionForOneOfTeams(connectedUser, read, apikey, myTeams),
    },
    {
      id: 'swagger',
      label: translate('api.editor.tab.specification'),
      visible: isOwner || ((isConnected || !tenant.apiReferenceHideForGuest) && hasSpecification),
    },
    {
      id: 'subscriptions',
      label: translate('Subscriptions'),
      count: api.subscriptionCount,
      visible: isOwner,
    },
    {
      id: 'documentation',
      label: translate('Documentation'),
      visible: isOwner || (isConnected && hasDocumentation),
    },
    { id: 'testing', label: translate('Testing'), visible: isOwner || (isConnected && hasTesting) },
    {
      id: 'news',
      label: translate('nav.section.news.label'),
      visible: isOwner || (isConnected && !!api.posts.length),
    },
    { id: 'issues', label: translate('api.editor.tab.help'), visible: true },
  ];

  return tabs.filter((tab) => tab.visible).map(({ id, label, count }) => ({ id, label, count }));
};
