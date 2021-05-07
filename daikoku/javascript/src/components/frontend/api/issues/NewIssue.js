import React, { useState } from 'react';
import { toastr } from 'react-redux-toastr';
import { TextInput } from '../../../inputs';
const LazySingleMarkdownInput = React.lazy(() => import('../../../inputs/SingleMarkdownInput'));

const styles = {
    commentHeader: {
        backgroundColor: "#eee", borderTopLeftRadius: "8px", borderTopRightRadius: '8px'
    },
    bold: {
        fontWeight: 'bold'
    }
}

export function NewIssue({ currentLanguage, user, ...props }) {
    const [issue, setIssue] = useState({ title: '', content: '' })

    function createIssue() {
        if (issue.title.length === 0 || issue.content.length === 0)
            toastr.error("Title or content are too short");
        else {
            // Create issue
            // then => redirect
            props.history.push(`${props.basePath}/issues`)
        }
    }

    return (
        <div className="d-flex pb-4">
            <div className="dropdown pr-2">
                <img
                    style={{ width: 42 }}
                    src={user.picture}
                    className="dropdown-toggle logo-anonymous user-logo"
                    data-toggle="dropdown"
                    alt="user menu"
                />
            </div>
            <div className="container">
                <div className="d-flex px-3 py-2" style={styles.commentHeader}>
                    <input
                        type='text'
                        className="form-control"
                        placeholder="Title"
                        value={issue.title}
                        onChange={e => setIssue({ ...issue, title: e.target.value })}
                    />
                </div>
                <div
                    className="p-3" style={{
                        border: "1px solid #eee", borderBottomLeftRadius: "8px", borderBottomRightRadius: '8px',
                        backgroundColor: "#fff"
                    }}>
                    <React.Suspense fallback={<div>loading ...</div>}>
                        <LazySingleMarkdownInput
                            currentLanguage={currentLanguage}
                            height='300px'
                            value={issue.content}
                            fixedWitdh="0px"
                            onChange={content => setIssue({ ...issue, content })}
                        />
                    </React.Suspense>
                    <div className="d-flex mt-3 justify-content-end">
                        <button className="btn btn-success" onClick={createIssue}>Submit new issue</button>
                    </div>
                </div>
            </div>
        </div>
    )
}