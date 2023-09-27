import classNames from 'classnames';
import React, { useContext } from 'react';
import ExternalLink from 'react-feather/dist/icons/external-link'

import { I18nContext } from '../../../core';
import { formatCurrency, getCurrencySymbol } from '../../utils/formatters';
import { ICurrency } from '../../../types';

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

type PriceCartridgeProps = {
  handleClick?: () => void
  label: string
  fetchInvoices?: () => void
  total: number
  currency: ICurrency
}
export const PriceCartridge = (props: PriceCartridgeProps) => {
  return (
    <div
      className={classNames('price__cartridge', { clickable: !!props.handleClick })}
      onClick={() => (props.handleClick ? props.handleClick() : {})}
      {...props}
    >
      {!!props.fetchInvoices && <span className="price__cartridge__label d-flex align-items-center">
        {props.label}
        <ExternalLink
          className="ms-1 cursor-pointer"
          style={{ height: '15px', width: '15px' }}
          onClick={props.fetchInvoices} />
      </span>}

      <span className="price__cartridge__total currency">
        {formatCurrency(props.total)}
        <span className="unit">{getCurrencySymbol(props.currency.code)}</span>
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
