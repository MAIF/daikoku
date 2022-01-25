import moment from 'moment'
import React, { useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { I18nContext } from '../../../core'
import * as Services from '../../../services'
import { Table } from '../../inputs'

const CONTENT_TYPES = [
    { value: 'text/html', label: 'HTML', icon: 'fab fa-html5' },
    { value: 'text/css', label: 'CSS', icon: 'fab fa-css3-alt' },
    { value: 'text/javascript', label: 'JS', icon: 'fab fa-js' },
    { value: 'text/markdown', label: 'MD', icon: 'fab fa-markdown' },
    { value: 'text/plain', label: 'PLAIN', icon: 'fas fa-quote-right' },
    { value: 'text/xml', label: 'XML' },
    { value: 'application/json', label: 'JSON' }
]

export const Pages = ({ pages, removePage }) => {
    const { translateMethod } = useContext(I18nContext)

    let table;

    const columns = [
        {
            Header: 'Name',
            style: { textAlign: 'left' },
            accessor: (item) => item.name,
        },
        {
            Header: 'Path',
            style: {
                textAlign: 'left',
                fontStyle: 'italic'
            },
            accessor: (item) => item.path,
        },
        {
            Header: 'Publish Date',
            style: { textAlign: 'left', maxWidth: 220 },
            disableFilters: true,
            accessor: (item) => item.lastPublishedDate ?
                moment(item.lastPublishedDate).format('DD MMMM y kk:mm') :
                '-',
        },
        {
            Header: 'Content Type',
            style: {
                textAlign: 'center',
                maxWidth: 100
            },
            disableFilters: true,
            accessor: (item) => item.contentType,
            Cell: ({
                cell: {
                    row: { original },
                },
            }) => {
                const { contentType } = original;
                const item = CONTENT_TYPES.find(f => f.value === contentType)
                return (
                    item.icon ? <i className={`${item.icon} fa-lg`} /> :
                        <span className={`badge bg-dark`}>{item.label}</span>
                );
            }
        },
        {
            Header: 'Actions',
            style: { textAlign: 'center' },
            disableSortBy: true,
            disableFilters: true,
            accessor: (item) => item._id,
            Cell: ({
                cell: {
                    row: { original },
                },
            }) => {
                const value = original;
                return (
                    <>
                        <Link to={`edit/${value.id}`}
                            className="btn btn-sm btn-outline-primary">
                            <i className='fas fa-edit' />
                        </Link>
                        <button className="btn btn-sm btn-outline-danger mx-1" onClick={() => {
                            window.confirm(translateMethod('cms.pages.remove_confirm')).then((ok) => {
                                if (ok) {
                                    Services.removeCmsPage(value.id)
                                        .then(res => {
                                            if (res.error)
                                                window.alert(res.error)
                                            else
                                                removePage(value.id)
                                        })
                                }
                            });
                        }}>
                            <i className='fas fa-trash' />
                        </button>
                        <Link to={`/_${value.path}`} className="btn btn-sm btn-outline-primary" target="_blank" rel="noopener noreferrer">
                            <i className='fas fa-eye' />
                        </Link>
                    </>
                );
            }
        }
    ];

    return (
        <div>
            <Table
                selfUrl="pages"
                defaultTitle="Pages"
                defaultValue={pages}
                fetchItems={() => pages}
                itemName="page"
                columns={columns}
                showActions={false}
                showLink={false}
                extractKey={(item) => item.id}
                injectTable={(t) => (table = t)}
                defaultSort="path"
                defaultSortDesc={true}
                header={false}
                footer={false}
            />
        </div>
    )
}
{/* {pages.map(({ id, name, path }) => (
            <div className="row" key={id}>
                <div className="col-sm-6">{name}</div>
                <div className="col-sm-3">{path}</div>
                <div className="col-sm-3">
                    <Link to={`/settings/pages/edit/${id}`}>
                        <i className="fas fa-edit"></i>
                    </Link>
                    <Link to={`/_${path}`} target="_blank" rel="noopener noreferrer">
                        <i className="fas fa-eye"></i>
                    </Link>

                    <button className="btn btn-sm"
                        onClick={() => removePage(id)}>
                        <i className="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        ))} */}