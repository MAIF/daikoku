import { useContext, useEffect } from 'react';
import { redirect, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { I18nContext } from '../../contexts/i18n-context';

import { GlobalContext } from '../../contexts/globalContext';
import { ITenant } from '../../types';

export const MaybeHomePage = ({
  tenant
}: { tenant: ITenant }) => {
  const { connectedUser } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);

  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const message = params.get("message")
    if (message) {
      toast.success(translate(message))
    }

    if (params.get('redirect')) {
      const rawRedirect = params.get('redirect')!;
      try {
        const redirect = atob(rawRedirect);
        window.location.href = redirect
      } catch (err) {
        window.location.href = rawRedirect
      }
      return
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
