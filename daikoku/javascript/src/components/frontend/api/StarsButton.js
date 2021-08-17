import React from 'react';
import { t } from '../../../locales';

const StarsButton = ({ stars, toggleStar, starred, connectedUser }) => (
  <div
    className="d-flex flex-row"
    style={{
      borderRadius: '4px',
      border: '1px solid',
      overflow: 'hidden',
      boxSizing: 'content-box',
      borderColor: 'var(--btn-border-color, #97b0c7)',
      backgroundColor: 'var(--btn-border-color, #fff)',
      fontSize: '18px',
    }}>
    {connectedUser && !connectedUser.isGuest ? (
      <>
        <button
          className="btn flex-row align-items-center pr-2"
          style={{ color: 'var(--btn-bg-color, "#000")', padding: '0' }}
          onClick={toggleStar}>
          <i className={`${starred ? 'fas' : 'far'} fa-star pl-2`} />
        </button>
        <div className="px-2 d-flex align-items-center" style={{ backgroundColor: '#fff' }}>
          <span>{stars}</span>
        </div>
      </>
    ) : (
      stars > 0 && (
        <div className="badge p-2" style={{ color: '#fff' }}>
          {stars}
          <i className="fas fa-star pl-2" />
        </div>
      )
    )}
  </div>
);

export default StarsButton;
