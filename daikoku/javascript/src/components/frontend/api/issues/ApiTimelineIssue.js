import moment from "moment";
import { useEffect, useState } from "react"
import { t } from "../../../../locales";
import { converter } from '../../../../services/showdown';

function Comment({ createdBy, createdDate, content, currentLanguage }) {
    return (
        createdBy ? <div className="d-flex pb-4">
            <div className="dropdown pr-2">
                <img
                    style={{ width: 42 }}
                    src={createdBy.picture}
                    className="dropdown-toggle logo-anonymous user-logo"
                    data-toggle="dropdown"
                    alt="user menu"
                />
            </div>
            <div className="container container-fluid" style={{ borderRadius: "8px" }}>
                <div className="d-flex px-3 py-2" style={{ backgroundColor: "#eee" }}>
                    <span className="pr-1" style={{ fontWeight: 'bold' }}>{createdBy._humanReadableId}</span>
                    <span className="pr-1">commented on</span>
                    {moment(createdDate).format(t('moment.date.format.without.hours', currentLanguage))}
                </div>
                <div
                    className="p-3" style={{ border: "1px solid #eee" }}
                    dangerouslySetInnerHTML={{ __html: converter.makeHtml(content) }}
                />
            </div>
        </div> : null
    )
}

export function ApiTimelineIssue({ issueId, currentLanguage }) {
    const [issue, setIssue] = useState({})

    useEffect(() => {
        // call services
        setIssue({
            seqId: 0,
            title: "Subscriptions must be cross API dut to otoroshi service groups usages",
            tags: ["bug", "enhancement", "global", "otoroshi"],
            status: "open",
            openedBy: { _humanReadableId: "quentinfoobar", picture: "https://www.gravatar.com/avatar/87d47b53c88259042a50fa24a6d6b0f4?size=128&d=robohash" },
            createdDate: Date.now(),
            content: "## Gros probleme quand je clique sur un bouton",
            comments: [
                {
                    createdBy: { _humanReadableId: "quentinovega", picture: "https://www.gravatar.com/avatar/87d47b53c88259042a50fa24a6d6b0f4?size=128&d=robohash" },
                    createdDate: Date.now(),
                    content: "Est-ce que c'est réglé ?"
                },
                {
                    createdBy: { _humanReadableId: "mathieuancelin", picture: "https://www.gravatar.com/avatar/87d47b53c88259042a50fa24a6d6b0f4?size=128&d=robohash" },
                    createdDate: Date.now(),
                    content: "Je pense que oui."
                }
            ]
        })
    }, [issueId])

    return (
        <div>
            <div className="container">
                <h1 style={{ fontSize: '1.5rem' }}>
                    {issue.title} <span style={{ fontWeight: 'bold' }}>#{issue.seqId}</span>
                </h1>
                <div className="d-flex align-items-center pb-3 mb-3">
                    <div style={{
                        textTransform: "capitalize",
                        borderRadius: '12px',
                        backgroundColor: "#28a745",
                        width: 'fit-content',
                        padding: '6px 12px',
                        borderRadius: "2em",
                        color: "#fff"
                    }} className="d-flex justify-content-center align-items-center mr-3">
                        <i className="fa fa-exclamation-circle mr-2" style={{ color: issue.status === "closed" ? 'red' : 'inherit' }} />
                        {issue.status}
                    </div>
                    <div>
                        <span className="pr-1" style={{ fontWeight: 'bold' }}>{issue.openedBy ? issue.openedBy._humanReadableId : ''}</span>
                         opened this issue on {moment(issue.createdDate)
                            .format(t('moment.date.format.without.hours', currentLanguage))} · {issue.comments ? issue.comments.length : 0} comments
                        </div>
                </div>

                <Comment {...issue} />
                <div>
                    {(issue.comments || []).map((comment, i) => (
                        <Comment {...comment} key={`comment${i}`} currentLanguage={currentLanguage} />
                    ))}
                </div>
            </div>
        </div >
    )
}