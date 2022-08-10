import React from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import { converter } from '../../services/showdown';
import { useSelector } from 'react-redux';

export const Footer = ({
  isBackOffice
}: any) => {

  const tenant = useSelector((s: any) => s.context.tenant)

  if (!tenant.footer) {
    return null;
  }

  return (
    <footer
      className={classNames('footer row', {
        'back-office-footer': isBackOffice,
      })}
      dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.footer) }}
    />
  );
};
