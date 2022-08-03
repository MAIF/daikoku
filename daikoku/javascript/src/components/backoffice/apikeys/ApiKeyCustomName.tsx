import React, { useState } from 'react';

export const ApiKeyCustomName = ({ apiKeyCustomName, updateCustomName }) => {
  const [customName, setCustomName] = useState(apiKeyCustomName || '');
  const [changes, setChanges] = useState(false);

  const updateValue = (value) => {
    setCustomName(value);
    setChanges(value !== apiKeyCustomName);
  };

  const handleKeyPress = (e) => {
    if (e.charCode === 13) {
      updateCustomName(customName);
    }
  };

  return (
    <div className="input-group">
      <input
        className="form-control"
        type="text"
        value={customName}
        onChange={(e) => updateValue(e.target.value)}
        onKeyPress={(e) => handleKeyPress(e)}
      />
      {changes && (
        <div className="input-group-append">
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => updateCustomName(customName)}
          >
            <i className="fas fa-arrow-circle-right" />
          </button>
        </div>
      )}
    </div>
  );
};
