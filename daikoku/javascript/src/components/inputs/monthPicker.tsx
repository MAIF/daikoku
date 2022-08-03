import React, { useContext } from 'react';

import DatePicker from 'antd/lib/date-picker';
import { I18nContext } from '../../core';

const getDateFormat = (language: any) => {
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

export const MonthPicker = ({
  updateDate,
  value
}: any) => {
  // @ts-expect-error TS(2339): Property 'language' does not exist on type 'unknow... Remove this comment to see the full error message
  const { language } = useContext(I18nContext);

  const dateFormat = getDateFormat(language);

  const onChange = (newMonth: any) => {
    if (newMonth && updateDate && !value.isSame(newMonth)) updateDate(newMonth.endOf('month'));
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <DatePicker.MonthPicker
      defaultValue={value}
      onChange={onChange}
      format={dateFormat.format}
      onOk={(value) => value}
    />
  );
};
