import { constraints, Form, format, Schema, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { useContext } from 'react';

import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { Display, IOtoroshiSettings, isError, ISimpleOtoroshiSettings, ITeamFullGql, ITenant, ITenantFull, IValidationStep } from '../../../../types';
import { SubscriptionProcessEditor } from '../../../backoffice/apis/SubscriptionProcessEditor';
import { Spinner } from '../../../utils';
import { OtoroshiEntitiesSelector } from '../../teams/TeamList';
import { toast } from 'sonner';

export const SecurityForm = (props: {
  tenant: ITenantFull;
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>;
}) => {
  const { translate } = useContext(I18nContext);
  const { alert, openRightPanel, openFormModal } = useContext(ModalContext);
  const { customGraphQLClient, tenant } = useContext(GlobalContext);

  const teamQuery = useQuery({
    queryKey: ["admin-team"],
    queryFn: () => {
      return customGraphQLClient.request<{ teamsPagination: { teams: Array<ITeamFullGql>, total: number } }>(
        `query getAllteams ($research: String, $limit: Int, $offset: Int) {
          teamsPagination (research: $research, limit: $limit, offset: $offset){
            teams {
              _id
              type
            }
            total
          }
        }`,
        {
          research: "admin-team",
          limit: 1,
          offset: 0
        })
    },
    select: data => data.teamsPagination.teams[0]
  })

  const otoroshiQuery = useQuery({
    queryKey: ["all-otoroshis"],
    queryFn: () => Services.allSimpleOtoroshis(tenant._id)
  })

  const schema: Schema = {
    isPrivate: {
      type: type.bool,
      label: translate('Private tenant'),
    },
    creationSecurity: {
      type: type.bool,
      label: translate('API creation security'),
      help: translate('creation.security.help'),
    },
    subscriptionSecurity: {
      type: type.bool,
      label: translate('subscription security'),
      help: translate('subscription.security.help'),
    },
    aggregationApiKeysSecurity: {
      type: type.bool,
      label: translate('aggregation api keys security'),
      onChange: (value) => {
        const security = (value as { value: any }).value;
        if (security) {
          alert({
            message: translate('aggregation.api_key.security.notification'),
          });
        }
      },
    },
    environmentAggregationApiKeysSecurity: {
      type: type.bool,
      label: translate('aggregation api keys security for environment mode'),
      help: translate('aggregation.environment.api_key.security.notification'),
      deps: ['aggregationApiKeysSecurity'],
      visible: ({ rawValues }) => rawValues.aggregationApiKeysSecurity && rawValues.display === Display.environment
    },
    apiReferenceHideForGuest: {
      type: type.bool,
      label: translate('API reference visibility'),
      help: translate('api.reference.visibility.help'),
    }
  }

  const AccountCreationProcessDocumentation = (props: { close: () => void, updateProcess: (process: IValidationStep[]) => void }) => {
    const defaultWorkflow: IValidationStep[] = [
      {
        id: nanoid(32),
        type: 'form',
        title: 'form',
        schema: {
          name: {
            type: type.string,
            label: "Name",
            constraints: [{
              "type": "required",
              "message": "Your name is required"
            }]
          },
          email: {
            type: type.string,
            label: "Email",
            constraints: [{
              "type": "required",
              "message": "Your email is required"
            }, {
              "type": "email",
              "message": "Your email needs to be an email"
            }]
          },
          password: {
            type: type.string,
            format: format.password,
            label: "Password",
            constraints: [{
              "type": "required",
              "message": "Your password is required"
            }, {
              "type": "matches", //@ts-ignore
              "regexp": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$",
              "message": translate('constraints.matches.password')
            }]
          },
          confirmPassword: {
            type: type.string,
            format: format.password,
            label: "Confirm password",
            constraints: [
              {
                "type": "required",
                "message": "a confirm password is required"
              },
              {
                "type": "oneOf", //@ts-ignore
                "arrayOfValues": [
                  {
                    "ref": "password"
                  }
                ],
                "message": "confirm password and password must be equal"
              }
            ]
          },
        },
        formatter: ''
      }, {
        id: nanoid(32),
        type: 'email',
        title: 'confirmation email',
        emails: ["${form.email}"],
        message: ""
      },
    ];

    const defaultWorkflowWithAdmin: IValidationStep[] = [...defaultWorkflow, {
      type: 'teamAdmin',
      id: nanoid(),
      title: 'admin validation',
      team: teamQuery.data?._id!
    }];

    return (
      <div className="alert alert-info" role="alert">
        <div className="d-flex justify-content-between">
          <h5 className="alert-heading">{translate('tenant.security.account.creation.process.doc.title')}</h5>
          <button type='button' aria-label={translate('tenant.security.account.creation.process.doc.close.aria')} className='btn-close' onClick={props.close} />
        </div>
        <p>
          {translate('tenant.security.account.creation.process.doc.intro')}
        </p>
        <ul>
          <li>
            <strong>{translate('subscription.process.form')}</strong> : {translate('tenant.security.account.creation.process.doc.step.form')}
          </li>
          <li>
            <strong>{translate('subscription.process.email')}</strong> : {translate('tenant.security.account.creation.process.doc.step.email')}
          </li>
          <li>
            <strong>{translate('subscription.process.httpRequest')}</strong> : {translate('tenant.security.account.creation.process.doc.step.http')}
          </li>
          <li>
            <strong>{translate('subscription.process.team.admin')}</strong> : {translate('tenant.security.account.creation.process.doc.step.admin')}
          </li>
        </ul>
        <hr />
        <div className="mb-0">
          {translate('tenant.security.account.creation.process.doc.footer')}
          <div className='d-flex flex-start gap-2'>
            <button className="btn btn-outline-info" onClick={() => props.updateProcess(defaultWorkflow)}>{translate('tenant.security.account.creation.process.doc.default.workflow')}</button>
            <button className="btn btn-outline-info" onClick={() => props.updateProcess(defaultWorkflowWithAdmin)}>{translate('tenant.security.account.creation.process.doc.default.workflow.admin')}</button>
          </div>
        </div>
      </div>
    )
  }

  const _tenant = props.tenant
  const editProcess = () => {
    openRightPanel({
      title: translate("tenant.security.account.creation.process.panel.title"),
      content: <SubscriptionProcessEditor
        save={accountCreationProcess => props.updateTenant.mutateAsync({ ..._tenant, accountCreationProcess })}
        process={props.tenant?.accountCreationProcess ?? []}
        team={teamQuery.data?._id!}
        tenant={props.tenant as ITenant}
        documentation={AccountCreationProcessDocumentation}
      />
    })
  }

  const openModalForDispatchingAction = () => openFormModal({
    title: translate("tenant.security.dispatch.default.auth.entities.modal.title"),
    schema: {
      choice: {
        type: type.string,
        format: format.buttonsSelect,
        label: translate("tenant.security.dispatch.default.auth.entities.choice.label"),
        options: [
          {
            label: translate("tenant.security.dispatch.default.auth.entities.choice.nothing"),
            value: "nothing"
          },
          {
            label: translate("tenant.security.dispatch.default.auth.entities.choice.replace"),
            value: "replace"
          },
          {
            label: translate("tenant.security.dispatch.default.auth.entities.choice.merge"),
            value: "merge"
          },
        ]
      }
    },
    onSubmit: (data) => {
      if (data.choice !== "nothing") {
        Services.dispatchDefaultAuthEntities(tenant, data.choice)
          .then(() => toast.success(translate('tenant.security.dispatch.default.auth.entities.successful')))
      }
    },
    actionLabel: translate('Ok')
  })
  const openModal = (otoroshis: ISimpleOtoroshiSettings[]) => {
    openFormModal({
      title: translate('tenant.security.configure.default.auth.otoroshi.entities.button.label'),
      schema: {
        authorizedOtoroshiEntities: {
          type: type.object,
          array: true,
          label: translate('Authorized entities'),
          format: format.form,
          schema: {
            otoroshiSettingsId: {
              type: type.string,
              format: format.select,
              label: translate('Otoroshi instance'),
              options: otoroshis,
              transformer: (s: IOtoroshiSettings) => ({
                label: s.url,
                value: s._id
              }),
              constraints: [
                constraints.required(translate('constraints.required.value'))
              ]
            },
            authorizedEntities: {
              type: type.object,
              visible: (props) => {
                return !!props.rawValues.authorizedOtoroshiEntities[props.informations?.parent?.index || 0].value.otoroshiSettingsId
              },
              deps: ['authorizedOtoroshiEntities.otoroshiSettingsId'],
              render: (props) => OtoroshiEntitiesSelector({ ...props, translate, targetKey: "authorizedOtoroshiEntities", teamId: teamQuery.data?._id! }),
              label: translate('Authorized entities'),
              placeholder: translate('Authorized.entities.placeholder'),
              help: translate('authorized.entities.help'),
              defaultValue: { routes: [], services: [], groups: [] }
            },
          }
        }
      },
      onSubmit: (data) => props.updateTenant.mutateAsync({ ...props.tenant, defaultAuthorizedOtoroshiEntities: data.authorizedOtoroshiEntities })
        .then(() => openModalForDispatchingAction()),
      value: { authorizedOtoroshiEntities: props.tenant.defaultAuthorizedOtoroshiEntities },
      moreAction: <button
        className='btn btn-outline-danger'
        onClick={() => props.updateTenant.mutateAsync({ ...props.tenant, defaultAuthorizedOtoroshiEntities: undefined })
          .then(() => openModalForDispatchingAction())}>
        {translate('tenant.security.clear.default.auth.otoroshi.entities.button.label')}
      </button>,
      actionLabel: translate('Save')
    })
  }

  if (otoroshiQuery.isLoading) {
    return <Spinner />
  } else if (!!otoroshiQuery.data && !isError(otoroshiQuery.data)) {
    const otoroshis = otoroshiQuery.data;
    return (
      <div className='d-flex flex-column gap-2'>
        <Form
          schema={schema}
          onSubmit={(updatedTenant) =>
            props.updateTenant.mutateAsync(updatedTenant)
          }
          value={props.tenant}
          options={{
            actions: {
              submit: { label: translate('Save') },
            },
          }}
        />
        <div>
          {tenant.authProvider === 'Local' && <button className='btn btn-outline-success' onClick={() => editProcess()}>{translate("tenant.security.account.creation.process.button.label")}</button>}
        </div>
        <div>
          <button onClick={() => openModal(otoroshis)} className='btn btn-outline-success'>{translate('tenant.security.configure.default.auth.otoroshi.entities.button.label')}</button>
        </div>
      </div>
    );
  } else {
    return (
      <div>An error occured during otoroshi list fetching</div>
    )
  }


};
