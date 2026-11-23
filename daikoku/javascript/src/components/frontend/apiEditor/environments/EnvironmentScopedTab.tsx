import { useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../../contexts';
import * as Services from '../../../../services';
import { IApi, isError, ITeamSimple, IUsagePlan } from '../../../../types';
import { ApiRedoc, ApiTest } from '../../api';
import { useSharedEnvironment } from './sharedEnvironment';

export type EnvironmentScopedTabId = 'swagger' | 'testing';

type EnvironmentScopedTabProps = {
  tab: EnvironmentScopedTabId;
  api: IApi;
  ownerTeam: ITeamSimple;
  environments: Array<IUsagePlan>;
};

export const EnvironmentScopedTab = ({ tab, api, ownerTeam, environments }: EnvironmentScopedTabProps) => {
  const { translate } = useContext(I18nContext);
  const { closeRightPanel } = useContext(ModalContext);
  const queryClient = useQueryClient();

  const { environment } = useSharedEnvironment(environments, tab);

  if (!environment) {
    return (
      <div className="alert alert-info" role="status">
        {translate('api.editor.environment.none')}
      </div>
    );
  }

  const savePlan = (plan: IUsagePlan) =>
    Services.updatePlan(ownerTeam._id, api._id, api.currentVersion, plan).then((response) => {
      if (isError(response)) {
        toast.error(response.error);
        return;
      }

      toast.success(translate('update.plan.successful.toast.label'));
      closeRightPanel();
      return queryClient.invalidateQueries({ queryKey: ['plans'] });
    });

  const swaggerUrl = `/api/teams/${ownerTeam._id}/apis/${api._id}/${api.currentVersion}/plans/${environment._id}/swagger`;

  return (
    <div className="d-flex flex-column">
      {tab === 'swagger' && (
        <ApiRedoc
          key={environment._id}
          save={savePlan}
          entity={environment}
          ownerTeam={ownerTeam}
          swaggerUrl={swaggerUrl}
          swaggerConf={environment.swagger}
        />
      )}

      {tab === 'testing' && (
        <ApiTest
          key={environment._id}
          _id={api._id}
          testing={environment.testing}
          swagger={environment.swagger}
          swaggerUrl={swaggerUrl}
          callUrl={`/api/teams/${ownerTeam._id}/testing/${api._id}/plans/${environment._id}/call`}
          ownerTeam={ownerTeam}
          entity={environment}
          save={savePlan}
        />
      )}
    </div>
  );
};
