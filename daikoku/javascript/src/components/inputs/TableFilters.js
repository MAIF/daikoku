import React from 'react';
import { XSquare } from 'react-feather'

import { SwitchButton } from './Switch'


export const fuzzyTextFilterFn = (rows, id, filterValue) => {
  return matchSorter(rows, filterValue, { keys: [row => row.values[id]] })
}

// Define a default UI for filtering
export const DefaultColumnFilter = ({
  column: { filterValue, preFilteredRows, setFilter },
}) => {
  const count = preFilteredRows.length

  return (
    <input
      value={filterValue || ''}
      onChange={e => {
        setFilter(e.target.value || undefined) // Set undefined to remove the filter entirely
      }}
      placeholder={`Search ${count} records...`}
    />
  )
}


// This is a custom filter UI that uses a
// slider to set the filter value between a column's
// min and max values
export const BooleanColumnFilter = ({
  column: { filterValue, setFilter, preFilteredRows, id },
}) => {

  return (
    <>
      <SwitchButton
        onSwitch={enabled => setFilter(enabled)}
        checked={filterValue || false}
        large
        noText
      />
      {filterValue !== undefined && <XSquare style={{ color: 'red' }} onClick={() => setFilter(undefined)} />}
    </>
  )
}