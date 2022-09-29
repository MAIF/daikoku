import React, { useContext, useRef } from 'react';
import { Flow, Form, format, FormRef, Schema, SchemaEntry, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';
import { getApolloContext, gql } from '@apollo/client';
import { useDispatch } from 'react-redux';

import { ITenant, ITenantFull } from '../../../../types';
import { I18nContext } from '../../../../locales/i18n-context';
import * as Services from '../../../../services';
import { AssetChooserByModal, MimeTypeFilter } from '../../../frontend/modals/AssetsChooserModal';
import { openSaveOrCancelModal } from '../../../../core';
import { redirect, useNavigate } from 'react-router-dom';


export const CustomizationForm = ({ tenant, updateTenant }: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {

  const { translateMethod } = useContext(I18nContext)
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
      label: translateMethod('Title')
    },
    description: {
      type: type.string,
      format: format.markdown,
      label: translateMethod('Description'),
    },
    homePageVisible: {
      type: type.bool,
      label: translateMethod('home page visible Enabled'), //todo translation
    },
    homeCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.name}`, value: t.id })),
      label: translateMethod('tenant_edit.home_page'),
      disabled: tenant?.style?.homePageVisible,

    },
    notFoundCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      label: translateMethod('tenant_edit.404_page'),
      disabled: tenant?.style?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.name}`, value: t.id })),

    },
    authenticatedCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      label: translateMethod('tenant_edit.authenticated_cmspage'),
      help: translateMethod('tenant_edit.authenticated_cmspage_help'),
      disabled: tenant?.style?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.name}`, value: t.id })),

    },
    cacheTTL: {
      type: 'number',
      visible: tenant?.style?.homePageVisible,
      props: {
        label: translateMethod('tenant_edit.cache'),
        help: translateMethod('tenant_edit.cache_help'),
        disabled: tenant?.style?.homePageVisible,
      },
    },
    cmsHistoryLength: {
      type: 'number',
      visible: tenant?.style?.homePageVisible,
      props: {
        label: translateMethod('tenant_edit.cms_history_length'),
        help: translateMethod('tenant_edit.cms_history_length.help'),
      },
    },
    logo: urlWithAssetButton(translateMethod('Logo'), translateMethod('Set Logo from asset'), MimeTypeFilter.image),
    CssUrl: urlWithAssetButton(translateMethod('CSS URL'), translateMethod('Set CSS from asset'), MimeTypeFilter.css),
    css: {
      type: type.string,
      format: format.code,
      label: translateMethod('CSS'),
    },
    colorTheme: {
      type: type.string,
      format: format.code,
      label: () => <div className='d-flex flex-row align-items-center'>
        <div>{translateMethod('CSS color theme')}</div>
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
              title: translateMethod('unsaved.modifications.title', false, 'Unsaved modifications'),
              message: translateMethod(
                'unsaved.modifications.message',
                false,
                'Your have unsaved modifications, do you want to save it before continue ?'
              ),
            }));
          } else {
            RedirectToUI();
          }
        }}>set them from UI</button>
      </div>,
    },
    jsUrl: urlWithAssetButton(translateMethod('Js URL'), translateMethod('Set JS from asset'), MimeTypeFilter.javascript), //todo: translate
    js: {
      type: type.string,
      format: format.code,
      label: translateMethod('Javascript')
    },
    faviconUrl: urlWithAssetButton(translateMethod('Favicon URL'), translateMethod('Set Favicon from asset'), MimeTypeFilter.image),
    fontFamilyUrl: urlWithAssetButton(translateMethod('Font family'), translateMethod('Set Font Family from asset'), MimeTypeFilter.font),
    footer: {
      type: type.string,
      format: format.markdown,
      label: translateMethod('Footer'),
    },
  }

  if (queryCMSPages.isLoading) {
    return (
      <div>loading</div>
    )
  }

  const flow: Flow = [
    {
      label: translateMethod('General'),
      flow: ['title', 'description', 'logo', 'cssUrl', 'css', 'colorTheme', 'jsUrl', 'js', 'faviconUrl', 'fontFamilyUrl'],
      collapsed: false
    },
    {
      label: translateMethod('Pages'),
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
          submit: { label: translateMethod('Save') }
        }
      }}
    />
  )
}