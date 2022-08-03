import React, { useContext, useEffect, useRef, useState } from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { constraints, Form, format, type } from '@maif/react-forms';

// @ts-expect-error TS(6142): Module '../../frontend/modals/AssetsChooserModal' ... Remove this comment to see the full error message
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend/modals/AssetsChooserModal';
import { Can, manage, Spinner, tenant as TENANT, Option } from '../../utils';
import * as Services from '../../../services';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
// @ts-expect-error TS(6142): Module './EditFrontOfficeTranslations' was resolve... Remove this comment to see the full error message
import { EditFrontOfficeTranslations } from './EditFrontOfficeTranslations';
import { useTenantBackOffice } from '../../../contexts';
// @ts-expect-error TS(6142): Module '../../utils/BeautifulTitle' was resolved t... Remove this comment to see the full error message
import { BeautifulTitle } from '../../utils/BeautifulTitle';
import { useDispatch } from 'react-redux';
import { openFormModal } from '../../../core';
import { Table } from '../../inputs';

const EditMailtemplate = ({
  tenantId
}: any) => {
  const [tenant, setTenant] = useState(undefined);
  const [mailTemplateTranslations, setMailTemplateTranslations] = useState([]);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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

  const saveTenant = () => {
    Services.saveTenant(tenant).then(manageError);
  };

  const saveTranslation = (translation: any) => {
    Services.saveTranslation(translation)
      .then((res) => {
        if (!res.error)
          setMailTemplateTranslations(
            // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
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
    if (res.error) toastr.error(res.error);
    else toastr.success(translateMethod('mailing_internalization.translation_updated'));
  };

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <BeautifulTitle
              placement="bottom"
              title={translateMethod('image url from asset')}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <AssetChooserByModal
                // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => any; onlyPrevi... Remove this comment to see the full error message
                typeFilter={MimeTypeFilter.image}
                onlyPreview
                tenantMode={true}
                icon="fas fa-file-image"
                classNames="btn-for-descriptionToolbar"
                onSelect={(asset: any) => insert(asset.link)
                }
              />
            </BeautifulTitle>
          );
        }
      }
    }
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="col-12 pb-3">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="my-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span className="h5">{translateMethod('Default mail template')}</span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mt-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Form value={(tenant as any)?.mailerSettings?.template} schema={translationSchema} onSubmit={t => {
        // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
        saveTenant({
            // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
            ...tenant,
            mailerSettings: {
                // @ts-expect-error TS(2339): Property 'mailerSettings' does not exist on type '... Remove this comment to see the full error message
                ...tenant.mailerSettings,
                template: t.value,
            },
        })
            // @ts-expect-error TS(2339): Property 'then' does not exist on type 'void'.
            .then(manageError);
    }}/>
        </div>
      </div>
      {mailTemplateTranslations
        .map((translation) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div className="my-3" key={`${translation.key}-${translation.language}`}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="h5">{translateMethod('Translation')} : {translation.language}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="mt-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Form value={translation} schema={translationSchema} onSubmit={saveTranslation}/>
              </div>
            </div>);
    })}
    </div>);
              // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
              (saveTenant({
    // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
    ...tenant,
    mailerSettings: {
        ...(tenant as any).mailerSettings,
        // @ts-expect-error TS(2304): Cannot find name 't'.
        template: t.value,
    },
}) as any).then(manageError);
            }}
          />
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
      // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
      {mailTemplateTranslations
        // @ts-expect-error TS(7006): Parameter 'translation' implicitly has an 'any' ty... Remove this comment to see the full error message
        .map((translation) => {
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          return (<div className="my-3" key={`${(translation as any).key}-${(translation as any).language}`}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="h5">{translateMethod('Translation')} : {(translation as any).language}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="mt-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Form value={translation} schema={translationSchema} onSubmit={saveTranslation}/>
              </div>
            </div>);
        })}
    // @ts-expect-error TS(2304): Cannot find name 'div'.
    </div>
  );
};

export const MailingInternalization = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();
  const table = useRef();
  const { tenant } = useSelector((s) => (s as any).context);

  const { domain } = useParams();
  const dispatch = useDispatch();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  function saveTranslation(translation: any) {
    Services.saveTranslation(translation)
      .then((res) => {
        if (res.error)
          toastr.error(translateMethod('mailing_internalization.failed_translation_update'));
        else {
          toastr.success(translateMethod('mailing_internalization.translation_updated'));
          // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          table.current.update();
        }
      });
  }

  function getRequiredVariables(str: any) {
    let dels = [];
    const words = [];
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '[') dels.push(i);
      else if (str[i] === ']' && dels.length > 0) {
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div>
            {
              getRequiredVariables(original[2])
                .map((word, i) => (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <span className="badge bg-info me-2" key={`translationKey${i}`}>
              [{word}]
            </span>
          ))
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className='d-flex flex-row flex-wrap justify-content-around'>
            {original[1].map((value: any) => {
              return (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={TENANT} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h1>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="internationalization" />
      </h1>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <li className="nav-item">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Link
            className={`nav-link ${domain === 'mail' ? 'active' : ''}`}
            to={`/settings/internationalization/mail`}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-envelope me-1" />
            {translateMethod('mailing_internalization.mail_tab')}
          </Link>
        </li>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <li className="nav-item">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Link
            className={`nav-link ${domain === 'mail-template' ? 'active' : ''}`}
            to={`/settings/internationalization/mail-template`}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-envelope me-1" />
            {translateMethod('mailing_internalization.mail_template_tab')}
          </Link>
        </li>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <li className="nav-item">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Link
            className={`nav-link ${domain === 'front' ? 'active' : ''}`}
            to={`/settings/internationalization/front`}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-globe me-1" />
            {translateMethod('mailing_internalization.front_office_tab')}
          </Link>
        </li>
      </ul>

      {domain === 'mail' && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="col-12 pb-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex justify-space-between py-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span style={{ flex: 1 }} className="lead">
              {translateMethod('mailing_internalization.message_text')}
            </span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span style={{ flex: 1 }} className="lead text-center">
              {translateMethod('mailing_internalization.required_variables')}
            </span>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Table
            // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
            selfUrl="translations"
            defaultTitle="Translations"
            defaultValue={() => ([])}
            defaultSort="message"
            itemName="translation"
            columns={columns}
            fetchItems={() => Services.getTranslations('mail').then(r => r.translations)}
            showActions={false}
            showLink={false}
            extractKey={(item: any) => item[0]}
            injectTable={(t: any) => table.current = t}
          />
        </div>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {domain === 'mail-template' && <EditMailtemplate tenantId={tenant._id} />}

      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {domain === 'front' && <EditFrontOfficeTranslations tenantId={tenant._id} />}
    </Can>
  );
};
