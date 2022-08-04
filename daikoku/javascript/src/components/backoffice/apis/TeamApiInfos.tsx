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
  tenant,
  openTestingApiKeyModal,
  openSubMetadataModal
}: any) => {
    const { translateMethod } = useContext(I18nContext);

  const informationForm = teamApiInfoForm(translateMethod, team, tenant);
  const descriptionForm = teamApiDescriptionForm(translateMethod);

  useEffect(() => {
    return () => {
      injectSubMenu(null);
    };
  }, []);

  const steps = [
    {
      id: 'info',
      label: translateMethod('Informations'),
      schema: informationForm.schema,
      flow: informationForm.flow(expertMode),
    },
    {
      id: 'description',
      label: translateMethod('Description'),
      schema: descriptionForm.schema,
      flow: descriptionForm.flow,
    },
    {
      id: 'swagger',
      label: translateMethod('Swagger'),
      component: TeamApiSwagger,
      skipTo: 'save',
    },
    {
      id: 'testing',
      label: translateMethod('Testing'),
      component: (p: any) => TeamApiTesting({ ...p, openTestingApiKeyModal, openSubMetadataModal }),
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
            label: translateMethod('Informations'),
            schema: informationForm.adminSchema,
            flow: informationForm.adminFlow,
          },
        ]}
        initial="info"
        creation={creation}
        save={save}
        // getBreadcrumb={(_, breadcrumb) => injectSubMenu(breadcrumb)}
        labels={{
          previous: translateMethod('Previous'),
          skip: translateMethod('Skip'),
          next: translateMethod('Next'),
          save: translateMethod('Save'),
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
      // getBreadcrumb={(_, breadcrumb) => injectSubMenu(breadcrumb)}
      labels={{
        previous: translateMethod('Previous'),
        skip: translateMethod('Skip'),
        next: translateMethod('Next'),
        save: translateMethod('Save'),
      }}
    />
  );
};
