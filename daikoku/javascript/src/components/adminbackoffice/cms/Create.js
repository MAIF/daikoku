import React, { useContext, useEffect, useRef, useState } from 'react'
import { Form, constraints, type, format } from '@maif/react-forms'
import { I18nContext } from '../../../core'
import { useNavigate, useParams } from 'react-router-dom'
import * as Services from '../../../services'
import { getApolloContext, gql } from '@apollo/client'
import { ContentSideView } from './ContentSideView'

export const Create = (props) => {
    const { translateMethod } = useContext(I18nContext)
    const navigate = useNavigate()
    const params = useParams()
    const ref = useRef()
    const { client } = useContext(getApolloContext())

    const [tab, setTab] = useState(0)

    const [value, setValue] = useState({
        name: '',
        path: '',
        body: `<DOCTYPE html>
<html>
    <head></head>
    <body>
        <h1>${translateMethod('cms.create.default_body_text')}</h1>
    </body>
</html>
        `,
        draft: `<DOCTYPE html>
<html>
    <head></head>
    <body>
        <h1>${translateMethod('cms.create.default_draft_body')}</h1>
    </body>
</html>`,
        contentType: 'text/html',
        visible: true,
        authenticated: false,
        metadata: {},
        tags: []
    })

    useEffect(() => {
        const id = params.id
        if (id)
            client.query({
                query: gql`
                query GetCmsPage {
                    cmsPage(id: "${id}") {
                        name
                        path
                        body
                        draft
                        visible
                        authenticated
                        metadata
                        contentType
                        tags
                        lastPublishedDate
                    }
                }
            `})
                .then(res => {
                    if (res.data)
                        setValue({
                            ...res.data.cmsPage,
                            metadata: JSON.parse(res.data.cmsPage.metadata)
                        })
                })
    }, []);

    const schema = {
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
            format: format.select,
            label: translateMethod('Content type'),
            options: [
                { label: 'HTML document', value: 'text/html' },
                { label: 'CSS stylesheet', value: 'text/css' },
                { label: 'Javascript script', value: 'text/javascript' },
                { label: 'Markdown document', value: 'text/markdown' },
                { label: 'Text plain', value: 'text/plain' },
                { label: 'XML content', value: 'text/xml' },
                { label: 'JSON content', value: 'application/json' }
            ]
        },
        draft: {
            type: type.string,
            label: null,
            help: translateMethod('cms.create.draft_help'),
            render: formProps => <ContentSideView {...formProps} {...props} publish={() => {
                const newValue = {
                    ...formProps.rawValues,
                    body: formProps.rawValues.draft,
                }
                setValue(newValue)
                Services.createCmsPage(params.id, {
                    ...newValue,
                    lastPublishedDate: Date.now()
                })
            }} />
        },
        body: {
            type: type.string,
            format: format.code,
            props: {
                theme: 'tomorrow',
                width: '-1',
                style: {
                    zIndex: 0,
                    isolation: 'isolate',
                    border: "1px solid rgba(225,225,225,.5)"
                }
            },
            label: null,
            help: translateMethod('cms.create.body_help'),
            disabled: true,
            readOnly: true,
            constraints: [
                constraints.nullable()
            ]
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
        metadata: {
            type: type.object,
            format: format.array,
            label: 'Metadata',
            help: translateMethod('cms.create.metadata_help')
        },
        tags: {
            type: type.string,
            format: format.select,
            createOption: true,
            isMulti: true,
            label: 'Tags',
            help: translateMethod('cms.create.tags_help')
        },
    }

    const bodyFlow = [
        'draft'
    ]

    const productionFlow = ['body']

    const sideFlow = [
        'name',
        'path',
        'contentType',
        'visible',
        'authenticated'
        ,
        {
            label: translateMethod('cms.create.advanced'),
            flow: ['tags', 'metadata'],
            collapsed: true
        }]

    const CustomForm = ({ flow }) => (
        <Form
            schema={schema}
            flow={flow}
            value={value}
            onError={console.log}
            onSubmit={item => {
                Services.createCmsPage(params.id, item)
                    .then(res => {
                        if (!res.error && !params.id)
                            navigate('/settings/pages', {
                                state: {
                                    reload: true
                                }
                            })
                        else if (res.error)
                            window.alert(res.error)
                    })
            }}
            ref={ref}
            footer={() => null}
        />
    )

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
                            <CustomForm flow={sideFlow} />
                        </li>
                    </ul>
                    <div className="px-2 mb-4 mt-auto d-flex">
                        <button className="btn btn-sm btn-primary me-1" style={{ flex: 1 }}
                            onClick={() => navigate('/settings/pages')}>{translateMethod('cms.create.back_to_pages')}</button>
                        <button className="btn btn-sm btn-success" style={{ flex: 1 }}
                            onClick={ref.current?.handleSubmit}>
                            {params.id ? translateMethod('cms.create.save_modifications') : translateMethod('cms.create.create_page')}
                        </button>
                    </div>
                </div>
            </nav>
        </>
    )

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
            <button className='btn btn-sm'>{title}</button>
            {onClose && <i className='fas fa-times' />}
        </div>
    )

    return (
        <>
            <Sidebar />
            <div className='p-2 d-flex flex-column' style={{ flex: 1 }}>
                <div className='d-flex align-items-center mt-2'>
                    <TabButton title={translateMethod('cms.create.draft')} onClick={() => setTab(0)} selected={tab === 0} />
                    <TabButton title={translateMethod('cms.create.content')} onClick={() => setTab(1)} selected={tab === 1} />
                </div>
                {tab === 0 && <CustomForm flow={bodyFlow} />}
                {tab === 1 && <CustomForm flow={productionFlow} />}
            </div>
            {/* {value.lastPublishedDate && <div>
                        <span>{translateMethod('cms.create.last_update')}</span>
                        <span>{value.lastPublishedDate && moment(value.lastPublishedDate).format('DD MMMM y kk:mm')}</span>
                    </div>} */}
        </>
    )
}