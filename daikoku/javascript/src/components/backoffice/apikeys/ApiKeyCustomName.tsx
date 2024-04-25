import React, { useState } from 'react';

export const ApiKeyCustomName = ({
  apiKeyCustomName,
  updateCustomName
}: any) => {
  const [customName, setCustomName] = useState(apiKeyCustomName || '');
  const [changes, setChanges] = useState(false);

  const updateValue = (value: any) => {
    setCustomName(value);
    setChanges(value !== apiKeyCustomName);
  };

  const handleKeyPress = (e: any) => {
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
            className="btn btn-access-negative"
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
