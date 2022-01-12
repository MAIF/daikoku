import React, { useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { I18nContext } from '../../../core'
import * as Services from '../../../services'
import { Table } from '../../inputs'

const CONTENT_TYPES = [
    { value: 'text/html', label: 'HTML', color: 'secondary' },
    { value: 'text/css', label: 'CSS', color: 'success' },
    { value: 'text/javascript', label: 'JS', color: 'warning' },
    { value: 'text/markdown', label: 'MD', color: 'dark' },
    { value: 'text/plain', label: 'PLAIN', color: 'dark' },
    { value: 'text/xml', label: 'XML', color: 'primary' },
    { value: 'application/json', label: 'JSON', color: 'primary' }
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
                    <span className={`badge bg-${item.color}`}>
                        {item.label}
                    </span>
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