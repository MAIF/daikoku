import React, { useContext, useEffect } from 'react';
import { I18nContext } from '../../../core';
import { IMultistepsformStep, MultiStepForm } from '../../utils';

import { teamApiInfoForm, teamApiDescriptionForm, TeamApiSwagger, TeamApiTesting } from '.';
import { IApi, ITeamFull, ITeamSimple, ITenant } from '../../../types';

export const TeamApiInfos = ({
  value,
  save,
  creation,
  expertMode,
  injectSubMenu,
  team,
  tenant
}: {
  value: IApi,
  save: (t: IApi) => Promise<void>,
  creation: boolean,
  expertMode: boolean,
  injectSubMenu: (e: JSX.Element) => void,
  team: ITeamSimple,
  tenant: ITenant
}) => {
  const { translate } = useContext(I18nContext);

  const informationForm = teamApiInfoForm(translate, team, tenant);
  const descriptionForm = teamApiDescriptionForm(translate);

  useEffect(() => {
    return () => {
      injectSubMenu(<></>);
    };
  }, []);

  const steps: Array<IMultistepsformStep<IApi>> = [
    {
      id: 'info',
      label: translate('Informations'),
      schema: informationForm.schema,
      flow: informationForm.flow(expertMode),
    },
    {
      id: 'description',
      label: translate('Description'),
      schema: descriptionForm.schema,
      flow: descriptionForm.flow,
    },
    {
      id: 'swagger',
      label: translate('Swagger'),//@ts-ignore
      component: TeamApiSwagger,
      skipTo: 'save',
    },
    {
      id: 'testing',
      label: translate('Testing'),//@ts-ignore
      component: TeamApiTesting,
      skipTo: 'save',
    },
  ];

  if (value.visibility === 'AdminOnly') {
    return (
      <MultiStepForm
        value={value}
        steps={[
          {
            id: 'info',
            label: translate('Informations'),
            schema: informationForm.adminSchema,
            flow: informationForm.adminFlow,
          },
        ]}
        initial="info"
        creation={creation}
        save={save}
        labels={{
          previous: translate('Previous'),
          skip: translate('Skip'),
          next: translate('Next'),
          save: translate('Save'),
        }}
      />
    );
  }
  return (
    <MultiStepForm
      value={value}
      steps={steps}
      initial="info"
      creation={creation}
      save={save}
      labels={{
        previous: translate('Previous'),
        skip: translate('Skip'),
        next: translate('Next'),
        save: translate('Save'),
      }}
    />
  );
};
