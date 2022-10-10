import { getApolloContext, gql } from '@apollo/client';
import { Flow, Form, format, FormRef, Schema, SchemaEntry, type } from '@maif/react-forms';
import { useContext, useRef } from 'react';
import { UseMutationResult, useQuery } from 'react-query';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { openSaveOrCancelModal } from '../../../../core';
import { I18nContext } from '../../../../locales/i18n-context';
import { ITenantFull } from '../../../../types';
import { AssetChooserByModal, MimeTypeFilter } from '../../../frontend/modals/AssetsChooserModal';


export const CustomizationForm = ({ tenant, updateTenant }: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {

  const { translate } = useContext(I18nContext)
  const { client } = useContext(getApolloContext());

  const formRef = useRef<FormRef>()

  const dispatch = useDispatch()
  const navigate = useNavigate();

  const queryCMSPages = useQuery(['CMS pages'], () => client?.query({
    query: gql`
      query CmsPages {
        pages {
          id
          name
          path
          contentType
        }
      }
    `,
  })
    .then((r) => r.data.pages))


  const urlWithAssetButton = (label: string, buttonLabel: string, filter?: any): SchemaEntry => ({
    type: type.string,
    label,
    render: ({ value, onChange, setValue }) => {
      const domain = tenant!.domain
      const origin =
        window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
      return (
        <div className='d-flex flex-column align-items-end'>
          <input className='mrf-input mb-1' value={value} onChange={e => onChange!(e.target.value)} />
          <AssetChooserByModal
            typeFilter={filter}
            onlyPreview
            tenantMode
            label={buttonLabel}
            onSelect={(asset) => {
              onChange!(origin + asset.link)
            }}
          />
        </div>
      )
    }
  })

  const schema: Schema = {
    title: {
      type: type.string,
      label: translate('Title')
    },
    description: {
      type: type.string,
      format: format.markdown,
      label: translate('Description'),
    },
    homePageVisible: {
      type: type.bool,
      label: translate('home page visible Enabled'), //todo translation
    },
    homeCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.name}`, value: t.id })),
      label: translate('tenant_edit.home_page'),
      disabled: tenant?.style?.homePageVisible,

    },
    notFoundCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      label: translate('tenant_edit.404_page'),
      disabled: tenant?.style?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.name}`, value: t.id })),

    },
    authenticatedCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      label: translate('tenant_edit.authenticated_cmspage'),
      help: translate('tenant_edit.authenticated_cmspage_help'),
      disabled: tenant?.style?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.name}`, value: t.id })),

    },
    cacheTTL: {
      type: 'number',
      visible: tenant?.style?.homePageVisible,
      props: {
        label: translate('tenant_edit.cache'),
        help: translate('tenant_edit.cache_help'),
        disabled: tenant?.style?.homePageVisible,
      },
    },
    cmsHistoryLength: {
      type: 'number',
      visible: tenant?.style?.homePageVisible,
      props: {
        label: translate('tenant_edit.cms_history_length'),
        help: translate('tenant_edit.cms_history_length.help'),
      },
    },
    logo: urlWithAssetButton(translate('Logo'), translate('Set Logo from asset'), MimeTypeFilter.image), //todo: translation
    cssUrl: urlWithAssetButton(translate('CSS URL'), translate('Set CSS from asset'), MimeTypeFilter.css), //todo: trabslation
    css: {
      type: type.string,
      format: format.code,
      label: translate('CSS'),
    },
    colorTheme: {
      type: type.string,
      format: format.code,
      label: () => <div className='d-flex flex-row align-items-center'>
        <div>{translate('CSS color theme')}</div>
        <button type="button" className="btn btn-access-negative ms-1" onClick={() => {
          const RedirectToUI = () => navigate(`/settings/tenants/${tenant?._id}/style`);
          if (Object.keys(formRef.current?.methods.formState.dirtyFields || {})) {
            dispatch(openSaveOrCancelModal({
              open: true,
              dontsave: () => RedirectToUI(),
              save: () => {
                formRef.current?.handleSubmit();
                RedirectToUI();
              },
              title: translate('unsaved.modifications.title'),
              message: translate('unsaved.modifications.message'),
            }));
          } else {
            RedirectToUI();
          }
        }}>set them from UI</button>
      </div>,
    },
    jsUrl: urlWithAssetButton(translate('Js URL'), translate('Set JS from asset'), MimeTypeFilter.javascript), //todo: translate
    js: {
      type: type.string,
      format: format.code,
      label: translate('Javascript')
    },
    faviconUrl: urlWithAssetButton(translate('Favicon URL'), translate('Set Favicon from asset'), MimeTypeFilter.image),//todo: translate
    fontFamilyUrl: urlWithAssetButton(translate('Font family'), translate('Set Font Family from asset'), MimeTypeFilter.font),//todo: translate
    footer: {
      type: type.string,
      format: format.markdown,
      label: translate('Footer'),
    },
  }

  if (queryCMSPages.isLoading) {
    return (
      <div>loading</div>
    )
  }

  const flow: Flow = [
    {
      label: translate('General'),
      flow: ['title', 'description', 'logo', 'cssUrl', 'css', 'colorTheme', 'jsUrl', 'js', 'faviconUrl', 'fontFamilyUrl'],
      collapsed: false
    },
    {
      label: translate('Pages'),
      flow: ['homePageVisible', 'homeCmsPage', 'notFoundCmsPage', 'authenticatedCmsPage', 'cacheTTL', 'cmsHistoryLength', 'footer'],
      collapsed: true
    }
  ]

  return (
    <Form
      schema={schema}
      flow={flow}
      ref={formRef}
      onSubmit={(style) => updateTenant.mutateAsync({ ...tenant, style } as ITenantFull)}
      value={tenant?.style}
      options={{
        actions: {
          submit: { label: translate('Save') }
        }
      }}
    />
  )
}