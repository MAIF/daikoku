import React from 'react';

import { DatePicker } from 'antd';
import 'antd/dist/antd.css';
import './datepicker.css';

const { RangePicker } = DatePicker;

export function OtoDatePicker(props: any) {
  const onChange = (value: any) => {
    const from = value[0];
    const to = value[1];
    if (from && to && props.updateDateRange && (!props.from.isSame(from) || !props.to.isSame(to))) {
      props.updateDateRange(from, to);
    }
  };

  const { from, to } = props;
  const dateFormat = 'YYYY-MM-DD HH:mm:ss';
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <RangePicker
      defaultValue={[from, to]}
      showTime={{ format: 'HH:mm:ss' }}
      format={dateFormat}
      placeholder={['Start Time', 'End Time']}
      onChange={onChange}
      onOk={(value) => value}
    />
  );
}
