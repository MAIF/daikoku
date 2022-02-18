import { CodeInput, SelectInput } from '@maif/react-forms/lib/inputs';
import moment from 'moment';
import React, { useContext, useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom';
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
    }}>
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
    const { text, parameters, example } = content
    const [value, setValue] = useState(example)
    return <div>
        <h5>{text}</h5>
        <div>
            <h6>Parameters</h6>
            <ul>
                {parameters.map(name => (
                    <li key={`${name}`}>{name}</li>
                ))}
            </ul>
        </div>
        <CodeInput
            onChange={setValue}
            value={value}
            width="-1"
            height='180px'
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
        marginTop: "52px",
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
                theme="tomorrow"
                width="-1" />
            {sideView && <div style={{
                backgroundColor: '#fff',
                position: 'absolute',
                inset: 0
            }}>
                <div className='d-flex' style={{ height: '100%', position: 'relative' }}>
                    {selector !== 'history' && <div className="p-3" style={{
                        flex: .75, backgroundColor: '#efefef', overflowY: 'scroll'
                    }}>
                        <h5 style={{ textAlign: "left" }}>
                            {translateMethod('cms.content_side_view.insert')}
                        </h5>
                        <div className='d-flex flex-column'>
                            {[
                                { name: "links", text: translateMethod('cms.content_side_view.choose_link') },
                                { name: "pages", text: translateMethod('cms.content_side_view.link_to_insert') },
                                { name: "blocks", text: translateMethod('cms.content_side_view.block_to_render') },
                                {
                                    name: "daikoku-user",
                                    text: "Get user information (name, email and picture)",
                                    parameters: [
                                        'id of the user, String value expected'
                                    ],
                                    example: '{{#daikoku-user \'{{userId}}\'}}\n<div>\n<span>{{user.name}}</span>\n<img src="{{user.picture}}"/>\n</div>\n{{/daikoku-user}}'
                                },
                                {
                                    name: "daikoku-owned-apis",
                                    text: 'Get owned apis',
                                    parameters: [
                                        'The visibility value : Private, Public or All'
                                    ],
                                    example: '{{#daikoku-owned-apis visibility="Private"}}\n<span>Mon api : {{api.name}}\n{{/daikoku-owned-apis}}'
                                },
                                {
                                    name: "daikoku-owned-api",
                                    text: 'Get owned api',
                                    parameters: [
                                        'The id of the api, String value expected',
                                        'The version, as named parameter, optional or set as 1.0.0 by default'
                                    ],
                                    example: '{{#daikoku-owned-api \'{{apiId}}\' version=\'1.0.0\'}}\n<span>Mon api : {{api.name}}\n{{/daikoku-owned-api}}'
                                },
                                {
                                    name: "daikoku-json-owned-apis",
                                    text: 'Get owned apis as stringified JSON format',
                                    parameters: [
                                        'The visibility value : Private, Public or All'
                                    ],
                                    example: '{{#daikoku-json-owned-apis visibility="Private"}}{{/daikoku-json-owned-apis}}'
                                },
                                {
                                    name: "daikoku-json-owned-api",
                                    text: 'Get owned api as stringified JSON format',
                                    parameters: [
                                        'The id of the api, String value expected',
                                        'The version, as named parameter, optional or set as 1.0.0 by default'
                                    ],
                                    example: '{{#daikoku-json-owned-api \'{{apiId}}\' version=\'1.0.0\'}}{{/daikoku-json-owned-api}}'
                                },
                                {
                                    name: "daikoku-owned-teams",
                                    text: 'Get owned teams',
                                    parameters: [],
                                    example: '{{#daikoku-owned-teams}}\n<span>Ma team : {{team.name}}\n{{/daikoku-owned-teams}}'
                                },
                                {
                                    name: "daikoku-owned-team",
                                    text: 'Get owned team',
                                    parameters: ['The id of the team, String value expected'],
                                    example: '{{#daikoku-owned-team \'{{teamId}}\'}}\n<span>Mon team : {{team.name}}\n{{/daikoku-owned-team}}'
                                },
                                {
                                    name: "daikoku-json-owned-teams",
                                    text: 'Get owned apis as stringified JSON format',
                                    parameters: [],
                                    example: '{{#daikoku-json-owned-teams}}{{/daikoku-json-owned-teams}}'
                                },
                                {
                                    name: "daikoku-json-owned-team",
                                    text: 'Get owned team as stringified JSON format',
                                    parameters: ['The id of the team, String value expected'],
                                    example: '{{#daikoku-json-owned-team \'{{teamId}}\'}}{{/daikoku-json-owned-team}}'
                                }
                            ].map(props => (
                                <button
                                    type="button"
                                    key={props.name}
                                    className="py-2 mb-1 ps-3"
                                    style={{
                                        textAlign: 'left',
                                        flex: 1,
                                        width: '100%',
                                        border: 'none',
                                        backgroundColor: selector?.name === props.name ? '#eee' : '#ddd',
                                        borderRight: `${selector?.name === props.name ? 2 : 0}px solid`,
                                        fontSize: '14px'
                                    }}
                                    onClick={() => setSelector(props)}>
                                    {props.text}
                                </button>
                            ))}
                        </div>
                    </div>}
                    <div style={{ flex: 1 }} className="ms-2 p-3">
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
                        {selector?.name.startsWith("daikoku") && <HelperView editor={ref} onChange={() => setSideView(false)} content={selector} />}
                    </div>
                </div>
            </div>}
        </div>
    </div >
}