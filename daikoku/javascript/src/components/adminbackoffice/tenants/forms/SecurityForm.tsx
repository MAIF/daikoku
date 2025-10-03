import { useContext } from 'react';
import { constraints, Form, Schema, type, format } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';

import { I18nContext } from '../../../../contexts';
import { Display, ITeamFullGql, ITenant, ITenantFull, IValidationStep } from '../../../../types';
import { ModalContext } from '../../../../contexts';
import { SubscriptionProcessEditor } from '../../../backoffice/apis/SubscriptionProcessEditor';
import { GlobalContext } from '../../../../contexts/globalContext';
import { nanoid } from 'nanoid';

export const SecurityForm = (props: {
  tenant: ITenantFull;
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>;
}) => {
  const { translate } = useContext(I18nContext);
  const { alert, openRightPanel } = useContext(ModalContext);
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
      },{
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

  return (
    <div>
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
      {tenant.authProvider === 'Local' && <button className='btn btn-outline-success' onClick={() => editProcess()}>{translate("tenant.security.account.creation.process.button.label")}</button>}
    </div>
  );

};
