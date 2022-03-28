import React, { useContext } from 'react';
import { useSelector } from 'react-redux';

import { I18nContext } from '../../../../locales/i18n-context';

export const GuestPanel = () => {
  const { translateMethod } = useContext(I18nContext);
  const loginProvider = useSelector((state) => state.context.tenant.authProvider)

  return (
    <div className='ms-3 mt-2 col-8 d-flex flex-column panel'>

      <div className='mb-3' style={{ height: '40px' }}></div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className='ms-2 block__entries d-flex flex-column'>
            <a href={`/auth/${loginProvider}/login`} className='block__entry__link'>
              {translateMethod('Login')}
            </a>
            <a
              href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
              className='block__entry__link'>
              {translateMethod('Register')}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}