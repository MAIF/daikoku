import React, { useContext, useEffect, useState } from 'react'
import { Form, constraints, type, format } from '@maif/react-forms'
import { I18nContext } from '../../../core'
import { useNavigate, useParams } from 'react-router-dom'
import * as Services from '../../../services'
import { getApolloContext, gql } from '@apollo/client'
import { ContentSideView } from './ContentSideView'
import moment from 'moment'

export const Create = (props) => {
    const { translateMethod } = useContext(I18nContext)
    const navigate = useNavigate()
    const params = useParams()
    const { client } = useContext(getApolloContext())

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
            label: translateMethod('cms.create.draft_label'),
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
                width: '-1'
            },
            label: translateMethod('cms.create.body_placeholder'),
            help: translateMethod('cms.create.body_help'),
            disabled: true,
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

    const flow = [{
        label: translateMethod('cms.create.information'),
        flow: [
            'name', 'path', 'visible', 'authenticated'
        ],
        collapsed: params.id
    },
    {
        label: translateMethod('cms.create.draft'),
        flow: ['contentType', 'draft'],
        collapsed: !params.id
    },
    {
        label: translateMethod('cms.create.content'),
        flow: [
            'body'
        ],
        collapsed: true
    },
    {
        label: translateMethod('cms.create.advanced'),
        flow: ['tags', 'metadata'],
        collapsed: true
    }]

    return (
        <div>
            <div className='d-flex justify-content-lg-between align-items-center'>
                <h1 className='my-0'>{params.id ? translateMethod('cms.create.edited_page') : translateMethod('cms.create.new_page')}</h1>
                {value.lastPublishedDate &&
                    <span className='h6 my-0'>
                        {translateMethod('cms.create.last_update')} {' : '} {value.lastPublishedDate && moment(value.lastPublishedDate).format('DD MMMM y kk:mm')}
                    </span>}
            </div>
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
                footer={({ valid }) => (
                    <div className="d-flex justify-content-end mt-3">
                        <button className="btn btn-sm btn-primary me-1"
                            onClick={() => navigate('/settings/pages')}>{translateMethod('cms.create.back_to_pages')}</button>
                        <button className="btn btn-sm btn-success" onClick={valid}>
                            {params.id ? translateMethod('cms.create.save_modifications') : translateMethod('cms.create.create_page')}
                        </button>
                    </div>
                )}
            />
        </div>
    )
}