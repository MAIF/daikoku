import { getApolloContext, gql } from '@apollo/client'
import React, { useContext, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { I18nContext } from '../../../core'
import { UserBackOffice } from '../../backoffice'
import { Can, manage, tenant } from '../../utils'
import { Create } from './Create'
import { Pages } from './Pages'
import * as Services from '../../../services'

const getAllPages = () => ({
    query: gql`
      query CmsPages {
        pages {
            id
            name
            path
            contentType
            lastPublishedDate
        }
      }
    `,
})

export const CMSOffice = () => {
    const { client } = useContext(getApolloContext())
    const location = useLocation()
    const [pages, setPages] = useState([])
    const { translateMethod } = useContext(I18nContext)

    useEffect(() => {
        reload()
    }, [])

    useEffect(() => {
        console.log(location.state)
        if (location.state && location.state.reload)
            reload()
    }, [location])

    const reload = () => {
        client.query(getAllPages())
            .then(r => setPages(r.data.pages))
    }

    const Index = ({ }) => {
        const navigation = useNavigate()
        const location = useLocation()

        return <div className='pt-2'>
            <div className="d-flex flex-row align-items-center justify-content-between mb-2">
                <h1 className="mb-0">Pages</h1>
                <button onClick={() => {
                    window.prompt('Indiquer le nom de la nouvelle page', '', false,
                        'Création d\'une nouvelle page', 'Nom de la nouvelle page')
                        .then(newPageName => {
                            if (newPageName) {
                                Services.createCmsPageWithName(newPageName)
                                    .then(res => navigation(`${location.pathname}/edit/${res._id}`))
                            }
                        })
                }} className="btn btn-sm btn-primary">{translateMethod('cms.index.new_page')}</button>
            </div>
            <Pages pages={pages} removePage={id => setPages(pages.filter(f => f.id !== id))} />
        </div>
    }

    return (
        <UserBackOffice tab="Pages">
            <Can I={manage} a={tenant} dispatchError>
                <Routes>
                    <Route path={`/new`} element={<Create pages={pages} />} />
                    <Route path={`/edit/:id`} element={<Create pages={pages} />} />
                    <Route path="*" element={<Index />} />
                </Routes>
            </Can>
        </UserBackOffice>
    )
}