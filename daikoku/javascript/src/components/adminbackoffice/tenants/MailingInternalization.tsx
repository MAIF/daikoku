import React, { useContext, useEffect, useRef, useState } from 'react';
import { toastr } from 'react-redux-toastr';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { constraints, Form, format, type } from '@maif/react-forms';
import { createColumnHelper } from '@tanstack/react-table';

import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import { Can, manage, Spinner, tenant as TENANT, Option } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../contexts/i18n-context';
import { EditFrontOfficeTranslations } from './EditFrontOfficeTranslations';
import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { BeautifulTitle } from '../../utils/BeautifulTitle';
import { useDispatch } from 'react-redux';
import { Table, TableRef } from '../../inputs';
import { IMailingTranslation, isError, ITenantFull } from '../../../types';
import { useQueries, useQuery } from '@tanstack/react-query';

const EditMailtemplate = ({
  tenantId
}: { tenantId: string }) => {
  const [tenant, setTenant] = useState<ITenantFull>();
  const [mailTemplateTranslations, setMailTemplateTranslations] = useState<Array<any>>([]);

  const KEY_MAIL_TEMPLATE = 'tenant.mail.template';

  // const tenantRequest = useQuery(['tenant'], () => Services.oneTenant(tenantId))
  // const translationsRequests = useQueries({
  //   queries: [
  //     {queryKey: [], queryFn: () => Services.getTranslationLanguages() },
  //     {queryKey: [], queryFn: () => Services.getMailTranslations()},
  //   ]
  // })

  const { translate } = useContext(I18nContext);

  useEffect(() => {
    Services.oneTenant(tenantId)
      .then((tenant) => {
        if (!isError(tenant)) {
          setTenant(tenant);
  
          Promise.all([
            Services.getTranslationLanguages(),
            Services.getMailTranslations(KEY_MAIL_TEMPLATE)
          ])
            .then(([languages, data]) => {
              if (!isError(languages) && !isError(data)) {
                const templates = languages.map((language) => {
                  return Option(data.translations[0][1].find((t) => t.language === language))
                    .getOrElse({
                      _id: nanoid(),
                      key: KEY_MAIL_TEMPLATE,
                      language,
                      value: '{{email}}',
                      _tenant: tenant._id
                    });
                })
                setMailTemplateTranslations(templates)
              }
            });
        }
      });
  }, []);

  const saveTenant = (tenant) => {
    return Services.saveTenant(tenant)
      .then(r => {
        manageError(r);
        setTenant(tenant);
      });
  };

  const saveTranslation = (translation: any) => {
    Services.saveTranslation(translation)
      .then((res) => {
        if (!res.error)
          setMailTemplateTranslations(
            mailTemplateTranslations.map((t) => {
              if ((t as any)._id === translation._id) {
                return res;
              }

              return t;
            })
          );
        return res;
      })
      .then(manageError);
  };

  const manageError = (res: any) => {
    if (res.error) {
      toastr.error(translate('Error'), res.error);
    } else {
      toastr.success(translate('Success'), translate('mailing_internalization.translation_updated'));
    }
  };

  if (!tenant) return <Spinner />;

  const translationSchema = {
    value: {
      type: type.string,
      format: format.markdown,
      label: null,
      defaultValue: '{{email}}',
      props: {
        actions: (insert: any) => {
          return (
            <BeautifulTitle
              place="bottom"
              title={translate('image url from asset')}
            >
              <AssetChooserByModal
                typeFilter={MimeTypeFilter.image}
                onlyPreview
                tenantMode={true}
                icon="fas fa-file-image"
                classNames="btn-for-descriptionToolbar"
                label={translate('Select')}
                onSelect={(asset: any) => insert(asset.link)
                }
              />
            </BeautifulTitle>
          );
        }
      }
    }
  }

  return (<div className="col-12 pb-3">
    <div className="my-3">
      <span className="h5">{translate('Default mail template')}</span>
      <div className="mt-3">
        <Form
          value={{ value: tenant?.mailerSettings?.template }}
          schema={translationSchema}
          onSubmit={t => {
            saveTenant({
              ...tenant,
              mailerSettings: {
                ...tenant.mailerSettings,
                template: t.value,
              },
            })
          }} />
      </div>
    </div>
    {mailTemplateTranslations
      .map((translation) => {
        return (<div className="my-3" key={`${translation.key}-${translation.language}`}>
          <span className="h5">{translate('Translation')} : {translation.language}</span>
          <div className="mt-3">
            <Form value={translation} schema={translationSchema} onSubmit={saveTranslation} />
          </div>
        </div>);
      })}
  </div>);
};

