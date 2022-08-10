import React, { useContext, useEffect, useRef, useState } from 'react';
import { toastr } from 'react-redux-toastr';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { constraints, Form, format, type } from '@maif/react-forms';

import { AssetChooserByModal, MimeTypeFilter } from '../../frontend/modals/AssetsChooserModal';
import { Can, manage, Spinner, tenant as TENANT, Option } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../locales/i18n-context';
import { EditFrontOfficeTranslations } from './EditFrontOfficeTranslations';
import { useTenantBackOffice } from '../../../contexts';
import { BeautifulTitle } from '../../utils/BeautifulTitle';
import { useDispatch } from 'react-redux';
import { openFormModal } from '../../../core';
import { Table, TableRef } from '../../inputs';

const EditMailtemplate = ({
  tenantId
}: any) => {
  const [tenant, setTenant] = useState<any>(undefined);
  const [mailTemplateTranslations, setMailTemplateTranslations] = useState<Array<any>>([]);

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.oneTenant(tenantId)
      .then((tenant) => {
        setTenant(tenant);

        const KEY_MAIL_TEMPLATE = 'tenant.mail.template';

        Promise.all([
          Services.getTranslationLanguages(),
          Services.getTranslations(KEY_MAIL_TEMPLATE)
        ])
          .then(([languages, data]) => {
            const templates = languages.map((language: any) => {
              return Option(data.translations.find((t: any) => t.language === language))
                .getOrElse({
                  _id: nanoid(),
                  key: KEY_MAIL_TEMPLATE,
                  language,
                  value: '{{email}}',
                  _tenant: tenant._id
                });
            })
            setMailTemplateTranslations(templates)
          });
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
      toastr.error(translateMethod('Error'), res.error);
    } else {
      toastr.success(translateMethod('Success'), translateMethod('mailing_internalization.translation_updated'));
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
              placement="bottom"
              title={translateMethod('image url from asset')}
            >
              <AssetChooserByModal
                typeFilter={MimeTypeFilter.image}
                onlyPreview
                tenantMode={true}
                icon="fas fa-file-image"
                classNames="btn-for-descriptionToolbar"
                label={translateMethod('Select')}
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
      <span className="h5">{translateMethod('Default mail template')}</span>
      <div className="mt-3">
        <Form
          value={tenant?.mailerSettings?.template}
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
          <span className="h5">{translateMethod('Translation')} : {translation.language}</span>
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

  const { translateMethod, Translation } = useContext(I18nContext);

  function saveTranslation(translation: any) {
    Services.saveTranslation(translation)
      .then((res) => {
        if (res.error)
          toastr.error(translateMethod('Error'), translateMethod('mailing_internalization.failed_translation_update'));
        else {
          toastr.success(translateMethod('Error'), translateMethod('mailing_internalization.translation_updated'));
          table.current?.update();
        }
      });
  }

  function getRequiredVariables(str: string) {
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

  const columns = [
    {
      id: 'message',
      Header: translateMethod('mailing_internalization.message_text'),
      style: { textAlign: 'left' },
      accessor: (translation: any) => translateMethod(translation[0]),
      sortType: 'basic',
      Cell: ({
        cell: {
          row: { original }
        }
      }: any) => {
        return (
          <div>
            {translateMethod(original[0])}
          </div>
        )
      }
    },
    {
      id: 'variables',
      Header: translateMethod('mailing_internalization.required_variables'),
      style: { textAlign: 'left' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (translation: any) => translation.defaultTranslation,
      Cell: ({
        cell: {
          row: { original }
        }
      }: any) => {
        return (
          <div>
            {
              getRequiredVariables(original[2])
                .map((word, i) => (
                  <span className="badge bg-info me-2" key={`translationKey${i}`}>
                    [{word}]
                  </span>
                ))
            }
          </div>
        )
      }
    },
    {
      id: 'actions',
      style: { textAlign: 'center' },
      Header: translateMethod('Translate'),
      disableSortBy: true,
      disableFilters: true,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const requiredVariables = getRequiredVariables(original[2])
          .map((word, i) => (
            <span className="badge bg-info me-2" key={`translationKey${i}`}>
              [{word}]
            </span>
          ))
        return (
          <div className='d-flex flex-row flex-wrap justify-content-around'>
            {original[1].map((value: any) => {
              return (
                <button type='button' key={value.language}
                  className='btn btn-outline-success'
                  onClick={() => dispatch(openFormModal({
                    title: `${translateMethod('Translation')} : [${value.language}]`,
                    schema: {
                      value: {
                        type: type.string,
                        format: format.markdown,
                        label: translateMethod(original[0]),
                        constraints: [
                          constraints.required(translateMethod('constraints.required.value')),
                          constraints.test('variables', 'constraint.test.required.variables', (value) => {
                            return !!value && requiredVariables.every(v => value.includes(v))
                          })
                        ]
                      }
                    },
                    value,
                    actionLabel: translateMethod('Translate'),
                    onSubmit: saveTranslation
                  }))}>
                  {value.language}
                </button>
              )
            })}
          </div>
        );
      }
    }
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
            {translateMethod('mailing_internalization.mail_tab')}
          </Link>
        </li>
        <li className="nav-item">
          <Link
            className={`nav-link ${domain === 'mail-template' ? 'active' : ''}`}
            to={`/settings/internationalization/mail-template`}
          >
            <i className="fas fa-envelope me-1" />
            {translateMethod('mailing_internalization.mail_template_tab')}
          </Link>
        </li>
        <li className="nav-item">
          <Link
            className={`nav-link ${domain === 'front' ? 'active' : ''}`}
            to={`/settings/internationalization/front`}
          >
            <i className="fas fa-globe me-1" />
            {translateMethod('mailing_internalization.front_office_tab')}
          </Link>
        </li>
      </ul>

      {domain === 'mail' && (
        <div className="col-12 pb-3">
          <div className="d-flex justify-space-between py-3">
            <span style={{ flex: 1 }} className="lead">
              {translateMethod('mailing_internalization.message_text')}
            </span>
            <span style={{ flex: 1 }} className="lead text-center">
              {translateMethod('mailing_internalization.required_variables')}
            </span>
          </div>
          <Table
            defaultSort="message"
            columns={columns}
            fetchItems={() => Services.getTranslations('mail').then(r => r.translations)}
            injectTable={(t: any) => table.current = t}
          />
        </div>
      )}
      {domain === 'mail-template' && <EditMailtemplate tenantId={tenant._id} />}

      {domain === 'front' && <EditFrontOfficeTranslations tenantId={tenant._id} />}
    </Can>
  );
};
