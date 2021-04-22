export default ({ stars, toggleStar, starred }) => (
    <div className="d-flex" style={{
        borderRadius: '4px',
        border: '1px solid',
        overflow: 'hidden',
        boxSizing: 'content-box',
        borderColor: 'var(--btn-border-color, #97b0c7)',
        backgroundColor: 'var(--btn-border-color, #fff)',
        fontSize: '18px'
    }}>
        <button
            className="btn"
            style={{ color: 'var(--btn-bg-color, "#000")', padding: '0' }}
            onClick={toggleStar}>
            <div style={{ padding: '2px 4px' }}>
                <i className={`${starred ? 'fas' : 'far'} fa-star pl-2`} />
                <span className="px-2">{starred ? "Unstar" : "Star"}</span>
            </div>
        </button>
        <div className="px-2 d-flex align-items-center" style={{ backgroundColor: "#fff" }}>
            <span>{stars}</span>
        </div>
    </div>
)