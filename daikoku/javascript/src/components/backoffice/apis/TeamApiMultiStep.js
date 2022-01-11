import React, { useContext } from 'react';
import { type, format, constraints } from '@maif/react-forms';
import { I18nContext } from '../../../core';
import { MultiStepForm } from '../../utils';
import { assign } from 'xstate';

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


export const TeamApiMultiStep = ({ value, team, onChange, creation }) => {
  const { translateMethod } = useContext(I18nContext);

  const setInformation = assign({
    isDefault: (_, response) => response.isDefault,
    published: (_, response) => response.published,
    name: (_, response) => response.name,
    smallDescription: (_, response) => response.smallDescription,
    image: (_, response) => response.image,
    header: (_, response) => response.header,
    currentVersion: (_, response) => response.currentVersion,
    supportedVersions: (_, response) => response.supportedVersions,
    tags: (_, response) => response.tags,
    categories: (_, response) => response.categories,
    visibility: (_, response) => response.visibility,
    authorizedTeams: (_, response) => response.authorizedTeams
  })
  const setDescription = assign({
    description: (_, response) => response.description
  })
  const setSwagger = assign({
    swagger: (_, response) => response.swagger
  })
  const setPlans = assign({
    possibleUsagePlans: (_, response) => response.possibleUsagePlans
  })
  const setTesting = assign({
    testing: (_, response) => response.testing
  })
  const setDocumentation = assign({
    documentation: (_, response) => response.documentation
  })

  const save = (context) => onChange(context)


  const informationForm = teamApiInfoForm(translateMethod)
  const descriptionForm = teamApiDescriptionForm(translateMethod)

  const steps = [
    {
      id: 'info',
      label: translateMethod('Informations'),
      schema: informationForm.schema,
      flow: informationForm.flow,
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
      skipTo: 'swagger',
      actions: ['setPlans']
    },
    {
      id: 'swagger',
      label: translateMethod('Swagger'),
      component: TeamApiSwagger,
      // skipTo: 'documentation',
      actions: ['setSwagger']
    },

    {
      id: 'testing',
      label: translateMethod('Testing'),
      component: TeamApiTesting,
      // skipTo: 'documentation',
      actions: ['setTesting']
    },
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
    <MultiStepForm value={value} steps={steps} actions={{ setInformation, setDescription, setSwagger, setPlans, setDocumentation, setTesting, save }} initial="info" creation={creation} />
  );
};
