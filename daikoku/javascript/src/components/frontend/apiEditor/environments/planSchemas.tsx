import { constraints, Flow, format, Schema, type } from '@maif/react-forms';

import { TranslateParams } from '../../../../contexts/i18n-context';
import * as Services from '../../../../services';
import {
  IApi,
  ISimpleOtoroshiSettings,
  isError,
  ITeamSimple,
  ITenant,
  IThirdPartyPaymentSettings,
  IUsagePlan,
} from '../../../../types';
import { ChoiceChips } from '../../../inputs';
import { CustomMetadataInput, OtoroshiEntitiesSelector } from '../../api/ApiPricing';

type Translate = (params: string | TranslateParams) => string;

const positiveInteger = (translate: Translate) => [
  constraints.positive(translate('constraints.positive')),
  constraints.integer(translate('constraints.integer')),
];

export const quotasSchema = (translate: Translate, plan: IUsagePlan): Schema => ({
  maxPerSecond: {
    type: type.number,
    label: translate('Max. per second'),
    placeholder: translate('Max. requests per second'),
    props: { step: 1, min: 0 },
    constraints: positiveInteger(translate),
  },
  maxPerDay: {
    type: type.number,
    label: translate('Max. per day'),
    placeholder: translate('Max. requests per day'),
    props: { step: 1, min: 0 },
    constraints: positiveInteger(translate),
  },
  maxPerMonth: {
    type: type.number,
    label: translate('Max. per month'),
    placeholder: translate('Max. requests per month'),
    help: plan.includedRequestsPerMonth
      ? translate({
          key: 'usage.plan.form.quotas.included.requests.help',
          replacements: [plan.includedRequestsPerMonth.toString()],
        })
      : undefined,
    props: { step: 1, min: 0 },
    constraints: [
      ...positiveInteger(translate),
      ...(plan.includedRequestsPerMonth
        ? [
            constraints.min(
              plan.includedRequestsPerMonth,
              translate({
                key: 'usage.plan.form.quotas.below.included.requests',
                replacements: [plan.includedRequestsPerMonth.toString()],
              })
            ),
          ]
        : []),
    ],
  },
});

export const billingSchema = (translate: Translate, tenant: ITenant, plan: IUsagePlan): Schema => ({
  paymentSettings: {
    type: type.object,
    format: format.form,
    label: null,
    schema: {
      thirdPartyPaymentSettingsId: {
        type: type.string,
        format: format.select,
        label: translate('usage.plan.form.pricing.payment.settings.label'),
        options: tenant.thirdPartyPaymentSettings,
        transformer: (s: IThirdPartyPaymentSettings) => ({ label: s.name, value: s._id }),
        constraints: [constraints.required(translate('constraints.required.value'))],
        onChange: ({ setValue, value }) =>
          setValue('paymentSettings.type', tenant.thirdPartyPaymentSettings.find((s) => value === s._id)?.type),
      },
    },
  },
  costPerMonth: {
    type: type.number,
    label: translate('Cost per month'),
    placeholder: translate('Cost per month'),
    constraints: [
      constraints.positive(translate('constraints.positive')),
      constraints.required(translate('constraints.required.value')),
    ],
  },
  costPerRequest: {
    type: type.number,
    label: translate('Cost per req.'),
    placeholder: translate('Cost per request'),
    props: { step: 0.01 },
    constraints: [constraints.positive(translate('constraints.positive'))],
  },
  includedRequestsPerMonth: {
    type: type.number,
    label: translate('usage.plan.form.pricing.included.requests.label'),
    visible: ({ rawValues }) => rawValues.costPerRequest !== undefined && rawValues.costPerRequest !== null,
    help: translate({
      key: 'usage.plan.form.pricing.included.requests.help',
      replacements: [
        plan.maxPerMonth
          ? translate({ key: 'usage.plan.form.pricing.monthly.limit', replacements: [plan.maxPerMonth.toString()] })
          : translate('usage.plan.form.pricing.no.monthly.limit'),
      ],
    }),
    props: { step: 1, min: 0 },
    constraints: [
      ...positiveInteger(translate),
      ...(plan.maxPerMonth
        ? [
            constraints.max(
              plan.maxPerMonth,
              translate({
                key: 'usage.plan.form.pricing.included.requests.above.limit',
                replacements: [plan.maxPerMonth.toString()],
              })
            ),
          ]
        : []),
    ],
  },
});

