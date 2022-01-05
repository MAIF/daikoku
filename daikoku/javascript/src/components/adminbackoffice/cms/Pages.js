import React, { useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { I18nContext } from '../../../core'
import * as Services from '../../../services'
import { Table } from '../../inputs'

export const Pages = ({ pages, removePage }) => {
    const navigate = useNavigate()
    const { translateMethod } = useContext(I18nContext)

    let table;

    const columns = [
        // {
        //     Header: 'Date',
        //     id: 'date',
        //     accessor: (item) =>
        //         item['@timestamp']['$long'] ? item['@timestamp']['$long'] : item['@timestamp'], //todo: try to remove this $long prop from reactivemongo
        //     style: { textAlign: 'left' },
        //     Cell: ({ value }) => {
        //         return moment(value).format('YYYY-MM-DD HH:mm:ss.SSS');
        //     },
        // },
        {
            Header: 'Name',
            style: { textAlign: 'left' },
            accessor: (item) => item.name,
        },
        {
            Header: 'Path',
            style: { textAlign: 'left' },
            accessor: (item) => item.path,
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
            },
        },
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