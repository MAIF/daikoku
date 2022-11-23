import React, { useContext, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { useLocation, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../contexts/i18n-context';

import { IState, ITenant, IUserSimple } from '../../types';

export const MaybeHomePage = ({
  tenant
}: {tenant: ITenant}) => {
  const connectedUser = useSelector<IState, IUserSimple>((state) => state.context.connectedUser);
  const { translate } = useContext(I18nContext);

  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const created = params.get("userCreated")
    if (params.get("userCreated") === "true") {
      toastr.success(translate('Success'), translate('user.validated.success'))
    }

    if (!tenant.homePageVisible || connectedUser?._humanReadableId) {
      navigate('/apis');
    } else window.location.replace('/_/');
  }, []);

  return null;

  // return (
  //   <div className="row">
  //     <div
  //       className="tenant-home-page"
  //       dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.unloggedHome || '') }}
  //     />
  //   </div>
  // );
};
