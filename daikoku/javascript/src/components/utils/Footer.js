import React from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import { converter } from '../../services/showdown';

const FooterComponent = ({tenant, isBackOffice}) => {

  if (!tenant.footer) {
    return null;
  }

  return (
    <footer
      className={classNames('footer row', {
        // 'col-md-10': !!isBackOffice,
        // 'ml-sm-auto': !!isBackOffice,
        // 'col-md-12': !isBackOffice,
        'back-office-footer': isBackOffice
      })}>
      <div 
        className="container"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.footer)}} />
    </footer>
  );
};

const mapStateToProps = state => ({
  ...state.context,
});

export const Footer = connect(mapStateToProps, null)(FooterComponent);
