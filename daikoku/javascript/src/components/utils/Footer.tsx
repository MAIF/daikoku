import React from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import { converter } from '../../services/showdown';

const FooterComponent = ({
  tenant,
  isBackOffice
}: any) => {
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

const mapStateToProps = (state: any) => ({
  ...state.context
});

export const Footer = connect(mapStateToProps, null)(FooterComponent);
