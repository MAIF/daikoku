import { useContext } from 'react';

import { I18nContext } from '../../../contexts';
import { getCurrencySymbol } from '../../utils/formatters';

export const NoData = () => {
  const { Translation } = useContext(I18nContext);
  return (
    <div className="col-12 no-data__container">
      <span className="badge bg-secondary no-data">
        <Translation i18nkey="No datas">No Datas</Translation>
      </span>
    </div>
  );
};

export const TheadBillingContainer = (props: any) => {
  const { Translation } = useContext(I18nContext);
  return (
    <div className="col-12 total ">
      <div className="title__container__bloc">
        <span className="title__container">{props.label}</span>
      </div>
      <div className="pricing__zone">
        <span className="label">
          <Translation i18nkey="Total">Total</Translation>
        </span>
        <span className="currency__total">
          {props.total}
          <span className="unit">{getCurrencySymbol('EUR')}</span>
        </span>
      </div>
    </div>
  );
};
