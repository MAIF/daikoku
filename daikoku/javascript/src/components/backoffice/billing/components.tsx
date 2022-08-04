import { formatCurrency, getCurrencySymbol } from '../../utils/formatters';
import classNames from 'classnames';
import React, { useContext } from 'react';
import { I18nContext } from '../../../core';

export const ApiTotal = (props: any) => {
  return (
        <div className="col-4 api__billing__card" onClick={props.handleClick}>
            <div className="api__billing__name label">{props.api ? props.api.name : null}</div>
            <div className="api__billing__total currency">
        {formatCurrency(props.total)}
                <span className="unit">{getCurrencySymbol('EUR')}</span>
      </div>
            <div>
                <i className="fas fa-plus-square" />
      </div>
    </div>
  );
};

export const PriceCartridge = ({
  label,
  total,
  currency,
  handleClick,
  ...props
}: any) => {
  return (
        <div
      className={classNames('price__cartridge', { clickable: !!handleClick })}
      onClick={() => (handleClick ? handleClick() : {})}
      {...props}
    >
            <span className="price__cartridge__label">{label}</span>
            <span className="price__cartridge__total currency">
        {formatCurrency(total)}
                <span className="unit">{getCurrencySymbol(currency.code)}</span>
      </span>
    </div>
  );
};

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
