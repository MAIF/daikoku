import DatePicker from 'antd/lib/date-picker';
import { useContext } from 'react';
import dateFnsGenerateConfig from 'rc-picker/lib/generate/dateFns'
import { endOfMonth } from 'date-fns';

import { I18nContext } from '../../contexts';
import { getLanguageAntd } from '../utils';

const getDateFormat = (language: string) => {
  switch (language.toUpperCase()) {
    case 'FR':
      return 'MMM. YYYY'
    case 'EN':
    default:
      return 'MMM., YYYY';
  }
};

export const MonthPicker = ({
  updateDate,
  value
}: {
  updateDate: (d: Date) => void,
  value: Date
}) => {
  const { language } = useContext(I18nContext);

  const dateFormat = getDateFormat(language);

  const onChange = (newMonth: Date) => {
    if (newMonth && updateDate && value.getTime() !== newMonth.getTime())
      updateDate(endOfMonth(newMonth));
  };

  const MyDatePicker = DatePicker.generatePicker<Date>(dateFnsGenerateConfig)
  const locale = getLanguageAntd(language)

  return (
    <MyDatePicker
      picker="month"
      defaultValue={value}
      onChange={onChange}
      format={dateFormat}
      onOk={(value) => value}
      locale={locale}
    />
  );
};
