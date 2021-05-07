import React from 'react';
import { Link } from 'react-router-dom';
import moment from "moment";
import { useEffect, useState } from "react"
import { t } from "../../../../locales";
import { converter } from '../../../../services/showdown';
const LazySingleMarkdownInput = React.lazy(() => import('../../../inputs/SingleMarkdownInput'));

const styles = {
    commentHeader: {
        backgroundColor: "#eee", borderTopLeftRadius: "8px", borderTopRightRadius: '8px'
    },
    bold: {
        fontWeight: 'bold'
    },
    getStatus: status => ({
        textTransform: "capitalize",
        borderRadius: '12px',
        backgroundColor: status === "open" ? "#28a745" : "#dc3545",
        width: 'fit-content',
        padding: '6px 12px',
        borderRadius: "2em",
        color: "#fff"
    })
}

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
            <div className="container">
                <div className="d-flex px-3 py-2" style={styles.commentHeader}>
                    <span className="pr-1" style={styles.bold}>{createdBy._humanReadableId}</span>
                    <span className="pr-1">commented on</span>
                    {moment(createdDate).format(t('moment.date.format.without.hours', currentLanguage))}
                </div>
                <div
                    className="p-3" style={{
                        border: "1px solid #eee", borderBottomLeftRadius: "8px", borderBottomRightRadius: '8px',
                        backgroundColor: "#fff"
                    }}
                    dangerouslySetInnerHTML={{ __html: converter.makeHtml(content) }}
                />
            </div>
        </div> : null
    )
}

function NewComment({ handleContent, content, picture, currentLanguage }) {
    return (
        <div className="d-flex pb-4">
            <div className="dropdown pr-2">
                <img
                    style={{ width: 42 }}
                    src={picture}
                    className="dropdown-toggle logo-anonymous user-logo"
                    data-toggle="dropdown"
                    alt="user menu"
                />
            </div>
            <div className="container">
                <div className="d-flex px-3 py-2" style={styles.commentHeader}>
                    New comment
                </div>
                <div
                    className="p-3" style={{
                        border: "1px solid #eee", borderBottomLeftRadius: "8px", borderBottomRightRadius: '8px',
                        backgroundColor: "#fff"
                    }}
                >
                    <React.Suspense fallback={<div>loading ...</div>}>
                        <LazySingleMarkdownInput
                            currentLanguage={currentLanguage}
                            height='300px'
                            value={content}
                            fixedWitdh="0px"
                            onChange={handleContent}
                        />
                    </React.Suspense>
                    <div className="d-flex mt-3 justify-content-end">
                        <button className="btn btn-outline-danger mr-1">
                            <i className="fa fa-exclamation-circle mr-2" />
                            Close issue</button>
                        <button className="btn btn-success">Comment</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function ApiTimelineIssue({ issueId, currentLanguage, connectedUser, team, api }) {
    const [issue, setIssue] = useState({})
    const [editionMode, handleEdition] = useState(false)

    const [newComment, setNewComment] = useState("")

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

    function updateIssue() {
        handleEdition(false)
        console.log(issue)
    }
    
    function deleteIssue() {
        console.log("Ask to intention")
    }

    return (
        <div className="container">
            <div className="d-flex align-items-center justify-content-between mb-2">
                {editionMode ?
                    <input
                        type='text'
                        className="form-control"
                        placeholder="Title"
                        value={issue.title}
                        onChange={e => setIssue({ ...issue, title: e.target.value })}
                    />
                    : <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
                        {issue.title} <span style={{ fontWeight: 'bold' }}>#{issue.seqId}</span>
                    </h1>}
                <div className="d-flex">
                    {editionMode ? <div className="d-flex ml-3">
                        <button className="btn btn-success mr-1" onClick={updateIssue}>Save</button>
                        <button className="btn btn-outline-secondary" onClick={() => handleEdition(false)}>Cancel</button>
                    </div> : <>
                        <button className="btn btn-outline-secondary mr-1" onClick={() => handleEdition(true)}>Edit</button>
                        <Link to={`/${team._humanReadableId}/${api._humanReadableId}/issues/new`} style={{ whiteSpace: "nowrap" }}>
                            <button className="btn btn-success">New issue</button>
                        </Link>
                    </>
                    }
                </div>
            </div>
            <div className="d-flex align-items-center pb-3 mb-3">
                <div style={styles.getStatus(issue.status)} className="d-flex justify-content-center align-items-center mr-3">
                    <i className="fa fa-exclamation-circle mr-2" style={{ color: "#fff" }} />
                    {issue.status}
                </div>
                <div>
                    <span className="pr-1" style={styles.bold}>{issue.openedBy ? issue.openedBy._humanReadableId : ''}</span>
                         opened this issue on {moment(issue.createdDate)
                        .format(t('moment.date.format.without.hours', currentLanguage))} · {issue.comments ? issue.comments.length : 0} comments
                        </div>
            </div>

            <div className="row">
                <div className="col-md-10">
                    <Comment {...issue} />
                    <div>
                        {(issue.comments || []).map((comment, i) => (
                            <Comment {...comment} key={`comment${i}`} currentLanguage={currentLanguage} />
                        ))}
                    </div>
                    <NewComment
                        currentLanguage={currentLanguage}
                        content={newComment}
                        handleContent={setNewComment}
                        picture={connectedUser.picture} />
                </div>
                <div className="col-md-2">
                    <div>
                        <label htmlFor="tags">Tags</label>
                        <div id="tags">
                            {(issue.tags || []).map(tag => (
                                <span className="badge badge-primary mr-1">{tag}</span>
                            ))}
                        </div>
                    </div>
                    <hr className="hr-apidescription" />
                    <div>
                        <label htmlFor="actions">Actions</label>
                        <div id="actions">
                            <i className="fa fa-trash"></i>
                            <button style={{ ...styles.bold, border: 0, background: 'transparent', outline: 'none' }}
                                onClick={deleteIssue}
                            >Delete this issue</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}