import React from 'react'
import { Link, useNavigate } from 'react-router-dom';
import * as Services from '../../../services'

export const Pages = ({ pages }) => {
    const navigate = useNavigate()

    const removePage = id => {
        Services.removeCmsPage(id)
            .then(res => {
                if (res.error) {

                } else
                    navigate("/settings/pages")
            });
    }

    return (
        <div>
            {pages.map(({ id, name, path }) => (
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
            ))}
        </div>
    )
}