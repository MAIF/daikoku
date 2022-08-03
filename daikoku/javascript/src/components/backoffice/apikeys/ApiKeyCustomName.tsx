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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="input-group">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <input
        className="form-control"
        type="text"
        value={customName}
        onChange={(e) => updateValue(e.target.value)}
        onKeyPress={(e) => handleKeyPress(e)}
      />
      {changes && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="input-group-append">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => updateCustomName(customName)}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-arrow-circle-right" />
          </button>
        </div>
      )}
    </div>
  );
};
