import React, { useContext, useEffect, useRef, useState } from 'react'
import { Form, constraints, type, format } from '@maif/react-forms'
import { I18nContext } from '../../../core'
import { useNavigate, useParams } from 'react-router-dom'
import * as Services from '../../../services'
import { getApolloContext, gql } from '@apollo/client'
import { ContentSideView } from './ContentSideView'
import moment from 'moment'
import { SelectInput } from '@maif/react-forms/lib/inputs'

export const Create = (props) => {
    const { translateMethod } = useContext(I18nContext)
    const navigate = useNavigate()
    const params = useParams()
    const { client } = useContext(getApolloContext())

    const sideRef = useRef()
    const bodyRef = useRef()

    const [tab, setTab] = useState(0)

    const [sideValue, setSideValue] = useState({
        name: '',
        path: '',
        contentType: 'text/html',
        visible: true,
        authenticated: false,
        metadata: {},
        tags: []
    })

    const [bodyValue, setBodyValue] = useState({
        draft: `<DOCTYPE html><html><head></head><body><h1>${translateMethod('cms.create.default_draft_body')}</h1></body></html>`
    });

    const [savePath, setSavePath] = useState()
    const [finalSideValue, setFinalSideValue] = useState();
    const [finalBodyValue, setFinalBodyValue] = useState();
    const [action, setFormAction] = useState()

    useEffect(() => {
        const onUpdatePreview = action === 'update_before_preview'
        const onPublish = action === 'publish'

        if ((action === 'update' || onUpdatePreview || onPublish) && finalSideValue && finalBodyValue) {
            if (onPublish) {
                const lastPublishedDate = Date.now()
                Services.createCmsPage(params.id, {
                    ...finalSideValue,
                    ...finalBodyValue,
                    body: finalBodyValue.draft,
                    lastPublishedDate
                })
                    .then(() => {
                        setSideValue({ ...sideValue, lastPublishedDate })
                        setBodyValue({ ...bodyValue, body: finalBodyValue.draft })
                    })
            } else
                Services.createCmsPage(params.id, {
                    ...finalSideValue,
                    ...finalBodyValue
                })
                    .then(res => {
                        if (!res.error && !params.id)
                            navigate('/settings/pages', {
                                state: {
                                    reload: true
                                }
                            })
                        else if (res.error)
                            window.alert(res.error)
                        else
                            setSavePath(finalSideValue.path)
                    })

            setFormAction(undefined)
            setFinalSideValue(undefined)
            setFinalBodyValue(undefined)

            if (onUpdatePreview)
                setTab(1)
        }
    }, [finalSideValue, finalBodyValue]);

    useEffect(() => {
        const id = params.id
        if (id)
            client.query({ query: Services.graphql.getCmsPage(id) })
                .then(res => {
                    if (res.data) {
                        const v = {
                            ...res.data.cmsPage,
                            metadata: JSON.parse(res.data.cmsPage.metadata)
                        }
                        setSavePath(v.path)
                        setSideValue(v)
                        setBodyValue({
                            draft: v.draft
                        })
                    }
                })
    }, [params.id]);

    const sideSchema = {
        lastPublishedDate: {
            type: type.string,
            format: format.text
        },
        name: {
            type: type.string,
            placeholder: translateMethod('cms.create.name_placeholder'),
            label: translateMethod('Name'),
            constraints: [
                constraints.required()
            ]
        },
        path: {
            type: type.string,
            placeholder: '/index',
            help: translateMethod('cms.create.path_placeholder'),
            label: translateMethod('Path'),
            constraints: [
                constraints.matches("^/", translateMethod('cms.create.path_slash_constraints')),
                constraints.test('path', translateMethod('cms.create.path_paths_constraints'),
                    value => params.id ? true : !props.pages.find(p => p.path === value))
            ]
        },
        contentType: {
            type: type.string,
            label: translateMethod('Content type'),
            render: ({ rawValues, value, onChange, error }) => <SelectInput
                value={value}
                possibleValues={[
                    { label: 'HTML document', value: 'text/html' },
                    { label: 'CSS stylesheet', value: 'text/css' },
                    { label: 'Javascript script', value: 'text/javascript' },
                    { label: 'Markdown document', value: 'text/markdown' },
                    { label: 'Text plain', value: 'text/plain' },
                    { label: 'XML content', value: 'text/xml' },
                    { label: 'JSON content', value: 'application/json' }
                ]}
                onChange={contentType => {
                    setSideValue({ ...sideValue, contentType })
                    onChange(contentType)
                }}
            />
        },
        visible: {
            type: type.bool,
            label: translateMethod('Visible'),
            help: translateMethod('cms.create.visible_label')
        },
        authenticated: {
            type: type.bool,
            label: translateMethod('cms.create.authenticated'),
            help: translateMethod('cms.create.authenticated_help')
        },

        // metadata: {
        //     type: type.object,
        //     array: true,
        //     label: 'Metadata',
        //     help: translateMethod('cms.create.metadata_help')
        // },
        // tags: {
        //     type: type.string,
        //     format: format.select,
        //     createOption: true,
        //     isMulti: true,
        //     label: 'Tags',
        //     help: translateMethod('cms.create.tags_help')
        // }
    }

    const schema = {
        draft: {
            type: type.string,
            label: null,
            help: translateMethod('cms.create.draft_help'),
            render: formProps => <ContentSideView {...formProps} {...props} contentType={sideValue.contentType}
                publish={() => {
                    setFormAction("publish");
                    [bodyRef, sideRef].map(r => r.current.handleSubmit())
                }}
            />
        }
    }

    const bodyFlow = [
        'draft'
    ]

    const sideFlow = [
        'name',
        'path',
        'contentType',
        'visible',
        'authenticated',
        // {
        //     label: translateMethod('cms.create.advanced'),
        //     flow: ['tags', 'metadata'],
        //     collapsed: true
        // }
    ]

    const Sidebar = () => (
        <>
            <button
                id="toggle-sidebar"
                type="button"
                className="navbar-toggle btn btn-sm btn-access-negative float-left me-2"
                data-toggle="collapse"
                data-target="#sidebar"
                aria-expanded="false"
                aria-controls="sidebar"
            >
                <span className="sr-only">Toggle sidebar</span>
                <span className="chevron" />
            </button>
            <nav className="col-md-3 d-md-block sidebar collapse" id="sidebar">
                <div className="sidebar-sticky" style={{
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <h6 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
                        {params.id ? translateMethod('cms.create.edited_page') : translateMethod('cms.create.new_page')}
                    </h6>
                    <ul className="nav flex-column mb-2 px-3">
                        <li className="nav-item">
                            <Form
                                schema={sideSchema}
                                value={sideValue}
                                flow={sideFlow}
                                onSubmit={side => {
                                    setSideValue(side)
                                    setFinalSideValue(side)
                                }}
                                ref={sideRef}
                                footer={() => null}
                            />
                        </li>
                    </ul>
                    <div className="px-2 mb-4 mt-auto">
                        {sideValue.lastPublishedDate && <div>
                            <span>{translateMethod('cms.create.last_update')}</span>
                            <span>{sideValue.lastPublishedDate && moment(sideValue.lastPublishedDate).format('DD MMMM y kk:mm')}</span>
                        </div>}
                        <div className='d-flex mt-3'>
                            <button className="btn btn-sm btn-primary me-1" style={{ flex: 1 }} type="button"
                                onClick={() => navigate('/settings/pages')}>{translateMethod('cms.create.back_to_pages')}</button>
                            <button className="btn btn-sm btn-success" style={{ flex: 1 }} type="button"
                                onClick={updatePage}>
                                {params.id ? translateMethod('cms.create.save_modifications') : translateMethod('cms.create.create_page')}
                            </button>
                        </div>
                    </div>
                </div>
            </nav>
        </>
    )

    const updatePage = () => {
        setFormAction("update");
        [bodyRef, sideRef].map(r => r.current.handleSubmit())
    }

    const TabButton = ({ title, onClose, onClick, selected }) => (
        <div style={{
            height: "42px",
            backgroundColor: "#fff",
            display: 'flex',
            alignItems: 'center',
            boxShadow: selected ? '0 1px 3px rgba(25,25,25,.5)' : 'none',
            backgroundColor: 'var(--sidebar-bg-color, #f8f9fa)',
            borderRadius: '4px',
            zIndex: selected ? 2 : 0
        }} onClick={onClick} className='px-3'>
            <button className='btn btn-sm' type="button">{title}</button>
            {onClose && <i className='fas fa-times' />}
        </div>
    )

    return (
        <>
            <Sidebar />
            <div className='p-2 d-flex flex-column' style={{ flex: 1, overflow: 'hidden' }}>
                <div className='d-flex align-items-center mt-2'>
                    {[
                        { title: translateMethod('cms.create.draft'), id: 0 },
                        {
                            title: translateMethod('cms.create.draft_preview'), id: 1, showPreview: () => {
                                setFormAction("update_before_preview");
                                [bodyRef, sideRef].map(r => r.current.handleSubmit())
                            }
                        },
                        { title: translateMethod('cms.create.content'), id: 2 }
                    ].map(({ title, id, showPreview }) => (
                        <TabButton title={title}
                            selected={tab === id}
                            key={`tabButton${id}`}
                            onClick={() => {
                                if (showPreview)
                                    showPreview()
                                else {
                                    setFormAction(undefined);
                                    [bodyRef, sideRef].map(r => {
                                        if (r && r.current)
                                            r.current.handleSubmit()
                                    })
                                    setTab(id)
                                }
                            }} />
                    ))}
                </div>
                <div style={{
                    display: tab === 0 ? 'block' : 'none'
                }}>
                    <Form
                        schema={schema}
                        value={bodyValue}
                        flow={bodyFlow}
                        onSubmit={body => {
                            setBodyValue(body)
                            setFinalBodyValue(body)
                        }}

                        ref={bodyRef}
                        footer={() => null}
                    />
                </div>
                {tab === 1 && <iframe className='mt-3' style={{ flex: 1 }} src={`/_${savePath || '/'}?draft=true`} />}
                {tab === 2 && <iframe className='mt-3' style={{ flex: 1 }} src={`/_${savePath || '/'}`} />}
            </div>
        </>
    )
}