const pathsSchema = (translate: Translate) => ({
  type: type.object,
  format: format.form,
  array: true,
  schema: {
    method: {
      type: type.string,
      format: format.select,
      label: translate('http.method'),
      options: ['*', 'GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH'],
    },
    path: {
      type: type.string,
      label: translate('http.path'),
      defaultValue: '/',
      constraints: [constraints.matches(/^\/([^\s]\w*)*$/, translate('constraint.match.path'))],
    },
  },
  flow: ['method', 'path'],
});

export const otoroshiSchema = (
  translate: Translate,
  tenant: ITenant,
  ownerTeam: ITeamSimple,
  plan: IUsagePlan,
  otoroshis: Array<ISimpleOtoroshiSettings>
): { schema: Schema; flow: Flow } => {
  const lockedByAggregation = !!plan.aggregationApiKeysSecurity;
  const lockedLabel = (label: string) =>
    lockedByAggregation ? `${translate(label)} (${translate('disabled.due.to.aggregation.security')})` : translate(label);
  const whenRestricted = {
    visible: ({ rawValues }) => !!rawValues.apikeyCustomization?.restrictions?.enabled,
    deps: ['apikeyCustomization.restrictions.enabled'],
  };

  return {
    schema: {
      otoroshiSettings: {
        type: type.string,
        format: format.select,
        disabled: !!plan.otoroshiTarget?.otoroshiSettings,
        label: translate('Otoroshi instances'),
        options: otoroshis,
        transformer: (s: ISimpleOtoroshiSettings) => ({ label: s.url, value: s._id }),
      },
      authorizedEntities: {
        type: type.object,
        visible: ({ rawValues }) => !!rawValues.otoroshiSettings,
        deps: ['otoroshiSettings'],
        render: (p) =>
          OtoroshiEntitiesSelector({
            rawValues: p.rawValues ?? {},
            onChange: (item) => p.onChange?.(item),
            translate,
            ownerTeam,
          }),
        label: translate('Authorized entities'),
        placeholder: translate('Authorized.entities.placeholder'),
        help: translate('authorized.entities.help'),
      },
      apikeyCustomization: {
        type: type.object,
        format: format.form,
        label: null,
        schema: {
          clientIdOnly: {
            type: type.bool,
            label: () => lockedLabel('Apikey with clientId only'),
            disabled: () => lockedByAggregation,
          },
          readOnly: {
            type: type.bool,
            label: () => lockedLabel('Read only apikey'),
            disabled: () => lockedByAggregation,
          },
          constrainedServicesOnly: {
            type: type.bool,
            label: translate('Constrained services only'),
          },
          metadata: {
            type: type.object,
            label: translate('Automatic API key metadata'),
            help: translate('automatic.metadata.help'),
            constraints: [
              constraints.test('no-dot-in-metadata', translate('constraints.test.no.dot.in.metadata.key'), (metadata) =>
                Object.keys(metadata || {}).every((key) => !key.includes('.'))
              ),
            ],
          },
          customMetadata: {
            type: type.object,
            array: true,
            label: translate('Custom Apikey metadata'),
            defaultValue: [],
            render: (props) => <CustomMetadataInput {...props} translate={translate} />,
            help: translate('custom.metadata.help'),
            arrayConstraints: [
              constraints.test('no-dot-in-metadata', translate('constraints.test.no.dot.in.metadata.key'), (metadata) =>
                metadata.every(({ key }) => !key.includes('.'))
              ),
            ],
          },
          tags: {
            type: type.string,
            array: true,
            label: translate('Apikey tags'),
          },
          restrictions: {
            type: type.object,
            format: format.form,
            label: 'Restrictions',
            schema: {
              enabled: { type: type.bool, label: translate('Enable restrictions') },
              allowLast: {
                type: type.bool,
                label: translate('Allow at last'),
                help: translate('allow.least.help'),
                ...whenRestricted,
              },
              allowed: { label: translate('Allowed pathes'), ...pathsSchema(translate), ...whenRestricted },
              forbidden: { label: translate('Forbidden pathes'), ...pathsSchema(translate), ...whenRestricted },
              notFound: { label: translate('Not found pathes'), ...pathsSchema(translate), ...whenRestricted },
            },
          },
        },
      },
    },
    flow: [
      'otoroshiSettings',
      'authorizedEntities',
      { label: translate('api.editor.section.advanced'), collapsed: true, flow: ['apikeyCustomization'] },
    ],
  };
};

