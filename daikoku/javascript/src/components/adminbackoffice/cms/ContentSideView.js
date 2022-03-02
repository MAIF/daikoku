import { CodeInput, SelectInput } from '@maif/react-forms/lib/inputs';
import React, { useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../core';
import Editor from './Editor'
import Helpers from './helpers.json'

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

    return <div>
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
    <div>
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
    const navigate = useNavigate()
    const select = id => {
        setSelector(undefined)
        setSideView(true)
    }

    return <div className="d-flex justify-content-between" style={{
        position: "absolute",
        top: "-42px",
        right: 0,
        left: 0
    }} id="content_sideview_parent">
        <button className='btn btn-sm btn-outline-primary me-1'
            type="button"
            onClick={select}>
            <i className='fas fa-plus pe-1' />
            {translateMethod('cms.content_side.new_action')}
        </button>
        <div className='d-flex'>
            <button className='btn btn-sm btn-outline-primary' onClick={() => navigate('revisions')}>
                Révisions
            </button>
            <button className='btn btn-sm btn-outline-success ms-1'
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
    </div>
}

const HelperView = ({ content, onChange, editor }) => {
    const [value, setValue] = useState(content.example)
    const { translateMethod } = useContext(I18nContext)

    useEffect(() => {
        setValue(content.example)
    }, [content.example])

    return <div>
        <h5>{translateMethod(`cms.content_side_view.${content.name}`)}</h5>
        {content.parameters && <div>
            <h6>Parameters</h6>
            <ul>
                {(content.parameters || []).map(name => (
                    <li key={`${name}`}>{name}</li>
                ))}
            </ul>
        </div>}
        {content.link && <a className='btn btn-sm btn-outline-info my-2'
            href={`https://maif.github.io/daikoku/swagger-ui/index.html${content.link}`} target="_blank" rel="noreferrer noopener">Link to the model</a>}
        <CodeInput
            onChange={setValue}
            value={value}
            width="-1"
            height='180px'
            useWrapMode={true}
        />
        <button className='btn btn-sm btn-outline-success mt-3' onClick={() => {
            onChange()
            copy(editor, value)
        }}>Insérer</button>
    </div>
}

