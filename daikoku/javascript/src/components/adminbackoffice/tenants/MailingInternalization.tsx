
import { useContext } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { useTenantBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { I18nContext } from '../../../contexts/i18n-context';
import { Can, tenant as TENANT, manage } from '../../utils';
import { EditFrontOfficeTranslations } from './EditFrontOfficeTranslations';


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
  const { tenant } = useContext(GlobalContext);

  const { domain } = useParams();

  const { translate, Translation } = useContext(I18nContext);

  return (
    <Can I={manage} a={TENANT} dispatchError>
      <h1>
        <Translation i18nkey="internationalization" />
      </h1>

      {!domain &&
        <InternalizationChooser domain={domain} translate={translate} />}

      <Breadcrumb />

      {domain === 'mail' && <div>
        <div className="alert alert-warning" role="alert">
          You have to use the CLI to customize your Daikoku mails.

          <a className="alert-link" href="https://maif.github.io/daikoku/docs/cli" target="_blank"> Follow these instructions to start</a>
        </div>
      </div>}

      {domain === 'front' && <EditFrontOfficeTranslations tenantId={tenant._id} />}
    </Can>
  );
};