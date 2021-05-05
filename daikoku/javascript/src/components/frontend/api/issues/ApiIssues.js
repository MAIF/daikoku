import moment from "moment";
import { t } from "../../../../locales";
import { Link } from 'react-router-dom';

export function ApiIssues({ issues, filter, currentLanguage }) {
    const filteredIssues = issues
        .filter(issue => filter === "all" || issue.status === filter)
    return (
        <div className="d-flex flex-column pt-3">
            {filteredIssues
                .map(({ seqId, title, tags, openedBy, createdDate, closedDate, status }) => (
                    <div className="border-bottom py-3 d-flex align-items-center" key={`issue-${seqId}`} style={{ backgroundColor: "#fff" }}>
                        <i className="fa fa-exclamation-circle mx-3" style={{ color: status === "closed" ? 'red' : 'inherit' }}></i>
                        <div>
                            <div>
                                <Link to={`issues/${seqId}`} className="mr-2">
                                    {title}
                                </Link>
                                {tags.map((tag, i) => (
                                    <span className="badge badge-primary mr-1" key={`issue-${seqId}-tag${i}`}>{tag}</span>
                                ))}
                            </div>
                            {status === "closed" ?
                                <span>
                                    #{seqId} on {moment(createdDate).format(
                                    t('moment.date.format.without.hours', currentLanguage)
                                )} by {openedBy._humanReadableId}</span> :
                                <span>
                                    #{seqId} by {openedBy._humanReadableId} was closed on {moment(closedDate).format(
                                    t('moment.date.format.without.hours', currentLanguage)
                                )} </span>
                            }
                        </div>
                    </div>
                ))}
            {filteredIssues.length <= 0 && <p>No issues matching filter</p>}
        </div>
    )
}