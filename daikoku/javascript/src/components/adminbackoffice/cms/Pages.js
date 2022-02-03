import moment from 'moment'
import React, { useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { I18nContext } from '../../../core'
import * as Services from '../../../services'
import { Table } from '../../inputs'

const CONTENT_TYPES = [
    { value: 'text/html', label: 'HTML' },
    { value: 'text/css', label: 'CSS' },
    { value: 'text/javascript', label: 'JS' },
    { value: 'text/markdown', label: 'MD' },
    { value: 'text/plain', label: 'PLAIN' },
    { value: 'text/xml', label: 'XML' },
    { value: 'application/json', label: 'JSON' }
]

export const Pages = ({ pages, removePage }) => {
    const { translateMethod } = useContext(I18nContext)

    let table;

    const columns = [
        {
            Header: ' ',
            style: {
                textAlign: 'center',
                maxWidth: 60
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
                return <img
                    style={{ width: '24px' }}
                    src={`/assets/file-icons/${item.value.replace('text/', '').replace('application/', '')}.svg`} />
            }
        },
        {
            Header: translateMethod('cms.pages.name'),
            style: { textAlign: 'left' },
            accessor: (item) => item.name,
        },
        {
            Header: translateMethod('cms.pages.path'),
            style: {
                textAlign: 'left',
                fontStyle: 'italic'
            },
            accessor: (item) => item.path ? item.path : '-',
        },
        {
            Header: translateMethod('cms.pages.publish_date'),
            style: { textAlign: 'left', maxWidth: 220 },
            disableFilters: true,
            accessor: (item) => item.lastPublishedDate ?
                moment(item.lastPublishedDate).format('DD/MM/yy kk:mm') :
                '-',
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
                    <div className='d-flex'>
                        <Link to={`edit/${value.id}`} className='m-1'>
                            <i className='fas fa-edit fa-lg' style={{ color: "#000" }} />
                        </Link>
                        <button className="m-1"
                            style={{
                                border: 'none',
                                background: 'none'
                            }}
                            onClick={() => {
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
                            <i className='fas fa-trash fa-lg' style={{ color: "var(--danger-color, #dc3545)" }} />
                        </button>
                        <Link to={`/_${value.path}`} target="_blank" rel="noopener noreferrer" className='m-1'>
                            <i className='fas fa-eye fa-lg' style={{ color: "#000" }} />
                        </Link>
                    </div>
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
                // footer={false}
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