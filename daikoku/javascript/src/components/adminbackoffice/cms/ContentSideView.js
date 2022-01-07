import { CodeInput, SelectInput } from '@maif/react-forms/lib/inputs';
import React, { useContext, useEffect, useState } from 'react'
import { I18nContext } from '../../../core';

const LinksView = ({ }) => (
    <>
        <span className='mb-1'>Choose the back office link to copy</span>
        <Copied>
            {setShow => <SelectInput possibleValues={[
                { label: "Notifications", value: "notifications" },
                { label: "Sign in", value: "login" },
                { label: "Logout", value: "logout" },
                { label: "Language", value: "language" },
                { label: "Back office", value: "backoffice" },
                { label: "Sign up", value: "signup" }
            ]}
                onChange={link => {
                    setShow(true)
                    copy(`{{daikoku-links-${link}}}`)
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
            <span>{translateMethod('2fa.copied')}</span>
        </div>
    else
        return children(setShow)
}

const copy = (text) => {
    navigator.clipboard.writeText(text)
}

const PagesView = ({ pages, prefix, title }) => (
    <>
        <span className='mb-1'>{title}</span>
        <Copied>
            {setShow => <SelectInput possibleValues={pages.map(page => ({
                label: page.name,
                value: page.id
            }))}
                onChange={page => {
                    setShow(true)
                    copy(`{{${prefix} "${page}"}}`)
                }}
            />}
        </Copied>
    </>
)

const TopActions = ({ setSideView, setSelector }) => {
    const select = id => {
        setSideView(true)
        setSelector(id);
    }
    return <div style={{
        position: "absolute",
        top: "-36px",
        right: 0,
        zIndex: 100
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
        <button className='btn btn-sm btn-outline-primary'
            type="button"
            onClick={() => select("blocks")}>
            <i className='fas fa-square' />
        </button>
    </div>
}

const SideBarActions = (props) => (
    <>
        <button type="button" className='btn btn-sm btn-outline-secondary mt-1 me-1'
            onClick={() => props.setSideView(false)}>Close</button>
    </>
)

export const ContentSideView = ({ value, onChange, pages }) => {
    const [sideView, setSideView] = useState(false);
    const [selector, setSelector] = useState("");

    return <div style={{
        position: "relative",
        marginTop: "12px"
    }}>
        <TopActions setSelector={setSelector} setSideView={setSideView} />
        <div className='d-flex'>
            <div style={{ flex: 1 }}>
                <CodeInput value={value} onChange={onChange} />
            </div>
            {sideView && <div style={{ flex: .5 }} className='p-2'>
                {selector === "links" && <LinksView />}
                {selector === "pages" && <PagesView pages={pages} prefix="daikoku-page-url" title="Link to the file"  />}
                {selector === "blocks" && <PagesView pages={pages} prefix="daikoku-include-block" title="Block to include" />}
                <SideBarActions setSideView={setSideView} />
            </div>}
        </div>
    </div>
}