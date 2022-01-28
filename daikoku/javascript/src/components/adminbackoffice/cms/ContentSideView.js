import { SelectInput } from '@maif/react-forms/lib/inputs';
import React, { useContext, useEffect, useState, useRef } from 'react'
import { I18nContext } from '../../../core';
import Editor from './Editor'

const CONTENT_TYPES_TO_MODE = {
    "application/json": "json",
    "text/html": "html",
    "text/javascript": "javascript",
    "text/css": "css",
    "text/markdown": "mardown"
}

const LinksView = ({ editor, onChange }) => (
    <>
        <span>Choose the back office link to insert</span>
        <Copied>
            {setShow => <SelectInput possibleValues={[
                { label: "Notifications", value: "notifications" },
                { label: "Sign in", value: "login" },
                { label: "Logout", value: "logout" },
                { label: "Language", value: "language" },
                { label: "Back office", value: "backoffice" },
                { label: "Sign up", value: "signup" },
                { label: 'Home', value: 'home' }
            ]}
                onChange={link => {
                    setShow(true)
                    onChange()
                    copy(editor, `{{daikoku-links-${link}}}`)
                }}
            />}
        </Copied>
    </>
)

const Copied = ({ children }) => {
    const { translateMethod } = useContext(I18nContext);
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (show)
            setTimeout(() => setShow(false), 500);
    }, [show])

    if (show)
        return <div className='my-2 text-center py-2' style={{
            backgroundColor: "#fff",
            borderRadius: "6px"
        }}>
            <span>{translateMethod('cms.inserted')}</span>
        </div>
    else
        return children(setShow)
}

const copy = (r, text) => {
    r.session.insert(r.getCursorPosition(), text)
}

const PagesView = ({ editor, pages, prefix, title, onChange }) => (
    <>
        <span>{title}</span>
        <Copied>
            {setShow => <SelectInput possibleValues={pages.map(page => ({
                label: page.name,
                value: page.id
            }))}
                onChange={page => {
                    setShow(true)
                    onChange()
                    copy(editor, `{{${prefix} "${page}"}}`)
                }}
            />}
        </Copied>
    </>
)

const TopActions = ({ setSideView, setSelector, publish }) => {
    const { translateMethod } = useContext(I18nContext);
    const select = id => {
        setSideView(true)
        setSelector(id);
    }
    return <div style={{
        position: "absolute",
        top: "-36px",
        right: 0
    }}>
        <button className='btn btn-sm btn-outline-primary'
            type="button"
            onClick={() => select("links")}>
            <i className='fas fa-link' />
        </button>
        <button className='btn btn-sm btn-outline-primary mx-1'
            type="button"
            onClick={() => select("pages")}>
            <i className='fas fa-pager' />
        </button>
        <button className='btn btn-sm btn-outline-primary me-1'
            type="button"
            onClick={() => select("blocks")}>
            <i className='fas fa-square' />
        </button>
        <button className='btn btn-sm btn-outline-success'
            type="button"
            onClick={() => {
                window.confirm(translateMethod('cms.content_side.publish_label')).then((ok) => {
                    if (ok) {
                        publish()
                    }
                });
            }}>
            {translateMethod("cms.content_side.publish_button")}
        </button>
    </div>
}

export const ContentSideView = ({ value, onChange, pages, rawValues, publish }) => {
    const [sideView, setSideView] = useState(false);
    const [selector, setSelector] = useState("");

    const [ref, setRef] = useState();

    return <div style={{
        position: "relative",
        marginTop: "48px",
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
    }}>
        <TopActions setSelector={setSelector} setSideView={setSideView} publish={publish} />
        <div style={{
            position: "relative",
            border: "1px solid rgba(225,225,225,.5)",
            flex: 1
        }} >
            <Editor
                value={value}
                onChange={onChange}
                setRef={setRef}
                mode={CONTENT_TYPES_TO_MODE[rawValues.contentType] || "html"}
                theme="tomorrow"
                width="-1" />

            {sideView && <div className='p-3' style={{
                backgroundColor: "#ecf0f1",
                boxShadow: "rgb(25 25 25 / 50%) 3px 3px 3px -2px",
                position: 'absolute',
                top: 0,
                right: '25%',
                left: '25%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                {selector === "links" && <LinksView editor={ref} onChange={() => setSideView(false)} />}
                {selector === "pages" && <PagesView pages={pages} prefix="daikoku-page-url" title="Choose the link to the page to insert" editor={ref} onChange={() => setSideView(false)} />}
                {selector === "blocks" && <PagesView pages={pages} prefix="daikoku-include-block" title="Choose the block to insert" editor={ref} onChange={() => setSideView(false)} />}
                <button type="button" className='btn btn-sm btn-outline-secondary mt-1 me-1'
                    onClick={() => setSideView(false)}>Close</button>
            </div>}
        </div>
    </div >
}