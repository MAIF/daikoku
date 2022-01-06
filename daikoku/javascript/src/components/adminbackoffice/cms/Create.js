import React, { useContext, useEffect, useRef, useState } from 'react'
import { Form, constraints, type, format } from '@maif/react-forms'
import { I18nContext } from '../../../core'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import * as Services from '../../../services'
import { getApolloContext, gql } from '@apollo/client'

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
        contentType: { label: 'HTML document', value: 'text/html' },
        visible: true,
        authenticated: false,
        metadata: {}
        /*'tags'*/
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
            format: format.code,
            label: 'Content of the page',
            help: 'The content of the page. It must be of the same type than the content-type',
        },
        draft: {
            type: type.string,
            format: format.code,
            label: 'Draft content',
            help: 'The content of the draft page. This is useful when you want to work on a future version of your page without exposing it.',
            constraints: [
                constraints.nullable()
            ]
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
            help: 'Linked tags'
        },
        // tags: {
        //     type: type.string,
        //     format: format.select,
        //     createOption: true,
        //     isMulti: true,
        //     label: 'Tags',
        //     help: 'Linked tags',
        //     constraints: [
        //         constraints.nullable()
        //     ],
        //     value: []
        // },
    }

    const informationFlow = ['name', 'path', 'visible', 'authenticated', /*'tags'*/, 'metadata']
    const contentFlow = ['contentType', 'body']
    const draftFlow = ['draft']

    const flow = {
        draft: draftFlow,
        content: contentFlow,
        information: informationFlow
    }[params.tab]

    if (!flow)
        return navigate('/settings/pages')

    return (
        <div>
            <h1>{params.id ? translateMethod('cms.create.edited_page') : translateMethod('cms.create.new_page')}</h1>
            <ul className="nav nav-tabs flex-column flex-sm-row">
                {[
                    { name: 'Information', to: '/information' },
                    { name: 'Content', to: '/content' },
                    { name: 'Draft content', to: '/draft' },
                ].map(({ name, to }) => (
                    <li className="nav-item">
                        <NavLink className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                            to={params.id ? `/settings/pages/edit/${params.id}${to}` : `/settings/pages/new${to}`}>
                            {name}
                        </NavLink>
                    </li>
                ))}
            </ul>
            <Form
                schema={schema}
                flow={flow}
                value={value}
                options={{
                    autosubmit: true
                }}
                onSubmit={item => {
                    console.log(item)
                    setValue(item)
                }}
                footer={() => null}
            />
            <>
                {/* {params.id && params.tab === "content" &&
                    <>
                        <span>Preview</span>
                        <iframe src={`/_${value.path}`}
                            style={{
                                width: '100%',
                                border: 0
                            }} />
                    </>
                } */}
                <div className="d-flex justify-content-end">
                    <button className="btn btn-sm btn-primary me-1" onClick={() => navigate('/settings/pages')}>Back</button>
                    <button className="btn btn-sm btn-success" onClick={() => {
                        Services.createCmsPage(params.id, value)
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
                    }}>
                        {params.id ? translateMethod('cms.create.save_modifications') : translateMethod('cms.create.create_page')}
                    </button>
                </div>
            </>
        </div>
    )
}