export const ContentSideView = ({ value, onChange, pages, publish, contentType }) => {
    const { translateMethod } = useContext(I18nContext)
    const [sideView, setSideView] = useState(false);
    const [selector, setSelector] = useState("");
    const [search, setSearch] = useState("")
    const [helpersList, setHelpers] = useState([])
    const [ref, setRef] = useState();

    const [selectedPage, setSelectedPage] = useState({
        top: 0,
        left: 0,
        pageName: undefined
    })

    const [height, setHeight] = useState(500);

    useEffect(() => {
        setHelpers(Helpers
            .reduce((acc, curr) => ({
                ...acc,
                [curr.important || curr.category]: {
                    collapsed: true,
                    helpers: [
                        ...((acc[curr.important || curr.category] || {}).helpers || []),
                        {
                            ...curr,
                            term: translateMethod(`cms.content_side_view.${curr.name}`)
                                .toLowerCase()
                                .replace(/[\[\]&]+/g, '')
                        }
                    ]
                }
            }), {}))

        searchHeight()
    }, [])

    const searchHeight = () => {
        if (!document.getElementById("content_sideview_parent"))
            setTimeout(searchHeight, 250)
        else
            setHeight(window.innerHeight - document.getElementById("content_sideview_parent").getBoundingClientRect().top - 75)
    }

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

    const filterHelpers = value => {
        const term = value.toLowerCase()
            .replace(/[\[\]&]+/g, '')
        setSearch(value)

        setHelpers(Object.fromEntries(
            Object.entries(helpersList)
                .map(([g, { helpers, ...rest }]) => [
                    g,
                    {
                        ...rest,
                        collapsed: term.length > 0 ? false : true,
                        helpers: helpers.map(helper => ({
                            ...helper,
                            filtered: term.length === 0 ? false : !helper.term.includes(term)
                        }))
                    }])
        ))
    }

    console.log(helpersList)

    return <div className='d-flex flex-column' style={{
        position: "relative",
        marginTop: "52px",
        flex: 1
    }}>
        <TopActions setSideView={setSideView} publish={publish} setSelector={setSelector} />
        <span style={{
            fontStyle: "italic",
            fontSize: "13px"
        }}>{translateMethod('cms.body.drag_and_drop_advice')}</span>
        <div style={{
            position: "relative",
            border: "1px solid rgba(225,225,225,.5)",
            flex: 1
        }} >
            {selectedPage.pageName && <Link className='btn btn-sm px-1' style={{
                position: 'absolute',
                zIndex: 100,
                top: selectedPage.top - 42,
                left: selectedPage.left,
                backgroundColor: '#fff',
                border: '1px solid #f0f1f6',
                boxShadow: '0 1px 3px rgb(0 0 0 / 15%)'
            }}
                to={`/settings/pages/edit/${selectedPage.id}`}
                onClick={() => setSelectedPage({ pageName: undefined })}
            >{`${translateMethod('cms.content_side_view.edit')} ${selectedPage.pageName}`}</Link>}
            <Editor
                value={value}
                onChange={onChange}
                onLoad={editorInstance => {
                    setRef(editorInstance)
                    editorInstance.container.style.resize = "both";
                    document.addEventListener("mouseup", e => (
                        editorInstance.resize()
                    ));
                }}
                mode={(CONTENT_TYPES_TO_MODE[contentType] || "html")}
                height={height}
                width="-1" />
            {sideView && <div style={{
                backgroundColor: '#fff',
                position: 'absolute',
                inset: 0
            }}>
                <div className='d-flex' style={{ height: '100%', position: 'relative' }}>
                    {selector !== 'history' && <div className="p-3" style={{
                        flex: !selector ? 1 : .75, backgroundColor: '#efefef', overflowY: 'scroll'
                    }}>
                        <div>
                            <input
                                type="text"
                                className="form-control mb-2"
                                placeholder={translateMethod('cms.content_side_view.search_text')}
                                value={search}
                                onChange={e => filterHelpers(e.target.value)}
                                style={{ border: 'none' }}
                            />
                        </div>
                        <div className='d-flex flex-column'>
                            {Object.entries(helpersList).map(([groupName, { helpers, collapsed }]) => (
                                <div onClick={() => setHelpers(Object.fromEntries(Object.entries(helpersList)
                                    .map(([g, { collapsed, ...rest }]) => {
                                        if (g === groupName)
                                            return [g, { ...rest, collapsed: !collapsed, helpers: rest.helpers.map(helper => ({ ...helper, filtered: false })) }]
                                        return [g, { ...rest, collapsed }]
                                    }))
                                )}>
                                    {helpers
                                        .filter(helper => !helper.filtered)
                                        .length > 0 && <div style={{
                                            background: '#fff'
                                        }} className="p-2 px-3 mb-1 d-flex justify-content-between align-items-center">
                                            <span>{groupName}</span>
                                            <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'}`}></i>
                                        </div>}
                                    {!collapsed && helpers
                                        .filter(helper => !helper.filtered)
                                        .map(helper => <button
                                            id={helper.name}
                                            type="button"
                                            key={helper.name}
                                            className="py-2 ps-3 mb-2"
                                            style={{
                                                textAlign: 'left',
                                                flex: 1,
                                                width: '100%',
                                                border: 'none',
                                                backgroundColor: selector?.name === helper.name ? '#bdc3c7' : '#ddd',
                                                borderRight: `${selector?.name === helper.name ? 2 : 0}px solid`,
                                                fontSize: '14px'
                                            }}
                                            onClick={e => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                setSelector(helper)
                                            }}>
                                            {translateMethod(`cms.content_side_view.${helper.name}`)}
                                        </button>
                                        )}
                                </div>
                            ))}
                        </div>
                    </div>}
                    <div style={{ flex: selector ? 1 : 0 }} className="ms-2 p-3">
                        <i className='fas fa-times'
                            style={{
                                cursor: 'pointer',
                                padding: '6px',
                                position: 'absolute',
                                top: '6px',
                                right: '6px'
                            }}
                            onClick={() => setSideView(false)} />
                        {selector?.name === "links" && <LinksView editor={ref} onChange={() => setSideView(false)} />}
                        {selector?.name === "pages" && <PagesView pages={pages} prefix="daikoku-page-url"
                            title={translateMethod("cms.content_side_view.link_to_insert")} editor={ref} onChange={() => setSideView(false)} />}
                        {selector?.name === "blocks" && <PagesView pages={pages} prefix="daikoku-include-block"
                            title={translateMethod("cms.content_side_view.block_to_render")} editor={ref} onChange={() => setSideView(false)} />}
                        {((selector?.name.startsWith("daikoku") || (!['links', 'blocks', 'pages'].includes(selector?.name))) && selector) &&
                            <HelperView editor={ref} onChange={() => setSideView(false)} content={selector} />}
                    </div>
                </div>
            </div>}
        </div>
    </div >
}