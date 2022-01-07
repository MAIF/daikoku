import React, { useContext, useEffect, useState } from 'react'
import { Form, constraints, type, format } from '@maif/react-forms'
import { I18nContext } from '../../../core'
import { useNavigate, useParams } from 'react-router-dom'
import * as Services from '../../../services'
import { getApolloContext, gql } from '@apollo/client'
import { CodeInput, SelectInput } from '@maif/react-forms/lib/inputs'

export const Create = () => {
    const { translateMethod } = useContext(I18nContext)
    const navigate = useNavigate()
    const params = useParams()
    const { client } = useContext(getApolloContext())

    const [value, setValue] = useState({
        name: '',
        path: '',
        body: '<!DOCTYPE html><html><head></head><body><h1>Home page</h1></body></html>',
        draft: '<!DOCTYPE html><html><head></head><body><h1>My draft version</h1></body></html>',
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
            placeholder: 'The name of the page.',
            label: translateMethod('Name'),
            constraints: [
                constraints.required()
            ]
        },
        path: {
            type: type.string,
            placeholder: '/index',
            help: 'The path where the page will be displayed',
            label: translateMethod('Path'),
            constraints: [
                constraints.required(),
                constraints.matches("^/")
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
        body: {
            type: type.string,
            label: 'Content of the page',
            help: 'The content of the page. It must be of the same type than the content-type',
            render: ({ value, onChange }) => {
                const [sideView, setSideView] = useState(false);
                const [selector, setSelector] = useState("");
                const [sideViewState, setSideViewState] = useState({});

                return <div style={{
                    position: "relative",
                    marginTop: "12px"
                }}>
                    <div style={{
                        position: "absolute",
                        top: "-36px",
                        right: 0,
                        zIndex: 100
                    }}>
                        <button className='btn btn-sm btn-outline-primary'
                            type="button"
                            onClick={() => {
                                setSideView(true)
                                setSelector("links")
                            }}>
                            <i className='fas fa-link' />
                        </button>
                    </div>
                    <div className='d-flex'>
                        <div style={{ flex: 1 }}>
                            <CodeInput value={value} onChange={onChange} />
                        </div>
                        {sideView && <div style={{ flex: 1 }} className='p-2'>
                            {selector === "links" && <>
                                <span className='mb-1'>Choose the link to import</span>
                                <SelectInput possibleValues={[
                                    { label: "Notifications", value: "notifications" },
                                    { label: "Sign in", value: "login" },
                                    { label: "Logout", value: "logout" },
                                    { label: "Language", value: "language" },
                                    { label: "Back office", value: "backoffice" },
                                    { label: "Sign up", value: "signup" }
                                ]} onChange={link => setSideViewState({ link })} />
                            </>}
                            <button type="button" className='btn btn-sm btn-outline-secondary mt-1 me-1'
                                onClick={() => {
                                    setSideView(false)
                                }}>Cancel
                            </button>
                            <button type="button" className='btn btn-sm btn-outline-primary mt-1'
                                onClick={() => {
                                    navigator.clipboard.writeText(`{{daikoku-links-${sideViewState.link}}}`)
                                    setSideView(false)
                                }}>Copy
                            </button>
                        </div>}
                    </div>
                </div>
            }
        },
        draft: {
            type: type.string,
            format: format.code,
            label: 'Draft content',
            help: 'The content of the draft page. This is useful when you want to work on a future version of your page without exposing it.'
        },
        visible: {
            type: type.bool,
            label: 'Visible',
            help: 'If not enabled, the page will not exposed'
        },
        authenticated: {
            type: type.bool,
            label: 'Authenticated',
            help: 'If enabled, the page will be only visible for authenticated user'
        },
        metadata: {
            type: type.object,
            format: format.array,
            label: 'Metadata',
            help: 'Linked metadata'
        },
        tags: {
            type: type.string,
            format: format.select,
            createOption: true,
            isMulti: true,
            label: 'Tags',
            help: 'Linked tags'
        },
    }

    const flow = [{
        label: 'Information',
        flow: [
            'name', 'path', 'visible', 'authenticated', 'tags', 'metadata'
        ],
        collapsed: params.id
    },
    {
        label: 'Content',
        flow: [
            'contentType',
            'body'
        ],
        collapsed: !params.id
    },
    {
        label: 'Draft',
        flow: ['draft'],
        collapsed: true
    }]

    return (
        <div>
            <h1>{params.id ? translateMethod('cms.create.edited_page') : translateMethod('cms.create.new_page')}</h1>
            <Form
                schema={schema}
                flow={flow}
                value={value}
                onSubmit={item => {
                    Services.createCmsPage(params.id, item)
                        .then(res => {
                            if (!res.error)
                                navigate('/settings/pages', {
                                    state: {
                                        reload: true
                                    }
                                })
                            else
                                window.alert(res.error)
                        })
                }}
                footer={({ valid }) => (
                    <div className="d-flex justify-content-end">
                        <button className="btn btn-sm btn-primary me-1" onClick={() => navigate('/settings/pages')}>Back</button>
                        <button className="btn btn-sm btn-success" onClick={valid}>
                            {params.id ? translateMethod('cms.create.save_modifications') : translateMethod('cms.create.create_page')}
                        </button>
                    </div>
                )}
            />
        </div>
    )
}