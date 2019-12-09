import React, { Component } from 'react';

// import DatePicker from 'antd/lib/date-picker';
import { ConfigProvider, DatePicker } from 'antd';
import enUS from 'antd/lib/locale-provider/en_US';
import 'antd/lib/date-picker/style/index.css';

export class MonthPicker extends Component {
  onChange = value => {
    const date = value;
    if (date && this.props.updateDate && !this.props.value.isSame(date)) {
      this.props.updateDate(date.endOf('month'));
    }
  };

  render() {
    const dateFormat = 'MMM. YYYY';
    return (
      <ConfigProvider locale={enUS}>
        <DatePicker.MonthPicker
          defaultValue={this.props.value}
          placeholder="Select month"
          onChange={v => this.onChange(v)}
          format={dateFormat}
          onOk={value => value}
        />
      </ConfigProvider>
    );
  }
}
