import { useContext } from 'react';
import { Link } from 'react-router-dom';

import { GlobalContext } from '../../../../contexts/globalContext';
import { I18nContext } from '../../../../contexts/i18n-context';

export const MorePanel = () => {
  const { translate } = useContext(I18nContext);
  const { connectedUser } = useContext(GlobalContext);

  return (
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      <div>
        <h3>{translate('more.nav.options')}</h3>
      </div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className="block__entries d-flex flex-column">
            {!connectedUser.isGuest && (
              <Link
                to="/apis/fast"
                className='block__entry__link d-flex align-items-center justify-content-between'
                title={translate('fastMode.access')}
              >
                {translate('fastMode.access')}
                <button className="btn btn-sm btn-outline-primary me-1">
                  <i className="fas fa-location-arrow" />
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