export const MailingInternalization = () => {
  useTenantBackOffice();
  const table = useRef<TableRef>();
  const { tenant } = useSelector((s: any) => s.context);

  const { domain } = useParams();
  const dispatch = useDispatch();

  const { translate, Translation } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  const saveTranslation = (translation: any) => {
    Services.saveTranslation(translation)
      .then((res) => {
        if (res.error)
          toastr.error(translate('Error'), translate('mailing_internalization.failed_translation_update'));
        else {
          toastr.success(translate('Error'), translate('mailing_internalization.translation_updated'));
          table.current?.update();
        }
      });
  }

  const getRequiredVariables = (str: string) => {
    let dels: Array<number> = [];
    const words: Array<string> = [];
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '[') {
        dels.push(i);
      } else if (str[i] === ']' && dels.length > 0) {
        let pos = dels[dels.length - 1];
        dels.pop();

        const len = i - 1 - pos;
        words.push(str.substring(pos + 1, (pos < len ? len : len + pos) + 1));
      }
    }
    return words;
  }

  const columnHelper = createColumnHelper<IMailingTranslation>()
  const columns = [
    columnHelper.accessor(row => translate(row[0]), {
      id: 'message',
      header: translate('mailing_internalization.message_text'),
      meta: { style: { textAlign: 'left' } },
      sortingFn: 'basic',
    }),
    columnHelper.accessor(row => row[2], {
      header: translate('mailing_internalization.required_variables'),
      meta: { style: { textAlign: 'left' } },
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div>
            {getRequiredVariables(info.getValue())
              .map((word, i) => (
                <span className="badge bg-info me-2" key={`translationKey${i}`}>
                  [{word}]
                </span>
              ))}
          </div>
        )
      }
    }),
    columnHelper.display({
      id: 'actions',
      meta: { style: { textAlign: 'center' } },
      header: translate('Translate'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {

        const requiredVariables = getRequiredVariables(info.row.original[2]);
        return (
          <div className='d-flex flex-row flex-wrap justify-content-around'>
            {info.row.original[1].map((value: any) => {
              return (
                <button type='button' key={value.language}
                  className='btn btn-outline-success'
                  onClick={() => openFormModal({
                    title: `${translate('Translation')} : [${value.language}]`,
                    schema: {
                      value: {
                        type: type.string,
                        format: format.markdown,
                        label: translate(info.row.original[0]),
                        constraints: [
                          constraints.required(translate('constraints.required.value')),
                          constraints.test('variables', translate('constraint.test.required.variables'), (value) => {
                            return !!value && requiredVariables.every(v => value.includes(v))
                          })
                        ]
                      }
                    },
                    value,
                    actionLabel: translate('Translate'),
                    onSubmit: saveTranslation
                  })}>
                  {value.language}
                </button>
              )
            })}
          </div>
        );
      }
    })
  ]

  return (
    <Can I={manage} a={TENANT} dispatchError>
      <h1>
        <Translation i18nkey="internationalization" />
      </h1>
      <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
        <li className="nav-item">
          <Link
            className={`nav-link ${domain === 'mail' ? 'active' : ''}`}
            to={`/settings/internationalization/mail`}
          >
            <i className="fas fa-envelope me-1" />
            {translate('mailing_internalization.mail_tab')}
          </Link>
        </li>
        <li className="nav-item">
          <Link
            className={`nav-link ${domain === 'mail-template' ? 'active' : ''}`}
            to={`/settings/internationalization/mail-template`}
          >
            <i className="fas fa-envelope me-1" />
            {translate('mailing_internalization.mail_template_tab')}
          </Link>
        </li>
        <li className="nav-item">
          <Link
            className={`nav-link ${domain === 'front' ? 'active' : ''}`}
            to={`/settings/internationalization/front`}
          >
            <i className="fas fa-globe me-1" />
            {translate('mailing_internalization.front_office_tab')}
          </Link>
        </li>
      </ul>

      {domain === 'mail' && (
        <Table
          defaultSort="message"
          columns={columns}
          fetchItems={() => Services.getMailTranslations()
            .then(r => isError(r) ? r : r.translations)}
          ref={table}
        />
      )}
      {domain === 'mail-template' && <EditMailtemplate tenantId={tenant._id} />}

      {domain === 'front' && <EditFrontOfficeTranslations tenantId={tenant._id} />}
    </Can>
  );
};
