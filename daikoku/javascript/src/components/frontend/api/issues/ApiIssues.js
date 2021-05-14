import moment from "moment";
import { t } from "../../../../locales";
import { Link } from 'react-router-dom';
import { useEffect, useState } from "react";
import * as Services from '../../../../services/index';

export function ApiIssues({ filter, currentLanguage, api }) {
    const [issues, setIssues] = useState([]);

    useEffect(() => {
        Services.getAPIIssues(api._id)
            .then(res => setIssues(res));
    }, [api._id]);

    const filteredIssues = issues
        .filter(issue => filter === "all" || (issue.open && filter === "open"))

    console.log(issues)

    return (
        <div className="d-flex flex-column pt-3">
            {filteredIssues
                .map(({ seqId, title, tags, by, createdDate, closedDate, open }) => (
                    <div className="border-bottom py-3 d-flex align-items-center" key={`issue-${seqId}`} style={{ backgroundColor: "#fff" }}>
                        <i className="fa fa-exclamation-circle mx-3" style={{ color: open ? 'inherit' : 'red' }}></i>
                        <div>
                            <div>
                                <Link to={`issues/${seqId}`} className="mr-2">
                                    {title}
                                </Link>
                                {tags
                                    .sort((a,b) => a.name < b.name ? -1 : 1)
                                    .map((tag, i) => (
                                    <span className="badge badge-primary mr-1"
                                        style={{ backgroundColor: tag.color }}
                                        key={`issue-${seqId}-tag${i}`}>{tag.name}</span>
                                ))}
                            </div>
                            {open ?
                                <span>
                                    #{seqId} opened on {moment(createdDate).format(
                                    t('moment.date.format.without.hours', currentLanguage)
                                )} by {by._humanReadableId}</span> :
                                <span>
                                    #{seqId} by {by._humanReadableId} was closed on {moment(closedDate).format(
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