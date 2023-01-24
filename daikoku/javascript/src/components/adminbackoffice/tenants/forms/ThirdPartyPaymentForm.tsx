import { constraints, format, type } from '@maif/react-forms';
import { useContext } from 'react';
import { UseMutationResult } from '@tanstack/react-query';

import { I18nContext } from '../../../../core';
import { IMailerSettings, ITenantFull, IThirdPartyPaymentSettings } from '../../../../types';
import { IMultistepsformStep, MultiStepForm } from '../../../utils';

export const ThirdPartyPaymentForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)

  const steps: Array<IMultistepsformStep<IThirdPartyPaymentSettings>> = [{
    id: 'type',
    label: translate('Third-Party payment provider'),
    schema: {
      type: {
        type: type.string,
        format: format.buttonsSelect,
        label: translate('Third-Party payment provider'),
        options: [
          { label: 'Stripe', value: 'Stripe' }
        ],
        constraints: [
          constraints.required()
        ]
      }
    },
  }, {
    id: 'settings',
    label: translate('Settings'),
    flow: (data) => {
      switch (data.type) {
        case 'Stripe':
          return ['publicKey', 'secretKey'];
      }
    },
    schema: (data) => {
      switch (data?.type) {
        default:
          return {
            publicKey: {
              type: type.string,
              label: translate('public apikey'),
            },
            secretKey: {
              type: type.string,
              label: translate('secret apikey'),
            },
          }
      }
    }
  }]

  return (
    <MultiStepForm<IThirdPartyPaymentSettings>
      value={props.tenant?.thirdPartyPaymentSettings}
      steps={steps}
      initial={props.tenant?.thirdPartyPaymentSettings ? "settings" : "type"}
      creation={false}
      save={(d: IThirdPartyPaymentSettings) => props.updateTenant.mutateAsync({ ...props.tenant, thirdPartyPaymentSettings: d } as ITenantFull)}
      labels={{
        previous: translate('Previous'),
        skip: translate('Skip'),
        next: translate('Next'),
        save: translate('Save'),
      }} />
  )
}