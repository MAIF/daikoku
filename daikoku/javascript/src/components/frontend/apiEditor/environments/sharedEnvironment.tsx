import { useSearchParams } from 'react-router-dom';

import { IUsagePlan } from '../../../../types';

export const SHARED_ENVIRONMENT_PARAM = 'env';

export type EnvironmentScope = 'swagger' | 'documentation' | 'testing';

const hasContent: Record<EnvironmentScope, (environment: IUsagePlan) => boolean> = {
  swagger: (environment) => !!environment.swagger,
  documentation: (environment) => !!environment.documentation?.pages.length,
  testing: (environment) => !!environment.testing?.enabled,
};

export const isEnvironmentScope = (tab: string): tab is EnvironmentScope => tab in hasContent;

export const useSharedEnvironment = (environments: Array<IUsagePlan>, scope: EnvironmentScope) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const environment =
    environments.find((e) => e._id === searchParams.get(SHARED_ENVIRONMENT_PARAM)) ??
    environments.find(hasContent[scope]) ??
    environments[0];

  const selectEnvironment = (environmentId: string) =>
    setSearchParams((params) => {
      params.set(SHARED_ENVIRONMENT_PARAM, environmentId);
      params.delete('page');
      return params;
    });

  return { environment: environment as IUsagePlan | undefined, selectEnvironment };
};
