import { constraints, format, Schema, type } from '@maif/react-forms';
import { UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { nanoid } from 'nanoid';
import { useContext, useEffect } from 'react';

import { I18nContext, ModalContext } from '../../../../contexts';
import { ITenantFull, IThirdPartyPaymentSettings, ThirdPartyPaymentType } from '../../../../types';
import { clientFetchData, DynamicTable, DynamicTableFeatures } from '../../../inputs';
import { Can, manage, tenant as TENANT } from '../../../utils';
import { Edit, Trash2 } from "lucide-react";

export const ThirdPartyPaymentForm = (props: { tenant: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext);
  const { openFormModal, confirm } = useContext(ModalContext);

  const queryClient = useQueryClient();

  const queryKey = ['third-party-payment-settings', props.tenant._id];

  // The rows come straight from the tenant prop, so the table has to be told
  // when that prop changes — nothing else would invalidate its cached page.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey })
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

  const columnHelper = createColumnHelper<DynamicTableFeatures, IThirdPartyPaymentSettings>();
  const columns = [
    columnHelper.accessor("name", {
      meta: { title: translate('Name'), size: 20 },
    }),
    columnHelper.accessor("type", {
      meta: { title: translate('Type'), size: 20 },
    }),
    columnHelper.display({
      id: 'actions',
      meta: { title: translate('Actions'), size: 8, className: 'action-cell' },
      cell: (info) => {
        const settings = info.row.original;
        return (
          <div className='d-flex justify-content-end gap-1'>
            <button
              type="button"
              className="btn --secondary --small --icon-only"
              title={translate('Edit')}
              onClick={() => editSettings(settings.type, settings)}
            >
              <Edit />
            </button>
            <button
              type="button"
              className="btn --secondary --small --icon-only"
              title={translate('Delete')}
              onClick={() => deleteSettings(settings)}
            >
              <Trash2 />
            </button>
          </div>
        );
      },
    }),
  ];

  const fetchData = clientFetchData<IThirdPartyPaymentSettings>(
    () => props.tenant.thirdPartyPaymentSettings
  );

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
    const thirdPartyPaymentSettings = props.tenant.thirdPartyPaymentSettings.filter(s => s._id !== paymentSetttings._id);

    confirm({
      message: translate('third-party.payment.settings.delete.confirm.message'),
      okLabel: translate('Delete')
    }).then((ok) => {
      if (ok) {
        props.updateTenant.mutateAsync({ ...props.tenant, thirdPartyPaymentSettings })
          .then(() => queryClient.invalidateQueries({ queryKey: ['full-tenant'] }))
          .then(() => queryClient.invalidateQueries({ queryKey }))
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
          .then(() => queryClient.invalidateQueries({ queryKey: ['full-tenant'] }))
          .then(() => queryClient.invalidateQueries({ queryKey }))
      },
      actionLabel: paymentSetttings ? translate('Update') : translate('Create')
    })
  }

  const beforeCreationSchema: Schema = {
    type: {
      type: type.string,
      format: format.buttonsSelect,
      options: ['Stripe'],
      label: translate('third-party.payment.settings.type.select.message'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    }
  }


  return (
    <Can I={manage} a={TENANT} dispatchError>
      <div>
        <button
          type="button"
          className="btn --primary m-1"
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
        <DynamicTable<IThirdPartyPaymentSettings>
          queryKey={queryKey}
          columns={columns}
          fetchData={fetchData}
          defaultSorting={[{ id: 'name', desc: false }]}
          getRowId={row => row._id}
          getRowAriaLabel={row => row.name}
        />
      </div>
    </Can>
  )


}
