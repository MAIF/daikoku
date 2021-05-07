import { Link } from "react-router-dom";

export function ApiFilter({ tags, handleFilter, filter, pathname }) {

    return (
        <div className="d-flex flex-row justify-content-between">
            <div>
                <button
                    className={`btn btn-${filter !== "all" ? 'outline-' : ''}primary`}
                    style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                    onClick={() => handleFilter("all")}>All</button>
                <button
                    className={`btn btn-${filter !== "open" ? 'outline-' : ''}primary`}
                    style={{ borderRadius: 0 }}
                    onClick={() => handleFilter("open")}>Open</button>
                <button
                    className={`btn btn-${filter !== "closed" ? 'outline-' : ''}primary`}
                    style={{ borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                    onClick={() => handleFilter("closed")}>Closed</button>
            </div>
            <div>
                <Link to={`${pathname}/labels`} className="btn btn-outline-primary">
                    <i className="fa fa-tag mr-1" />
                    Labels
                    <span className="badge badge-secondary ml-2">{tags.length || 0}</span>
                </Link>
                <Link to={`${pathname}/issues/new`} className="btn btn-outline-success ml-1">
                    New issue
                </Link>
            </div>
        </div >
    )
}