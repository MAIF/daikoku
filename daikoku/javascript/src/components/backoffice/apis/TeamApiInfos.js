import React, { useContext } from 'react';
import { I18nContext } from '../../../core';
import { MultiStepForm } from '../../utils';

import {
  teamApiInfoForm,
  teamApiDescriptionForm,
  TeamApiPricing,
  TeamApiSwagger,
  TeamApiTesting,
} from '.';



export const TeamApiInfos = ({ value, save, creation, expertMode, injectSubMenu, team, tenant, openTestingApiKeyModal, openSubMetadataModal, otoroshiSettings }) => {
  const { translateMethod } = useContext(I18nContext);

  const informationForm = teamApiInfoForm(translateMethod, team, tenant)
  const descriptionForm = teamApiDescriptionForm(translateMethod)

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
      component: p => TeamApiTesting({ ...p, openTestingApiKeyModal, openSubMetadataModal, otoroshiSettings}),
      skipTo: 'save',
    }
  ]

  if (value.visibility === 'AdminOnly') {
    return (
      <MultiStepForm
        value={value}
        steps={[{
          id: 'info',
          label: translateMethod('Informations'),
          schema: informationForm.adminSchema,
          flow: informationForm.adminFlow,
        }]}
        initial="info"
        creation={creation}
        save={save}
        getBreadcrumb={(_, breadcrumb) => injectSubMenu(breadcrumb)}
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
      getBreadcrumb={(_, breadcrumb) => injectSubMenu(breadcrumb)}
    // report={(value, current)  => (
    //   <div className='col-5'>
    //     <h4>{current}</h4>
    //     <CodeInput value={JSON.stringify(value, null, 4)} mode='json'/>
    //   </div>
    // )} 
    />
  );
};
