import { Link } from "react-router-dom";
import { t } from "../../../../locales";

export function MailTemplateButton({ currentLanguage }) {
    return <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label">
            {t('mailing_internalization.mail_template_tab', currentLanguage)}
        </label>
        <div className="col-sm-10">
            <Link to="/settings/internationalization/mail-template" className="btn btn-outline-success">
                {t('mailing_internalization.go_to_edit_template', currentLanguage)}
            </Link>
        </div>
    </div>
}