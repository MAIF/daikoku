import { constraints, format, Schema, type } from '@maif/react-forms';
import { UseMutationResult } from '@tanstack/react-query';
import { useContext, useRef } from 'react';

import { createColumnHelper } from '@tanstack/react-table';
import { I18nContext, updateTenant } from '../../../../core';
import { ITenantFull, IThirdPartyPaymentSettings, ThirdPartyPaymentType } from '../../../../types';
import { Table, TableRef } from '../../../inputs/Table';
import { Can, manage, tenant as TENANT } from '../../../utils';
import { ModalContext } from '../../../../contexts';
import { nanoid } from 'nanoid';

export const ThirdPartyPaymentForm = (props: { tenant: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const table = useRef<TableRef>()

  const { translate } = useContext(I18nContext)
  const { openFormModal } = useContext(ModalContext);

  // const steps: Array<IMultistepsformStep<IThirdPartyPaymentSettings>> = [{
  //   id: 'name',
  //   label: translate('Third-Party payment provider'),
  //   schema: {
  //     name: {
  //       type: type.string,
  //       format: format.buttonsSelect,
  //       label: translate('Third-Party payment provider'),
  //       options: [
  //         { label: 'Stripe', value: 'Stripe' }
  //       ],
  //       constraints: [
  //         constraints.required()
  //       ]
  //     }
  //   },
  // }, {
  //   id: 'settings',
  //   label: translate('Settings'),
  //   flow: (data) => {
  //     switch (data.type) {
  //       case 'Stripe':
  //         return ['publicKey', 'secretKey'];
  //     }
  //   },
  //   schema: (data) => {
  //     switch (data?.name) {
  //       default:
  //         return {
  //           publicKey: {
  //             type: type.string,
  //             label: translate('public apikey'),
  //           },
  //           secretKey: {
  //             type: type.string,
  //             label: translate('secret apikey'),
  //           },
  //         }
  //     }
  //   }
  // }]

  const columnHelper = createColumnHelper<IThirdPartyPaymentSettings>();
  const columns = [
    columnHelper.accessor("name", {
      header: translate('Name'),
    }),
    // columnHelper.accessor("type", {
    //   header: translate('Type'),
    // }),
    // columnHelper.display({
    //   header: translate('Actions'),
    //   meta: { style: { textAlign: 'center', width: '120px' } },
    //   enableColumnFilter: false,
    //   enableSorting: false,
    //   cell: (info) => {
    //     const settings = info.row.original;
    //     return (
    //       <div >
    //         <button
    //           type="button"
    //           className="btn btn-outline-primary me-1"
    //           title={translate('Edit this settings')}
    //           onClick={() => console.debug(`Editing ${settings.name}`)}
    //         >
    //           <i className="fas fa-edit" />
    //         </button>
    //         <button
    //           type="button"
    //           className="btn btn-outline-danger"
    //           title={translate('Delete this settings')}
    //           onClick={() => console.debug(`Deleting third party settings ${settings.name}`)}
    //         >
    //           <i className="fas fa-trash" />
    //         </button>
    //       </div>
    //     );
    //   },
    // }),
  ];

  const getSettingsSchema = (paymentType: ThirdPartyPaymentType): Schema => {
    switch (paymentType) {
      case ThirdPartyPaymentType.stripe:
        return ({
          name: {
            type: type.string,
            label: translate('Name'),
            defaultValue: 'New Stripe settings',
            constraints: [
              constraints.required()
            ]
          },
          publicKey: {
            type: type.string,
            label: translate('Public key'),
            constraints: [
              constraints.required()
            ]
          },
          secretKey: {
            type: type.string,
            label: translate('Secret Key'),
            constraints: [
              constraints.required()
            ]
          }
        })
    }
  }

  const createNewSettings = (paymentType: ThirdPartyPaymentType) => {
    const schema = getSettingsSchema(paymentType);

    openFormModal<IThirdPartyPaymentSettings>({
      title: 'creation',
      schema: schema,
      onSubmit: (data) => props.updateTenant.mutateAsync({
        ...props.tenant, 
        thirdPartyPaymentSettings: [
          ...props.tenant.thirdPartyPaymentSettings, 
          {...data, type: paymentType, _id: nanoid(32)}]}),
      actionLabel: 'Create'
    })
  }

  const beforeCreationSchema: Schema = {
    type: {
      type: type.string,
      format: format.buttonsSelect,
      options: ['Stripe'],
      label: 'Quel type de third-party paiement ?'
    }
  }


  return (
    <Can I={manage} a={TENANT} dispatchError>
      <div>
        <button
          type="button"
          className="btn btn-sm btn-outline-success mb-1 ms-1"
          title={translate('otoroshi.list.add.label')}
          onClick={() => {
            openFormModal({
              title: 'titre',
              schema: beforeCreationSchema,
              onSubmit: (data: {type: ThirdPartyPaymentType}) => createNewSettings(data.type),
              actionLabel: 'Next',
              noClose: true
            })
          }}
        >
          {translate('otoroshi.list.add.label')}
        </button>
        <div className="section p-2"></div>
        <Table
          defaultSort="Url"
          columns={columns}
          fetchItems={() => props.tenant.thirdPartyPaymentSettings}
          ref={table}
        />
      </div>
    </Can>
  )


}