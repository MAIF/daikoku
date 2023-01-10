import classNames from 'classnames';
import { useSelector } from 'react-redux';
import { converter } from '../../services/showdown';
import { IState, ITenant } from '../../types';

export const Footer = (props: {isBackOffice: boolean}) => {

  const tenant = useSelector<IState, ITenant>((s) => s.context.tenant)

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
