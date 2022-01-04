import React, { useContext } from 'react'
import { Form, constraints, type, format } from '@maif/react-forms'
import { I18nContext } from '../../../core'
import { useNavigate } from 'react-router-dom'
import * as Services from '../../../services'

export const Create = () => {
    const { translateMethod } = useContext(I18nContext);
    const navigate = useNavigate()

    const schema = {
        name: {
            type: type.string,
            placeholder: 'The name of the page.',
            label: translateMethod('Name')
        },
        path: {
            type: type.string,
            placeholder: '/index',
            help: 'The path where the page will be displayed',
            label: translateMethod('Path')
        },
        body: {
            type: type.string,
            format: format.code,
            help: 'The content of the page. It must be of the same type than the content-type',
            value: '<html><head></head><body><h1>Home page</h1></body></html>'
        },
        draft: {
            type: type.string,
            format: format.code,
            help: 'The content of the draft page. This is useful when you want to work on a future version of your page without exposing it.',
            value: '<html><head></head><body><h1>My draft version</h1></body></html>',
            constraints: [
                constraints.nullable()
            ]
        },
        visible: {
            type: type.bool,
            label: 'Visible',
            help: 'If not enabled, the page will not exposed',
        },
        authenticated: {
            type: type.bool,
            label: 'Authenticated',
            help: 'If enabled, the page will be only visible for authenticated user',
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
        metadata: {
            type: type.object,
            format: format.array,
            label: 'Metadata',
            help: 'Linked tags'
        },
    }

    const flow = ['name', 'path', 'body', 'draft', 'visible', 'authenticated', /*'tags'*/, 'metadata']

    return (
        <div>
            <h1>{translateMethod("cms.create.new_page")}</h1>
            <Form
                schema={schema}
                flow={flow}
                onSubmit={item => {
                    Services.createCmsPage(item)
                        .then(res => {
                            console.log(res)
                        })
                    console.log({ item })
                }}
                footer={({ reset, valid }) => {
                    return (
                        <div className="d-flex justify-content-end">
                            <button className="btn btn-primary m-3" onClick={() => navigate(-1)}>Back</button>
                            <button className="btn btn-success m-3" onClick={valid}>Créer</button>
                        </div>
                    )
                }}
            />
        </div>
    )
}