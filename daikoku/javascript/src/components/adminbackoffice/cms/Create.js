import React, { useContext, useEffect, useRef, useState } from 'react'
import { I18nContext } from '../../../core'
import { useNavigate, useParams } from 'react-router-dom'
import * as Services from '../../../services'
import { getApolloContext } from '@apollo/client'

import Sidebar from './Sidebar'
import Body from './Body'

export const Create = (props) => {
    const { client } = useContext(getApolloContext())
    const { translateMethod } = useContext(I18nContext)
    const params = useParams()
    const navigate = useNavigate()
    const [tab, setTab] = useState(0)

    const sideRef = useRef()
    const bodyRef = useRef()

    const [inValue, setInValue] = useState({})
    const [savePath, setSavePath] = useState()
    const [contentType, setContentType] = useState()

    const [finalSideValue, setFinalSideValue] = useState();
    const [finalBodyValue, setFinalBodyValue] = useState();
    const [action, setFormAction] = useState()

    useEffect(() => {
        const id = params.id
        if (id)
            client.query({ query: Services.graphql.getCmsPage(id) })
                .then(res => {
                    if (res.data) {
                        const { draft, ...side } = res.data.cmsPage
                        setInValue({
                            side: {
                                ...side,
                                metadata: side.metadata ? JSON.parse(side.metadata) : {},
                                isBlockPage: !side.path || side.path.length === 0
                            },
                            draft
                        })
                        setSavePath(side.path)
                    }
                })
    }, [params.id]);

    useEffect(() => {
        const onUpdatePreview = action === 'update_before_preview'
        const onPublish = action === 'publish'

        if ((action === 'update' || onUpdatePreview || onPublish) && finalSideValue && finalBodyValue) {
            if (onPublish) {
                const lastPublishedDate = Date.now()
                const updatedPage = {
                    ...finalSideValue,
                    ...finalBodyValue,
                    body: finalBodyValue.draft,
                    lastPublishedDate
                }
                Services.createCmsPage(params.id, updatedPage)
                    .then(() => {
                        const { draft, ...side } = updatedPage
                        setInValue({
                            draft, side
                        })
                    })
            } else {
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

                        if (onUpdatePreview)
                            setTimeout(() => setTab(1), 100)
                    })
            }

            setFormAction(undefined)
            setFinalSideValue(undefined)
            setFinalBodyValue(undefined)
        }
    }, [action, finalSideValue, finalBodyValue]);

    const updatePage = () => {
        setFormAction("update");
        [bodyRef, sideRef].map(r => r.current.handleSubmit())
    }

    const onPublish = () => {
        setFormAction("publish");
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
            <Sidebar
                setFinalValue={setFinalSideValue}
                updatePage={updatePage}
                ref={sideRef}
                savePath={savePath}
                pages={props.pages}
                setContentType={setContentType}
                inValue={inValue.side}
            />
            <div className='p-2 d-flex flex-column' style={{ flex: 1, overflow: 'hidden' }}>
                <div className='d-flex align-items-center mt-2'>
                    {[
                        { title: translateMethod('cms.create.draft'), id: 0, showPreview: () => setTab(0) },
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
                                    [bodyRef, sideRef].map(r => r.current.handleSubmit())
                                    setTab(id)
                                }
                            }} />
                    ))}
                </div>
                <Body
                    show={tab === 0}
                    ref={bodyRef}
                    pages={props.pages}
                    contentType={contentType}
                    setFinalValue={setFinalBodyValue}
                    inValue={inValue.draft}
                    publish={onPublish}
                />
                {tab === 1 && <iframe className='mt-3' style={{ flex: 1 }} src={`/_${savePath || '/'}?draft=true`} />}
                {tab === 2 && <iframe className='mt-3' style={{ flex: 1 }} src={`/_${savePath || '/'}`} />}
            </div>
        </>
    )
}