import React, { useContext } from 'react';
import { I18nContext } from '../../../core';
import { MultiStepForm } from '../../utils';

import {
  teamApiInfoForm,
  teamApiDescriptionForm,
  TeamApiPricing,
  TeamApiSwagger,
  TeamApiTesting,
} from './';
import { actions } from 'react-redux-toastr';

import CodeInput from '../../inputs/CodeInput';


export const TeamApiMultiStep = ({ value, onChange, creation }) => {
  const { translateMethod } = useContext(I18nContext);

  const informationForm = teamApiInfoForm(translateMethod)
  const descriptionForm = teamApiDescriptionForm(translateMethod)

  const steps = [
    
    {
      id: 'info',
      label: translateMethod('Informations'),
      schema: informationForm.schema,
      flow: informationForm.flow(true),
    },
    {
      id: 'description',
      label: translateMethod('Description'),
      schema: descriptionForm.schema,
      flow: descriptionForm.flow,
    },
    {
      id: 'pricing',
      label: translateMethod('Plans'),
      component: TeamApiPricing,
      skipTo: 'swagger',
    },
    {
      id: 'swagger',
      label: translateMethod('Swagger'),
      component: TeamApiSwagger,
      skipTo: 'done',
    },

    {
      id: 'testing',
      label: translateMethod('Testing'),
      component: TeamApiTesting,
      skipTo: 'done',
    }
  ]

  return (
    <MultiStepForm 
      value={value} 
      steps={steps} 
      initial="info" 
      creation={creation}
      onSave={v => console.error({v})} //todo: real onSave
      // report={(value, current)  => (
      //   <div className='col-5'>
      //     <h4>{current}</h4>
      //     <CodeInput value={JSON.stringify(value, null, 4)} mode='json'/>
      //   </div>
      // )} 
      />
  );
};
