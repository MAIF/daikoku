import { Link } from "react-router-dom";
import { t } from "../../../../locales";

export function MailTemplateButton({ currentLanguage }) {
    return <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label">
            {t('Mail template', currentLanguage)}
        </label>
        <div className="col-sm-10">
            <Link to="/settings/internationalization/mail-template" className="btn btn-outline-success">
                {t('Edit mail template', currentLanguage)}
            </Link>
        </div>
    </div>
}