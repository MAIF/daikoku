import { SelectInput } from '@maif/react-forms/lib/inputs';
import React, { useContext, useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom';
import { I18nContext } from '../../../core';
import Editor from './Editor'

const CONTENT_TYPES_TO_MODE = {
    "application/json": "json",
    "text/html": "html",
    "text/javascript": "javascript",
    "text/css": "css",
    "text/markdown": "mardown",
    "text/plain": "plain_text",
    "text/xml": "xml",
}

const LinksView = ({ editor, onChange }) => {
    const { translateMethod } = useContext(I18nContext);

    return <div className='mt-3'>
        <span>{translateMethod('cms.content_side_view.choose_link')}</span>
        <Copied>
            {setShow => <SelectInput possibleValues={[
                { label: translateMethod('cms.content_side_view.notifications'), value: "notifications" },
                { label: translateMethod('cms.content_side_view.sign_in'), value: "login" },
                { label: translateMethod('cms.content_side_view.logout'), value: "logout" },
                { label: translateMethod('cms.content_side_view.language'), value: "language" },
                { label: translateMethod('cms.content_side_view.back_office'), value: "backoffice" },
                { label: translateMethod('cms.content_side_view.sign_up'), value: "signup" },
                { label: translateMethod('cms.content_side_view.home'), value: 'home' }
            ]}
                onChange={link => {
                    setShow(true)
                    onChange()
                    copy(editor, `{{daikoku-links-${link}}}`)
                }}
            />}
        </Copied>
    </div>
}

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
    <div className='mt-3'>
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
    </div>
)

const TopActions = ({ setSideView, publish, setSelector }) => {
    const { translateMethod } = useContext(I18nContext);
    const select = id => {
        setSelector(undefined)
        setSideView(true)
    }
    return <div style={{
        position: "absolute",
        top: "-36px",
        right: 0
    }}>
        <button className='btn btn-sm btn-outline-primary me-1'
            type="button"
            onClick={select}>
            <i className='fas fa-plus pe-1' />
            {translateMethod('cms.content_side.new_action')}
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

export const ContentSideView = ({ value, onChange, pages, publish, contentType }) => {
    const { translateMethod } = useContext(I18nContext)
    const [sideView, setSideView] = useState(false);
    const [selector, setSelector] = useState("");

    const [ref, setRef] = useState();

    const [selectedPage, setSelectedPage] = useState({
        top: 0,
        left: 0,
        pageName: undefined
    })

    window.pages = pages

    const onMouseDown = () => {
        if (ref) {
            setTimeout(() => {
                const pos = ref.getCursorPosition();
                const token = ref.session.getTokenAt(pos.row, pos.column);

                const value = token ? token.value.trim() : "";
                try {
                    const id = value
                        .match(/(?:"[^"]*"|^[^"]*$)/)[0]
                        .replace(/"/g, "")
                    const page = window.pages.find(p => p.id === id)
                    setSelectedPage({
                        ...ref.renderer.$cursorLayer.getPixelPosition(),
                        pageName: page.name,
                        id
                    })
                } catch (err) {
                    setSelectedPage({ top: 0, left: 0, pageName: undefined })
                }
            }, 10)
        }
    }

    useEffect(() => {
        if (ref)
            ref.on("mousedown", onMouseDown);
    }, [ref])

    return <div className='d-flex flex-column' style={{
        position: "relative",
        marginTop: "48px",
        flex: 1
    }}>
        <TopActions setSideView={setSideView} publish={publish} setSelector={setSelector} />
        <div style={{
            position: "relative",
            border: "1px solid rgba(225,225,225,.5)",
            flex: 1
        }} >
            {selectedPage.pageName && <Link className='btn btn-sm px-1' style={{
                position: 'absolute',
                zIndex: 100,
                backgroundColor: "#fff",
                boxShadow: '0 1px 3px rgba(25,25,25.5)',
                top: selectedPage.top - 42,
                left: selectedPage.left
            }}
                to={`/settings/pages/edit/${selectedPage.id}`}
                onClick={() => setSelectedPage({ pageName: undefined })}
            >{`Editer ${selectedPage.pageName}`}</Link>}
            <Editor
                value={value}
                onChange={onChange}
                setRef={setRef}
                mode={(CONTENT_TYPES_TO_MODE[contentType] || "html")}
                theme="tomorrow"
                width="-1" />

            {sideView && <div className='p-3' style={{
                backgroundColor: "#ecf0f1",
                boxShadow: "rgb(25 25 25 / 50%) 3px 3px 3px -2px",
                position: 'absolute',
                top: 0,
                right: '20%',
                left: '20%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                <div className='d-flex align-items-center justify-content-between mb-3'>
                    <h5 style={{ textAlign: "left" }} className="mb-0">Insérer</h5>
                    <i className='fas fa-times'
                        style={{ cursor: 'pointer', padding: '6px' }}
                        onClick={() => setSideView(false)} />
                </div>
                <div className='d-flex'>
                    {[
                        { name: "links", text: translateMethod('cms.content_side_view.choose_link') },
                        { name: "pages", text: translateMethod('cms.content_side_view.link_to_insert'), className: 'mx-2' },
                        { name: "blocks", text: translateMethod('cms.content_side_view.block_to_render') }
                    ].map(({ name, text, className }) => (
                        <button
                            key={name}
                            className={`btn btn-sm btn-outline-${selector === name ? 'primary' : 'secondary'} ${className}`}
                            style={{ opacity: !selector || selector === name ? 1 : .5, flex: 1 }}
                            type="button"
                            onClick={() => setSelector(name)}>
                            <div className='my-3'>
                                <span>{text}</span>
                                <hr />
                                <span>Choisir</span>
                            </div>
                        </button>
                    ))}
                </div>
                {selector === "links" && <LinksView editor={ref} onChange={() => setSideView(false)} />}
                {selector === "pages" && <PagesView pages={pages} prefix="daikoku-page-url"
                    title={translateMethod("cms.content_side_view.link_to_insert")} editor={ref} onChange={() => setSideView(false)} />}
                {selector === "blocks" && <PagesView pages={pages} prefix="daikoku-include-block"
                    title={translateMethod("cms.content_side_view.block_to_render")} editor={ref} onChange={() => setSideView(false)} />}
            </div>}
        </div>
    </div >
}