import { Flow, Form, FormRef, Schema, SchemaEntry, format, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';
import { useContext, useEffect, useRef } from 'react';
import Select from 'react-select';

import { ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import { I18nContext } from '../../../../contexts/i18n-context';
import { AssetChooserByModal, MimeTypeFilter } from '../../../../contexts/modals/AssetsChooserModal';
import { ICmsPageGQL, isError, ITenantFull } from '../../../../types';
import * as Services from '../../../../services';
import { toast } from 'sonner';

type CmsPagesSelectorProps = {
  rawValues: any
  onChange: (item: any) => void,
  value: string
}
const CmsPageSelector = ({ rawValues, onChange, value }: CmsPagesSelectorProps) => {
  const { customGraphQLClient, reloadContext } = useContext(GlobalContext);
  const cmsPagesQuery = `
      query CmsPages {
        pages {
          id
          name
          path
          contentType
          lastPublishedDate
          metadata
        }
      }
    `

  const queryPages = useQuery({
    queryKey: ['cmsPageSelector', 'pages'],
    queryFn: () => customGraphQLClient.request<{ pages: Array<ICmsPageGQL> }>(
      cmsPagesQuery
    )
  })

  return (
    <div>
      <Select
        id={`input-label`}
        name={`search-label`}
        isLoading={queryPages.isLoading}
        options={queryPages.data?.pages.map(p => ({ label: `${p.path} - ${p.name}`, value: p.id }))}
        value={queryPages.data?.pages.map(p => ({ label: `${p.path} - ${p.name}`, value: p.id })).find(p => p.value === value)}//@ts-ignore
        onChange={({ value }) => onChange(value)}
        classNamePrefix="reactSelect"
        className="reactSelect"
      />
    </div>
  )
}


export const CustomizationForm = ({ tenant, updateTenant }: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {

  const { translate } = useContext(I18nContext);
  const { alert, confirm } = useContext(ModalContext);
  const { customGraphQLClient, reloadContext } = useContext(GlobalContext);

  const formRef = useRef<FormRef>(undefined)

  useEffect(() => {
    const display = localStorage.getItem("display.migration.custom.style.alert")
    if (!display || display !== "false") {
      alert({
        title: translate('migration.custom.style.alert.title'),
        message: <div>
          <div className='alert alert-danger mt-3'>
            <div>{translate('migration.custom.style.alert.info.1')}</div>
            <div className='ps-2' style={{ borderLeft: '1px solid black' }}>
              <em>{translate('migration.custom.style.alert.info.2')}</em>
            </div>
            <div className='mt-3'>{translate('migration.custom.style.alert.info.3')}</div>
            <div>{translate('migration.custom.style.alert.info.4')}</div>
            <div className='mt-3' dangerouslySetInnerHTML={{
              __html: translate({
                key: 'migration.custom.style.alert.info.5', replacements: [
                  `<a class="underline" target="_blank" href='https://maif.github.io/daikoku/docs/cli'>${translate('Documentation')}</a>`
                ]
              })
            }} />

          </div>
          <label htmlFor="check" className='me-3'>
            {translate('migration.custom.style.alert.hide')}
          </label>
          <input type='checkbox' id='check' onChange={e => {
            if (e.target.value)
              localStorage.setItem("display.migration.custom.style.alert", "false")
          }} />
        </div>
      })
    }
  }, [tenant])

  const queryCMSPages = useQuery({
    queryKey: ['CMS pages'],
    queryFn: () => customGraphQLClient.request<{ pages: ICmsPageGQL[] }>(
      `query CmsPages {
        pages {
          id
          name
          path
          contentType
        }
      }
    `)
      .then((r) => r.pages)
  })


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
      label: translate('tenant_edit.home_page.visibility'),
    },
    homeCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.path}`, value: t.id })),
      label: translate('tenant_edit.home_page'),
      disabled: !tenant?.style?.homePageVisible,

    },
    notFoundCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      label: translate('tenant_edit.404_page'),
      disabled: !tenant?.style?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.path}`, value: t.id })),

    },
    authenticatedCmsPage: {
      type: type.string,
      format: format.select,
      visible: ({ rawValues }) => rawValues?.homePageVisible,
      label: translate('tenant_edit.authenticated_cmspage'),
      help: translate('tenant_edit.authenticated_cmspage_help'),
      disabled: !tenant?.style?.homePageVisible,
      options: queryCMSPages.data?.map((t) => ({ label: `${t.path}`, value: t.id })),

    },
    logo: urlWithAssetButton(translate('Logo'), translate({ key: 'set.from.assets', replacements: [translate('set.logo')] }), MimeTypeFilter.image),
    logoMin: urlWithAssetButton(translate('Logo min'), translate({ key: 'set.from.assets', replacements: [translate('set.logo')] }), MimeTypeFilter.image),
    logoDark: urlWithAssetButton(translate('Logo dark'), translate({ key: 'set.from.assets', replacements: [translate('set.logo')] }), MimeTypeFilter.image),
    logoMinDark: urlWithAssetButton(translate('Logo min dark'), translate({ key: 'set.from.assets', replacements: [translate('set.logo')] }), MimeTypeFilter.image),
    cssUrl: urlWithAssetButton(translate('CSS URL'), translate({ key: 'set.from.assets', replacements: [translate('set.css')] }), MimeTypeFilter.css),
    jsUrl: urlWithAssetButton(translate('Js URL'), translate({ key: 'set.from.assets', replacements: [translate('set.js')] }), MimeTypeFilter.javascript),
    faviconUrl: urlWithAssetButton(translate('Favicon URL'), translate({ key: 'set.from.assets', replacements: [translate('set.favicon')] }), MimeTypeFilter.image),
    fontFamilyUrl: urlWithAssetButton(translate('Font family'), translate({ key: 'set.from.assets', replacements: [translate('set.font.family')] }), MimeTypeFilter.font),
    footer: {
      type: type.string,
      format: format.markdown,
      label: translate('Footer'),
    },
    defaultMessage: {
      type: type.string,
      format: format.text,
      label: translate('Message')
    }
  }

  if (queryCMSPages.isLoading) {
    return (
      <div>loading</div>
    )
  }

  const flow: Flow = [
    {
      label: translate('General'),
      flow: ['title', 'description', 'logo', 'logoMin', 'logoDark', 'logoMinDark', 'cssUrl', 'jsUrl', 'faviconUrl', 'fontFamilyUrl'],
      collapsed: false
    },
    {
      label: translate('Message'),
      flow: ['defaultMessage'],
      collapsed: true
    },
    {
      label: translate('Pages'),
      flow: ['homePageVisible', 'homeCmsPage', 'notFoundCmsPage', 'authenticatedCmsPage', 'footer'],
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
          submit: { label: translate('Save') },
          cancel: {
            display: !!tenant,
            label: translate('tenant.edition.color-theme.reset.button.label'),
            action: () => confirm({
              title: translate('tenant.edition.color-theme.reset.confirm.title'),
              message: translate('tenant.edition.color-theme.reset.confirm.message')
            })
              .then(res => {
                if (res) {
                  Services.resetColorTheme(tenant!)
                    .then(r => {
                      if (isError(r)) {
                        toast.error(r.error)
                      } else {
                        reloadContext().then(() => toast.success(translate('tenant.edition.color-theme.reset.successful.message')))
                      }
                    })

                }
              })
          }
        }
      }}
    />
  )
}