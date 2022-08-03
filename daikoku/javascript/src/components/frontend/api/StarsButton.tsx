import React from 'react';

const StarsButton = ({
  stars,
  toggleStar,
  starred,
  connectedUser
}: any) => (
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
    }}
  >
    {connectedUser && !connectedUser.isGuest ? (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          className="btn flex-row align-items-center pe-2"
          style={{ color: 'var(--btn-bg-color, "#000")', padding: '0' }}
          onClick={toggleStar}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className={`${starred ? 'fas' : 'far'} fa-star ps-2`} />
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="px-2 d-flex align-items-center" style={{ backgroundColor: '#fff' }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span>{stars}</span>
        </div>
      </>
    ) : (
      stars > 0 && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="badge p-2" style={{ color: '#fff' }}>
          {stars}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-star ps-2" />
        </div>
      )
    )}
  </div>
);

export default StarsButton;
