
import { DatePicker } from 'antd';
import dateFnsGenerateConfig from '@rc-component/picker/generate/dateFns'
import type { RangePickerProps } from '@rc-component/picker';
import { useContext } from 'react';

import { I18nContext } from '../../contexts';
import { getLanguageAntd } from '../utils';


const DateFnsDatePicker = DatePicker.generatePicker<Date>(dateFnsGenerateConfig)
const { RangePicker } = DateFnsDatePicker;

type RangeValue = Parameters<NonNullable<RangePickerProps<Date>['onChange']>>[0];

type OtoDatePickerProps = {
  from: Date,
  to: Date,
  updateDateRange: (from: Date, to: Date) => void
}
export function OtoDatePicker(props: OtoDatePickerProps) {
  const { translate, language } = useContext(I18nContext);

  const onChange = (value: RangeValue) => {
    const from = value?.[0];
    const to = value?.[1];
    if (from && to && props.updateDateRange && (props.from.getTime() !== from.getTime() || props.to.getTime() !== to.getTime())) {
      props.updateDateRange(from, to);
    }
  };

  const { from, to } = props;
  const dateFormat = translate('date.format');
  const locale = getLanguageAntd(language)


  return (
    <RangePicker
      value={[from, to]}
      showTime={{ format: 'HH:mm:ss' }}
      format={dateFormat}
      placeholder={['Start Time', 'End Time']}
      onChange={(dates) => onChange(dates)}
      onOk={(value) => value}
      locale={locale}
    />
  );
}
