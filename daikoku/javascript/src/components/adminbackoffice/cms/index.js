import { getApolloContext, gql } from '@apollo/client'
import React, { useContext, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { I18nContext } from '../../../core'
import { UserBackOffice } from '../../backoffice'
import { Can, manage, tenant } from '../../utils'
import { Create } from './Create'
import { Pages } from './Pages'

const getAllPages = () => ({
    query: gql`
      query CmsPages {
        pages {
            id
            name
            path
            contentType
        }
      }
    `,
})

export const CMSOffice = () => {
    const { Translation } = useContext(I18nContext)
    const { client } = useContext(getApolloContext())

    const navigate = useNavigate()
    const location = useLocation()

    const [pages, setPages] = useState([])

    useEffect(() => {
        reload()
    }, [])

    useEffect(() => {
        if (location.state && location.state.reload)
            reload()
    }, [location.state])

    const reload = () => {
        client.query(getAllPages())
            .then(r => setPages(r.data.pages))
    }

    const index = () => (
        <div>
            <div className="d-flex flex-row align-items-center justify-content-between mb-2">
                <h1 className="mb-0">Pages</h1>
                <button className="btn btn-sm btn-primary"
                    onClick={() => navigate('new')}>New page</button>
            </div>
            <Pages pages={pages} removePage={id => setPages(pages.filter(f => f.id !== id))} />
        </div>
    )

    return (
        <UserBackOffice tab="Pages">
            <Can I={manage} a={tenant} dispatchError>
                <div className="section py-3 px-2 mt-3">
                    <Routes>
                        <Route path="/" element={index()} />
                        <Route path="/new" element={<Create />} />
                        <Route path="/edit/:id" element={<Create />} />
                    </Routes>
                </div>
            </Can>
        </UserBackOffice>
    )
}