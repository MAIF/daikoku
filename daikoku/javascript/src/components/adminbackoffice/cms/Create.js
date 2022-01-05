import React, { useContext, useEffect, useState } from 'react'
import { Form, constraints, type, format } from '@maif/react-forms'
import { I18nContext } from '../../../core'
import { useNavigate, useParams } from 'react-router-dom'
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
        body: '<html><head></head><body><h1>Home page</h1></body></html>',
        draft: '<html><head></head><body><h1>My draft version</h1></body></html>',
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
                constraints.required()
            ]
        },
        body: {
            type: type.string,
            format: format.code,
            help: 'The content of the page. It must be of the same type than the content-type',
        },
        draft: {
            type: type.string,
            format: format.code,
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

    const flow = ['name', 'path', 'body', 'draft', 'visible', 'authenticated', /*'tags'*/, 'metadata']

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
                footer={({ reset, valid }) => {
                    return (
                        <div className="d-flex justify-content-end">
                            <button className="btn btn-sm btn-primary me-1" onClick={() => navigate(-1)}>Back</button>
                            <button className="btn btn-sm btn-success" onClick={valid}>
                                {params.id ? translateMethod('cms.create.save_modifications') : translateMethod('cms.create.create_page')}
                            </button>
                        </div>
                    )
                }}
            />
        </div>
    )
}