export const generalSchema = (
  translate: Translate,
  tenant: ITenant,
  api: IApi,
  ownerTeam: ITeamSimple,
  availableEnvs: Array<string>,
  confirm: (props: { message: string }) => Promise<boolean>
): { schema: Schema; flow: Flow } => {
  const byEnvironment = tenant.display === 'environment' && api.visibility !== 'AdminOnly';
  const toggleLabels = { trueLabel: translate('Enabled'), falseLabel: translate('Disabled') };

  return {
    schema: {
      visibility: {
        type: type.string,
        label: null,
        render: ({ value, onChange }) => (
          <ChoiceChips
            label={translate('Visibility')}
            options={[
              { label: translate('Public'), value: 'Public' },
              { label: translate('Private'), value: 'Private' },
            ]}
            value={value}
            onChange={(visibility) => onChange?.(visibility)}
          />
        ),
      },
      authorizedTeams: {
        type: type.string,
        format: format.select,
        isMulti: true,
        defaultValue: [],
        visible: ({ rawValues }) => rawValues.visibility !== 'Public',
        deps: ['visibility'],
        label: translate('Authorized teams'),
        optionsFrom: () => Services.teams(ownerTeam).then((r) => (isError(r) ? [] : r)),
        transformer: (t: ITeamSimple) => ({ label: t.name, value: t._id }),
      },
      customName: byEnvironment
        ? {
            type: type.string,
            format: format.select,
            label: translate('Name'),
            placeholder: translate('Plan name'),
            options: availableEnvs,
            constraints: [
              constraints.oneOf(tenant.environments, translate('constraints.plan.custom-name.one-of.environment')),
              constraints.required(translate('constraints.required.value')),
            ],
          }
        : {
            type: type.string,
            label: translate('Name'),
            placeholder: translate('Plan name'),
            constraints: [constraints.required(translate('constraints.required.value'))],
          },
      customDescription: {
        type: type.string,
        format: format.text,
        label: translate('Description'),
        placeholder: translate('Plan description'),
      },
      metadata: {
        type: type.object,
        label: translate('Metadata'),
      },
      autoRotation: {
        type: type.bool,
        label: translate('Force apikey auto-rotation'),
      },
      aggregationApiKeysSecurity: {
        type: type.bool,
        format: format.buttonsSelect,
        visible: !!tenant.aggregationApiKeysSecurity,
        label: translate('aggregation api keys security'),
        help: translate('aggregation_apikeys.security.help'),
        onChange: ({ value }) => {
          if (value) {
            confirm({ message: translate('aggregation.api_key.security.notification') });
          }
        },
        props: toggleLabels,
      },
      allowMultipleKeys: {
        type: type.bool,
        format: format.buttonsSelect,
        label: translate('Allow multiple apiKey demands'),
        props: toggleLabels,
      },
      integrationProcess: {
        type: type.string,
        format: format.buttonsSelect,
        label: translate('Integration'),
        options: [
          { label: translate('Automatic'), value: 'Automatic' },
          { label: translate('ApiKey'), value: 'ApiKey' },
        ],
      },
    },
    flow: [
      'visibility',
      'authorizedTeams',
      { label: translate('api.editor.section.identity'), collapsed: false, flow: ['customName', 'customDescription'] },
      { label: translate('Metadata'), collapsed: false, flow: ['metadata'] },
      {
        label: translate('api.editor.section.security'),
        collapsed: false,
        flow: [
          'autoRotation',
          {
            label: translate('api.editor.section.advanced'),
            collapsed: true,
            flow: ['aggregationApiKeysSecurity', 'allowMultipleKeys', 'integrationProcess'],
          },
        ],
      },
    ],
  };
};
