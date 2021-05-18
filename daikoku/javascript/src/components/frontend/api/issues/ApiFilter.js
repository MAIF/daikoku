import { Link } from "react-router-dom";
import { t } from "../../../../locales";

export function ApiFilter({ api, teamPath, tags, handleFilter, filter, pathname, connectedUser, currentLanguage }) {

    return (
        <div className="d-flex flex-row justify-content-between">
            <div>
                <button
                    className={`btn btn-${filter !== "all" ? 'outline-' : ''}primary`}
                    style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                    onClick={() => handleFilter("all")}>{t('All', currentLanguage)}</button>
                <button
                    className={`btn btn-${filter !== "open" ? 'outline-' : ''}primary`}
                    style={{ borderRadius: 0 }}
                    onClick={() => handleFilter("open")}>{t('issues.open', currentLanguage)}</button>
                <button
                    className={`btn btn-${filter !== "closed" ? 'outline-' : ''}primary`}
                    style={{ borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                    onClick={() => handleFilter("closed")}>{t('issues.closed', currentLanguage)}</button>
            </div>

            {(connectedUser && !connectedUser.isGuest) &&
                <div>
                    <Link to={`${teamPath}/settings/apis/${api._humanReadableId}`} className="btn btn-outline-primary">
                        <i className="fa fa-tag mr-1" />
                        {t('issues.tags', currentLanguage)}
                        <span className="badge badge-secondary ml-2">{tags.length || 0}</span>
                    </Link>
                    <Link to={`${pathname}/issues/new`} className="btn btn-outline-success ml-1">
                        {t('issues.new_issue', currentLanguage)}
                    </Link>
                </div>
            }
        </div>
    )
}