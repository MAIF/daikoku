import React, { useContext } from 'react';
import { I18nContext } from '../../../core';
import { MultiStepForm } from '../../utils';

import {
  teamApiInfoForm,
  teamApiDescriptionForm,
  TeamApiPricing,
  TeamApiSwagger,
  TeamApiTesting,
  TeamApiDocumentation,
  TeamApiPost
} from './';
import { actions } from 'react-redux-toastr';

import CodeInput from '../../inputs/CodeInput';
import { type } from '@maif/react-forms';


export const TeamApiMultiStep = ({ value, team, onChange, creation }) => {
  const { translateMethod } = useContext(I18nContext);

  const informationForm = teamApiInfoForm(translateMethod)
  const descriptionForm = teamApiDescriptionForm(translateMethod)

  const steps = [
    
    {
      id: 'info',
      label: translateMethod('Informations'),
      schema: informationForm.schema,
      flow: informationForm.simpleFlow,
      actions: ['setInformation']
    },
    {
      id: 'description',
      label: translateMethod('Description'),
      schema: descriptionForm.schema,
      flow: descriptionForm.flow,
      actions: ['setDescription']
    },
    {
      id: 'pricing',
      label: translateMethod('Plans'),
      component: TeamApiPricing,
      // skipTo: 'swagger',
      actions: ['setPlans']
    },
    // {
    //   id: 'swagger',
    //   label: translateMethod('Swagger'),
    //   component: TeamApiSwagger,
    //   // skipTo: 'documentation',
    //   actions: ['setSwagger']
    // },

    // {
    //   id: 'testing',
    //   label: translateMethod('Testing'),
    //   component: TeamApiTesting,
    //   // skipTo: 'documentation',
    //   actions: ['setTesting']
    // },
    // {
    //   id: 'documentation',
    //   label: translateMethod('Documentation'),
    //   component: TeamApiDocumentation,
    //   actions: ['setDocumentation']
    // },
    // {
    //   id: 'news',
    //   label: translateMethod('News'),
    //   component: TeamApiPost,
    //   actions: ['setPost']
    // },
  ]

  return (
    <MultiStepForm 
      value={value} 
      steps={steps} 
      initial="info" 
      creation={creation}
      onSave={v => console.error({v})}
      // report={(value, current)  => (
      //   <div className='col-5'>
      //     <h4>{current}</h4>
      //     <CodeInput value={JSON.stringify(value, null, 4)} mode='json'/>
      //   </div>
      // )} 
      />
  );
};
