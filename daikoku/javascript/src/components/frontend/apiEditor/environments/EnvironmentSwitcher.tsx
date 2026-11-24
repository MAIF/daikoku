import { useContext, useState } from 'react';

import { I18nContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { IApi, ITeamSimple, IUsagePlan } from '../../../../types';
import { ScopeSelect } from '../../../inputs';
import { api as API, CanIDoAction, manage } from '../../../utils';
import { EnvironmentSideSheet } from './EnvironmentSideSheet';
import { fromRestPlan } from './planUtils';
import { EnvironmentScope, useSharedEnvironment } from './sharedEnvironment';

const CREATE_PREFIX = 'create:';

type EnvironmentSwitcherProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  environments: Array<IUsagePlan>;
  scope: EnvironmentScope;
};

export const EnvironmentSwitcher = ({ api, ownerTeam, environments, scope }: EnvironmentSwitcherProps) => {
  const { translate } = useContext(I18nContext);
  const { tenant, connectedUser } = useContext(GlobalContext);

  const { environment, selectEnvironment } = useSharedEnvironment(environments, scope);
  const [draft, setDraft] = useState<IUsagePlan>();

  const isOwner = CanIDoAction(connectedUser, manage, API, ownerTeam);
  const createLabel = translate('api.editor.environment.create.title');

  const options = tenant.environments.flatMap((name) => {
    const plan = environments.find((e) => e.customName === name);

    if (plan) {
      return [{ label: name, value: plan._id }];
    } else if (isOwner) {
      return [{ label: name, value: `${CREATE_PREFIX}${name}`, muted: true, title: createLabel }];
    } else {
      return [];
    }
  });

  const createEnvironment = (name: string) =>
    Services.fetchNewPlan().then((plan) => setDraft({ ...fromRestPlan(plan), customName: name }));

  const select = (value: string) =>
    value.startsWith(CREATE_PREFIX) ? createEnvironment(value.slice(CREATE_PREFIX.length)) : selectEnvironment(value);

  if (options.length < 2) {
    return null;
  }

  const label = translate('api.editor.environment.select.label');

  return (
    <div className="environment-switcher">
      <ScopeSelect
        badge={translate('api.home.config.api.test.env.badge')}
        ariaLabel={label}
        options={options}
        value={environment?._id ?? ''}
        onChange={select}
      />

      {draft && (
        <EnvironmentSideSheet
          api={api}
          ownerTeam={ownerTeam}
          plan={draft}
          creation
          initialTab="general"
          onClose={() => setDraft(undefined)}
        />
      )}
    </div>
  );
};
