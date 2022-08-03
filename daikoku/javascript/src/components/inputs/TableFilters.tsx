import React from 'react';
import { Sliders } from 'react-feather';

// @ts-expect-error TS(6142): Module './Switch' was resolved to '/Users/qaubert/... Remove this comment to see the full error message
import { SwitchButton } from './Switch';

// Define a default UI for filtering
export const DefaultColumnFilter = ({
  column: { filterValue, setFilter }
}: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 pb-0">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="input-group input-group-sm mb-2 pe-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="input-group-prepend">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="input-group-text">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-search" />
          </div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          value={filterValue || ''}
          onChange={(e) => {
            setFilter(e.target.value || undefined); // Set undefined to remove the filter entirely
          }}
          placeholder={'Search'}
          className="form-control form-control-sm me-2"
          style={{ borderColor: '#9ab0c5' }}
        />
      </div>
    </div>
  );
};

// This is a custom filter UI that uses a
// slider to set the filter value between a column's
// min and max values
export const BooleanColumnFilter = ({
  column: { filterValue, setFilter }
}: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span className="d-flex justify-content-around">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <SwitchButton
        onSwitch={(enabled) => setFilter(enabled)}
        checked={filterValue || false}
        // @ts-expect-error TS(2322): Type '{ onSwitch: (enabled: any) => any; checked: ... Remove this comment to see the full error message
        large
        noText
      />
      {filterValue !== undefined && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span className="btn btn-sm btn-danger-negative table-filter-suppress">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Sliders onClick={() => setFilter(undefined)} />
        </span>
      )}
    </span>
  );
};
