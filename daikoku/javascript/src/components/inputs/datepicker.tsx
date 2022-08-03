import React from 'react';

import { DatePicker } from 'antd';
import 'antd/dist/antd.css';
import './datepicker.css';

const { RangePicker } = DatePicker;

export function OtoDatePicker(props) {
  const onChange = (value) => {
    const from = value[0];
    const to = value[1];
    if (from && to && props.updateDateRange && (!props.from.isSame(from) || !props.to.isSame(to))) {
      props.updateDateRange(from, to);
    }
  };

  const { from, to } = props;
  const dateFormat = 'YYYY-MM-DD HH:mm:ss';
  return (
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
