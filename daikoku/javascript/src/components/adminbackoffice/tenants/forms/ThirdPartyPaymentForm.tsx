import { constraints, format, Schema, type } from '@maif/react-forms';
import { UseMutationResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';

import { ModalContext } from '../../../../contexts';
import { I18nContext } from '../../../../core';
import { ITenantFull, IThirdPartyPaymentSettings, ThirdPartyPaymentType } from '../../../../types';
import { Table, TableRef } from '../../../inputs/Table';
import { Can, manage, tenant as TENANT } from '../../../utils';
import { deleteOtoroshiSettings } from '../../../../services';

export const ThirdPartyPaymentForm = (props: { tenant: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const table = useRef<TableRef>();

  const { translate } = useContext(I18nContext);
  const { openFormModal, confirm } = useContext(ModalContext);

  const queryClient = useQueryClient();

  useEffect(() => {
    //todo: refactor this
    table.current?.update()
  }, [props.tenant.thirdPartyPaymentSettings])



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
    columnHelper.accessor("type", {
      header: translate('Type'),
    }),
    columnHelper.display({
      header: translate('Actions'),
      meta: { style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const settings = info.row.original;
        return (
          <div >
            <button
              type="button"
              className="btn btn-outline-primary me-1"
              title={translate('Edit')}
              onClick={() => editSettings(settings.type, settings)}
            >
              <i className="fas fa-edit" />
            </button>
            <button
              type="button"
              className="btn btn-outline-danger"
              title={translate('Delete')}
              onClick={() => deleteSettings(settings)}
            >
              <i className="fas fa-trash" />
            </button>
          </div>
        );
      },
    }),
  ];

  const getSettingsSchema = (paymentType: ThirdPartyPaymentType): Schema => {
    switch (paymentType) {
      case ThirdPartyPaymentType.stripe:
        return ({
          name: {
            type: type.string,
            label: translate('Name'),
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

  const deleteSettings = (paymentSetttings: IThirdPartyPaymentSettings) => {
    const thirdPartyPaymentSettings = [...props.tenant.thirdPartyPaymentSettings.filter(s => s._id !== paymentSetttings._id)];

    confirm({
      message: translate('third-party.payment.settings.delete.confirm.message'),
      okLabel: translate('Delete')
    }).then((ok) => {
      if (ok) {
        props.updateTenant.mutateAsync({ ...props.tenant, thirdPartyPaymentSettings })
          .then(() => queryClient.invalidateQueries(['full-tenant']))
          .then(() => table.current?.update())
      }
    })
  }

  const editSettings = (paymentType: ThirdPartyPaymentType, paymentSetttings?: IThirdPartyPaymentSettings) => {
    const schema = getSettingsSchema(paymentType);

    openFormModal<IThirdPartyPaymentSettings>({
      title: translate('Creation'),
      schema: schema,
      value: paymentSetttings,
      onSubmit: (data) => {
        const thirdPartyPaymentSettings = !paymentSetttings ?
          [
            ...props.tenant.thirdPartyPaymentSettings,
            { ...data, type: paymentType, _id: nanoid(32) }
          ] :
          [
            ...props.tenant.thirdPartyPaymentSettings.filter(s => s._id !== data._id),
            data
          ];

        props.updateTenant.mutateAsync({
          ...props.tenant,
          thirdPartyPaymentSettings
        })
          .then(() => queryClient.invalidateQueries(['full-tenant']))
          .then(() => table.current?.update())
      },
      actionLabel: !!paymentSetttings ? translate('Update') : translate('Create')
    })
  }

  const beforeCreationSchema: Schema = {
    type: {
      type: type.string,
      format: format.buttonsSelect,
      options: ['Stripe'],
      label: translate('third-party.payment.settings.type.select.message')
    }
  }


  return (
    <Can I={manage} a={TENANT} dispatchError>
      <div>
        <button
          type="button"
          className="btn btn-sm btn-outline-success mb-1 ms-1"
          title={translate('third-party.payment.list.add.label')}
          onClick={() => {
            openFormModal({
              title: translate('third-party.payment.list.add.label'), //todo ?
              schema: beforeCreationSchema,
              onSubmit: (data: { type: ThirdPartyPaymentType }) => editSettings(data.type),
              actionLabel: translate('Next'),
              noClose: true
            })
          }}
        >
          {translate('third-party.payment.list.add.label')}
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