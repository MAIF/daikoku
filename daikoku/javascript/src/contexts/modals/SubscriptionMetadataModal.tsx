import { constraints, Form, format, FormRef, type } from '@maif/react-forms';
import sortBy from 'lodash/sortBy';
import { useContext, useRef } from 'react';

import { useQuery } from '@tanstack/react-query';
import { formatPlanType, Option, Spinner } from '../../components/utils';
import { I18nContext } from '../../core';
import * as Services from '../../services';
import { IApi, isError, ITesting, ITestingConfig, IUsagePlan, IWithTesting } from '../../types';
import { IBaseModalProps, SubscriptionMetadataModalProps } from './types';

export type OverwriteSubscriptionData = {
  metadata: { [key: string]: string },
  customMetadata: { [key: string]: string },
  customQuotas: {
    customMaxPerSecond: number,
    customMaxPerDay: number,
    customMaxPerMonth: number,
  },
  customReadOnly: boolean
}

export type CustomSubscriptionData = {
  customMetadata: { [key: string]: string },
  customMaxPerSecond: number,
  customMaxPerDay: number,
  customMaxPerMonth: number,
  customReadOnly: boolean,
  adminCustomName: string
}

export const SubscriptionMetadataModal = <T extends IWithTesting>(props: SubscriptionMetadataModalProps<T> & IBaseModalProps) => {

  const { translate, Translation } = useContext(I18nContext);

  const formRef = useRef<FormRef>()


  const apiQuery = useQuery({
    queryKey: ['api'],
    queryFn: () => Services.getVisibleApiWithId(props.api!),
    enabled: !!props.api
  })
  const planQuery = useQuery({
    queryKey: ['plan'],
    queryFn: () => {
      const api = apiQuery.data as IApi
      return Services.getVisiblePlan(api._humanReadableId, api.currentVersion, props.plan!)
    },
    enabled: !!props.plan && !!apiQuery.data && !isError(apiQuery.data)
  })

  const actionAndClose = (formData) => {
    const subProps: CustomSubscriptionData = {
      customMetadata: {
        ...formData.customMetadata,
        ...formData.metadata,
      },
      customMaxPerSecond: formData.customQuotas.customMaxPerSecond,
      customMaxPerDay: formData.customQuotas.customMaxPerDay,
      customMaxPerMonth: formData.customQuotas.customMaxPerMonth,
      customReadOnly: formData.customReadOnly,
      adminCustomName: formData.adminCustomName
    };

    const res = props.save(subProps)
    if (res instanceof Promise) {
      res.then(() => !props.noClose && props.close());
    } else if (!props.noClose) {
      props.close();
    }
  };

  const schema = {
    customMetadata: {
      type: type.object,
      label: translate('Additional metadata'),
    },
    customQuotas: {
      type: type.object,
      format: format.form,
      label: translate('Custom quotas'),
      schema: {
        customMaxPerSecond: {
          type: type.number,
          label: translate('Max. requests per second'),
          constraints: [
            constraints.min(0, translate('constraints.min.0')) //todo: translate
          ]
        },
        customMaxPerDay: {
          type: type.number,
          label: translate('Max. requests per day'),
          constraints: [
            constraints.min(0, translate('constraints.min.0')) //todo: translate
          ]
        },
        customMaxPerMonth: {
          type: type.number,
          label: translate('Max. requests per month'),
          constraints: [
            constraints.min(0, translate('constraints.min.0')) //todo: translate
          ]
        },
      }
    },
    customReadOnly: {
      type: type.bool,
      label: translate('Read only apikey')
    },
    adminCustomName: {
      type: type.string,
      label: translate('sub.meta.modal.admin.custom.name.label'),
      help: translate('sub.meta.modal.admin.custom.name.help'),
    }
  }

  const mandatoryMetdataSchema = (plan: IUsagePlan) => ({
    metadata: {
      type: type.object,
      format: format.form,
      visible: !!plan,
      label: translate({ key: 'mandatory.metadata.label', replacements: [plan?.otoroshiTarget?.apikeyCustomization.customMetadata.length.toString() || ''] }),
      schema: sortBy(plan?.otoroshiTarget?.apikeyCustomization.customMetadata, ['key'])
        .map((meta: { key: string, possibleValues: Array<string> }) => {
          return {
            key: meta.key,
            schemaEntry: {
              type: type.string,
              format: format.select,
              createOption: true,
              options: meta.possibleValues,
              constraints: [
                constraints.required(translate('constraints.required.value'))
              ]
            }
          }
        })
        .reduce((acc, curr) => {
          return { ...acc, [curr.key]: curr.schemaEntry }
        }, {}),
    },
  })


  if (!!props.api && apiQuery.isLoading || props.plan && planQuery.isLoading) {
    return <div className="modal-content"><Spinner /></div>
  } else if (!props.api && planQuery.data || (apiQuery.data && !isError(apiQuery.data))) {
    const plan = !!props.plan ? !isError(planQuery.data) ? planQuery.data : undefined : undefined

    const maybeSubMetadata = Option(props.subscription)
      .orElse(props.config)
      .map((s: ITestingConfig) => s.customMetadata)
      .map((v: object) => Object.entries(v))
      .getOrElse([]);


    const [maybeMetadata, maybeCustomMetadata] = maybeSubMetadata.reduce(
      ([accMeta, accCustomMeta]: any, item: any) => {
        if (plan && plan.otoroshiTarget?.apikeyCustomization.customMetadata.some((x: any) => x.key === item[0])) {
          return [[...accMeta, item], accCustomMeta];
        }
        return [accMeta, [...accCustomMeta, item]];
      },
      [[], []]
    );

    const value = {
      metadata: Object.fromEntries(maybeMetadata),
      customMetadata: Object.fromEntries(maybeCustomMetadata),
      customQuotas: {
        customMaxPerSecond: Option(props.subscription)
          .orElse(props.config)
          .map((s: any) => s.customMaxPerSecond)
          .getOrNull(),
        customMaxPerDay: Option(props.subscription)
          .orElse(props.config)
          .map((s: any) => s.customMaxPerDay)
          .getOrNull(),
        customMaxPerMonth: Option(props.subscription)
          .orElse(props.config)
          .map((s: any) => s.customMaxPerMonth)
          .getOrNull(),
      },
      customReadOnly: Option(props.subscription)
        .orElse(props.config)
        .map((s: any) => s.customReadOnly)
        .getOrNull(),
      adminCustomName: Option(props.subscription)
        .orElse(props.config)
        .map((s: any) => s.adminCustomName)
        .getOrNull()
    }




    return (<div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">
          <Translation i18nkey="Subscription metadata">Subscription metadata</Translation>
        </h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
      </div>
      <div className="modal-body">
        <>
          {/* {!!plan && !props.description && props.creationMode && (<div className="modal-description">
            <Translation i18nkey="subscription.metadata.modal.creation.description" replacements={[

              props.team?.name,
              plan.customName || formatPlanType(plan, translate),
            ]}>
              {props.team?.name} ask you an apikey for plan{' '}
              {plan.customName || formatPlanType(plan, translate)}
            </Translation>
          </div>)}
          {!!plan && !props.description && !props.creationMode && (<div className="modal-description">
            <Translation i18nkey="subscription.metadata.modal.update.description" replacements={[
              props.team?.name,
              plan.customName || formatPlanType(plan, translate),
            ]}>
              Team: {props.team?.name} - Plan:{' '}
              {plan.customName || formatPlanType(plan, translate)}
            </Translation>
          </div>)} */}
          {props.description && <div className="modal-description">{props.description}</div>}

        </>
        <Form
          schema={{...schema, ...(props.api ? mandatoryMetdataSchema : {})}}
          onSubmit={actionAndClose}
          ref={formRef}
          value={value}
          footer={() => <></>}
          className='mb-1'
        />

        <div className="modal-footer">
          <button type="button" className="btn btn-outline-danger" onClick={props.close}>
            <Translation i18nkey="Cancel">Cancel</Translation>
          </button>
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={() => formRef.current?.handleSubmit()}>
            {props.creationMode ? translate('Accept') : translate('Update')}
          </button>
        </div>
      </div>
    </div>);
  } else {
    return <div>Error while fetching metadata</div>
  }

};
