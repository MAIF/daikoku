import React, { Component } from 'react';

import { DatePicker } from 'antd';
import 'antd/dist/antd.css';
import './datepicker.css';

const { RangePicker } = DatePicker;
export class OtoDatePicker extends Component {
  onChange = (value) => {
    const from = value[0];
    const to = value[1];
    if (
      from &&
      to &&
      this.props.updateDateRange &&
      (!this.props.from.isSame(from) || !this.props.to.isSame(to))
    ) {
      this.props.updateDateRange(from, to);
    }
  };

  render() {
    const { from, to } = this.props;
    const dateFormat = 'YYYY-MM-DD HH:mm:ss';
    return (
      <RangePicker
        defaultValue={[from, to]}
        showTime={{ format: 'HH:mm:ss' }}
        format={dateFormat}
        placeholder={['Start Time', 'End Time']}
        onChange={this.onChange}
        onOk={(value) => value}
      />
    );
  }
}
