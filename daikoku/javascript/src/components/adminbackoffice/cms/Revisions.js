import React, { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getApolloContext } from '@apollo/client'
import moment from 'moment'
import * as Services from '../../../services'
import { Spinner } from '../../utils/Spinner'
import { SwitchButton } from '../../inputs'
import { I18nContext } from '../../../core'

const CURRENT_VERSION_ITEM = {
    value: {
        id: "LATEST"
    },
    label: 'Current version'
}

export default ({ }) => {
    const { client } = useContext(getApolloContext())
    const params = useParams()
    const navigate = useNavigate()
    const { translateMethod } = useContext(I18nContext)

    const [reloading, setReloading] = useState(false);

    const [loading, setLoading] = useState(true)
    const [value, setValue] = useState({})
    const [html, setHtml] = useState({
        html: "",
        hasDiff: false
    })
    const [selectedDiff, setSelectedDiff] = useState(CURRENT_VERSION_ITEM)

    const [latestVersion, setLatestVersion] = useState()
    const [showDiffs, toggleDiffs] = useState(false)

    useEffect(() => {
        const id = params.id
        if (id) {
            setLoading(true)
            client.query({ query: Services.graphql.getCmsPageHistory(id) })
                .then(res => {
                    if (res.data) {
                        setSelectedDiff(CURRENT_VERSION_ITEM)
                        setLatestVersion({
                            draft: res.data.cmsPage.draft,
                            ...CURRENT_VERSION_ITEM
                        })
                        setHtml({
                            html: res.data.cmsPage.draft,
                            hasDiff: false
                        })
                        setValue(
                            res.data.cmsPage.history.slice(1).reduce((diffsByMonth, current) => {
                                const month = moment(current.date).format('MMMM')
                                return {
                                    ...diffsByMonth,
                                    [month]: [
                                        ...(diffsByMonth[month] || []),
                                        {
                                            value: current,
                                            label: moment(current.date).format('DD MMMM, HH:mm:ss')
                                        }
                                    ]
                                }
                            }, {
                                'latest': [CURRENT_VERSION_ITEM]
                            })
                        )
                    }
                    setLoading(false)
                })
        }
    }, [params.id, reloading]);

    const loadDiff = (item, nearValue) => {
        if (item.value.id === "LATEST") {
            setSelectedDiff(latestVersion)
            setHtml({
                html: latestVersion.draft,
                hasDiff: false
            })
        } else {
            setLoading(true)
            Services.getDiffOfCmsPage(params.id, item.value.id, nearValue !== undefined ? nearValue : showDiffs)
                .then(res => {
                    if (res.html) {
                        setHtml({
                            html: res.html.replace(/&para;/g, ''),
                            hasDiff: res.hasDiff
                        })
                    }
                    setLoading(false)
                })
            setSelectedDiff(item)
        }
    }

    return (
        <>
            <nav className="col-md-3 d-md-block sidebar collapse" id="sidebar">
                <div className="sidebar-sticky d-flex flex-column">
                    <div className='d-flex p-3 align-items-baseline'>
                        <div style={{
                            backgroundColor: "#fff",
                            borderRadius: '50%',
                            maxHeight: '42px',
                            maxWidth: '42px',
                            cursor: 'pointer'
                        }}
                            className='p-3 me-2 d-flex align-items-center'
                            onClick={() => navigate(-1)}>
                            <i className='fas fa-arrow-left' />
                        </div>
                        <h5 className='m-0'>{translateMethod("cms.revisions.version_history")}</h5>
                    </div>
                    <div>
                        {Object.entries(value).map(([month, diffs]) => {
                            return <div key={month}>
                                <div className='py-2 px-3 d-flex' style={{
                                    border: '1px solid rgb(225,225,225)',
                                    borderLeft: 'none',
                                    background: "#fff"
                                }}>
                                    <span className='me-1' style={{ fontWeight: 'bold' }}>{`${month.toLocaleUpperCase()}`}</span>
                                    <span>{`(${moment(diffs[0].value.date).format('YYYY')})`}</span>
                                </div>
                                {diffs.map(item => {
                                    const isCurrentVersion = item.value.id === "LATEST"
                                    const isSelected = selectedDiff.value.id === item.value.id

                                    return <div key={item.value.id}
                                        style={{
                                            backgroundColor: "#fff",
                                            borderBottom: '1px solid rgb(225,225,225)',
                                            borderRight: '1px solid rgb(225,225,225)',
                                            cursor: 'pointer',
                                            marginBottom: isCurrentVersion ? '12px' : 0,
                                            minHeight: '50px'
                                        }}
                                        onClick={() => loadDiff(item)}
                                        className='p-1 px-3 d-flex flex-column'>
                                        <div className='d-flex align-items-center justify-content-between' style={{ flex: 1 }}>
                                            <span>{item.label}</span>
                                            {isSelected && <i className='fas fa-arrow-right' />}
                                        </div>
                                        {item.value.user && <div style={{ fontStyle: "italic", fontWeight: "bold" }}>
                                            <span>{item.value.user.name}</span>
                                        </div>}
                                        {(!isCurrentVersion && isSelected) &&
                                            <button className='btn btn-sm btn-outline-info mt-2' onClick={() => {
                                                window.confirm(translateMethod('cms.revisions.delete_sentence')).then((ok) => {
                                                    if (ok) {
                                                        Services.restoreCmsDiff(params.id, item.value.id)
                                                            .then(() => setReloading(true))
                                                    }
                                                });
                                            }}>
                                                {translateMethod('cms.revisions.restore')}
                                            </button>
                                        }
                                    </div>
                                })}
                            </div>
                        })}
                    </div>
                </div>
            </nav>
            <div className='p-2' style={{ flex: 1, position: 'relative' }}>
                {loading ? <Spinner /> : <>
                    <div className='pt-4' style={{ borderBottom: '1px solid #eee' }}>
                        <h5>{selectedDiff && moment(selectedDiff.value.date).format('DD MMMM, YY, (HH:mm)')}</h5>
                        {selectedDiff && <div className='d-flex align-items-center pb-3'>
                            <span className='me-2'>Show differences</span>
                            <SwitchButton checked={showDiffs}
                                disabled={selectedDiff.value.id === "LATEST"}
                                onSwitch={() => {
                                    loadDiff(selectedDiff, !showDiffs)
                                    toggleDiffs(!showDiffs)
                                }} />
                        </div>}
                    </div>
                    {html && (html.hasDiff ? <div dangerouslySetInnerHTML={{ __html: html.html }} ></div> : <pre>{html.html}</pre>)}
                </>}
            </div>
        </>
    )
}