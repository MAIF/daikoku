import React, { useContext } from 'react';

import DatePicker from 'antd/lib/date-picker';
import { I18nContext } from '../../core';

const getDateFormat = (language) => {
  switch (language.toUpperCase()) {
    case 'FR':
      return {
        format: 'MMM. YYYY',
      };
    case 'EN':
    default:
      return {
        format: 'MMM., YYYY',
      };
  }
};

export const MonthPicker = ({ updateDate, value }) => {
  const { language } = useContext(I18nContext);

  const dateFormat = getDateFormat(language);

  const onChange = (value) => {
    const date = value;
    if (date && updateDate && !value.isSame(date)) {
      updateDate(date.endOf('month'));
    }
  };

  return (
    <DatePicker.MonthPicker
      defaultValue={value}
      onChange={(v) => onChange(v)}
      format={dateFormat.format}
      onOk={(value) => value}
    />
  );
};
