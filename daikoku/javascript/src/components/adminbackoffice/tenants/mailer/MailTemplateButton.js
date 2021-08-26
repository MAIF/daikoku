import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { I18nContext } from '../../../../core';

export function MailTemplateButton() {
  const { translateMethod } = useContext(I18nContext);

  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">
        {translateMethod('mailing_internalization.mail_template_tab')}
      </label>
      <div className="col-sm-10">
        <Link to="/settings/internationalization/mail-template" className="btn btn-outline-success">
          {translateMethod('mailing_internalization.go_to_edit_template')}
        </Link>
      </div>
    </div>
  );
}
