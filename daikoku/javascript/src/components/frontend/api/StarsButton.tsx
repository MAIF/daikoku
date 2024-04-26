import React from "react";

const StarsButton = ({ stars, toggleStar, starred, connectedUser }: any) => (
  <div className="d-flex flex-row star-button">
    {connectedUser && !connectedUser.isGuest ? (
      <>
        <button
          className="btn flex-row align-items-center pe-2"
          style={{ color: 'var(--btn-bg-color, "#000")', padding: "0" }}
          aria-label="star"
          onClick={toggleStar}
        >
          <i className={`${starred ? "fas" : "far"} fa-star ps-2`} />
        </button>
        <span className="btn btn-sm btn-access-negative">{stars}</span>
      </>
    ) : (
      stars > 0 && (
        <div className="badge p-2" style={{ color: "#fff" }}>
          {stars}
          <i className="fas fa-star ps-2" />
        </div>
      )
    )}
  </div>
);

export default StarsButton;
