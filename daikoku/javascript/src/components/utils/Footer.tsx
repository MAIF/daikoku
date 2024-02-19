import classNames from 'classnames';
import { converter } from '../../services/showdown';
import { IState, ITenant } from '../../types';
import { GlobalContext } from '../../contexts/globalContext';
import { useContext } from 'react';

export const Footer = (props: { isBackOffice: boolean }) => {

  const { tenant } = useContext(GlobalContext)

  if (!tenant.footer) {
    return null;
  }

  return (
    <footer
      className={classNames('footer row', {
        'back-office-footer': props.isBackOffice,
      })}
      dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.footer) }}
    />
  );
};
