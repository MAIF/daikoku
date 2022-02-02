import { getApolloContext, gql } from '@apollo/client'
import React, { useContext, useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
            lastPublishedDate
        }
      }
    `,
})

export const CMSOffice = () => {
    const { client } = useContext(getApolloContext())
    const location = useLocation()
    const [pages, setPages] = useState([])

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
        return <div>
            <div className="d-flex flex-row align-items-center justify-content-between mb-2">
                <h1 className="mb-0">Pages</h1>
                <Link to="new" className="btn btn-sm btn-primary">New page</Link>
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