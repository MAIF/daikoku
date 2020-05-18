import React, { useState, useEffect } from 'react';

// import DatePicker from 'antd/lib/date-picker';
import { ConfigProvider, DatePicker } from 'antd';
import enUS from 'antd/es/locale/en_US';
import frFr from 'antd/es/locale/fr_FR';
import "moment/locale/fr";

const getDateFormat = (language) => {
  switch (language.toUpperCase()) {
    case 'FR': 
      return {
        locale: frFr,
        format: 'MMM. YYYY'
      }
    case 'EN':
      default: 
      return {
        locale: enUS,
        format: 'MMM., YYYY'
      }
  }
}

export const MonthPicker = ({ currentLanguage, updateDate, value }) => {
  const dateFormat = getDateFormat(currentLanguage);

  const onChange = (value) => {
    const date = value;
    if (date && updateDate && !value.isSame(date)) {
      updateDate(date.endOf('month'));
    }
  };

  return (
      <ConfigProvider locale={dateFormat.locale}>
        <DatePicker.MonthPicker
          defaultValue={value}
          onChange={(v) => onChange(v)}
          format={dateFormat.format}
          onOk={(value) => value}
        />
      </ConfigProvider>
    );
  }
