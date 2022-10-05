import React, { useContext, useEffect } from 'react';
import { I18nContext } from '../../../core';
import { MultiStepForm } from '../../utils';

import { teamApiInfoForm, teamApiDescriptionForm, TeamApiSwagger, TeamApiTesting } from '.';

export const TeamApiInfos = ({
  value,
  save,
  creation,
  expertMode,
  injectSubMenu,
  team,
  tenant
}: any) => {
  const { translate } = useContext(I18nContext);

  const informationForm = teamApiInfoForm(translate, team, tenant);
  const descriptionForm = teamApiDescriptionForm(translate);

  useEffect(() => {
    return () => {
      injectSubMenu(null);
    };
  }, []);

  const steps = [
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
      label: translate('Swagger'),
      component: TeamApiSwagger,
      skipTo: 'save',
    },
    {
      id: 'testing',
      label: translate('Testing'),
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
