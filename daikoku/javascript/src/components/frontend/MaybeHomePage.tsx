import { useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
    console.log('homePageVisible', tenant.homePageVisible);
    if (tenant.homePageVisible) {
      window.location.replace('/_/');
    } else
      navigate('/apis');
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
