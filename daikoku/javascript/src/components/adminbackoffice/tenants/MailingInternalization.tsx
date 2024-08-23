import { Form, constraints, format, type } from '@maif/react-forms';
import { createColumnHelper } from '@tanstack/react-table';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IMailingTranslation, ITenantFull, isError } from '../../../types';
import { Table, TableRef } from '../../inputs';
import { Can, Option, Spinner, tenant as TENANT, manage } from '../../utils';
import { BeautifulTitle } from '../../utils/BeautifulTitle';
import { EditFrontOfficeTranslations } from './EditFrontOfficeTranslations';

const MAIL_CATEGORIES = [
  'subscription', 'new', 'create', 'apikey', 'team', 'api',
  'contact', 'user', 'checkout', 'rejection', 'acceptation'
]

const EditMailtemplate = ({
  tenantId
}: { tenantId: string }) => {
  const [tenant, setTenant] = useState<ITenantFull>();
  const [mailTemplateTranslations, setMailTemplateTranslations] = useState<Array<any>>([]);

  const KEY_MAIL_TEMPLATE = 'tenant.mail.template';

  // const tenantRequest = useQuery({ queryKey: ['tenant'], queryFn: () => Services.oneTenant(tenantId) })
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
                  const item: IMailingTranslation = data.translations[0];
                  return Option(item.translations.find((t) => t.language === language))
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
      toast.error(res.error);
    } else {
      toast.success(translate('mailing_internalization.translation_updated'));
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

function Breadcrumb() {
  const { pathname } = useLocation()

  let parts = pathname.replace("/settings", "")
    .split("/")

  if (parts.length === 2)
    return null

  parts = parts.filter(f => f)

  return <p className='d-flex gap-1'>
    {parts
      .map((part, i) => {
        return <Link key={part} to={pathname.split("/").slice(0, i + 3).join("/")}>
          <button className='btn btn-sm btn-outline-primary' style={{
            border: 'none',
            // borderRadius: 0,
            padding: '.5rem'
          }}>{`/ ${part}`}</button>
        </Link>
      })}
  </p>
}

function InternalizationChooser({ domain, translate }) {

  const links = [
    {
      active: "mail",
      translation: 'mailing_internalization.mail_tab',
      description: 'mailing_internalization.mail_description'
    },
    {
      active: "mail-template",
      translation: 'mailing_internalization.mail_template_tab',
      description: 'mailing_internalization.mail_template_description'
    },
    {
      active: "front",
      translation: 'mailing_internalization.front_office_tab',
      description: 'mailing_internalization.front_office_description'
    },
  ]

  return <div className='d-flex gap-2 pe-2'>
    {links.map(({ active, translation, description }) => {
      return <div className='card flex-grow' key={active}>
        <div className='card-header'>
          {translate(translation)}
        </div>
        <div className='card-body'>
          <p>{translate(description)}</p>
          <Link
            className={`btn btn-success btn-outline ${domain === active ? 'active' : ''}`}
            to={`/settings/internationalization/${active}`}
          >
            {translate('mailing_internalization.action')}
          </Link>
        </div>
      </div>
    })}
  </div>
}

export const MailingInternalization = () => {
  useTenantBackOffice();
  const table = useRef<TableRef>();
  const { tenant } = useContext(GlobalContext);

  const { domain } = useParams();

  const { translate, Translation } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  const [category, setCategory] = useState<string | undefined>()
  const [mails, setMails] = useState<any>()

  const saveTranslation = (translation: any) => {
    Services.saveTranslation(translation)
      .then((res) => {
        if (res.error)
          toast.error(translate('mailing_internalization.failed_translation_update'));
        else {
          toast.success(translate('mailing_internalization.translation_updated'));
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
    columnHelper.display({
      cell: info => {
        return <>
          <p style={{ fontWeight: 'bold' }} className='m-0'>
            {translate("mailing_internalization.usage")} : {info.row.original._id.replace("mail.", "").split(".").join(" > ")}
          </p>
          <p className='m-0'>
            {translate(info.row.original._id)}
          </p>
        </>
      },
      id: 'message',
      header: translate('mailing_internalization.message_text'),
      meta: { style: { textAlign: 'left' } },
      sortingFn: 'basic',
    }),
    columnHelper.accessor(row => row.content, {
      header: translate('mailing_internalization.required_variables'),
      meta: { style: { textAlign: 'left' } },
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className='d-flex gap-1 flex-wrap'>
            {getRequiredVariables(info.getValue())
              .map((word, i) => (
                <span className="badge bg-primary" key={`translationKey${i}`}>
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
      header: translate('Translation'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const requiredVariables = getRequiredVariables(info.row.original.content);
        return (
          <div className='d-flex flex-row flex-wrap justify-content-around'>
            {info.row.original.translations.map((value: any) => {
              return (
                <button type='button' key={value.language}
                  className='btn btn-outline-success'
                  onClick={() => openFormModal({
                    title: `${translate('Translation')} : [${value.language}]`,
                    schema: {
                      value: {
                        type: type.string,
                        format: format.markdown,
                        label: translate(info.row.original._id),
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

  const loadEmails = () => {
    Services.getMailTranslations()
      .then(r => isError(r) ? r : r.translations
        .sort((a, b) => a._id.split(".")[1] < b._id.split(".")[1] ? -1 : 1))
      .then(setMails)
  }

  useEffect(() => {
    if (domain === 'mail') {
      loadEmails()
    }
  }, [domain])

  useEffect(() => {
    console.log('reload table', mails, category)
    if (table.current)
      table.current.update()
  }, [mails, category])

  return (
    <Can I={manage} a={TENANT} dispatchError>
      <h1>
        <Translation i18nkey="internationalization" />
      </h1>

      {!domain &&
        <InternalizationChooser domain={domain} translate={translate} />}

      <Breadcrumb />

      {domain === 'mail' && <>
        <div className='d-flex align-items-center gap-2'>
          <span>Catégories :</span>
          {<div className='d-flex gap-1 my-2'>
            {['all', ...MAIL_CATEGORIES
              .sort()]
              .map(cat => {
                return <button className='btn btn-sm btn-outline-primary'
                  type="button"
                  style={{ textTransform: 'capitalize' }}
                  onClick={() => {
                    if (cat === category)
                      setCategory(undefined)
                    else
                      setCategory(cat)
                  }}
                  key={cat}>{cat}</button>
              })}
          </div>}
        </div>
        <Table
          defaultSort="message"
          columns={columns}
          fetchItems={() => {
            if (!category || category === 'all') {
              return Promise.resolve(mails)
            }
            return Promise.resolve(mails.filter(mail => mail._id.split(".")[1] === category))
          }}
          ref={table}
        />
      </>}
      {domain === 'mail-template' && <EditMailtemplate tenantId={tenant._id} />}

      {domain === 'front' && <EditFrontOfficeTranslations tenantId={tenant._id} />}
    </Can>
  );
};
